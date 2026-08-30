/**
 * 画布落位算法 —— 对应 DESIGN.md §6.1
 * 网关只给"建议坐标"，前端执行器可做吸附/避让调整。
 * 画布为 React Flow 世界坐标系（像素级偏移即可，具体网格步长与前端约定后调整）。
 *
 * 2026-08-28：新增占用避让——服务端记录本会话已落卡矩形（canvasOccupancy），
 * 新批次默认铺在锚点右侧，若与已占用区域冲突则整批下移一行，直到找到空位。
 */

export interface PlacementInput {
  candidateCount: number;
  /** 锚点资产（当前选区的第一个元素）；无选区时为空 */
  anchor?: { x?: number; y?: number; width?: number } | undefined;
  /** 视口中心提示（无锚点时兜底） */
  viewportCenter?: { x: number; y: number };
}

export interface PlacedCard {
  pos: { x: number; y: number };
}

/** 画布占用矩形（服务端视角的已落卡区域） */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 40;
export const CARD_W = 300;
export const CARD_H = 220;
const MAX_ROWS = 50;

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function layoutCandidates(input: PlacementInput, occupied: Rect[] = []): PlacedCard[] {
  const n = Math.max(1, input.candidateCount);

  // 无锚点：从画布原点下方开始（避开顶部工具栏）；有锚点：候选横排铺在锚点右侧
  const startX = input.anchor
    ? (input.anchor.x ?? 0) + (input.anchor.width ?? CARD_W) + GAP
    : (input.viewportCenter?.x ?? 0);
  const anchorY = input.anchor?.y ?? input.viewportCenter?.y ?? 90;

  // 先尝试锚点行 → 下方逐行（原始行为）
  for (let offset = 0; offset < MAX_ROWS; offset++) {
    const y = anchorY + offset * (CARD_H + GAP);
    const rects = makeRow(startX, y, n);
    if (!rects.some((r) => occupied.some((o) => overlaps(r, o)))) {
      return rects.map((r) => ({ pos: { x: r.x, y: r.y } }));
    }
  }

  // 向上折叠：从锚点上方逐行检查（删除卡片后释放的空间）
  for (let offset = 1; offset <= MAX_ROWS; offset++) {
    const y = anchorY - offset * (CARD_H + GAP);
    if (y < 0) break;
    const rects = makeRow(startX, y, n);
    if (!rects.some((r) => occupied.some((o) => overlaps(r, o)))) {
      return rects.map((r) => ({ pos: { x: r.x, y: r.y } }));
    }
  }

  // 兜底：放在锚点行（即使有冲突也落地，渲染层处理遮挡）
  return makeRow(startX, anchorY, n).map((r) => ({ pos: { x: r.x, y: r.y } }));
}

function makeRow(startX: number, y: number, n: number): Rect[] {
  return Array.from({ length: n }, (_, i) => ({
    x: startX + i * (CARD_W + GAP),
    y,
    w: CARD_W,
    h: CARD_H,
  }));
}
