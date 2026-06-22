// @ts-nocheck
import React from 'react';
import { createPortal } from 'react-dom';
import paper from 'paper';
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
const MiniMapImageOverlay: React.FC = () => {
  const [svgEl, setSvgEl] = React.useState<SVGSVGElement | null>(null);
  const [targetEl, setTargetEl] = React.useState<SVGGElement | SVGSVGElement | null>(null);
  const [images, setImages] = React.useState<Array<{ id: string; x: number; y: number; width: number; height: number }>>([]);
  const lastSigRef = React.useRef("");
  const dragState = React.useRef<{ active: boolean; pointerId: number | null; lastEvent: PointerEvent | null; raf: number }>({
    active: false,
    pointerId: null,
    lastEvent: null,
    raf: 0,
  });

  const panToWorldCenter = React.useCallback((worldX: number, worldY: number) => {
    try {
      const clamped = clampWorldPointToContentBounds(worldX, worldY);
      const { zoom, setPan } = useCanvasStore.getState();
      const vs = paper?.view?.viewSize;
      const cx = vs ? vs.width / 2 : window.innerWidth / 2;
      const cy = vs ? vs.height / 2 : window.innerHeight / 2;
      const desiredPanX = (cx / (zoom || 1)) - clamped.x;
      const desiredPanY = (cy / (zoom || 1)) - clamped.y;
      setPan(desiredPanX, desiredPanY);
    } catch {}
  }, []);

  const clientToWorld = React.useCallback((clientX: number, clientY: number) => {
    if (!svgEl) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const svgPt = pt.matrixTransform(inv);
    return { x: svgPt.x, y: svgPt.y };
  }, [svgEl]);

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
        setTargetEl(target);
        if (host) setSvgEl(host);
      }
    };
    find();
    const id = window.setInterval(find, 500);
    return () => window.clearInterval(id);
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
    if (!svgEl) return;
    const onClick = (ev: MouseEvent) => {
      try {
        const world = clientToWorldForInteraction(ev.clientX, ev.clientY);
        if (!world) return;

        const hit = images.find(
          (m) =>
            world.x >= m.x &&
            world.x <= m.x + m.width &&
            world.y >= m.y &&
            world.y <= m.y + m.height
        );
        const worldX = hit ? hit.x + hit.width / 2 : world.x;
        const worldY = hit ? hit.y + hit.height / 2 : world.y;

        panToWorldCenter(worldX, worldY);
        window.requestAnimationFrame(() => ensureViewportShowsContent());
      } catch {}
    };
    svgEl.addEventListener('click', onClick);
    return () => svgEl.removeEventListener('click', onClick);
  }, [svgEl, images, clientToWorldForInteraction, panToWorldCenter]);

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
      state.active = true;
      state.pointerId = ev.pointerId;
      state.lastEvent = ev;
      try { el.setPointerCapture(ev.pointerId); } catch {}
      ev.preventDefault();
      applyDrag();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!state.active || state.pointerId !== ev.pointerId) return;
      state.lastEvent = ev;
      if (!state.raf) state.raf = window.requestAnimationFrame(applyDrag);
    };

    const stopDrag = (ev?: PointerEvent) => {
      if (ev && state.pointerId !== null && ev.pointerId !== state.pointerId) return;
      if (!state.active) return;
      const pointerId = state.pointerId;
      state.active = false;
      state.pointerId = null;
      state.lastEvent = null;
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      if (pointerId != null) {
        try { el.releasePointerCapture(pointerId); } catch {}
      }
      window.requestAnimationFrame(() => ensureViewportShowsContent());
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
  }, [svgEl, clientToWorldForInteraction, panToWorldCenter]);

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
