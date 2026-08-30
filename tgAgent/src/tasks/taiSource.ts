/**
 * 天宫TAI 真实任务源 —— 对接 TAI 后端（NestJS，全局前缀 /api，控制器 /ai）。
 *
 * 接口契约来源：TAI 仓库 backend/src/ai/ai.controller.ts（2026-08-27 快照），鉴权走
 * ApiKeyOrJwtGuard：请求头 `x-api-key: <key>` 直接放行（积分由平台侧 API 用量体系处理）。
 *
 * - 生图：POST /api/ai/generate-image-async → { taskId, status }
 *         轮询 GET /api/ai/image-task/:taskId → { status, imageUrl, imageUrls, thumbnailUrl, error }
 *         status ∈ queued | processing | succeeded | failed
 *         多候选：默认 banana-3.1 **并发多个独立任务**（各自幂等键）；
 *         仅 seedream5 系走批量（batchMode:true + batchCount，一次任务返回多张）
 * - 视频图生视频：POST /api/ai/generate-video-provider（provider=kling-o3 等）
 *         → { taskId }（kling-o3 走 managed 任务，同步返回 taskId）
 *         轮询 GET /api/ai/video-task/:provider/:taskId → { status, videoUrl }
 *         provider ∈ kling | kling-2.6 | kling-o3 | vidu | viduq3-pro | doubao | omni-flash-ext
 *
 * 待决⑤至此收口：后端接口已在同仓库公开，无需再等平台团队另出文档。
 */

import { randomUUID } from "node:crypto";
import { TaskSourceError } from "./types.js";
import type {
  GeneratedImage,
  GenerationTaskSource,
  ImageGenOutcome,
  ImageGenRequest,
  PartialFailure,
  ProgressFn,
  VideoGenRequest,
  VideoJobStatus,
} from "./types.js";

const MAX_CONCURRENT_GENERATIONS = 2;
const IMAGE_POLL_INTERVAL_MS = 3_000;
const IMAGE_POLL_TIMEOUT_MS = 90_000;
const HTTP_TIMEOUT_MS = 30_000;

// ── 模块级共享信号量 ──────────────────────────────────────────────
// 所有 TaiTaskSource 实例（含每个会话的 jwt 源）共享同一把锁，
// 避免多会话并发时 MAX_CONCURRENT_GENERATIONS 形同虚设（P1 §4）。
// cost 表示本次调用实际向 TAI 后端提交的任务数（P1 §5）。

let _gateActive = 0;
const _gateWaiters: Array<{ resolve: () => void; cost: number }> = [];
const GATE_TIMEOUT_MS = 180_000; // 3 分钟，与 HTTP 超时对齐
const GATE_WAIT_TIMEOUT_MS = 180_000; // 排队等待上限：拥塞时不允许永久挂起

/**
 * 获取 cost 个槽位。
 *
 * ⚠️ 与 `releaseGateSlot` 之间是一套**显式移交握手**，改动前务必读完：
 * release 选中等待者时会**先替它把槽位占好**（`_gateActive += w.cost`）再唤醒，
 * 以防这中间的微任务间隙被后来的 acquire 插队抢走。因此被唤醒的一侧
 * **绝不能再次累加**——早期实现唤醒后仍走 `while` 复检并重复 `+= cost`，
 * 双重计数让复检必然失败，等待者把自己重新入队 → 永久死锁
 * （表现为并发超过 MAX 后请求全部挂起，且不超时）。
 * `granted` 就是用来区分「release 已代为占位」与「只是被超时唤醒」的。
 */
async function acquireGateSlot(cost: number): Promise<void> {
  if (_gateActive + cost <= MAX_CONCURRENT_GENERATIONS) {
    _gateActive += cost;
    return;
  }
  for (;;) {
    let granted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waiter = { resolve: () => {}, cost };
    await new Promise<void>((resolve) => {
      waiter.resolve = () => {
        granted = true;
        resolve();
      };
      _gateWaiters.push(waiter);
      // 排队超时兜底：GATE_TIMEOUT_MS 只在 acquire **成功之后**才起算，
      // 若此处不加超时，acquire 阶段的拥塞将永久挂起且无任何错误信号。
      timer = setTimeout(() => {
        // release 若已把槽位移交，waiter 早已出队，indexOf 为 -1，不可重复摘除。
        const i = _gateWaiters.indexOf(waiter);
        if (i >= 0) _gateWaiters.splice(i, 1);
        resolve();
      }, GATE_WAIT_TIMEOUT_MS);
    });
    if (timer) clearTimeout(timer);

    // 槽位已由 release 代为计入，直接返回
    if (granted) return;

    // 被超时唤醒：容量恰好空出则占用，否则放弃并抛出可诊断的错误
    if (_gateActive + cost <= MAX_CONCURRENT_GENERATIONS) {
      _gateActive += cost;
      return;
    }
    throw new TaskSourceError(
      `并发队列等待超时（>${GATE_WAIT_TIMEOUT_MS / 1000}s，需要 ${cost} 个槽位，上限 ${MAX_CONCURRENT_GENERATIONS}）`,
      "timeout",
    );
  }
}

/**
 * 释放槽位。扫描全部等待者，优先满足代价最小的（防饥饿），
 * 用不完的容量继续留在池中供后续 acquire 直接使用。
 *
 * 移交语义：**先占位再唤醒**（`_gateActive += w.cost` 在 `w.resolve()` 之前），
 * 这样即使 resolve 的微任务被延迟，槽位也不会被新来的 acquire 抢走。
 * 代价是被唤醒方不能再计数——详见 `acquireGateSlot` 的握手说明。
 */
function releaseGateSlot(cost: number): void {
  _gateActive -= cost;
  if (_gateActive < 0) _gateActive = 0;
  let remaining = MAX_CONCURRENT_GENERATIONS - _gateActive;
  // 每次选最小可满足的等待者
  while (remaining > 0) {
    let bestIdx = -1;
    for (let i = 0; i < _gateWaiters.length; i++) {
      if (_gateWaiters[i]!.cost <= remaining && (bestIdx < 0 || _gateWaiters[i]!.cost < _gateWaiters[bestIdx]!.cost)) {
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const w = _gateWaiters.splice(bestIdx, 1)[0]!;
    _gateActive += w.cost;
    remaining -= w.cost;
    w.resolve();
  }
}

async function gated<T>(fn: () => Promise<T>, cost = 1): Promise<T> {
  await acquireGateSlot(cost);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const task = fn();
    const timed = Promise.race([
      task,
      new Promise<never>((_, rej) => {
        timer = setTimeout(
          () => rej(new TaskSourceError("队列门控超时", "timeout")),
          GATE_TIMEOUT_MS,
        );
      }),
    ]);
    return await timed;
  } finally {
    if (timer) clearTimeout(timer);
    releaseGateSlot(cost);
  }
}

/** TAI 后端支持的 provider 白名单（video-provider.dto.ts） */
const VIDEO_PROVIDERS = [
  "kling",
  "kling-2.6",
  "kling-o3",
  "vidu",
  "viduq3-pro",
  "doubao",
  "omni-flash-ext",
] as const;
type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

/** 生图 provider（image-generation.dto.ts aiProvider 枚举，去掉默认 gemini） */
const IMAGE_PROVIDERS = [
  "gemini-pro",
  "banana",
  "banana-2.5",
  "banana-3.1",
  "runninghub",
  "midjourney",
  "nano2",
  "seedream5",
  "seedream5Pro",
] as const;
type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

/**
 * 凭证模式（详见 docs/TAI-INTEGRATION-PLAN.md §7）
 * - `apiKey`：S2S 联调用，发 `x-api-key` 头。⚠️ TAI 后端对该路径**不扣用户积分**
 *   —— `getUserId()`（ai.controller.ts:725）开头即 `if (req.apiClient) return null`，
 *   随后 :5555 `if (!userId)` 跳过扣费。仅供联调，不可用于生产计费。
 * - `jwt`：生产计费用，发 `Authorization: Bearer <用户 accessToken>`，积分计入用户账。
 *   ⚠️ 绝不可同时携带 `x-api-key`：守卫中 apiKey 判断优先（api-key-or-jwt.guard.ts:29），
 *   命中后直接放行、不解析 JWT、`req.user` 为空 → **静默免单且不报错**。
 */
export type TaiAuthMode = "apiKey" | "jwt";

/** accessToken 可为字符串或异步获取器——token 会过期，需支持 refresh（前端见 authFetch.ts:193） */
export type TokenProvider = string | (() => string | Promise<string>);

export interface TaiSourceOptions {
  /** TAI 后端根地址，如 http://localhost:4000（不含 /api） */
  baseUrl?: string;
  /** x-api-key（authMode=apiKey 时必填） */
  apiToken?: string;
  /** 生图 provider，默认 **banana-3.1**——唯一同时保住 aspectRatio 与图生图的 provider。
   *  ⚠️ 勿改用 seedream5 / seedream5Pro：已核对 TAI 源码（seedream5.provider.ts:91），
   *  其 editImage() 直接 throw 且 aspectRatio 被丢弃，迭代会静默退化为文生图 */
  imageProvider?: string;
  /** 生图模型 ID（覆盖 provider 默认模型） */
  imageModel?: string;
  /** 视频默认 provider，默认 kling-o3（首尾帧插值支持，见 DESIGN §12.2） */
  videoProvider?: string;
  /** 凭证模式，默认 apiKey（联调）；**生产计费必须显式设为 jwt** */
  authMode?: TaiAuthMode;
  /** 用户 access token（authMode=jwt 时必填） */
  accessToken?: TokenProvider;
  /** 团队计费 ID，透传 `X-Team-Id`（前端见 authFetch.ts:141） */
  teamId?: string;
}

// ---------- TAI 后端响应类型 ----------

interface ImageTaskResponse {
  status: "queued" | "processing" | "succeeded" | "failed";
  imageUrl?: string | null;
  imageUrls?: string[];
  thumbnailUrl?: string | null;
  error?: string | null;
  progress?: number;
}

interface VideoProviderSubmitResponse {
  taskId?: string;
  status?: string;
  videoUrl?: string;
  message?: string;
  error?: { message?: string } | string;
}

interface VideoTaskResponse {
  status: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

function normalizeVideoStatus(raw: string | undefined): VideoJobStatus["status"] {
  const v = (raw ?? "").trim().toLowerCase();
  if (["queued", "queue", "pending", "submitted", "waiting"].includes(v)) return "queued";
  if (["processing", "running", "progressing", "in_progress"].includes(v)) return "processing";
  if (["succeeded", "success", "done", "completed"].includes(v)) return "done";
  if (["failed", "error", "cancelled", "canceled"].includes(v)) {
    return v.startsWith("cancel") ? "cancelled" : "failed";
  }
  return "processing";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class TaiTaskSource implements GenerationTaskSource {
  readonly name = "tai";

  constructor(private readonly opts: TaiSourceOptions) {
    // 凭证互斥断言（防静默免单）：jwt 模式下配置 apiToken 是明确的误配置。
    // 虽然当前 authHeaders() 在 jwt 分支不会发出 x-api-key，但一旦未来有人
    // 在分支外"顺手"补上 apiKey 头，守卫会优先判定 apiClient → 不解析 JWT
    // → 不扣费，且全程无报错。与其赌代码纪律，不如在构造期就炸出来。
    //
    // 抛 TaskSourceError 而非裸 Error：否则 BFF 的 applyBffAuth catch 只认
    // TaskSourceError，会把这类配置错误一律降级成 500 "internal error" 且不打日志，
    // 2026-08-29 的 P0-B 正是因此被掩盖成"计费链路全面 500"却查无原因。
    if ((opts.authMode ?? "apiKey") === "jwt" && (opts.apiToken ?? "").trim()) {
      throw new TaskSourceError(
        "TaiTaskSource 凭证冲突：authMode=jwt（生产计费）时不得配置 apiToken（x-api-key）。" +
          "两者并存会触发守卫的 apiKey 优先判定 → 静默免单（见 docs/TAI-INTEGRATION-PLAN.md §7）。",
        "not_configured",
      );
    }
  }

  /**
   * 用用户 JWT 创建新实例（承载新凭证，同一线程内互不干扰）。
   *
   * ⚠️ 必须显式剔除 `apiToken`：共享源是 apiKey 模式（联调用），直接展开
   * `...this.opts` 会把它的 `apiToken` 一并带到 jwt 模式的新实例上，
   * 从而触发本文件的构造期凭证互斥断言 → 抛错 → `/chat` 一律 500，
   * 整条生产计费链路不可用。这道断言本是为了防静默免单，别被自己误伤。
   */
  withUserAuth(bearer: string, teamId?: string): GenerationTaskSource {
    const { apiToken: _sharedApiToken, ...rest } = this.opts;
    return new TaiTaskSource({
      ...rest,
      authMode: "jwt",
      accessToken: bearer,
      teamId,
    });
  }

  private baseUrl(): string {
    const url = (this.opts.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (!url) {
      throw new TaskSourceError("TAI_API_BASE_URL 未配置（TAI 后端根地址，如 http://localhost:4000）", "not_configured");
    }
    return url;
  }

  private token(): string {
    const t = (this.opts.apiToken ?? "").trim();
    if (!t) {
      throw new TaskSourceError("TAI_API_TOKEN 未配置（TAI 后端 x-api-key）", "not_configured");
    }
    return t;
  }

  /**
   * 构造鉴权头。
   *
   * jwt 模式下**只**发 `Authorization`，绝不附带 `x-api-key`——两者并存不会报错，
   * 但守卫会优先判定为 apiClient 从而跳过扣费（静默免单）。这是本文件最容易踩的坑。
   */
  private async authHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if ((this.opts.authMode ?? "apiKey") === "jwt") {
      const raw = this.opts.accessToken;
      const token = typeof raw === "function" ? await raw() : raw;
      if (!token || !token.trim()) {
        throw new TaskSourceError(
          "authMode=jwt 但缺少 accessToken（计费需用户 JWT，见 docs/TAI-INTEGRATION-PLAN.md §7）",
          "not_configured",
        );
      }
      headers["Authorization"] = `Bearer ${token.trim()}`;
      if (this.opts.teamId) headers["X-Team-Id"] = this.opts.teamId;
      return headers;
    }

    headers["x-api-key"] = this.token();
    return headers;
  }

  // 模块级信号量见文件顶部（`acquireGateSlot` / `releaseGateSlot` / `gated`）。
  // 语义：同时最多 MAX_CONCURRENT_GENERATIONS 个「任务组」在飞；
  // 每组的 cost = min(req.count, MAX)，即多候选调用按上限计费，而非按实际候选数。

  /**
   * 生成幂等键，格式对齐平台前端（aiBackendAPI.ts:138）：`<scope>-<timestamp>-<uuid>`。
   *
   * ⚠️ 必须**每次调用唯一**，不能按内容（prompt/参数）生成——否则一次请求里的多个候选
   * 会拿到相同 key，被后端判定为重复提交而去重，最终只出一张图。
   * 后端会截断到 128 字符（ai.controller.ts:760），本格式远小于该上限。
   */
  private newIdempotencyKey(scope: string): string {
    return `${scope}-${Date.now()}-${randomUUID()}`;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    opts?: { idempotencyKey?: string },
  ): Promise<{ ok: boolean; status: number; data: T | null; errorText: string }> {
    // 在 try 之外解析：地址/鉴权配置错误应原样抛出，不被下面的网络错误包装掩盖。
    // 顺序固定为「先地址后凭证」，保证缺 baseUrl 时报的是 TAI_API_BASE_URL。
    const url = this.baseUrl();
    const headers = await this.authHeaders();
    if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    let res: Response;
    try {
      res = await fetch(`${url}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, status: 0, data: null, errorText: `网络错误: ${(err as Error).message}` };
    }
    const text = await res.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      /* 非 JSON 响应按纯文本错误处理 */
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      errorText: data === null ? text.slice(0, 300) : "",
    };
  }

  // ---------- 生图 ----------

  async generateImages(req: ImageGenRequest, onProgress: ProgressFn): Promise<ImageGenOutcome> {
    const gateCost = Math.min(req.count, MAX_CONCURRENT_GENERATIONS);
    return gated(async () => {
      const provider = this.pickImageProvider();
      onProgress("submitting", 10);

      // ── 意图分流（用户决策：v1 保「迭代 / 比例」）──
      // 有底图 = 版本迭代 → `edit-image-async`，底图走 sourceImageUrl（真正的图生图语义）。
      //   必须避开 seedream5 / 5Pro：两者的 editImage() 直接 throw。
      // 无底图 = 首轮探索 → `generate-image-async`；多候选靠并发提交多个独立任务
      //   （banana 系 n:1 硬编码，而 seedream5 的 batchMode 虽能一次出多张却会丢弃 aspectRatio）。
      const editing = !!req.baseImageUrl;
      const endpoint = editing ? "edit-image-async" : "generate-image-async";
      const useBatch = !editing && (provider === "seedream5" || provider === "seedream5Pro");

      const submitBody: Record<string, unknown> = {
        prompt: req.negativePrompt
          ? `${req.prompt}\n\nAvoid: ${req.negativePrompt}`
          : req.prompt,
        aiProvider: provider,
        aspectRatio: req.aspectRatio,
        imageSize: req.imageSize,
        projectId: req.projectId,
        ...(useBatch ? { batchMode: true, batchCount: Math.min(4, Math.max(1, req.count)) } : {}),
      };
      if (this.opts.imageModel) submitBody.model = this.opts.imageModel;

      if (editing) {
        // 底图必须用 sourceImageUrl 发出。塞进 imageUrls 只是「参考图」语义，
        // 会让 inheritFromAssetId 静默退化——出图与底图无关，且不报错。
        submitBody.sourceImageUrl = req.baseImageUrl;
      }
      const refs = req.referenceImageUrls ?? [];
      if (refs.length) submitBody.imageUrls = refs;
      // 注：maskUrl 不发送——EditImageDto 无 crop/mask 字段，TAI 的局部重绘是
      // 「传原图整张 → 模型整图重绘 → 前端按 cropRectNormalized 合成回原图」，
      // 区域坐标不进后端。详见 src/shared/region.ts 顶部说明。

      const submit = await this.request<{ taskId: string; status: string }>(
        "POST", `/api/ai/${endpoint}`, submitBody,
        { idempotencyKey: this.newIdempotencyKey("img") },
      );
      if (!submit.ok || !submit.data?.taskId) {
        const detail = this.extractError(submit.data as { message?: string } | null, submit.errorText);
        const authErr = this.authErrorFromStatus(submit.status, detail);
        if (authErr) throw authErr;
        throw new TaskSourceError(`生图任务提交失败 (HTTP ${submit.status}): ${detail}`, "submission_failed");
      }
      const taskId = submit.data.taskId;
      onProgress("submitted", 25);

      if (!useBatch && req.count > 1) {
        // 多候选并发：N 个任务 = N 次预扣积分（风险④）。
        // 原则是"部分成功也交付"：个别任务失败只记入 partialFailures，
        // 绝不因一个失败丢掉其余已扣费的成果；全灭时才抛错。
        const failures: PartialFailure[] = [];
        let firstAuthErr: TaskSourceError | undefined;
        const recordFailure = (message: string, err?: unknown) => {
          const code = err instanceof TaskSourceError ? err.code : undefined;
          failures.push({ message, code });
          if (
            !firstAuthErr &&
            err instanceof TaskSourceError &&
            (err.code === "auth_expired" || err.code === "insufficient_credits")
          ) {
            firstAuthErr = err;
          }
        };

        const extra = await Promise.all(
          Array.from({ length: req.count - 1 }, () =>
            // 并发提交剩余候选（用户决策：首轮多候选走并发而非串行）。
            // 每个任务各自生成幂等键——共用同一个 key 会被后端判为重提而去重。
            this.request<{ taskId: string }>("POST", `/api/ai/${endpoint}`, submitBody, {
              idempotencyKey: this.newIdempotencyKey("img"),
            }),
          ),
        );
        const taskIds: string[] = [taskId];
        for (const r of extra) {
          if (r.ok && r.data?.taskId) {
            taskIds.push(r.data.taskId);
            continue;
          }
          const detail = this.extractError(r.data as { message?: string } | null, r.errorText);
          const authErr = this.authErrorFromStatus(r.status, detail);
          recordFailure(
            authErr ? authErr.message : `候选任务提交失败 (HTTP ${r.status}): ${detail}`,
            authErr ?? undefined,
          );
        }

        // 逐任务容错轮询：任一任务失败不影响其余任务出图
        const settled = await Promise.allSettled(
          taskIds.map((id, i) => this.pollImageTask(id, i === 0 ? onProgress : () => {})),
        );
        const images: GeneratedImage[] = [];
        for (const s of settled) {
          if (s.status === "fulfilled") {
            images.push(...s.value.filter((u) => u.url));
            continue;
          }
          const err = s.reason instanceof Error ? s.reason : new Error(String(s.reason));
          recordFailure(err.message, err);
        }

        if (!images.length) {
          // 全灭：鉴权/计费类错误优先透传（调用方据此决定刷新 token 或提示充值）
          if (firstAuthErr) throw firstAuthErr;
          throw new TaskSourceError(`全部生图任务失败: ${failures.map((f) => f.message).join("；")}`, "remote_error");
        }
        return { images, partialFailures: failures };
      }

      const images = await this.pollImageTask(taskId, onProgress);
      if (!images.length) throw new TaskSourceError("生图任务未返回图片", "remote_error");
      return { images, partialFailures: [] };
    });
  }

  private async pollImageTask(taskId: string, onProgress: ProgressFn): Promise<GeneratedImage[]> {
    const deadline = Date.now() + IMAGE_POLL_TIMEOUT_MS;
    let lastProgress = 25;
    while (Date.now() < deadline) {
      await sleep(IMAGE_POLL_INTERVAL_MS);
      const r = await this.request<ImageTaskResponse>("GET", `/api/ai/image-task/${taskId}`);
      if (!r.ok) {
        // 查询瞬时失败容忍一轮，连续失败才抛
        if (r.status >= 500 || r.status === 0) continue;
        // 401/403 不重试：轮询期 token 过期/积分不足时，继续打只会重复失败
        const authErr = this.authErrorFromStatus(r.status, r.errorText);
        if (authErr) throw authErr;
        throw new TaskSourceError(`查询任务失败 (HTTP ${r.status}): ${r.errorText}`, "remote_error");
      }
      const t = r.data;
      if (!t) continue;
      if (t.status === "succeeded") {
        onProgress("done", 100);
        const urls = [
          ...(t.imageUrls?.filter((u) => typeof u === "string" && u.trim()) ?? []),
          ...(t.imageUrl ? [t.imageUrl] : []),
        ];
        const seen = new Set<string>();
        return [...new Set(urls)].filter((u) => {
          if (seen.has(u)) return false;
          seen.add(u);
          return true;
        }).map((url) => ({ url, width: undefined, height: undefined }));
      }
      if (t.status === "failed") {
        throw new TaskSourceError(`生图任务失败: ${t.error ?? "unknown"}`, "remote_error");
      }
      const p = t.progress ?? (t.status === "processing" ? 60 : 30);
      if (p > lastProgress) {
        lastProgress = p;
        onProgress(t.status === "processing" ? "rendering" : "queued", p);
      }
    }
    throw new TaskSourceError(`生图任务超时（>${IMAGE_POLL_TIMEOUT_MS / 1000}s, taskId=${taskId}）`, "timeout");
  }

  private pickImageProvider(): ImageProvider | "gemini" {
    const p = (this.opts.imageProvider ?? "banana-3.1").trim();
    if ((IMAGE_PROVIDERS as readonly string[]).includes(p)) return p as ImageProvider;
    throw new TaskSourceError(
      `不支持的生图 provider: ${p}（可选: ${IMAGE_PROVIDERS.join(" | ")}）`,
      "not_configured",
    );
  }

  // ---------- 视频 ----------

  private pickVideoProvider(): VideoProvider {
    const p = (this.opts.videoProvider ?? "kling-o3").trim();
    if ((VIDEO_PROVIDERS as readonly string[]).includes(p)) return p as VideoProvider;
    throw new TaskSourceError(
      `不支持的视频 provider: ${p}（可选: ${VIDEO_PROVIDERS.join(" | ")}）`,
      "not_configured",
    );
  }

  async submitVideoTask(req: VideoGenRequest): Promise<{ taskId: string }> {
    const provider = this.pickVideoProvider();
    const references: { url: string }[] = [{ url: req.firstFrameUrl }];
    if (req.lastFrameUrl) references.push({ url: req.lastFrameUrl });

    const body: Record<string, unknown> = {
      provider,
      referenceImages: references,
      prompt: req.prompt ?? "",
    };
    if (req.durationSec) body.duration = Math.round(req.durationSec);

    const r = await this.request<VideoProviderSubmitResponse>(
      "POST",
      "/api/ai/generate-video-provider",
      body,
      { idempotencyKey: this.newIdempotencyKey("vid") },
    );
    if (!r.ok) {
      const detail = this.extractError(r.data, r.errorText);
      const authErr = this.authErrorFromStatus(r.status, detail);
      if (authErr) throw authErr;
      throw new TaskSourceError(`视频任务提交失败 (HTTP ${r.status}): ${detail}`, "submission_failed");
    }
    const d = r.data;
    if (d?.taskId) return { taskId: `${provider}:${d.taskId}` };
    if (d?.videoUrl) {
      // 个别 provider 同步即完成：包装成已完成任务 ID，getVideoTask 直接还原
      return { taskId: `sync:${d.videoUrl}` };
    }
    throw new TaskSourceError(
      `视频任务提交失败: ${this.extractError(d, "未返回 taskId")}`,
      "submission_failed",
    );
  }

  async getVideoTask(taskId: string): Promise<VideoJobStatus> {
    if (taskId.startsWith("sync:")) {
      return { status: "done", progress: 100, url: taskId.slice(5) };
    }
    const idx = taskId.indexOf(":");
    const provider = taskId.slice(0, idx) as VideoProvider;
    const id = taskId.slice(idx + 1);
    const r = await this.request<VideoTaskResponse>(
      "GET",
      `/api/ai/video-task/${provider}/${encodeURIComponent(id)}`,
    );
    if (!r.ok || !r.data) {
      const detail = r.errorText || `HTTP ${r.status}`;
      const authErr = this.authErrorFromStatus(r.status, detail);
      if (authErr) throw authErr;
      return { status: "failed", progress: 0, error: `查询失败 (HTTP ${r.status}): ${r.errorText}` };
    }
    const status = normalizeVideoStatus(r.data.status);
    return {
      status,
      progress: status === "done" ? 100 : status === "processing" ? 50 : 10,
      url: status === "done" ? r.data.videoUrl : undefined,
    };
  }

  async cancelTask(taskId: string): Promise<void> {
    if (taskId.startsWith("sync:")) return;
    // TAI 后端未提供统一取消端点；对 managed 任务采用幂等"放弃轮询"策略：
    // gateway 侧已把任务从轮询表移除，这里不再报错。
    void taskId;
  }

  private extractError(data: { message?: string; error?: { message?: string } | string } | null, fallback: string): string {
    if (data?.error) {
      return typeof data.error === "string" ? data.error : (data.error.message ?? fallback);
    }
    return data?.message ?? fallback;
  }

  /**
   * 鉴权/计费类 HTTP 状态映射（见 docs/TAI-INTEGRATION-PLAN.md §7）：
   * 401 = 凭证无效或 token 过期；403 = 业务拒绝（典型：积分不足，
   * 前端 authFetch 对 403 会触发余额刷新，即"业务拒绝"语义）。
   * 非这两类返回 null，由调用方走原有错误路径。
   */
  private authErrorFromStatus(status: number, detail: string): TaskSourceError | null {
    if (status === 401) {
      return new TaskSourceError(`鉴权失败（401）：token 无效或已过期，请刷新后重试——${detail}`, "auth_expired");
    }
    if (status === 403) {
      return new TaskSourceError(`请求被拒绝（403）：可能积分不足——${detail}`, "insufficient_credits");
    }
    return null;
  }
}
