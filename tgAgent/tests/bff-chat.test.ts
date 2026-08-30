/**
 * BFF 转发入口测试：`POST /chat`（SSE 流式）。
 *
 * 这个端点服务的是 TAI 后端 `/api/ai/architecture-chat`——前者是后者的上游。
 * 锁住这里的契约，P2 对接时就不必猜测流式格式与结束信号。
 *
 * 不依赖任何外部 API：强制脚本大脑（deepseek.apiKey 置空）+ mock 任务源。
 */

import { createServer, type Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
import { TaiTaskSource } from "../src/tasks/taiSource.js";
import { GatewaySessions } from "../src/gateway/sessions.js";
import { startGateway } from "../src/gateway/wsServer.js";
import type { Downstream } from "../src/shared/protocol.js";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`✓ ${msg}`);
  } else {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

/** 读 SSE 流，直到收到 `event: done` 或超时 */
async function readSse(
  res: Response,
  timeoutMs = 20_000,
): Promise<{ events: Downstream[]; sawDone: boolean }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Downstream[] = [];
  let buf = "";
  let sawDone = false;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline && !sawDone) {
    // race 一层超时：流不会自己结束，必须在 done 出现前可读、超时后能跳出
    const { done, value } = await Promise.race([
      reader.read(),
      new Promise<{ done: true }>((r) =>
        setTimeout(() => r({ done: true }), Math.max(0, deadline - Date.now())),
      ),
    ]);
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // SSE 事件以空行分隔
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: done")) {
          sawDone = true;
          continue;
        }
        if (line.startsWith("data:")) {
          try {
            events.push(JSON.parse(line.slice(5).trim()) as Downstream);
          } catch {
            /* 非 JSON 帧忽略 */
          }
        }
      }
    }
  }

  try {
    await reader.cancel();
  } catch {
    /* 已结束 */
  }
  return { events, sawDone };
}

async function main(): Promise<void> {
  const base = loadConfig();
  // 置空 key 强制走 ScriptedBrain：测试不应消耗真实 token
  const cfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
  const sessions = new GatewaySessions(
    cfg,
    new AssetStore(),
    new MockTaskSource({ imageDelayMs: [100, 200], videoDelayMs: 800 }),
    () => undefined,
  );
  const gw = await startGateway({ port: 0, sessions, log: () => undefined });
  const origin = `http://127.0.0.1:${gw.port}`;

  // ---- ① 正常一轮 ----
  const res = await fetch(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p_bff", text: "帮我在滨江做一个办公楼方案" }),
  });
  assert(res.status === 200, `① HTTP 200（实际 ${res.status}）`);
  assert(
    (res.headers.get("content-type") ?? "").includes("text/event-stream"),
    "① 响应为 SSE（text/event-stream）",
  );

  const { events, sawDone } = await readSse(res);
  assert(events.length > 0, `① 收到 SSE 数据帧 ${events.length} 条`);
  assert(
    events.some((e) => e.body.type === "brief.updated"),
    "① 含 brief.updated（需求落档）",
  );
  assert(
    events.some((e) => e.body.type === "conversation.delta"),
    "① 含 conversation.delta（文本流）",
  );
  assert(sawDone, "① 收到 event: done（本轮正常结束）");

  // ---- ② seq 单调递增（断线补发依赖）----
  const seqs = events.map((e) => e.seq);
  const brokenAt = seqs.findIndex((s, i) => i > 0 && s <= seqs[i - 1]!);
  assert(
    brokenAt === -1,
    `② seq 单调递增${brokenAt === -1 ? "" : `（在索引 ${brokenAt} 处断裂，seqs=${JSON.stringify(seqs)}）`}`,
  );

  // ---- ③ 参数校验 ----
  const blank = await fetch(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p_bff", text: "   " }),
  });
  assert(blank.status === 400, `③ 空 text 返回 400（实际 ${blank.status}）`);

  const badJson = await fetch(`${origin}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ 不是 JSON",
  });
  assert(badJson.status === 400, `③ 非法 JSON 返回 400（实际 ${badJson.status}）`);

  // ---- ④ 未命中路径 ----
  const nf = await fetch(`${origin}/nope`, { method: "POST" });
  assert(nf.status === 404, `④ 未知路径返回 404（实际 ${nf.status}）`);

  await sessions.disposeAll();
  await gw.close();

  // ---- ⑤⑥ 计费链路：BFF 透传用户 JWT → 会话级 jwt 源 → 回调只带 Authorization ----
  // 假 TAI 后端：记录回调头，生图轮询首轮即成功（缩短测试耗时）
  const taiHeaders: Record<string, string | string[] | undefined>[] = [];
  const taiTasks = new Map<string, { polls: number }>();
  const fakeTai: Server = createServer((req, res) => {
    const send = (code: number, data: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const url = req.url ?? "";
    if (req.method === "POST" && url === "/api/ai/generate-image-async") {
      taiHeaders.push({ ...req.headers });
      const taskId = `img_${taiTasks.size + 1}`;
      taiTasks.set(taskId, { polls: 0 });
      return send(200, { taskId, status: "queued" });
    }
    const m = url.match(/^\/api\/ai\/image-task\/(.+)$/);
    if (req.method === "GET" && m) {
      const t = taiTasks.get(m[1]!);
      if (!t) return send(404, { message: "not found" });
      t.polls += 1;
      if (t.polls >= 1) {
        return send(200, {
          status: "succeeded",
          imageUrl: `https://tos.example.com/${m[1]}.png`,
          imageUrls: [`https://tos.example.com/${m[1]}.png`],
          progress: 100,
        });
      }
      return send(200, { status: "processing", progress: 40 });
    }
    send(404, { message: `unknown ${req.method} ${url}` });
  });
  await new Promise<void>((r) => fakeTai.listen(0, "127.0.0.1", () => r()));
  const fakeBase = `http://127.0.0.1:${(fakeTai.address() as { port: number }).port}`;

  const cfg2 = {
    ...base,
    deepseek: { ...base.deepseek, apiKey: "" },
    tai: { ...base.tai, apiBaseUrl: fakeBase },
  };
  // 共享源 = apiKey 模式（联调默认）；会话级源由 BFF 透传的 JWT 触发
  const sessions2 = new GatewaySessions(
    cfg2,
    new AssetStore(),
    new TaiTaskSource({ baseUrl: fakeBase, apiToken: "shared-api-key" }),
    () => undefined,
  );
  const gw2 = await startGateway({ port: 0, sessions: sessions2, log: () => undefined });
  const origin2 = `http://127.0.0.1:${gw2.port}`;

  // ---- ⑤ 对照：无 Authorization → 回退共享源，回调带 x-api-key ----
  const ctl = await fetch(`${origin2}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p_ctl", text: "出一个办公楼效果图方案" }),
  });
  const ctlRead = await readSse(ctl);
  assert(ctlRead.sawDone, "⑤ 无凭证轮正常结束（对照不回归）");
  const ctlHeaders = taiHeaders[0];
  assert(ctlHeaders?.["x-api-key"] === "shared-api-key", "⑤ 无凭证时回退共享 apiKey 源");
  assert(ctlHeaders?.["authorization"] === undefined, "⑤ 对照请求不含 Authorization");

  // ---- ⑥ 带 JWT → 会话级源生效：只带 Bearer + X-Team-Id，绝不带 x-api-key ----
  const taiHeadersBefore = taiHeaders.length;
  const jwtRes = await fetch(`${origin2}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer user-jwt-e2e",
      "x-team-id": "team_bff",
    },
    body: JSON.stringify({ projectId: "p_jwt", text: "出一个滨江办公楼黄昏效果图" }),
  });
  const { events: jwtEvents, sawDone: jwtDone } = await readSse(jwtRes);
  assert(jwtDone, "⑥ 带 JWT 轮正常结束");
  assert(
    jwtEvents.some((e) => e.body.type === "canvas.place"),
    "⑥ 出图经 jwt 源完成并落位（canvas.place）",
  );
  const jwtHeaders = taiHeaders.slice(taiHeadersBefore);
  assert(jwtHeaders.length >= 1, `⑥ jwt 轮发起了生图回调（${jwtHeaders.length} 次）`);
  assert(
    jwtHeaders.every((h) => h["authorization"] === "Bearer user-jwt-e2e"),
    "⑥ 每次回调都携带用户 Bearer（积分计入用户）",
  );
  assert(
    jwtHeaders.every((h) => h["x-team-id"] === "team_bff"),
    "⑥ X-Team-Id 逐跳透传",
  );
  assert(
    jwtHeaders.every((h) => h["x-api-key"] === undefined),
    "⑥ 回调绝不携带 x-api-key（否则守卫优先判 apiKey → 静默免单）",
  );

  await sessions2.disposeAll();
  await gw2.close();
  fakeTai.closeAllConnections();
  await new Promise<void>((r) => fakeTai.close(() => r()));

  // ---- ⑧ 每 IP 限流（须在鉴权测试前运行，因限流桶为模块级共享）----
  {
    const rlCfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
    const rlSessions = new GatewaySessions(
      rlCfg, new AssetStore(), new MockTaskSource({ imageDelayMs: [100, 200] }), () => undefined,
    );
    const rlGw = await startGateway({
      port: 0, sessions: rlSessions, log: () => undefined,
      chatRateLimit: { max: 2, windowMs: 10_000 },
    });
    const rlOrigin = `http://127.0.0.1:${rlGw.port}`;

    const r1 = await fetch(`${rlOrigin}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "p_rl", text: "req1" }) });
    assert(r1.status === 200, `⑧ 第1次请求通过（实际 ${r1.status}）`);
    await readSse(r1);

    const r2 = await fetch(`${rlOrigin}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "p_rl", text: "req2" }) });
    assert(r2.status === 200, `⑧ 第2次请求通过（实际 ${r2.status}）`);
    await readSse(r2);

    const r3 = await fetch(`${rlOrigin}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "p_rl", text: "req3" }) });
    assert(r3.status === 429, `⑧ 第3次请求被限流 → 429（实际 ${r3.status}）`);

    await rlSessions.disposeAll();
    await rlGw.close();
  }

  // ---- ⑦ BFF 服务间鉴权：BFF_SECRET 生效时 x-bff-token 须匹配 ----
  {
    const secCfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
    const secSessions = new GatewaySessions(
      secCfg, new AssetStore(), new MockTaskSource({ imageDelayMs: [100, 200] }), () => undefined,
    );
    const secGw = await startGateway({
      port: 0, sessions: secSessions, log: () => undefined,
      bffSecret: "s3cr3t",
    });
    const secOrigin = `http://127.0.0.1:${secGw.port}`;

    const noToken = await fetch(`${secOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "p_sec", text: "测试鉴权" }),
    });
    assert(noToken.status === 401, `⑦ 无 x-bff-token → 401（实际 ${noToken.status}）`);

    const wrongToken = await fetch(`${secOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bff-token": "wrong" },
      body: JSON.stringify({ projectId: "p_sec", text: "测试鉴权" }),
    });
    assert(wrongToken.status === 401, `⑦ 错误 x-bff-token → 401（实际 ${wrongToken.status}）`);

    const goodToken = await fetch(`${secOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bff-token": "s3cr3t" },
      body: JSON.stringify({ projectId: "p_sec", text: "测试鉴权通过" }),
    });
    assert(goodToken.status === 200, `⑦ 正确 x-bff-token → 200（实际 ${goodToken.status}）`);
    await readSse(goodToken);

    await secSessions.disposeAll();
    await secGw.close();
  }

  // ---- ⑨ 请求体上限 ----
  {
    const bodyCfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
    const bodySessions = new GatewaySessions(
      bodyCfg, new AssetStore(), new MockTaskSource({ imageDelayMs: [100, 200] }), () => undefined,
    );
    const bodyGw = await startGateway({
      port: 0, sessions: bodySessions, log: () => undefined,
      chatMaxBodyBytes: 100,
    });
    const bodyOrigin = `http://127.0.0.1:${bodyGw.port}`;

    const bigBody = "x".repeat(200);
    const bigRes = await fetch(`${bodyOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bigBody,
    });
    assert(bigRes.status === 413, `⑨ 超大请求体 → 413（实际 ${bigRes.status}）`);

    await bodySessions.disposeAll();
    await bodyGw.close();
  }

  // ---- ⑩ userId 隔离：同 projectId+sessionId，不同 bearer → 不同会话 ----
  {
    const isoCfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
    const isoSessions = new GatewaySessions(
      isoCfg, new AssetStore(), new MockTaskSource({ imageDelayMs: [100, 200] }), () => undefined,
    );
    const isoGw = await startGateway({ port: 0, sessions: isoSessions, log: () => undefined });
    const isoOrigin = `http://127.0.0.1:${isoGw.port}`;

    const resA = await fetch(`${isoOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer user-a-token" },
      body: JSON.stringify({ projectId: "p_iso", sessionId: "shared", text: "用户A的消息" }),
    });
    assert(resA.status === 200, `⑩ 用户A请求通过（实际 ${resA.status}）`);
    await readSse(resA);

    const resB = await fetch(`${isoOrigin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer user-b-token" },
      body: JSON.stringify({ projectId: "p_iso", sessionId: "shared", text: "用户B的消息" }),
    });
    assert(resB.status === 200, `⑩ 用户B请求通过（实际 ${resB.status}）`);
    await readSse(resB);

    // 两个不同 bearer → 两个不同会话（不串台）
    const recA = isoSessions.get("p_iso", "shared",
      (await import("node:crypto")).createHash("sha256").update("user-a-token").digest("hex").slice(0, 16));
    const recB = isoSessions.get("p_iso", "shared",
      (await import("node:crypto")).createHash("sha256").update("user-b-token").digest("hex").slice(0, 16));
    assert(recA !== undefined && recB !== undefined, "⑩ 两个用户各自有会话记录");
    assert(recA !== recB, "⑩ 不同 bearer → 不同会话（租户隔离）");

    await isoSessions.disposeAll();
    await isoGw.close();
  }

  if (failed > 0) {
    console.error(`\n${failed} 项失败`);
    process.exit(1);
  }
  console.log("\nBFF CHAT TEST PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("BFF CHAT FAIL ❌", err);
  process.exit(1);
});
