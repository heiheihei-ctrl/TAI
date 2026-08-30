/**
 * W1-① 第 5 项收口：vision 带图对话端到端验证。
 * 链路：ws message.send(attachments) → PiBrain → pi PromptOptions.images → DeepSeek vision。
 * 需要 .env 配置 DEEPSEEK_API_KEY；图片用 .mock-assets 下的千问真实生成样图（非 mock 占位）。
 * 产生真实 token 消耗（一轮带图对话）。
 *
 * 断言：回复文本中命中最少 3/4 组视觉事实关键词（建筑类型 / 幕墙玻璃 / 黄昏暖调 / 水面倒影），
 * 证明模型确实"看到"了图，而非按文字提示编造。
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WebSocket } from "ws";
import "../src/config.js";
import { loadConfig } from "../src/config.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
import { GatewaySessions } from "../src/gateway/sessions.js";
import { startGateway } from "../src/gateway/wsServer.js";
import type { Downstream, ServerMessage } from "../src/shared/protocol.js";

/** 样图内容（千问真实生成，已人工核验）：黄昏、玻璃幕墙现代办公楼群（双塔+裙房）、水面倒影 */
const SAMPLE_IMAGE = join(process.cwd(), ".mock-assets", "4569647b-381a-46ed-bc90-bcc761608ce1.png");

/** 每组至少命中一词；命中 ≥3 组判 PASS（防模型仅凭措辞惯性猜测） */
const EXPECTED_GROUPS: { label: string; any: string[] }[] = [
  { label: "建筑类型", any: ["楼", "建筑", "办公", "塔"] },
  { label: "幕墙/玻璃", any: ["幕墙", "玻璃"] },
  { label: "黄昏/暖调", any: ["黄昏", "傍晚", "夕", "暖"] },
  { label: "水面/倒影", any: ["水", "倒影"] },
];

const QUIET_MS = 10_000; // 首个增量后静默 10s 视为回合结束（tool.status 会重置计时）
const TIMEOUT_MS = 180_000;

/** 解析 PNG IHDR 宽高（日志用，勿引入图像依赖） */
function pngSize(buf: Buffer): { w: number; h: number } {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function isBatch(m: ServerMessage): m is import("../src/shared/protocol.js").ResyncBatch {
  return "messages" in m;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.deepseek.apiKey) throw new Error("请在 .env 配置 DEEPSEEK_API_KEY");
  if (!existsSync(SAMPLE_IMAGE))
    throw new Error(`样图缺失：${SAMPLE_IMAGE}（千问真实生成样图，勿用 SVG 占位图代替）`);

  const imgBuf = await readFile(SAMPLE_IMAGE);
  const { w, h } = pngSize(imgBuf);
  const attachment = { mediaType: "image/png", data: imgBuf.toString("base64") };
  console.log(`样图 ${w}x${h}，base64 ${(attachment.data.length / 1024).toFixed(0)} KiB`);

  const sessions = new GatewaySessions(cfg, new AssetStore(), new MockTaskSource(), (l) =>
    console.log("[gw]", l),
  );
  const gw = await startGateway({ port: 0, sessions, log: () => undefined });
  const ws = new WebSocket(`ws://127.0.0.1:${gw.port}/ws`);
  await new Promise((r) => ws.on("open", () => r(null)));

  let transcript = "";
  let lastActivity = Date.now();
  let sawFirstDelta = false;
  let sessionBound = false;
  const errors: string[] = [];

  const turnDone = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("整轮超时（180s 无完整回复）")), TIMEOUT_MS);
    ws.on("message", (raw) => {
      const m = JSON.parse(String(raw)) as ServerMessage;
      if (isBatch(m)) return;
      const b = (m as Downstream).body;
      if (b.type === "conversation.delta") {
        transcript += b.delta;
        sawFirstDelta = true;
        lastActivity = Date.now();
        process.stdout.write(b.delta);
      } else if (b.type === "tool.status") {
        lastActivity = Date.now(); // 工具执行中的停顿不算回合结束
        console.log(`\n[事件] tool.status ${b.name} → ${b.state}`);
      } else if (b.type === "brief.updated") {
        sessionBound = true;
        lastActivity = Date.now();
        console.log(`\n[事件] brief.updated`);
      } else if (b.type === "error") {
        errors.push(`${b.code}: ${b.message}`);
        console.log(`\n[事件] error ${b.code}: ${b.message}`);
      }
    });
    const poll = setInterval(() => {
      if (sawFirstDelta && Date.now() - lastActivity > QUIET_MS) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    }, 500);
  });

  console.log("━━━ vision 带图对话：发送参考图并要求看图描述 ━━━");
  ws.send(
    JSON.stringify({
      type: "message.send",
      projectId: "p_vision",
      text: "这是我找到的一张参考图。请只根据你看到的画面回答：①主体是什么类型的建筑？②外立面主要材料？③大概什么时段、什么色调？④环境里还有什么显著元素？这轮只看图描述，不要出图。",
      attachments: [attachment],
      clientId: "c_vision",
    }),
  );

  await turnDone;

  ws.close();
  await sessions.disposeAll();
  await gw.close();

  // ── 断言 ──
  console.log("\n\n── 断言结果 ──");
  const fails: string[] = [];
  if (errors.length) fails.push(`收到 error 事件: ${errors.join("; ")}`);
  if (!transcript.trim()) fails.push("回复文本为空");
  const hits = EXPECTED_GROUPS.map((g) => ({ label: g.label, ok: g.any.some((k) => transcript.includes(k)) }));
  for (const h of hits) console.log(`  ${h.ok ? "✅" : "❌"} ${h.label}`);
  const hitCount = hits.filter((h) => h.ok).length;
  if (hitCount < 3) fails.push(`视觉事实命中不足（${hitCount}/4 组）`);

  if (fails.length) {
    console.error(`\nPI-VISION FAIL ❌\n  - ${fails.join("\n  - ")}\n\n回复全文：\n${transcript}`);
    process.exit(1);
  }
  console.log(`\nPI-VISION PASS ✅（命中 ${hitCount}/4 组视觉事实，sessionId 绑定=${sessionBound ? "是" : "未观测到"}）`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPI-VISION FAIL ❌", err);
  process.exit(1);
});
