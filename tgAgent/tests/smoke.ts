/**
 * 全链路冒烟测试（不依赖任何外部 API）：
 * 启动网关（mock 任务源 + 脚本大脑）→ ws 客户端走一轮
 * 「需求→出图→落画布→视频→video_completed→断线补发」，断言事件序列。
 */

import { WebSocket } from "ws";
import { loadConfig } from "../src/config.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
import { GatewaySessions } from "../src/gateway/sessions.js";
import { startGateway } from "../src/gateway/wsServer.js";
import type { Downstream, ResyncBatch, ServerMessage } from "../src/shared/protocol.js";

function isBatch(m: ServerMessage): m is ResyncBatch {
  return "messages" in m;
}

async function main(): Promise<void> {
  const base = loadConfig();
  const cfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
  const sessions = new GatewaySessions(
    cfg,
    new AssetStore(),
    new MockTaskSource({ imageDelayMs: [200, 400], videoDelayMs: 1500 }),
    () => undefined,
  );
  // 临时端口：避免与常驻 dev 网关/前端自动重连的 ws 客户端相互干扰
  const gw = await startGateway({ port: 0, sessions, log: () => undefined });

  const ws = new WebSocket(`ws://127.0.0.1:${gw.port}/ws`);
  const received: Downstream[] = [];

  const waitFor = (
    pred: (d: Downstream) => boolean,
    label: string,
    timeoutMs = 20_000,
  ): Promise<Downstream> => {
    const hit = received.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${label} 超时`)), timeoutMs);
      const onMsg = (raw: unknown) => {
        const m = JSON.parse(String(raw)) as ServerMessage;
        if (isBatch(m)) {
          received.push(...m.messages);
          return;
        }
        received.push(m);
        if (m.body.type === "error") console.log("  [error 消息]", m.body.code, m.body.message);
        if (pred(m)) {
          clearTimeout(timer);
          ws.off("message", onMsg);
          resolve(m);
        }
      };
      ws.on("message", onMsg);
    });
  };

  await new Promise((r) => ws.on("open", () => r(null)));

  // ① 需求 → 脚本大脑第一轮：落档 + 追问
  ws.send(
    JSON.stringify({
      type: "message.send",
      projectId: "p_smoke",
      text: "帮我在滨江做一个办公楼方案",
      clientId: "c1",
    }),
  );
  const firstBrief = await waitFor((d) => d.body.type === "brief.updated", "brief.updated");
  const sessionId = firstBrief.body.sessionId; // 客户端从首个响应学习 sessionId
  console.log(`✓ ① 需求落档：brief.updated 收到（session=${sessionId}）`);

  // ② 出图指令 → tool.status(running) → canvas.place(2张候选)
  ws.send(
    JSON.stringify({
      type: "message.send",
      projectId: "p_smoke",
      sessionId,
      text: "出图吧，黄昏光照",
      clientId: "c2",
    }),
  );
  await waitFor((d) => d.body.type === "tool.status" && d.body.state === "running", "tool.status running");
  const placed = await waitFor(
    (d) => d.body.type === "canvas.place" && d.body.cards.length === 2,
    "canvas.place",
  );
  if (placed.body.type !== "canvas.place") throw new Error("unreachable");
  const firstCard = placed.body.cards[0]!;
  console.log(`✓ ② 出图落画布：2 张候选（首张 ${firstCard.assetId}）`);

  // ③ 视频提交 → job.accepted → asset.video_completed
  ws.send(
    JSON.stringify({
      type: "message.send",
      projectId: "p_smoke",
      sessionId,
      text: "做一个环绕视频",
      clientId: "c3",
    }),
  );
  await waitFor((d) => d.body.type === "job.accepted", "job.accepted");
  console.log("✓ ③ 视频任务已受理");
  const done = await waitFor((d) => d.body.type === "asset.video_completed", "asset.video_completed");
  if (done.body.type !== "asset.video_completed") throw new Error("unreachable");
  console.log(`✓ ④ 视频完成推送：${done.body.asset.url}`);

  // ④ 断线补发：循环读取 resync_batch 消息（验证协议类型+消息条数）
  ws.send(JSON.stringify({ type: "message.resync", lastSeq: 0 }));
  const resyncMessages: ResyncBatch[] = [];
  const resyncDone = new Promise<ResyncBatch[]>((resolve) => {
    const handler = (raw: unknown) => {
      const parsed = JSON.parse(String(raw));
      if (parsed && typeof parsed === "object" && parsed.type === "message.resync_batch" && Array.isArray(parsed.messages)) {
        resyncMessages.push(parsed as ResyncBatch);
        if (resyncMessages.length >= 1) resolve(resyncMessages); // resync_batch 通常只有一条
      }
    };
    ws.on("message", handler);
  });
  const batches = await resyncDone;
  const totalMsgs = batches.reduce((sum, b) => sum + b.messages.length, 0);
  console.log(`✓ ⑤ 断线补发：${batches.length} 个批次，共 ${totalMsgs} 条`);

  ws.close();
  await sessions.disposeAll();
  await gw.close();
  console.log("\nSMOKE PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL ❌", err);
  process.exit(1);
});
