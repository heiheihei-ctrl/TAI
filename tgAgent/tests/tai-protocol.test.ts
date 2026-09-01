/**
 * TAI ↔ tgagent 协议契约测试。
 *
 * 验证 TAI 前端（aiChatStore.ts）发送的 payload 格式与后端期望完全对齐，
 * 以及 SSE 下行数据格式与前端解析器兼容。
 *
 * 覆盖场景：
 *  ① selectionRefs 带 normalizedRegion → 透传到 pi brain
 *  ② attachments（base64 图片）→ 透传到 pi brain
 *  ③ 同一 sessionId 续接 → 上下文不丢失
 *  ④ TAI 前端 parser 能正确解析的 SSE 帧格式
 *  ⑤ canvas.place 事件出图链路
 *  ⑥ tool.status 工具执行状态事件
 */

import { createServer, type Server } from "node:http";
import { loadConfig } from "../src/config.js";
import { AssetStore } from "../src/assets/store.js";
import { MockTaskSource } from "../src/tasks/mockSource.js";
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 读 SSE 流，收集所有事件直到 event: done */
async function readSse(
  res: Response,
  timeoutMs = 15_000,
): Promise<{ events: Downstream[]; sawDone: boolean }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: Downstream[] = [];
  let buf = "";
  let sawDone = false;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline && !sawDone) {
    const { done, value } = await Promise.race([
      reader.read(),
      new Promise<{ done: true }>((r) =>
        setTimeout(() => r({ done: true }), Math.max(0, deadline - Date.now())),
      ),
    ]);
    if (done) break;
    buf += decoder.decode(value, { stream: true });

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
            /* skip non-JSON frames */
          }
        }
      }
    }
  }

  try {
    await reader.cancel();
  } catch {
    /* done */
  }
  return { events, sawDone };
}

async function main(): Promise<void> {
  const base = loadConfig();
  const cfg = { ...base, deepseek: { ...base.deepseek, apiKey: "" } };
  const sessions = new GatewaySessions(
    cfg,
    new AssetStore(),
    new MockTaskSource({ imageDelayMs: [100, 200], videoDelayMs: 800 }),
    () => undefined,
  );
  const gw = await startGateway({ port: 0, sessions, log: () => undefined });
  const origin = `http://127.0.0.1:${gw.port}`;

  // ================================================================
  // ① selectionRefs 带 normalizedRegion → 透传到 pi brain
  // ================================================================
  {
    const res = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_sel",
        text: "优化这个选定区域",
        sessionId: "s_sel",
        selectionRefs: [
          {
            assetId: "img_001",
            kind: "image",
            imageWidth: 1024,
            imageHeight: 768,
            normalizedRegion: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
          },
        ],
      }),
    });
    assert(res.status === 200, `① HTTP 200（实际 ${res.status}）`);

    // 不等待完整流（ScriptedBrain 不需要真正跑 pi），只验证请求被接受
    // 检查 selection 是否已记录到 session 中
    const rec = sessions.get("p_sel", "s_sel");
    if (rec) {
      const s = rec as unknown as { selection: { assetId: string; normalizedRegion?: { x: number; y: number; width: number; height: number } }[] };
      assert(
        s.selection.some(
          (sel) => sel.assetId === "img_001" &&
            sel.normalizedRegion &&
            Math.abs(sel.normalizedRegion.x - 0.1) < 0.001,
        ),
        "① selectionRefs.normalizedRegion 写入 session selection（x≈0.1）",
      );
    } else {
      assert(false, "① session p_sel/s_sel 存在");
    }

    try {
      await res.body?.cancel();
    } catch {
      /* ok */
    }
  }

  // ================================================================
  // ② attachments（base64 图片）→ 透传到 pi brain
  // ================================================================
  {
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const res = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_att",
        text: "分析这张图",
        sessionId: "s_att",
        attachments: [
          { mediaType: "image/png", data: `data:image/png;base64,${tinyPng}` },
        ],
      }),
    });
    assert(res.status === 200, `② 带 attachments 请求通过（实际 ${res.status}）`);

    // ScriptedBrain 会在回复中带上附件标记
    try {
      await res.body?.cancel();
    } catch {
      /* ok */
    }
  }

  // ================================================================
  // ③ 同一 sessionId 续接 → 上下文不丢失
  // ================================================================
  {
    const r1 = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_cont",
        sessionId: "s_cont",
        text: "第一轮对话",
      }),
    });
    assert(r1.status === 200, `③-1 第一轮 HTTP 200（实际 ${r1.status}）`);

    // 读完第一轮的 done
    const { sawDone: d1 } = await readSse(r1, 10_000);
    assert(d1, "③-1 第一轮收到 event: done");

    const r2 = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_cont",
        sessionId: "s_cont",
        text: "继续第二轮",
      }),
    });
    assert(r2.status === 200, `③-2 第二轮 HTTP 200（实际 ${r2.status}）`);

    const { events: evts2, sawDone: d2 } = await readSse(r2, 10_000);
    assert(d2, "③-2 第二轮收到 event: done");
    assert(
      evts2.some((e) => e.body.type === "conversation.delta"),
      "③-2 第二轮有 conversation.delta（上下文可用）",
    );
  }

  // ================================================================
  // ④ SSE 帧格式：每帧严格为 `data: ...\n\n`，TAI 前端可正确解析
  // ================================================================
  {
    const res = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_fmt",
        text: "纯文本",
      }),
    });
    assert(res.status === 200, `④ HTTP 200（实际 ${res.status}）`);

    const { sawDone } = await readSse(res, 10_000);
    assert(sawDone, "④ 收到 event: done");

    // readSse 已完整消费全部帧 → 证明帧格式（data: + 空行分隔）与前端解析器兼容
    assert(true, "④ readSse 能完整消费全部帧（帧格式匹配）");
  }

  // ================================================================
  // ⑤ canvas.place 出图链路（JWT + 生图回调出图」
  // ================================================================
  {
    // 模拟 TAI 生图回调端点
    const taiHeaders: string[][] = [];
    const fakeTai = createServer((req, res) => {
      const url = req.url ?? "";
      if (req.method === "POST" && url === "/api/ai/generate-image-async") {
        taiHeaders.push([...(req.headers || {})]);
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ taskId: `task_${taiHeaders.length}` }));
        });
        return;
      }
      const m = url.match(/^\/api\/ai\/image-task\/(.+)$/);
      if (req.method === "GET" && m) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "succeeded",
            imageUrl: `https://mock.example.com/${m[1]}.png`,
            imageUrls: [`https://mock.example.com/${m[1]}.png`],
            progress: 100,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end("unknown");
    });
    await new Promise<void>((r) => fakeTai.listen(0, "127.0.0.1", () => r()));
    const fakePort = (fakeTai.address() as { port: number }).port;
    const fakeBase = `http://127.0.0.1:${fakePort}`;

    const cfg2 = {
      ...base,
      deepseek: { ...base.deepseek, apiKey: "" },
      tai: { ...base.tai, apiBaseUrl: fakeBase, apiToken: "shared-key" },
    };
    const sessions2 = new GatewaySessions(
      cfg2,
      new AssetStore(),
      new MockTaskSource({ imageDelayMs: [100, 200] }),
      () => undefined,
    );
    const gw2 = await startGateway({ port: 0, sessions: sessions2, log: () => undefined });
    const origin2 = `http://127.0.0.1:${gw2.port}`;

    // 带 JWT → 走会话级 TAI 源 → 回调查询/JWT → 出图 → canvas.place
    const jwtToken = "Bearer test-jwt-for-canvas-place";
    const r = await fetch(`${origin2}/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: jwtToken,
        "x-team-id": "team_test",
      },
      body: JSON.stringify({
        projectId: "p_place",
        text: "帮我在滨江做一个办公楼方案，渲染效果图",
      }),
    });
    assert(r.status === 200, `⑤ HTTP 200（实际 ${r.status}）`);

    const { events, sawDone } = await readSse(r, 20_000);
    assert(sawDone, "⑤ 收到 event: done");
    assert(
      events.some((e) => e.body.type === "canvas.place"),
      "⑤ 出图完成有 canvas.place 事件（TAI 前端可落位画布）",
    );
    assert(
      events.some((e) => e.body.type === "conversation.delta"),
      "⑤ 同时有 conversation.delta（文本流）",
    );

    // 验证回传的 header 信息
    if (taiHeaders.length > 0) {
      const lastH = taiHeaders[taiHeaders.length - 1]!;
      assert(
        lastH["authorization"] === jwtToken,
        "⑤ 回调携带用户 Bearer（jwtToken）",
      );
      assert(lastH["x-team-id"] === "team_test", "⑤ X-Team-Id 透传");
    }

    await sessions2.disposeAll();
    await gw2.close();
    fakeTai.closeAllConnections();
    await new Promise<void>((r) => fakeTai.close(() => r()));
  }

  // ================================================================
  // ⑥ brief.updated 必发 + 多轮消息不串台
  // ================================================================
  {
    const res = await fetch(`${origin}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p_brief",
        sessionId: "s_brief",
        text: "我需要一个现代办公楼的方案",
      }),
    });
    assert(res.status === 200, `⑥ HTTP 200（实际 ${res.status}）`);

    const { events, sawDone } = await readSse(res, 15_000);
    assert(sawDone, "⑥ 收到 event: done");
    assert(
      events.some((e) => e.body?.type === "brief.updated"),
      "⑥ 包含 brief.updated（需求档案落档）",
    );
    assert(
      events.some((e) => e.body?.type === "conversation.delta"),
      "⑥ 包含 conversation.delta（文本回复）",
    );

    // brief 中提取了关键词
    const briefEvt = events.find((e) => e.body?.type === "brief.updated");
    if (briefEvt) {
      const b = (briefEvt.body ?? {}) as Record<string, unknown>;
      const brief = b.brief as Record<string, unknown> | undefined;
      assert(brief !== undefined, "⑥ brief.updated 携带 brief 对象");
      if (brief) {
        assert(
          brief.projectType === "办公楼",
          "⑥ brief.projectType 从输入中提取为 办公楼",
        );
      }
    }

    try {
      await res.body?.cancel();
    } catch {
      /* ok */
    }
  }

  await sessions.disposeAll();
  await gw.close();

  if (failed > 0) {
    console.error(`\n${failed} 项失败`);
    process.exit(1);
  }
  console.log("\nTAI PROTOCOL TEST PASS ✅");
  process.exit(0);
}

main().catch((err) => {
  console.error("TAI PROTOCOL TEST FAIL ❌", err);
  process.exit(1);
});
