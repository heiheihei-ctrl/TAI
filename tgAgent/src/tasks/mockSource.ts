/**
 * Mock 任务源 —— 无外部依赖的全链路联调用。
 * 生成 SVG 占位图写入 .mock-assets/，由 gateway 静态服务对外提供。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  GenerationTaskSource,
  ImageGenOutcome,
  ImageGenRequest,
  ProgressFn,
  VideoGenRequest,
  VideoJobStatus,
  GeneratedImage,
} from "./types.js";

const ASPECT_SIZES: Record<string, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "3:4": { w: 768, h: 1024 },
  "4:3": { w: 1024, h: 768 },
  "2:3": { w: 683, h: 1024 },
  "3:2": { w: 1024, h: 683 },
  "16:9": { w: 1280, h: 720 },
  "9:16": { w: 720, h: 1280 },
  "21:9": { w: 1280, h: 549 },
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );
}

function placeholderSvg(req: ImageGenRequest, seedText: string): { svg: string; w: number; h: number } {
  const size = ASPECT_SIZES[req.aspectRatio ?? "16:9"] ?? ASPECT_SIZES["16:9"]!;
  const hue = Math.floor(Math.random() * 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">
<rect width="100%" height="100%" fill="hsl(${hue},30%,88%)"/>
<rect x="6%" y="10%" width="88%" height="80%" fill="hsl(${hue},38%,72%)" rx="12"/>
<rect x="20%" y="46%" width="60%" height="44%" fill="hsl(${hue},25%,95%)" rx="8"/>
<text x="50%" y="54%" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#333">MOCK RENDER</text>
<text x="50%" y="60%" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#666">${escapeXml(seedText)}</text>
</svg>`;
  return { svg, w: size.w, h: size.h };
}

interface MockVideoTask {
  status: VideoJobStatus;
}

export class MockTaskSource implements GenerationTaskSource {
  readonly name = "mock";
  private readonly outDir: string;
  private readonly urlPrefix: string;
  private readonly imageDelayMs: [number, number];
  private readonly videoDelayMs: number;
  private videoTasks = new Map<string, MockVideoTask>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(opts?: {
    outDir?: string;
    urlPrefix?: string;
    imageDelayMs?: [number, number];
    videoDelayMs?: number;
  }) {
    this.outDir = opts?.outDir ?? join(process.cwd(), ".mock-assets");
    this.urlPrefix = opts?.urlPrefix ?? "/mock-assets";
    this.imageDelayMs = opts?.imageDelayMs ?? [2500, 6000];
    this.videoDelayMs = opts?.videoDelayMs ?? 8000;
  }

  withUserAuth(): GenerationTaskSource {
    return this; // mock 源无计费概念，忽略凭证
  }

  private randDelay(): number {
    const [lo, hi] = this.imageDelayMs;
    return lo + Math.floor(Math.random() * (hi - lo));
  }

  private async writeAsset(fileName: string, content: string): Promise<string> {
    await mkdir(this.outDir, { recursive: true });
    await writeFile(join(this.outDir, fileName), content, "utf-8");
    return `${this.urlPrefix}/${fileName}`;
  }

  async generateImages(
    req: ImageGenRequest,
    onProgress: ProgressFn,
  ): Promise<ImageGenOutcome> {
    onProgress("prompt_assembled", 5);
    await sleep(Math.min(800, this.randDelay() / 3));
    onProgress("submitted", 20);
    await sleep(this.randDelay() / 2);
    onProgress("rendering", 60);

    const results: GeneratedImage[] = [];
    for (let i = 0; i < req.count; i++) {
      const seed = `#${req.projectId.slice(0, 6)} · ${req.aspectRatio ?? "16:9"} · v${i + 1}`;
      const { svg, w, h } = placeholderSvg(req, seed);
      const url = await this.writeAsset(`${randomUUID()}.svg`, svg);
      results.push({ url, width: w, height: h });
    }
    onProgress("done", 100);
    return { images: results, partialFailures: [] };
  }

  async submitVideoTask(req: VideoGenRequest): Promise<{ taskId: string }> {
    const taskId = `mockvid_${randomUUID().slice(0, 8)}`;
    this.videoTasks.set(taskId, {
      status: { status: "queued", progress: 0, stage: "queued" },
    });
    // 模拟异步推进（定时器可被 dispose 清理）
    const task = this.videoTasks.get(taskId)!;
    const t1 = setTimeout(() => {
      task.status = { status: "processing", progress: 40, stage: "rendering_frames" };
    }, this.videoDelayMs / 3);
    const t2 = setTimeout(() => {
      task.status = { status: "processing", progress: 80, stage: "encoding" };
    }, (this.videoDelayMs * 2) / 3);
    const t3 = setTimeout(async () => {
      const placeholder = await this.writeAsset(
        `${taskId}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#1a1a2e"/><polygon points="260,110 260,250 400,180" fill="#e94560"/><text x="50%" y="88%" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#fff">MOCK VIDEO</text></svg>`,
      );
      task.status = { status: "done", progress: 100, url: placeholder };
    }, this.videoDelayMs);
    this.timers.push(t1, t2, t3);
    return { taskId };
  }

  async getVideoTask(taskId: string): Promise<VideoJobStatus> {
    return this.videoTasks.get(taskId)?.status ?? { status: "failed", progress: 0, error: "unknown_task" };
  }

  async cancelTask(taskId: string): Promise<void> {
    this.videoTasks.delete(taskId);
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.videoTasks.clear();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
