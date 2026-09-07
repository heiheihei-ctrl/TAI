// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
import { useReactFlow, useStore } from 'reactflow';
import { useCanvasStore } from '@/stores';
import {
  clampWorldPointToContentBounds,
  ensureViewportShowsContent,
} from '@/utils/viewportFit';

/**
 * MiniMapImageOverlay
 * Adds a <g> layer above the React Flow MiniMap <svg>:
 * - Flow 节点：用 boxW/boxH（或 width/height）画占位，避免 RF MiniMap 因缺 width/height 空白
 * - 画布图片：绿色块（可按 nodesOnly 关闭）
 */
type MiniMapImageOverlayProps = {
  viewportContainerRef?: React.RefObject<HTMLElement | null>;
  /** 仅绘制 Flow 节点占位（低细节 / 大图模式用，减负） */
  nodesOnly?: boolean;
};

const PAN_LIMIT = 1_000_000;
const POSITION_EPSILON = 0.01;
const DRAG_THRESHOLD_PX = 3;
const DEFAULT_NODE_W = 200;
const DEFAULT_NODE_H = 150;

const clampPan = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));
};

type MiniRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'node' | 'image';
  selected?: boolean;
};

const resolveNodeSize = (node: any): { width: number; height: number } => {
  const styleW = Number(node?.style?.width);
  const styleH = Number(node?.style?.height);
  const width = Number(
    node?.width ??
      node?.data?.boxW ??
      (Number.isFinite(styleW) ? styleW : undefined) ??
      DEFAULT_NODE_W
  );
  const height = Number(
    node?.height ??
      node?.data?.boxH ??
      (Number.isFinite(styleH) ? styleH : undefined) ??
      DEFAULT_NODE_H
  );
  return {
    width: Number.isFinite(width) && width > 0 ? width : DEFAULT_NODE_W,
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_NODE_H,
  };
};

const MiniMapImageOverlay: React.FC<MiniMapImageOverlayProps> = ({
  viewportContainerRef,
  nodesOnly = false,
}) => {
  const rf = useReactFlow();
  // 订阅节点几何变化，保证小地图随拖拽/增删更新
  const nodeSignature = useStore((s) => {
    try {
      return s
        .getNodes()
        .map((n) => {
          const { width, height } = resolveNodeSize(n);
          return `${n.id}:${n.position?.x ?? 0},${n.position?.y ?? 0},${width}x${height},${n.selected ? 1 : 0},${n.hidden ? 1 : 0}`;
        })
        .join('|');
    } catch {
      return '';
    }
  });
  const [svgEl, setSvgEl] = React.useState<SVGSVGElement | null>(null);
  const [graphEl, setGraphEl] = React.useState<SVGGElement | null>(null);
  const [targetEl, setTargetEl] = React.useState<SVGGElement | SVGSVGElement | null>(null);
  const [rects, setRects] = React.useState<MiniRect[]>([]);
  const lastSigRef = React.useRef('');
  const dragState = React.useRef<{
    active: boolean;
    pointerId: number | null;
    lastEvent: PointerEvent | null;
    raf: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  }>({
    active: false,
    pointerId: null,
    lastEvent: null,
    raf: 0,
    startClientX: 0,
    startClientY: 0,
    moved: false,
  });

  const resolveViewportMetrics = React.useCallback(() => {
    try {
      const rect =
        viewportContainerRef?.current?.getBoundingClientRect?.() ||
        (paper?.view?.element as HTMLCanvasElement | undefined)?.getBoundingClientRect?.();
      const width =
        rect && Number.isFinite(rect.width) && rect.width > 0
          ? rect.width
          : window.innerWidth;
      const height =
        rect && Number.isFinite(rect.height) && rect.height > 0
          ? rect.height
          : window.innerHeight;
      const zoom = Math.max(
        0.1,
        Math.min(4, Number(useCanvasStore.getState().zoom) || 1)
      );
      const dpr =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      return { width, height, zoom, dpr };
    } catch {
      return null;
    }
  }, [viewportContainerRef]);

  const panToWorldCenter = React.useCallback((worldX: number, worldY: number) => {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
    try {
      const clamped = clampWorldPointToContentBounds(worldX, worldY);
      const metrics = resolveViewportMetrics();
      if (!metrics) return;
      const { width, height, zoom, dpr } = metrics;
      const nextPanX = clampPan((((width / 2) / zoom) - clamped.x) * dpr);
      const nextPanY = clampPan((((height / 2) / zoom) - clamped.y) * dpr);
      const store = useCanvasStore.getState();
      if (
        Math.abs((store.panX || 0) - nextPanX) < POSITION_EPSILON &&
        Math.abs((store.panY || 0) - nextPanY) < POSITION_EPSILON
      ) {
        return;
      }
      store.setPan(nextPanX, nextPanY);
    } catch {}
  }, [resolveViewportMetrics]);

  const clientToWorld = React.useCallback((clientX: number, clientY: number) => {
    const host = graphEl || svgEl;
    if (!host || !svgEl) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = host.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const svgPt = pt.matrixTransform(inv);
    if (!Number.isFinite(svgPt.x) || !Number.isFinite(svgPt.y)) return null;
    return { x: svgPt.x, y: svgPt.y };
  }, [graphEl, svgEl]);

  const findHitCenter = React.useCallback((worldX: number, worldY: number) => {
    const hit = rects.find(
      (item) =>
        worldX >= item.x &&
        worldX <= item.x + item.width &&
        worldY >= item.y &&
        worldY <= item.y + item.height
    );
    if (hit) {
      return {
        x: hit.x + hit.width / 2,
        y: hit.y + hit.height / 2,
      };
    }
    return { x: worldX, y: worldY };
  }, [rects]);

  const clampClientToMiniMap = React.useCallback((clientX: number, clientY: number) => {
    if (!svgEl) return { x: clientX, y: clientY };
    const rect = svgEl.getBoundingClientRect();
    return {
      x: Math.max(rect.left, Math.min(rect.right, clientX)),
      y: Math.max(rect.top, Math.min(rect.bottom, clientY)),
    };
  }, [svgEl]);

  const clientToWorldForInteraction = React.useCallback((clientX: number, clientY: number) => {
    const clamped = clampClientToMiniMap(clientX, clientY);
    return clientToWorld(clamped.x, clamped.y);
  }, [clampClientToMiniMap, clientToWorld]);

  React.useEffect(() => {
    const find = () => {
      let host: SVGSVGElement | null = null;
      const container = document.querySelector('.react-flow__minimap') as HTMLElement | null;
      if (container) {
        if (container instanceof SVGSVGElement) host = container as SVGSVGElement;
        else {
          const innerSvg = container.querySelector('svg');
          if (innerSvg instanceof SVGSVGElement) host = innerSvg as SVGSVGElement;
        }
      }
      const graph = host?.querySelector('.react-flow__minimap-graph') as SVGGElement | null;
      const target = (graph || host) as any;
      if (target) {
        setGraphEl(graph);
        setTargetEl(target);
        if (host) setSvgEl(host);
      }
    };

    find();
    const observer = new MutationObserver(() => find());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const updateRects = React.useCallback(() => {
    try {
      const next: MiniRect[] = [];

      const nodes = rf.getNodes?.() || [];
      for (const node of nodes) {
        if (!node || (node as any).hidden) continue;
        const x = Number(node.position?.x);
        const y = Number(node.position?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const { width, height } = resolveNodeSize(node);
        next.push({
          id: `node:${node.id}`,
          x,
          y,
          width,
          height,
          kind: 'node',
          selected: Boolean(node.selected),
        });
      }

      if (!nodesOnly) {
        const list = (window as any).tanvaImageInstances || [];
        const visible = list.filter((img: any) => img && img.visible !== false);
        const dpr = window.devicePixelRatio || 1;
        for (const img of visible) {
          const x = Number(img.bounds?.x || 0) / dpr;
          const y = Number(img.bounds?.y || 0) / dpr;
          const width = Number(img.bounds?.width || 0) / dpr;
          const height = Number(img.bounds?.height || 0) / dpr;
          if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) continue;
          next.push({
            id: `image:${img.id}`,
            x,
            y,
            width,
            height,
            kind: 'image',
          });
        }
      }

      const sig = JSON.stringify(next);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setRects(next);
      }
    } catch {}
  }, [nodesOnly, rf]);

  React.useEffect(() => {
    updateRects();
  }, [updateRects, nodeSignature, nodesOnly]);

  React.useEffect(() => {
    const onUpdate = () => updateRects();
    window.addEventListener('tanva-image-instances-updated', onUpdate);
    return () => window.removeEventListener('tanva-image-instances-updated', onUpdate);
  }, [updateRects]);

  React.useEffect(() => {
    const id = window.setInterval(() => updateRects(), 1000);
    return () => window.clearInterval(id);
  }, [updateRects]);

  React.useEffect(() => {
    if (!targetEl) return;
    updateRects();
  }, [targetEl, updateRects]);

  React.useEffect(() => {
    const el = svgEl;
    if (!el) return;
    const state = dragState.current;

    const applyDrag = () => {
      state.raf = 0;
      const ev = state.lastEvent;
      if (!ev) return;
      const world = clientToWorldForInteraction(ev.clientX, ev.clientY);
      if (!world) return;
      panToWorldCenter(world.x, world.y);
    };

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if ((ev.target as Element | null)?.closest('.react-flow__minimap-mask')) {
        ev.preventDefault();
      }
      state.active = true;
      state.pointerId = ev.pointerId;
      state.lastEvent = ev;
      state.startClientX = ev.clientX;
      state.startClientY = ev.clientY;
      state.moved = false;
      try { el.setPointerCapture(ev.pointerId); } catch {}
      ev.stopPropagation();
      ev.preventDefault();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!state.active || state.pointerId !== ev.pointerId) return;
      state.lastEvent = ev;
      const dx = ev.clientX - state.startClientX;
      const dy = ev.clientY - state.startClientY;
      if (!state.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        state.moved = true;
      }
      ev.stopPropagation();
      ev.preventDefault();
      if (!state.moved) return;
      if (!state.raf) state.raf = window.requestAnimationFrame(applyDrag);
    };

    const stopDrag = (ev?: PointerEvent) => {
      if (ev && state.pointerId !== null && ev.pointerId !== state.pointerId) return;
      if (state.active && !state.moved && ev && ev.type !== 'pointercancel') {
        const world = clientToWorldForInteraction(ev.clientX, ev.clientY);
        if (world) {
          const target = findHitCenter(world.x, world.y);
          panToWorldCenter(target.x, target.y);
        }
      }
      if (!state.active) return;
      const pointerId = state.pointerId;
      state.active = false;
      state.pointerId = null;
      state.lastEvent = null;
      state.moved = false;
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      if (pointerId != null) {
        try { el.releasePointerCapture(pointerId); } catch {}
      }
      window.requestAnimationFrame(() => ensureViewportShowsContent());
      ev?.stopPropagation();
      ev?.preventDefault();
    };

    const onLostPointerCapture = (ev: PointerEvent) => {
      if (!state.active || state.pointerId !== ev.pointerId) return;
      stopDrag(ev);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', stopDrag);
    el.addEventListener('pointercancel', stopDrag);
    el.addEventListener('lostpointercapture', onLostPointerCapture);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', stopDrag);
      el.removeEventListener('pointercancel', stopDrag);
      el.removeEventListener('lostpointercapture', onLostPointerCapture);
      stopDrag();
    };
  }, [svgEl, clientToWorldForInteraction, findHitCenter, panToWorldCenter]);

  if (!targetEl || rects.length === 0) return null;

  return createPortal(
    <g className="tanva-minimap-images" style={{ pointerEvents: 'none' as const }}>
      {rects.map((item) => (
        <rect
          key={item.id}
          x={item.x}
          y={item.y}
          width={Math.max(0, item.width)}
          height={Math.max(0, item.height)}
          fill={
            item.kind === 'image'
              ? '#10b98155'
              : item.selected
                ? '#0f766eaa'
                : '#64748baa'
          }
          stroke={item.kind === 'node' ? '#1e293b' : 'none'}
          strokeWidth={item.kind === 'node' ? 1 : 0}
          rx={2}
          ry={2}
        />
      ))}
    </g>,
    targetEl
  );
};

export default MiniMapImageOverlay;
