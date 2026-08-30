/**
 * 全链路冒烟（qianwen 任务源）：ws 进 gateway → 大脑 → generate_rendering → canvas.place。
 * 运行: npx tsx tests/manual-ws-e2e.ts [需求文案]
 */

import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";

const WS_URL = "ws://localhost:8712/ws";
const text = process.argv[2] ?? "帮我出一个滨江办公楼的黄昏效果图，玻璃幕墙";

const socket = new WebSocket(WS_URL);
const timer = setTimeout(() => {
  console.error("TIMEOUT: 未在时限内收到 canvas.place");
  process.exit(2);
}, 280_000);

let toolStarted = false;

socket.on("open", () => {
  console.log("[e2e] connected");
  socket.send(
    JSON.stringify({
      type: "message.send",
      projectId: "p_e2e",
      text,
      clientId: `e2e_${randomUUID().slice(0, 8)}`,
    }),
  );
});

socket.on("message", (raw) => {
  const msg = JSON.parse(String(raw)) as { seq: number; body: Record<string, unknown> };
  const b = msg.body;
  switch (b.type) {
    case "conversation.delta":
      process.stdout.write(String(b.delta));
      break;
    case "tool.status": {
      const p = b.progress as { stage?: string; percent?: number } | undefined;
      console.log(`\n[e2e] tool ${b.name} ${b.state}${p ? ` ${p.stage} ${p.percent}%` : ""}`);
      if (b.name === "generate_rendering" && b.state === "running") toolStarted = true;
      break;
    }
    case "canvas.place": {
      console.log("\n[e2e] canvas.place:");
      const cards = b.cards as { url: string; width?: number; height?: number }[];
      let ok = true;
      for (const c of cards) {
        console.log(`  ${c.url} ${c.width}x${c.height}`);
        if (!String(c.url).startsWith("/mock-assets/") || !String(c.url).endsWith(".png")) ok = false;
      }
      if (ok && toolStarted) {
        clearTimeout(timer);
        console.log("[e2e] PASS");
        socket.close();
        process.exit(0);
      }
      break;
    }
    case "error":
      console.log(`\n[e2e] ERROR ${b.code}: ${b.message}`);
      break;
    default:
      console.log(`\n[e2e] ${b.type} ${JSON.stringify(b).slice(0, 160)}`);
  }
});

socket.on("error", (err) => {
  console.error("[e2e] ws error:", err.message);
  process.exit(1);
});
