// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
import { useReactFlow } from 'reactflow';
import { useCanvasStore } from '@/stores';
import {
  clampWorldPointToContentBounds,
  ensureViewportShowsContent,
} from '@/utils/viewportFit';

/**
 * MiniMapImageOverlay
 * Adds a <g> layer above the React Flow MiniMap <svg>,
 * reads canvas image instances (window.tanvaImageInstances),
 * and renders them as green rectangles.
 *
 * Notes:
 * - FlowOverlay already syncs ReactFlow viewport with Canvas pan/zoom.
 * - MiniMap viewBox matches world coordinates, so image world bounds can be used directly.
 */
type MiniMapImageOverlayProps = {
  viewportContainerRef?: React.RefObject<HTMLElement | null>;
};

const PAN_LIMIT = 1_000_000;
const POSITION_EPSILON = 0.01;
const DRAG_THRESHOLD_PX = 3;

const clampPan = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, value));
};

const MiniMapImageOverlay: React.FC<MiniMapImageOverlayProps> = ({
  viewportContainerRef,
}) => {
  const rf = useReactFlow();
  const [svgEl, setSvgEl] = React.useState<SVGSVGElement | null>(null);
  const [graphEl, setGraphEl] = React.useState<SVGGElement | null>(null);
  const [targetEl, setTargetEl] = React.useState<SVGGElement | SVGSVGElement | null>(null);
  const [images, setImages] = React.useState<Array<{ id: string; x: number; y: number; width: number; height: number }>>([]);
  const lastSigRef = React.useRef("");
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
    try {
      const nodes = rf.getNodes?.() || [];
      for (const node of nodes) {
        const x = Number(node?.position?.x);
        const y = Number(node?.position?.y);
        const width = Number(node?.data?.boxW ?? node?.width ?? 0);
        const height = Number(node?.data?.boxH ?? node?.height ?? 0);
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          continue;
        }
        if (
          worldX >= x &&
          worldX <= x + width &&
          worldY >= y &&
          worldY <= y + height
        ) {
          return { x: x + width / 2, y: y + height / 2 };
        }
      }
    } catch {}

    const hitImage = images.find(
      (item) =>
        worldX >= item.x &&
        worldX <= item.x + item.width &&
        worldY >= item.y &&
        worldY <= item.y + item.height
    );
    if (hitImage) {
      return {
        x: hitImage.x + hitImage.width / 2,
        y: hitImage.y + hitImage.height / 2,
      };
    }

    return { x: worldX, y: worldY };
  }, [images, rf]);

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
        try { if (!(window as any).__minimap_found__) { console.log('[MiniMapImageOverlay] Found MiniMap Graph'); (window as any).__minimap_found__ = true; } } catch {}
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

  const updateImages = React.useCallback(() => {
    try {
      const list = (window as any).tanvaImageInstances || [];
      const visible = list.filter((img: any) => img && (img.visible !== false));
      const dpr = (window.devicePixelRatio || 1);
      const mapped = visible.map((img: any) => ({
        id: img.id,
        x: Number(img.bounds?.x || 0) / dpr,
        y: Number(img.bounds?.y || 0) / dpr,
        width: Number(img.bounds?.width || 0) / dpr,
        height: Number(img.bounds?.height || 0) / dpr,
      }));
      const sig = JSON.stringify(mapped);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setImages(mapped);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    const onUpdate = () => updateImages();
    window.addEventListener("tanva-image-instances-updated", onUpdate);
    return () => window.removeEventListener("tanva-image-instances-updated", onUpdate);
  }, [updateImages]);

  React.useEffect(() => {
    const id = window.setInterval(() => updateImages(), 1000);
    return () => window.clearInterval(id);
  }, [updateImages]);

  React.useEffect(() => {
    if (!targetEl) return;
    updateImages();
  }, [targetEl, updateImages]);

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

  if (!targetEl || images.length === 0) return null;

  return createPortal(
    <g className="tanva-minimap-images" style={{ pointerEvents: 'none' as const }}>
      {images.map((img) => (
        <rect
          key={img.id}
          x={img.x}
          y={img.y}
          width={Math.max(0, img.width)}
          height={Math.max(0, img.height)}
          fill="#10b98155"
          rx={2}
          ry={2}
        />
      ))}
    </g>,
    targetEl
  );
};

export default MiniMapImageOverlay;
