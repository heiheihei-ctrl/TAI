/**
 * 局部区域矩形转换测试（src/shared/region.ts）
 *
 * 背景：前端上报像素坐标，TAI 前端契约用**归一化** 0–1
 * （PreciseEditContext.cropRectNormalized）。量纲混用不报错、只静默错位，
 * 故用测试锁住转换行为。
 *
 * 另注：归一化坐标**不发给 TAI 后端**——模型收到的是原图整张，区域仅用于
 * 前端 canvas 合成。详见 src/shared/region.ts 顶部说明。
 */

import {
  toNormalizedRect,
  toPixelRect,
  resolveNormalizedRegion,
} from "../src/shared/region.js";

let failed = 0;
function assert(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`✓ ${msg}`);
  } else {
    failed++;
    console.error(`✗ ${msg}`);
  }
}

const near = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;

// ---- ① 像素 → 归一化 ----
{
  const r = toNormalizedRect({ x: 160, y: 90, w: 320, h: 180 }, 1280, 720);
  assert(!!r, "① 有宽高时可转换（返回非 undefined）");
  assert(near(r!.x, 0.125) && near(r!.y, 0.125), "① 原点换算正确（160/1280, 90/720）");
  assert(near(r!.width, 0.25) && near(r!.height, 0.25), "① 尺寸换算正确（320/1280, 180/720）");
}

// ---- ② 缺少/非法宽高时拒绝猜测 ----
{
  assert(toNormalizedRect({ x: 1, y: 1, w: 1, h: 1 }, undefined, undefined) === undefined, "② 缺宽高返回 undefined");
  assert(toNormalizedRect({ x: 1, y: 1, w: 1, h: 1 }, 0, 720) === undefined, "② 宽度 0 返回 undefined");
  assert(toNormalizedRect({ x: 1, y: 1, w: 1, h: 1 }, 1280, -5) === undefined, "② 负高度返回 undefined");
}

// ---- ③ 越界钳制到 0–1 ----
{
  const over = toNormalizedRect({ x: -100, y: 2000, w: 9999, h: 9999 }, 1000, 1000);
  assert(near(over!.x, 0) && near(over!.y, 1), "③ 负值与超界值被钳制");
  assert(near(over!.width, 1) && near(over!.height, 1), "③ 尺寸上限钳制为 1");
}

// ---- ④ 归一化 → 像素 ----
{
  const p = toPixelRect({ x: 0.25, y: 0.5, width: 0.5, height: 0.25 }, 800, 600);
  assert(p.x === 200 && p.y === 300, "④ 原点还原正确（0.25*800, 0.5*600）");
  assert(p.w === 400 && p.h === 150, "④ 尺寸还原正确（0.5*800, 0.25*600）");
}

// ---- ⑤ 零尺寸兜底为 1px（避免出现空区域）----
{
  const p = toPixelRect({ x: 0, y: 0, width: 0, height: 0 }, 800, 600);
  assert(p.w === 1 && p.h === 1, "⑤ 零尺寸兜底为 1px");
}

// ---- ⑥ 往返一致性 ----
{
  const px = { x: 123, y: 45, w: 300, h: 200 };
  const back = toPixelRect(toNormalizedRect(px, 1920, 1080)!, 1920, 1080);
  assert(
    near(back.x, px.x, 1) && near(back.y, px.y, 1) && near(back.w, px.w, 1) && near(back.h, px.h, 1),
    "⑥ 像素→归一化→像素 往返一致（误差 <1px）",
  );
}

// ---- ⑦ resolveNormalizedRegion 优先级 ----
{
  const norm = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  const resolved = resolveNormalizedRegion({
    normalizedRegion: norm,
    regionRect: { x: 999, y: 999, w: 999, h: 999 },
    imageWidth: 1000,
    imageHeight: 1000,
  });
  assert(resolved === norm, "⑦ 两者并存时以 normalizedRegion 为准");

  const fromPixel = resolveNormalizedRegion({
    regionRect: { x: 100, y: 100, w: 200, h: 200 },
    imageWidth: 1000,
    imageHeight: 1000,
  });
  assert(near(fromPixel!.x, 0.1) && near(fromPixel!.width, 0.2), "⑦ 仅像素时按宽高换算");

  assert(
    resolveNormalizedRegion({ regionRect: { x: 1, y: 1, w: 1, h: 1 } }) === undefined,
    "⑦ 像素但缺宽高时返回 undefined（不猜测）",
  );
  assert(resolveNormalizedRegion({}) === undefined, "⑦ 无任何输入返回 undefined");
}

if (failed > 0) {
  console.error(`\n${failed} 项失败`);
  process.exit(1);
}
console.log("\nREGION TEST PASS ✅");
