/**
 * TaiTaskSource 集成测试（不依赖真实 TAI 后端）：
 * 本地起一个假 TAI 后端（按 backend/src/ai/ai.controller.ts 的契约返回），
 * 验证：鉴权头 x-api-key、生图异步提交+轮询、Seedream5 批量候选、
 * 视频 provider 提交与任务查询（含首尾帧引用）、错误传播。
 */

import { createServer, type Server } from "node:http";
import { TaiTaskSource } from "../src/tasks/taiSource.js";
import { TaskSourceError } from "../src/tasks/types.js";
import type { GenerationTaskSource, ImageGenRequest, VideoGenRequest } from "../src/tasks/types.js";
import { mapTaskSourceErrorToProtocol } from "../src/shared/protocol.js";

interface State {
  imageTasks: Map<string, { status: string; imageUrls?: string[]; polls: number; settled?: boolean; doomed?: boolean }>;
  videoTasks: Map<string, { status: string; videoUrl?: string }>;
  lastHeaders: Record<string, string | string[] | undefined> | null;
  lastImageBody: any;
  lastVideoBody: any;
  /** 记录生图走的是 generate-image-async 还是 edit-image-async（意图分流验证） */
  lastImageEndpoint: string | null;
  /** 在飞任务数，用于验证并发门控是否真的生效 */
  inFlight: number;
  maxInFlight: number;
  /** 收到的 Idempotency-Key 序列（多候选去重回归防线） */
  idempotencyKeys: string[];
  /** 故障注入：非 null 时生图提交端点直接返回该状态码（401/403 语义测试用） */
  forceSubmitStatus: number | null;
  /** 生图提交总次数（配合下面两个故障注入字段按次序定位目标任务） */
  submitCount: number;
  /** 故障注入：命中这些序号（从 1 计）的提交直接返回 500 */
  failSubmitOrdinals: Set<number>;
  /** 故障注入：下一次提交创建的任务在轮询时判为 failed */
  poisonNextSubmit: boolean;
  /** 故障注入：非 null 时视频轮询端点返回该状态码（401/403 映射测试用） */
  forceVideoPollStatus: number | null;
}

function startFakeTai(state: State): Promise<Server> {
  const srv = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      state.lastHeaders = req.headers;
      const send = (code: number, data: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const url = req.url ?? "";

      if (
        req.method === "POST" &&
        (url === "/api/ai/generate-image-async" || url === "/api/ai/edit-image-async")
      ) {
        state.lastImageBody = JSON.parse(body || "{}");
        state.lastImageEndpoint = url;
        const idem = req.headers["idempotency-key"];
        if (typeof idem === "string") state.idempotencyKeys.push(idem);
        if (state.forceSubmitStatus !== null) {
          return send(state.forceSubmitStatus, { message: `forced ${state.forceSubmitStatus}` });
        }
        state.submitCount += 1;
        if (state.failSubmitOrdinals.has(state.submitCount)) {
          return send(500, { message: "injected submit failure" });
        }
        const doomed = state.poisonNextSubmit;
        state.poisonNextSubmit = false;
        const taskId = `img_${state.imageTasks.size + 1}`;
        state.imageTasks.set(taskId, { status: "queued", polls: 0, doomed });
        state.inFlight += 1;
        state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
        return send(200, { taskId, status: "queued" });
      }
      const imgMatch = url.match(/^\/api\/ai\/image-task\/(.+)$/);
      if (req.method === "GET" && imgMatch) {
        const t = state.imageTasks.get(imgMatch[1]!);
        if (!t) return send(404, { message: "not found" });
        t.polls += 1;
        if (t.doomed && !t.settled) {
          t.settled = true;
          state.inFlight -= 1;
          return send(200, { status: "failed", imageUrl: null, imageUrls: [], thumbnailUrl: null, error: "injected poll failure", progress: 0 });
        }
        if (t.polls >= 2 && !t.settled) {
          // Seedream5 批量：一次任务返回多张
          t.status = "succeeded";
          t.settled = true;
          state.inFlight -= 1; // 任务落定，释放并发槽位
          t.imageUrls = ["https://tos.example.com/a.png", "https://tos.example.com/b.png"];
        }
        return send(200, {
          status: t.status,
          imageUrl: t.imageUrls?.[0] ?? null,
          imageUrls: t.imageUrls ?? [],
          thumbnailUrl: null,
          error: null,
          progress: t.status === "succeeded" ? 100 : 40,
        });
      }

      if (req.method === "POST" && url === "/api/ai/generate-video-provider") {
        state.lastVideoBody = JSON.parse(body || "{}");
        const taskId = `vid_${state.videoTasks.size + 1}`;
        state.videoTasks.set(taskId, { status: "processing" });
        return send(200, { taskId, status: "processing" });
      }
      const vidMatch = url.match(/^\/api\/ai\/video-task\/([^/]+)\/(.+)$/);
      if (req.method === "GET" && vidMatch) {
        if (state.forceVideoPollStatus !== null) {
          return send(state.forceVideoPollStatus, { message: `injected ${state.forceVideoPollStatus}` });
        }
        const t = state.videoTasks.get(vidMatch[2]!);
        if (!t) return send(404, { message: "not found" });
        if (!t.videoUrl) t.videoUrl = "https://tos.example.com/v.mp4";
        return send(200, { status: "succeeded", videoUrl: t.videoUrl });
      }

      send(404, { message: `unknown ${req.method} ${url}` });
    });
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve(srv)));
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function main(): Promise<void> {
  const state: State = {
    imageTasks: new Map(),
    videoTasks: new Map(),
    lastHeaders: null,
    lastImageBody: null,
    lastVideoBody: null,
    lastImageEndpoint: null,
    inFlight: 0,
    maxInFlight: 0,
    idempotencyKeys: [],
    forceSubmitStatus: null,
    submitCount: 0,
    failSubmitOrdinals: new Set(),
    poisonNextSubmit: false,
    forceVideoPollStatus: null,
  };
  const srv = await startFakeTai(state);
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

  const src = new TaiTaskSource({
    baseUrl: base,
    apiToken: "test-key-123",
    imageProvider: "seedream5",
    videoProvider: "kling-o3",
  });

  // ---- ① 生图：批量模式提交 + 轮询 + 去重后的候选列表 ----
  const progress: string[] = [];
  const gen = await src.generateImages(
    {
      projectId: "p_demo",
      prompt: "滨江办公楼 黄昏效果图",
      aspectRatio: "16:9",
      count: 2,
    } satisfies ImageGenRequest,
    (stage) => progress.push(stage),
  );
  assert(gen.images.length === 2, `① 生图返回 2 候选（实际 ${gen.images.length}）`);
  assert(gen.partialFailures.length === 0, "① 全成功时 partialFailures 为空");
  assert(state.lastHeaders?.["x-api-key"] === "test-key-123", "① x-api-key 鉴权头已携带");
  assert(state.lastImageBody?.aiProvider === "seedream5", "① 生图 provider=seedream5");
  assert(state.lastImageBody?.batchMode === true, "① Seedream5 走批量模式");
  assert(state.lastImageBody?.batchCount === 2, "① batchCount=2");
  assert(state.lastImageBody?.aspectRatio === "16:9", "① aspectRatio 透传");
  assert(state.lastImageBody?.projectId === "p_demo", "① projectId 透传");
  assert(progress.includes("submitted") && progress.includes("done"), "① 进度事件含 submitted/done");

  // ---- ② 视频：提交 + 首尾帧引用 + 轮询 ----
  const { taskId } = await src.submitVideoTask({
    projectId: "p_demo",
    prompt: "环绕展示",
    firstFrameUrl: "https://tos.example.com/a.png",
    lastFrameUrl: "https://tos.example.com/b.png",
    durationSec: 10,
  } satisfies VideoGenRequest);
  assert(taskId.startsWith("kling-o3:"), `② 视频 taskId 带 provider 前缀（${taskId}）`);
  assert(state.lastVideoBody?.provider === "kling-o3", "② 视频 provider=kling-o3");
  assert(
    Array.isArray(state.lastVideoBody?.referenceImages) &&
      state.lastVideoBody.referenceImages.length === 2,
    "② 首尾帧作为 referenceImages 传入（2 张）",
  );
  assert(state.lastVideoBody?.duration === 10, "② duration 透传");
  const vs = await src.getVideoTask(taskId);
  assert(vs.status === "done" && vs.url === "https://tos.example.com/v.mp4", "② 视频轮询到 done + url");

  // ---- ③ 未配置时的报错 ----
  const bad = new TaiTaskSource({ baseUrl: "", apiToken: "" });
  let threw = "";
  try {
    await bad.generateImages(
      { projectId: "p", prompt: "x", count: 1 },
      () => {},
    );
  } catch (e) {
    threw = (e as Error).message;
  }
  assert(threw.includes("TAI_API_BASE_URL"), "③ 未配置 baseUrl 时抛 not_configured");

  // ---- ④ 非法 provider 报错 ----
  const badProvider = new TaiTaskSource({ baseUrl: base, apiToken: "k", imageProvider: "gpt5" });
  let threwP = "";
  try {
    await badProvider.generateImages({ projectId: "p", prompt: "x", count: 1 }, () => {});
  } catch (e) {
    threwP = (e as Error).message;
  }
  assert(threwP.includes("不支持的生图 provider"), "④ 非法 provider 被拒绝");

  // ---- ⑤ 底图（版本迭代）必须发出 ----
  // 回归防线：底图若被丢弃，inheritFromAssetId 会静默退化为文生图，不报错但结果完全无关
  // 迭代必须用 banana 系：seedream5/5Pro 的 editImage() 直接抛错
  const iterSrc = new TaiTaskSource({ baseUrl: base, apiToken: "k", imageProvider: "banana-3.1" });
  await iterSrc.generateImages(
    {
      projectId: "p_demo",
      prompt: "改成立面材质为陶板",
      baseImageUrl: "https://tos.example.com/parent.png",
      referenceImageUrls: ["https://tos.example.com/ref.png"],
      count: 1,
    } satisfies ImageGenRequest,
    () => {},
  );
  assert(
    state.lastImageEndpoint === "/api/ai/edit-image-async",
    "⑤ 有底图时走 edit-image-async（迭代语义）",
  );
  assert(
    state.lastImageBody?.sourceImageUrl === "https://tos.example.com/parent.png",
    "⑤ 底图经 sourceImageUrl 发出（真正的图生图）",
  );
  assert(
    Array.isArray(state.lastImageBody?.imageUrls) &&
      state.lastImageBody.imageUrls.length === 1 &&
      state.lastImageBody.imageUrls[0] === "https://tos.example.com/ref.png",
    "⑤ 参考图独立走 imageUrls，底图不混入",
  );

  // ---- ⑥ jwt 计费模式：只发 Authorization，绝不发 x-api-key ----
  // 回归防线：两者并存不报错但静默免单（守卫 apiKey 优先 → req.user 空 → getUserId() null）
  const jwtSrc = new TaiTaskSource({
    baseUrl: base,
    authMode: "jwt",
    accessToken: "user-access-token-xyz",
    teamId: "team_42",
    imageProvider: "seedream5",
  });
  await jwtSrc.generateImages(
    { projectId: "p_demo", prompt: "计费链路", count: 1 } satisfies ImageGenRequest,
    () => {},
  );
  assert(
    state.lastHeaders?.["authorization"] === "Bearer user-access-token-xyz",
    "⑥ Authorization: Bearer 已携带",
  );
  assert(state.lastHeaders?.["x-team-id"] === "team_42", "⑥ X-Team-Id 透传");
  assert(
    state.lastHeaders?.["x-api-key"] === undefined,
    "⑥ jwt 模式未携带 x-api-key（否则静默免单）",
  );

  // ---- ⑦ accessToken 支持异步获取器（token 过期后可 refresh）----
  const fnSrc = new TaiTaskSource({
    baseUrl: base,
    authMode: "jwt",
    accessToken: async () => "refreshed-token",
    imageProvider: "seedream5",
  });
  await fnSrc.generateImages(
    { projectId: "p_demo", prompt: "refresh", count: 1 } satisfies ImageGenRequest,
    () => {},
  );
  assert(
    state.lastHeaders?.["authorization"] === "Bearer refreshed-token",
    "⑦ accessToken 支持异步获取器",
  );

  // ---- ⑧ jwt 模式缺 token 立即报错 ----
  const noTokSrc = new TaiTaskSource({
    baseUrl: base,
    authMode: "jwt",
    imageProvider: "seedream5",
  });
  let threwTok = "";
  try {
    await noTokSrc.generateImages({ projectId: "p", prompt: "x", count: 1 }, () => {});
  } catch (e) {
    threwTok = (e as Error).message;
  }
  assert(threwTok.includes("accessToken"), "⑧ jwt 缺 accessToken 抛 not_configured");

  // ---- ⑨ 意图分流：无底图走 generate，默认 provider 保比例 ----
  // 用户决策「保迭代/比例」→ 默认 provider 为 banana-3.1（seedream5 会丢弃 aspectRatio）
  const defSrc = new TaiTaskSource({ baseUrl: base, apiToken: "k" });
  state.idempotencyKeys = [];
  await defSrc.generateImages(
    {
      projectId: "p_demo",
      prompt: "首轮探索",
      aspectRatio: "16:9",
      count: 2,
    } satisfies ImageGenRequest,
    () => {},
  );
  assert(state.lastImageBody?.aiProvider === "banana-3.1", "⑨ 默认 provider=banana-3.1");
  assert(
    state.lastImageEndpoint === "/api/ai/generate-image-async",
    "⑨ 无底图走 generate-image-async（首轮探索）",
  );
  assert(state.lastImageBody?.aspectRatio === "16:9", "⑨ aspectRatio 透传（banana 会真正生效）");
  assert(
    state.lastImageBody?.batchMode === undefined,
    "⑨ 不走 batchMode——banana n:1，多候选靠并发独立任务",
  );

  // ---- ⑪ 幂等键：每个候选任务各自唯一 ----
  // 回归防线：若按内容生成，多个候选会拿到相同 key 而被后端去重，最终只出一张图
  assert(
    state.idempotencyKeys.length === 2,
    `⑪ 两个候选各提交一次（收到 ${state.idempotencyKeys.length} 个 key）`,
  );
  assert(
    new Set(state.idempotencyKeys).size === 2,
    "⑪ 幂等键互不相同（共用会被后端去重成一张）",
  );
  assert(
    state.idempotencyKeys.every((k) => k.startsWith("img-") && k.length <= 128),
    "⑪ 幂等键格式与长度合规（后端截断 128 字符）",
  );

  // ---- ⑩ 并发门控：最多 MAX_CONCURRENT_GENERATIONS(2) 个任务在飞 ----
  // 历史缺陷①：旧实现 fn() 在门控链外立即启动，常量从未被引用，上限形同虚设。
  // 历史缺陷②（2026-08-29）：release 预分配槽位后被唤醒方重复计数，第 3 个任务
  //   永久排队。**该缺陷表现为挂起而非失败**——若无超时保护，回归时整个测试套件
  //   会卡死到外部超时，红灯被掩盖。故这里必须自带超时把挂起转成失败。
  const gateSrc = new TaiTaskSource({ baseUrl: base, apiToken: "k" });
  state.maxInFlight = 0;
  const GATE_TEST_TIMEOUT_MS = 20_000;
  let gateTimer: ReturnType<typeof setTimeout> | undefined;
  const gateOutcome = await Promise.race([
    Promise.all([
      gateSrc.generateImages({ projectId: "p", prompt: "A", count: 1 } satisfies ImageGenRequest, () => {}),
      gateSrc.generateImages({ projectId: "p", prompt: "B", count: 1 } satisfies ImageGenRequest, () => {}),
      gateSrc.generateImages({ projectId: "p", prompt: "C", count: 1 } satisfies ImageGenRequest, () => {}),
    ]).then(() => "ok" as const),
    new Promise<"timeout">((r) => {
      gateTimer = setTimeout(() => r("timeout"), GATE_TEST_TIMEOUT_MS);
    }),
  ]);
  // 成功路径也要清掉，否则 timer 会白占 20s 事件循环、拖慢整个套件
  if (gateTimer) clearTimeout(gateTimer);
  assert(
    gateOutcome === "ok",
    `⑩ 三个并发任务全部完成（并发数 > 上限 2 时不得挂起，实际 ${gateOutcome}）`,
  );
  assert(state.maxInFlight <= 2, `⑩ 并发上限生效：峰值 ${state.maxInFlight} ≤ 2`);
  assert(state.maxInFlight >= 2, `⑩ 确实在并发（峰值 ${state.maxInFlight} ≥ 2，非串行）`);

  // ---- ⑫ 凭证互斥断言：jwt + apiToken 同时配置 → 构造期直接抛错 ----
  // 回归防线：两者并存不报错但静默免单（守卫 apiKey 优先），必须在开发期炸出来
  let threwMix = "";
  try {
    new TaiTaskSource({
      baseUrl: base,
      authMode: "jwt",
      apiToken: "should-not-be-set",
      accessToken: "user-token",
    });
  } catch (e) {
    threwMix = (e as Error).message;
  }
  assert(threwMix.includes("凭证冲突"), "⑫ jwt 模式配置 apiToken 时构造期抛错");
  assert(threwMix.includes("静默免单"), "⑫ 错误信息点明静默免单风险");

  // ---- ⑫b withUserAuth 派生 jwt 源时不得携带共享源的 apiToken ----
  // 回归防线（2026-08-29 P0-B）：早期实现用 {...this.opts} 把共享源（apiKey 模式）
  // 的 apiToken 一并带到 jwt 实例上，撞上 ⑫ 的互斥断言 → 抛错 → BFF /chat 一律 500，
  // 整条生产计费链路瘫痪。这里直接锁住派生动作，而不只依赖端到端用例。
  const sharedSrc = new TaiTaskSource({ baseUrl: base, apiToken: "shared-api-key" });
  let derived: GenerationTaskSource | undefined;
  let deriveErr = "";
  try {
    derived = sharedSrc.withUserAuth("user-jwt-xyz", "team_1");
  } catch (e) {
    deriveErr = (e as Error).message;
  }
  assert(derived !== undefined, `⑫b 从 apiKey 共享源派生 jwt 源成功（${deriveErr}）`);
  assert(
    (derived as unknown as { opts?: { apiToken?: string } } | undefined)?.opts?.apiToken === undefined,
    "⑫b 派生的 jwt 源已剔除共享源 apiToken",
  );

  // ---- ⑬ 401 → auth_expired（token 过期，前端刷新后重试）----
  state.forceSubmitStatus = 401;
  let code401 = "";
  try {
    await jwtSrc.generateImages({ projectId: "p", prompt: "x", count: 1 }, () => {});
  } catch (e) {
    code401 = e instanceof TaskSourceError ? e.code : "";
  }
  assert(code401 === "auth_expired", `⑬ 401 映射为 auth_expired（实际 ${code401 || "未抛出"}）`);

  // ---- ⑭ 403 → insufficient_credits（积分不足，提示用户）----
  state.forceSubmitStatus = 403;
  let code403 = "";
  try {
    await jwtSrc.generateImages({ projectId: "p", prompt: "x", count: 1 }, () => {});
  } catch (e) {
    code403 = e instanceof TaskSourceError ? e.code : "";
  }
  assert(code403 === "insufficient_credits", `⑭ 403 映射为 insufficient_credits（实际 ${code403 || "未抛出"}）`);
  state.forceSubmitStatus = null;

  // ---- ⑭b getVideoTask 401/403 抛出 TaskSourceError（轮询层可映射协议码）----
  const vidSrc = new TaiTaskSource({ baseUrl: base, apiToken: "k" });
  state.forceVideoPollStatus = 401;
  let vidCode401 = "";
  try {
    await vidSrc.getVideoTask("kling-o3:test-task");
  } catch (e) {
    vidCode401 = e instanceof TaskSourceError ? e.code : "";
  }
  assert(vidCode401 === "auth_expired", `⑭b 视频轮询 401 → auth_expired（实际 ${vidCode401 || "未抛出"}）`);
  state.forceVideoPollStatus = 403;
  let vidCode403 = "";
  try {
    await vidSrc.getVideoTask("kling-o3:test-task");
  } catch (e) {
    vidCode403 = e instanceof TaskSourceError ? e.code : "";
  }
  assert(vidCode403 === "insufficient_credits", `⑭b 视频轮询 403 → insufficient_credits（实际 ${vidCode403 || "未抛出"}）`);
  state.forceVideoPollStatus = null;

  // ---- ⑮ 部分失败（轮询阶段）：一个候选失败不得连累其余成果（风险④）----
  // 回归防线：N 个并发任务 = N 次预扣；旧 Promise.all 语义下一任务失败会整批抛错，
  // 把已扣费且成功的图白白丢掉。现在必须"部分成功也交付"
  const pfSrc = new TaiTaskSource({ baseUrl: base, apiToken: "k" }); // 默认 banana → 并发模式
  state.poisonNextSubmit = true;
  const pfOutcome = await pfSrc.generateImages(
    { projectId: "p", prompt: "部分失败测试", count: 2 } satisfies ImageGenRequest,
    () => {},
  );
  assert(pfOutcome.images.length === 2, `⑮ 一候选失败后其余任务出图照常交付（实际 ${pfOutcome.images.length} 张）`);
  assert(pfOutcome.partialFailures.length === 1, `⑮ 失败被记入 partialFailures（实际 ${pfOutcome.partialFailures.length} 条）`);
  assert(pfOutcome.partialFailures[0]!.message.includes("injected poll failure"), "⑮ 失败原因携带远端错误信息");

  // ---- ⑯ 部分失败（提交阶段）：候选提交 500 → 记录原因但不抛错 ----
  state.submitCount = 0;
  state.failSubmitOrdinals = new Set([2]);
  const sfOutcome = await pfSrc.generateImages(
    { projectId: "p", prompt: "部分失败测试2", count: 2 } satisfies ImageGenRequest,
    () => {},
  );
  assert(sfOutcome.images.length === 2, "⑯ 一个提交失败后其余候选照常交付");
  assert(
    sfOutcome.partialFailures.length === 1 && sfOutcome.partialFailures[0]!.message.includes("HTTP 500"),
    "⑯ 提交失败带状态码被记录",
  );
  state.failSubmitOrdinals = new Set();

  // ---- ⑰ 协议映射：not_configured 单列错误码，不得落入 generation_failed ----
  // 配置/部署错误（缺 baseUrl、非法 provider、jwt+apiToken 互斥）不是生成失败，
  // 用户重试不会恢复；前端需据此提示"服务配置问题"，监控需按码分流（P2 打磨项）。
  const cfgProto = mapTaskSourceErrorToProtocol(new TaskSourceError("TAI_API_BASE_URL 未配置", "not_configured"));
  assert(cfgProto.code === "not_configured", `⑰ not_configured → not_configured（实际 ${cfgProto.code}）`);
  assert(cfgProto.message.includes("服务配置错误"), "⑰ 文案提示服务配置错误而非生成失败");
  // 其余既有映射不受新增分支影响
  assert(
    mapTaskSourceErrorToProtocol(new TaskSourceError("x", "remote_error")).code === "generation_failed",
    "⑰ remote_error 仍走 default → generation_failed",
  );
  assert(
    mapTaskSourceErrorToProtocol(new TaskSourceError("x", "submission_failed")).code === "generation_failed",
    "⑰ submission_failed 仍走 default → generation_failed",
  );

  // close() 只停止接受新连接；undici keep-alive 连接池会攥住存量 socket 导致进程不退出
  srv.closeAllConnections();
  await new Promise<void>((r) => srv.close(() => r()));
  console.log("\nTAI SOURCE TEST PASS ✅");
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
