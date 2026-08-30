/**
 * QianwenTaskSource 契约测试 (qianwenSource.ts)
 *
 * 使用内存 Fake HTTP Server 验证接口契约，包括：
 *  - resolveSizePx 纯函数计算
 *  - 鉴权头发送
 *  - 图像生成与响应解析
 *  - 进度回调
 *  - 视频委托给 mock
 */

import http from "node:http";
import { TaskSourceError } from "../src/tasks/types.js";
import { QianwenTaskSource, resolveSizePx } from "../src/tasks/qianwenSource.js";

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ========== Fake HTTP Server ==========

let server: ReturnType<typeof http.createServer> | undefined;
const fakeState = { apiKey: "fake-qw-key", counter: 0 };

function startFakeServer(): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // --- Image download (no auth) ---
      if (req.method === "GET") {
        const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ccc"/></svg>`);
        res.writeHead(200, { "content-type": "image/svg+xml" });
        res.end(svg);
        return;
      }

      // --- Auth check ---
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "Missing auth" }));
        return;
      }

      // --- Image generation POST ---
      if (req.url?.includes("/services/aigc/multimodal-generation/generation")) {
        let body = "";
        req.on("data", (d) => { body += d; });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const n = Math.max(1, Math.min(payload.parameters?.n ?? 1, 4));
            const choices: { message: { content: { image: string }[] } }[] = [];
            for (let i = 0; i < n; i++) {
              fakeState.counter++;
              choices.push({
                message: {
                  // Return localhost URL pointing back to this server for download test
                  content: [{ image: `http://localhost:${port}/dl/${fakeState.counter}.png` }],
                },
              });
            }
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ output: { choices }, usage: { size: "1024*1024" } }));
          } catch {
            res.writeHead(400);
            res.end("bad");
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(0, () => {
      const addr = server.address();
      const p = typeof addr === "number" ? addr : (addr as { port: number }).port;
      port = p;
      resolve(p);
    });
  });
}

function stopFakeServer(): Promise<void> {
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
    server = undefined;
  });
}

let port = 0;

// ================================================================
// resolveSizePx — pure function
// ================================================================

async function testResolveSizePx(): Promise<void> {
  assert(resolveSizePx(undefined, undefined) === "1280*720");
  assert(resolveSizePx("16:9", undefined) === "1280*720");
  assert(resolveSizePx("1:1", undefined) === "1280*1280");
  assert(resolveSizePx("robots", undefined) === "1280*720", "invalid→16:9");
  assert(resolveSizePx("16:9", "2K") === "2048*1152");
  assert(resolveSizePx("16:9", "4K") === "2048*1152", "4K capped at 2048");
  assert(resolveSizePx("1:1", "4K") === "2048*2048");
  assert(resolveSizePx("9:16", undefined) === "720*1280");

  const [w, h] = resolveSizePx("1:16", undefined).split("*").map(Number);
  assert(w >= 512 && w <= 2048 && h >= 512 && h <= 2048, "clamp 512-2048");

  const [w2, h2] = resolveSizePx("16:9", "2K").split("*").map(Number);
  assert(w2 % 16 === 0 && h2 % 16 === 0, "multiples of 16");

  console.log("✓ resolveSizePx");
}

// ================================================================
// QianwenTaskSource — contract via fake HTTP
// ================================================================

async function testQianwenContract(): Promise<void> {
  port = await startFakeServer();
  const source = new QianwenTaskSource({
    apiKey: fakeState.apiKey,
    baseUrl: `http://localhost:${port}`,
  });
  fakeState.counter = 0;

  try {
    // --- not_configured ---
    {
      const noKey = new QianwenTaskSource({ apiKey: "", baseUrl: `http://localhost:${port}` });
      let threw = false;
      try {
        await noKey.generateImages({ projectId: "p1", prompt: "test", count: 1 }, () => {});
      } catch (e) {
        threw = true;
        assert((e as Error & { code?: string }).code === "not_configured", "code should be not_configured");
      }
      assert(threw, "should throw not_configured");
    }

    // --- count & results ---
    {
      const gen = await source.generateImages(
        { projectId: "p1", prompt: "modern tower", count: 3 },
        () => {},
      );
      assert(gen.images.length === 3, "should return 3 images");
      assert(gen.partialFailures.length === 0, "no partial failures on happy path");
      assert(gen.images.every((r) => r.url.length > 0), "URLs should be non-empty");
      console.log("  URLs:", gen.images.map((r) => r.url));
    }

    // --- onProgress ---
    {
      const stages: string[] = [];
      await source.generateImages(
        { projectId: "p1", prompt: "test", count: 1 },
        (s) => stages.push(s),
      );
      assert(stages.length >= 2, `onProgress should fire >=2 times, got ${stages.length}`);
    }

    // --- dimensions from usage.size (fake server returns 1024*1024) ---
    {
      const gen = await source.generateImages({ projectId: "p1", prompt: "test", count: 1 }, () => {});
      assert(gen.images[0]!.width === 1024 && gen.images[0]!.height === 1024, "dims from usage.size");
    }

    // --- unique URLs ---
    {
      const gen = await source.generateImages({ projectId: "p1", prompt: "test", count: 3 }, () => {});
      assert(new Set(gen.images.map((r) => r.url)).size === 3, "each image has unique URL");
    }

    // --- negativePrompt inlined ---
    {
      const gen = await source.generateImages(
        { projectId: "p1", prompt: "tower", negativePrompt: "blurry", count: 1 },
        () => {},
      );
      assert(gen.images.length === 1, "negativePrompt should not break generation");
    }

    // --- video delegates to mock ---
    {
      const { taskId } = await source.submitVideoTask({
        projectId: "p1", baseFrameAssetId: "a1", motionPreset: "orbit", durationSec: 8, count: 1,
      });
      assert(taskId.startsWith("mockvid_"), "video delegates to mock");

      const status = await source.getVideoTask(taskId);
      assert(["queued", "processing", "done"].includes(status.status), `video status: ${status.status}`);

      await source.cancelTask(taskId);
      const after = await source.getVideoTask(taskId);
      assert(after.status === "failed", "cancelled → failed");
    }

    console.log("✓ QianwenTaskSource contract");
  } finally {
    await stopFakeServer();
  }
}

// ================================================================
// Main
// ================================================================

async function main(): Promise<void> {
  await testResolveSizePx();
  await testQianwenContract();
  console.log("\nALL PASS ✅");
}

main().catch((err) => {
  console.error("FAIL ❌", err);
  process.exit(1);
});
