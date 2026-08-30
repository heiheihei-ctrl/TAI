/**
 * 手动冒烟：qianwenSource 真实出图（直连任务源，不经网关）。
 * 运行: npx tsx tests/manual-qianwen.ts [文案]
 */

import { stat } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { QianwenTaskSource } from "../src/tasks/qianwenSource.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.qianwen.apiKey) {
    console.error("QIANWEN_API_KEY 未配置");
    process.exit(1);
  }
  const src = new QianwenTaskSource({
    apiKey: cfg.qianwen.apiKey,
    baseUrl: cfg.qianwen.baseUrl,
    model: cfg.qianwen.imageModel,
  });

  const prompt = process.argv[2] ?? "滨江办公楼黄昏效果图，玻璃幕墙反射晚霞，前景水面";
  const t0 = Date.now();
  const gen = await src.generateImages(
    {
      projectId: "p_smoke",
      prompt,
      negativePrompt: "低质量、模糊、变形",
      aspectRatio: "16:9",
      imageSize: "1K",
      count: 2,
    },
    (stage, percent) => console.log(`  progress ${percent}% ${stage}`),
  );
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const img of gen.images) {
    const rel = img.url.replace("/mock-assets/", ".mock-assets/");
    const st = await stat(rel).catch(() => undefined);
    console.log(`${img.url}  ${img.width}x${img.height}  落盘=${st ? `${st.size}B` : "缺失!"}`);
    if (!st) process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
