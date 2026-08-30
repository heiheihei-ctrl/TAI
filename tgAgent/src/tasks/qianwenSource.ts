/**
 * 千问生图任务源 —— 测试后端（真实出图，替换 SVG 占位；TAI 契约落地前的联调源）。
 * 平台文档: https://platform.qianwenai.com/docs/developer-guides/image-generation/text-to-image
 *
 * 实测确认（2026-08，模型 wan2.7-image）：
 * - 端点: POST {baseUrl}/services/aigc/multimodal-generation/generation（同步返回）
 * - 鉴权: Authorization: Bearer <key>
 * - 正向提示词: input.messages[].content[] = [{image?}...,{text}]；无 prompt 字段时必须走 messages 形态
 * - 多候选: parameters.n = count（一次请求返回 choices.length 张）
 * - 图生图: content 前置 {image: <公开URL | dataURL>} 即可；本地文件转 base64 dataURL 实测可用
 * - 结果为 OSS 签名 URL，24h 过期 → 拿到后立即下载落盘到静态目录，前端经网关 HTTP 取图
 * - negative_prompt 参数该模型不支持 → 以「避免：…」子句并入正向文本（测试后端简化处理）
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { MockTaskSource } from "./mockSource.js";
import { TaskSourceError } from "./types.js";
import type {
  GeneratedImage,
  GenerationTaskSource,
  ImageGenOutcome,
  ImageGenRequest,
  ProgressFn,
  VideoGenRequest,
  VideoJobStatus,
} from "./types.js";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const GENERATION_PATH = "/services/aigc/multimodal-generation/generation";
const REQUEST_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;
/** 落盘目录复用网关既有静态路由 /mock-assets/* */
const OUT_DIR = join(process.cwd(), ".mock-assets");
const URL_PREFIX = "/mock-assets";

// ---------- 响应类型 ----------

interface QwContentPart {
  text?: string;
  image?: string;
}
interface QwGenResponse {
  output?: {
    choices?: { finish_reason?: string; message?: { role?: string; content?: QwContentPart[] } }[];
    task_id?: string;
    task_status?: string;
  };
  usage?: { image_count?: number; size?: string };
  code?: string;
  message?: string;
  request_id?: string;
}

export interface QianwenSourceOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class QianwenTaskSource implements GenerationTaskSource {
  readonly name = "qianwen";
  /** 视频暂无生图契约可接 —— 退回 mock 占位保持链路可测 */
  private readonly videoFallback = new MockTaskSource();

  constructor(private readonly opts: QianwenSourceOptions) {}

  withUserAuth(): GenerationTaskSource {
    return this; // 通义源无 JWT 计费概念，忽略凭证
  }

  private apiKey(): string {
    const key = this.opts.apiKey ?? "";
    if (!key) {
      throw new TaskSourceError(
        "QIANWEN_API_KEY 未配置，无法调用生图服务（TASK_SOURCE=qianwen 需要）",
        "not_configured",
      );
    }
    return key;
  }

  // ---------- 生图 ----------

  async generateImages(
    req: ImageGenRequest,
    onProgress: ProgressFn,
  ): Promise<ImageGenOutcome> {
    const key = this.apiKey();
    const model = this.opts.model ?? "wan2.7-image";
    const size = resolveSizePx(req.aspectRatio, req.imageSize);
    const n = Math.min(Math.max(req.count, 1), 4);

    onProgress("prompt_assembled", 5);

    // 参考图/底图先于文本（编辑模式下前者是输入约束）；本地资产落盘 → base64 dataURL
    const content: QwContentPart[] = [];
    const inputs = [req.baseImageUrl, ...(req.referenceImageUrls ?? [])].filter(
      (u): u is string => Boolean(u),
    );
    if (req.maskUrl) {
      console.warn("[qianwen] 局部遮罩暂不支持（测试后端），退化为整图重绘");
    }
    for (const raw of inputs.slice(0, 3)) {
      content.push({ image: await toApiImageRef(raw) });
    }

    const text = req.negativePrompt ? `${req.prompt}\n\n避免：${req.negativePrompt}` : req.prompt;
    content.push({ text });
    onProgress("submitted", 15);

    const payload = {
      model,
      input: { messages: [{ role: "user", content }] },
      parameters: { size, n },
    };

    const started = Date.now();
    const resp = await this.post(key, payload);
    onProgress("rendering", 50);

    const parts = (resp.output?.choices ?? []).flatMap((c) => c.message?.content ?? []);
    const remoteUrls = parts.flatMap((p) => (p.image ? [p.image] : []));
    if (remoteUrls.length === 0) {
      const detail = resp.message ?? resp.code ?? "响应中不含图片";
      throw new TaskSourceError(`千问生图未返回图片: ${detail}`, "remote_error");
    }

    // 签名 URL 24h 过期：立即落盘，改以网关静态路由对外提供
    const dims = parseSize(resp.usage?.size ?? size);
    const total = remoteUrls.length;
    const results: GeneratedImage[] = [];
    await mkdir(OUT_DIR, { recursive: true });
    for (let i = 0; i < total; i++) {
      const buf = await download(remoteUrls[i]!);
      const fileName = `${randomUUID()}.png`;
      await writeFile(join(OUT_DIR, fileName), buf);
      results.push({ url: `${URL_PREFIX}/${fileName}`, width: dims.w, height: dims.h });
      onProgress("downloading", 60 + Math.round(((i + 1) / total) * 35));
    }
    console.log(`[qianwen] ${model} 出图 ${total} 张（${size}），耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
    onProgress("done", 100);
    return { images: results, partialFailures: [] };
  }

  private async post(apiKey: string, payload: unknown): Promise<QwGenResponse> {
    const base = (this.opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const endpoint = `${base}${GENERATION_PATH}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const bodyText = await res.text();
        let body: QwGenResponse;
        try {
          body = JSON.parse(bodyText) as QwGenResponse;
        } catch {
          body = {};
        }
        if (res.ok && body.output) return body;
        const detail = body.message ?? body.code ?? bodyText.slice(0, 300);
        const errCode: "insufficient_credits" | "remote_error" =
          res.status === 429 || res.status === 403 ? "insufficient_credits" : "remote_error";
        throw new TaskSourceError(`千问生图接口 ${res.status}: ${detail}`, errCode);
      } catch (err) {
        lastErr = err;
        // 明确的业务错误不重试；网络异常/超时才退避重试
        if (err instanceof TaskSourceError && err.code !== "timeout") throw err;
        if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    throw new TaskSourceError(
      `千问生图请求失败（已重试 ${MAX_RETRIES} 次）: ${(lastErr as Error)?.message ?? lastErr}`,
      "remote_error",
    );
  }

  // ---------- 视频：委托 mock 占位 ----------

  async submitVideoTask(req: VideoGenRequest): Promise<{ taskId: string }> {
    return this.videoFallback.submitVideoTask(req);
  }
  async getVideoTask(taskId: string): Promise<VideoJobStatus> {
    return this.videoFallback.getVideoTask(taskId);
  }
  async cancelTask(taskId: string): Promise<void> {
    return this.videoFallback.cancelTask(taskId);
  }
  dispose(): void {
    this.videoFallback.dispose?.();
  }
}

// ---------- 工具函数 ----------

/** 资产引用 → 接口可用的 image 内容：http(s) 透传，其余按本地文件转 dataURL */
async function toApiImageRef(rawUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(rawUrl) || /^data:/i.test(rawUrl)) return rawUrl;
  const rel = rawUrl.startsWith(URL_PREFIX + "/") ? rawUrl.slice(URL_PREFIX.length + 1) : null;
  if (!rel || rel.includes("..")) {
    throw new TaskSourceError(`无法解析参考图地址: ${rawUrl}`, "submission_failed");
  }
  const file = join(OUT_DIR, rel);
  // 路径穿越加固：确保解析后的路径仍在 OUT_DIR 内
  const normalized = file.replace(/\\/g, "/");
  const outDirNorm = OUT_DIR.replace(/\\/g, "/");
  if (!normalized.startsWith(outDirNorm + "/") && normalized !== outDirNorm) {
    throw new TaskSourceError(`路径越界: ${rawUrl}`, "submission_failed");
  }
  const mime = MIME[extname(rel).toLowerCase()] ?? "application/octet-stream";
  const buf = await readFile(file).catch(() => {
    throw new TaskSourceError(`参考图文件读取失败: ${file}`, "submission_failed");
  });
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch((e: Error) => {
    throw new TaskSourceError(`生成结果下载失败: ${e.message}`, "remote_error");
  });
  if (!res.ok) throw new TaskSourceError(`生成结果下载失败: HTTP ${res.status}`, "remote_error");
  return Buffer.from(await res.arrayBuffer());
}

function parseSize(s: string): { w: number; h: number } {
  const m = s.match(/^(\d+)\s*\*\s*(\d+)$/);
  if (!m) return { w: 1280, h: 720 };
  return { w: Number(m[1]), h: Number(m[2]) };
}

/**
 * aspectRatio + imageSize → 该模型接受的像素尺寸字符串 "宽*高"。
 * wan2.7-image 自定义尺寸范围 512~2048；按比例求长边对齐目标档位，边长取 16 的倍数。
 * 4K 与 2K 均受模型上限 2048 限制，故合并处理。
 */
export function resolveSizePx(aspectRatio?: string, imageSize?: string): string {
  const targetLong = imageSize === "2K" || imageSize === "4K" ? 2048 : 1280;
  const ratio = (() => {
    if (!aspectRatio) return { rw: 16, rh: 9 };
    const m = aspectRatio.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m) return { rw: 16, rh: 9 };
    return { rw: Number(m[1]), rh: Number(m[2]) };
  })();
  const longIsWidth = ratio.rw >= ratio.rh;
  const shortSide = Math.round(((longIsWidth ? ratio.rh / ratio.rw : ratio.rw / ratio.rh) * targetLong) / 16) * 16;
  const clamp = (v: number) => Math.min(2048, Math.max(512, v));
  const w = longIsWidth ? targetLong : shortSide;
  const h = longIsWidth ? shortSide : targetLong;
  return `${clamp(w)}*${clamp(h)}`;
}
