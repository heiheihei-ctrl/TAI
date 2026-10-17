import { useEffect, useState } from "react";
import paper from "paper";
import { useProjectStore } from "@/stores/projectStore";
import { useCanvasStore } from "@/stores";
import { useAuthStore } from "@/stores/authStore";
import { csRealtimeClient } from "@/services/csRealtimeClient";
import { isLinglongRestrictedPalette } from "@/config/linglongPalette";
import { clientToProject, clientToCollabWorld, getDpr } from "@/utils/paperCoords";
import CollabCursorLayer from "@/components/collab/CollabCursorLayer";
import type { PeerCursor } from "@/hooks/usePresence";

export function CsCanvasCursors() {
  const projectId = useProjectStore((state) => state.currentProjectId);
  const userId = useAuthStore((state) => state.user?.id);
  const [cursors, setCursors] = useState<Record<string, PeerCursor>>({});
  const [connectionError, setConnectionError] = useState("");
  useEffect(() => {
    setCursors({});
    if (!projectId || !isLinglongRestrictedPalette()) return;
    const off = csRealtimeClient.subscribe((event) => {
      if (event.type === "canvas_error") setConnectionError(event.message || "鼠标同步连接失败，请刷新后重试");
      if (event.type === "canvas_ready" && event.projectId === projectId) setConnectionError("");
      if (event.type === "status" || (event.type === "message" && event.message?.content?.status === "ended")) {
        setCursors({});
        return;
      }
      if (event.type !== "canvas_cursor" || event.projectId !== projectId || event.userId === userId) return;
      if (typeof event.userId !== "string") return;
      if (!event.hidden && (!Number.isFinite(event.x) || !Number.isFinite(event.y))) return;
      setCursors((previous) => {
        const next = { ...previous };
        if (event.hidden) delete next[event.userId];
        else next[event.userId] = {
          userId: event.userId, name: event.name || "协同成员", color: event.color,
          x: event.x, y: event.y, receivedAt: Date.now(),
        };
        return next;
      });
    });
    let lastSent = 0;
    const sendHidden = () => csRealtimeClient.send({ type: "canvas_cursor", projectId, hidden: true });
    const move = (event: PointerEvent) => {
      const canvas = paper.view?.element ?? document.querySelector<HTMLCanvasElement>("canvas.tanva-main-canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      const now = Date.now();
      if (now - lastSent < 100) return;
      lastSent = now;
      let point;
      if (paper.view?.element) {
        const position = clientToProject(canvas, event.clientX, event.clientY);
        const dpr = getDpr();
        point = { x: position.x / dpr, y: position.y / dpr };
      } else {
        const { zoom, panX, panY } = useCanvasStore.getState();
        point = clientToCollabWorld(canvas, event.clientX, event.clientY, zoom, panX, panY);
      }
      csRealtimeClient.send({ type: "canvas_cursor", projectId, ...point });
    };
    const visibility = () => { if (document.hidden) sendHidden(); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", sendHidden);
    document.documentElement.addEventListener("pointerleave", sendHidden);
    document.addEventListener("visibilitychange", visibility);
    const sweep = window.setInterval(() => setCursors((previous) => {
      const entries = Object.entries(previous).filter(([, cursor]) => Date.now() - cursor.receivedAt < 5000);
      return entries.length === Object.keys(previous).length ? previous : Object.fromEntries(entries);
    }), 1000);
    return () => {
      sendHidden(); off(); window.clearInterval(sweep);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", sendHidden);
      document.documentElement.removeEventListener("pointerleave", sendHidden);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [projectId, userId]);
  return <>
    <CollabCursorLayer cursors={cursors} />
    {connectionError && <div role="alert" className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm text-orange-700 shadow-sm">鼠标同步未连接：{connectionError}</div>}
  </>;
}
