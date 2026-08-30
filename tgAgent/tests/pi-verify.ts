/**
 * W1-① 端到端验证：pi 大脑 + DeepSeek 真实对话 + 工具调用 + 流式 + 画布事件。
 * 需要 .env 配置 DEEPSEEK_API_KEY。产生真实 token 消耗（约几千 token）。
 */

import { WebSocket } from "ws";
import "../src/config.js";
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
  const cfg = loadConfig();
  if (!cfg.deepseek.apiKey) throw new Error("请在 .env 配置 DEEPSEEK_API_KEY");

  const sessions = new GatewaySessions(
    cfg,
    new AssetStore(),
    new MockTaskSource({ imageDelayMs: [300, 600], videoDelayMs: 1500 }),
    (l) => console.log("[gw]", l),
  );
  const gw = await startGateway({ port: 0, sessions, log: (l) => console.log("[gw]", l) });
  console.log(`网关端口: ${gw.port}`);

  const ws = new WebSocket(`ws://127.0.0.1:${gw.port}/ws`);
  await new Promise((r) => ws.on("open", () => r(null)));

  const received: Downstream[] = [];
  const waiters: { pred: (d: Downstream) => boolean; resolve: (d: Downstream) => void }[] = [];

  const waitFor = (pred: (d: Downstream) => boolean, label: string, timeoutMs = 180_000): Promise<Downstream> => {
    const hit = received.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${label} 超时`)), timeoutMs);
      waiters.push({
        pred: (d) => {
          if (pred(d)) {
            clearTimeout(timer);
            return true;
          }
          return false;
        },
        resolve,
      });
    });
  };

  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as ServerMessage;
    if (isBatch(m)) return;
    received.push(m);
    // 实时转录
    const b = m.body;
    if (b.type === "conversation.delta") process.stdout.write(b.delta);
    else if (b.type === "tool.status")
      console.log(`\n[事件] tool.status ${b.name} → ${b.state}${b.progress ? ` (${b.progress.stage} ${b.progress.percent}%)` : ""}`);
    else if (b.type === "canvas.place")
      console.log(`\n[事件] canvas.place ×${b.cards.length} @(${b.cards[0]?.pos.x},${b.cards[0]?.pos.y})`);
    else if (b.type === "brief.updated") console.log(`\n[事件] brief.updated 完备度=${b.brief.completeness}`);
    else if (b.type === "error") console.log(`\n[事件] error ${b.code}: ${b.message}`);
    else console.log(`\n[事件] ${b.type}`);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.pred(m)) {
        waiters[i]!.resolve(m);
        waiters.splice(i, 1);
      }
    }
  });

  const send = (text: string, clientId: string, sessionId?: string, attachments?: { mediaType: string; data: string }[]) =>
    ws.send(JSON.stringify({ type: "message.send", projectId: "p_verify", sessionId, text, clientId, attachments }));

  // ── 场景1：需求澄清 → 应触发 update_design_brief 工具调用 + 追问 ──
  console.log("\n━━━ 场景1：模糊需求（期待 brief 工具 + 追问）━━━");
  send("我想做一个美术馆方案，在西湖边上", "c1");
  const briefUpdated = await waitFor((d) => d.body.type === "brief.updated", "brief.updated");
  const sid = briefUpdated.body.sessionId;
  const sawBriefTool = received.some(
    (d) => d.body.type === "tool.status" && d.body.name === "update_design_brief",
  );
  console.log(`\n→ 会话 ${sid}，brief 工具${sawBriefTool ? "已调用 ✅" : "未调用 ❌"}`);

  // ── 场景2：出图 → 期待 generate_rendering 工具 → canvas.place ──
  console.log("\n━━━ 场景2：出图指令（期待生图工具 + 画布落图）━━━");
  send("可以，出图吧，黄昏低角度光照，人视角看主入口", "c2", sid);
  await waitFor(
    (d) => d.body.type === "canvas.place" && d.body.cards.length > 0,
    "canvas.place",
    240_000,
  );
  console.log("→ 画布落图 ✅");

  // ── 场景3：迭代上一版 → 期待 inheritFromAssetId 血缘 ──
  console.log("\n━━━ 场景3：迭代（期待血缘继承）━━━");
  send("保持构图，把幕墙换成暖色陶板再看看", "c3", sid);
  await waitFor(
    (d) => d.body.type === "canvas.place" && d.body.cards.some((c) => c.parentIds.length > 0),
    "带血缘的 canvas.place",
    240_000,
  );
  console.log("→ 版本血缘 ✅");

  ws.close();
  await sessions.disposeAll();
  await gw.close();
  console.log("\nPI-VERIFY PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPI-VERIFY FAIL ❌", err);
  process.exit(1);
});
