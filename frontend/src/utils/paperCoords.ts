import paper from 'paper';

export function getDpr(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

// 将浏览器事件的 client 坐标转换为 Paper 的 project 坐标
export function clientToProject(canvas: HTMLCanvasElement, clientX: number, clientY: number): paper.Point {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  const vx = (clientX - rect.left) * dpr;
  const vy = (clientY - rect.top) * dpr;
  try {
    if (paper && paper.view && (paper.view as any).viewToProject) {
      return (paper.view as any).viewToProject(new paper.Point(vx, vy));
    }
  } catch {}
  return new paper.Point(vx, vy);
}

// 将 Paper 的 project 点转换为浏览器屏幕的 client 坐标
export function projectToClient(canvas: HTMLCanvasElement, projectPoint: paper.Point): { x: number; y: number } {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  let v = { x: projectPoint.x, y: projectPoint.y } as any;
  try {
    if (paper && paper.view && (paper.view as any).projectToView) {
      v = (paper.view as any).projectToView(projectPoint);
    }
  } catch {}
  return { x: rect.left + v.x / dpr, y: rect.top + v.y / dpr };
}

/** 与 PaperCanvasManager 视口公式一致：view = zoom * (world + pan) */
export function projectToClientWithViewport(
  canvas: HTMLCanvasElement,
  projectX: number,
  projectY: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  const viewX = safeZoom * (projectX + panX);
  const viewY = safeZoom * (projectY + panY);
  return { x: rect.left + viewX / dpr, y: rect.top + viewY / dpr };
}

/** 与 projectToClientWithViewport 互逆 */
export function clientToProjectWithViewport(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom: number,
  panX: number,
  panY: number
): paper.Point {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  const viewX = (clientX - rect.left) * dpr;
  const viewY = (clientY - rect.top) * dpr;
  return new paper.Point(viewX / safeZoom - panX, viewY / safeZoom - panY);
}

/**
 * Paper 世界坐标 → 画布容器内 CSS 像素（不含 getBoundingClientRect 偏移）。
 * 用于 absolute inset-0 父级下的 ImageContainer / Model3D 等 overlay。
 * 公式与 PaperCanvasManager 一致：css = zoom * (world + pan) / dpr
 */
export function projectToCanvasCssWithViewport(
  projectX: number,
  projectY: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  return {
    x: (safeZoom * (projectX + panX)) / dpr,
    y: (safeZoom * (projectY + panY)) / dpr,
  };
}

/** 画布容器内 CSS 像素 → Paper 世界坐标（与 projectToCanvasCssWithViewport 互逆） */
export function canvasCssToProjectWithViewport(
  cssX: number,
  cssY: number,
  zoom: number,
  panX: number,
  panY: number,
): paper.Point {
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  return new paper.Point(
    (cssX * dpr) / safeZoom - panX,
    (cssY * dpr) / safeZoom - panY,
  );
}

/**
 * 协作光标用的 CSS 逻辑世界坐标（与 devicePixelRatio / 屏幕分辨率无关）。
 *
 * 本地 Paper 世界坐标是设备像素：world_device = world_css * dpr
 * Flow 视口用 (pan * zoom) / dpr，即 CSS 空间。
 * 协作者必须在 wire 上交换 world_css，否则笔记本(2x)与台式机(1x)会对不齐。
 *
 * 公式：css = zoom * (world_css + pan_device / dpr)
 */
export function clientToCollabWorld(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  return {
    x: (clientX - rect.left) / safeZoom - panX / dpr,
    y: (clientY - rect.top) / safeZoom - panY / dpr,
  };
}

/** 将协作 CSS 世界坐标转回当前设备屏幕 client 坐标 */
export function collabWorldToClient(
  canvas: HTMLCanvasElement,
  worldX: number,
  worldY: number,
  zoom: number,
  panX: number,
  panY: number,
): { x: number; y: number } {
  const viewCanvas =
    (paper?.view?.element as HTMLCanvasElement | undefined) || canvas;
  const rect = viewCanvas.getBoundingClientRect();
  const dpr = getDpr();
  const safeZoom = Math.max(zoom, 0.0001);
  return {
    x: rect.left + safeZoom * (worldX + panX / dpr),
    y: rect.top + safeZoom * (worldY + panY / dpr),
  };
}

/** React Flow screenToFlowPosition 需要 viewport client 坐标 */
export function getElementClientCenter(
  el: Element | null | undefined,
): { x: number; y: number } {
  const rect = el?.getBoundingClientRect();
  if (!rect) {
    return {
      x: typeof window !== 'undefined' ? window.innerWidth / 2 : 640,
      y: typeof window !== 'undefined' ? window.innerHeight / 2 : 360,
    };
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

// 将 Paper 的矩形（project 坐标）转换为 CSS 像素矩形
export function projectRectToClient(canvas: HTMLCanvasElement, rectInProject: paper.Rectangle) {
  const tl = projectToClient(canvas, rectInProject.topLeft);
  const br = projectToClient(canvas, rectInProject.bottomRight);
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/**
 * 检查 Paper.js Item 是否为 Raster 类型
 * 兼容生产环境代码压缩后 instanceof 失效的问题
 */
export function isRaster(item: paper.Item | null | undefined): item is paper.Raster {
  if (!item) return false;
  return item.className === 'Raster' || item instanceof paper.Raster;
}

/**
 * 检查 Paper.js Item 是否为 Path 类型
 * 兼容生产环境代码压缩后 instanceof 失效的问题
 */
export function isPath(item: paper.Item | null | undefined): item is paper.Path {
  if (!item) return false;
  return item.className === 'Path' || item instanceof paper.Path;
}

/**
 * 检查 Paper.js Item 是否为 PointText 类型
 * 兼容生产环境代码压缩后 instanceof 失效的问题
 */
export function isPointText(item: paper.Item | null | undefined): item is paper.PointText {
  if (!item) return false;
  return item.className === 'PointText' || item instanceof paper.PointText;
}

/**
 * 检查 Paper.js Item 是否为 Group 类型
 * 兼容生产环境代码压缩后 instanceof 失效的问题
 */
export function isGroup(item: paper.Item | null | undefined): item is paper.Group {
  if (!item) return false;
  return item.className === 'Group' || item instanceof paper.Group;
}
