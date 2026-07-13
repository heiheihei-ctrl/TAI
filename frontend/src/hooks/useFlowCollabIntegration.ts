import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import {
  collaborationSocket,
  dedupeByUserId,
  type CollaborationSelectionState,
  type FlowPatchPayload,
} from '@/services/collaborationSocket';

const PATCH_DEBOUNCE_MS = 200;
const PATCH_MAXWAIT_MS = 150;

type NormalizeNodeType = (rawType?: string) => string | null;

export interface RemoteFlowNodeLock {
  userId: string;
  name: string;
  color: string;
}

interface Options {
  projectId: string | null;
  enabled: boolean;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  normalizeNodeType: NormalizeNodeType;
  knownNodeTypes: ReadonlySet<string>;
}

function dedupById(arr?: unknown[]): unknown[] | undefined {
  if (!arr || arr.length === 0) return undefined;
  const byId = new Map<string, Record<string, unknown>>();
  const noId: unknown[] = [];
  for (const it of arr) {
    const cur = it as Record<string, unknown>;
    const id = cur?.id;
    if (typeof id === 'string') {
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, cur);
        continue;
      }
      const merged: Record<string, unknown> = { ...prev, ...cur };
      if (prev.data || cur.data) {
        merged.data = { ...(prev.data as object || {}), ...(cur.data as object || {}) };
      }
      if (prev.style || cur.style) {
        merged.style = { ...(prev.style as object || {}), ...(cur.style as object || {}) };
      }
      byId.set(id, merged);
    } else {
      noId.push(it);
    }
  }
  return [...noId, ...byId.values()];
}

export function useFlowCollabIntegration({
  projectId,
  enabled,
  setNodes,
  setEdges,
  normalizeNodeType,
  knownNodeTypes,
}: Options) {
  const applyingRemoteRef = useRef(false);
  const pendingPatch = useRef<FlowPatchPayload | null>(null);
  const patchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patchLastFlush = useRef(0);
  const lastBroadcastFlowSelectionRef = useRef('');
  const [remoteFlowSelections, setRemoteFlowSelections] = useState<
    CollaborationSelectionState[]
  >([]);
  const [lockedNodeIds, setLockedNodeIds] = useState<Set<string>>(() => new Set());
  const lockedNodeMapRef = useRef<Map<string, RemoteFlowNodeLock>>(new Map());

  const applyRemotePatch = useCallback(
    (payload: FlowPatchPayload) => {
      applyingRemoteRef.current = true;
      try {
        if (Array.isArray(payload.upsertNodes) && payload.upsertNodes.length > 0) {
          setNodes((ns) => {
            const result = [...ns];
            for (const incoming of payload.upsertNodes as Record<string, unknown>[]) {
              if (!incoming?.id) continue;
              const incomingType =
                typeof incoming.type === 'string'
                  ? normalizeNodeType(incoming.type) || incoming.type
                  : undefined;
              const idx = result.findIndex((n) => n.id === incoming.id);
              if (idx >= 0) {
                const existing = result[idx];
                result[idx] = {
                  ...existing,
                  ...incoming,
                  ...(incomingType ? { type: incomingType } : {}),
                  data: incoming.data
                    ? { ...(existing.data || {}), ...(incoming.data as object) }
                    : existing.data,
                  style: incoming.style
                    ? { ...(existing.style || {}), ...(incoming.style as object) }
                    : existing.style,
                } as Node;
              } else if (incomingType && knownNodeTypes.has(incomingType)) {
                result.push({ ...incoming, type: incomingType } as Node);
              }
            }
            return result;
          });
        }

        if (Array.isArray(payload.removeNodeIds) && payload.removeNodeIds.length > 0) {
          const ids = payload.removeNodeIds as string[];
          setNodes((ns) => ns.filter((n) => !ids.includes(n.id)));
        }

        if (Array.isArray(payload.upsertEdges) && payload.upsertEdges.length > 0) {
          setEdges((es) => {
            const result = [...es];
            for (const incoming of payload.upsertEdges as Record<string, unknown>[]) {
              if (!incoming?.id) continue;
              const idx = result.findIndex((e) => e.id === incoming.id);
              if (idx >= 0) {
                result[idx] = { ...result[idx], ...incoming } as Edge;
              } else {
                result.push(incoming as Edge);
              }
            }
            return result;
          });
        }

        if (Array.isArray(payload.removeEdgeIds) && payload.removeEdgeIds.length > 0) {
          const ids = payload.removeEdgeIds as string[];
          setEdges((es) => es.filter((e) => !ids.includes(e.id)));
        }
      } finally {
        queueMicrotask(() => {
          applyingRemoteRef.current = false;
        });
      }
    },
    [knownNodeTypes, normalizeNodeType, setEdges, setNodes],
  );

  useEffect(() => {
    if (!enabled || !projectId) {
      setRemoteFlowSelections([]);
      setLockedNodeIds(new Set());
      lockedNodeMapRef.current = new Map();
      return;
    }

    const unsub = collaborationSocket.subscribeFlowPatches((message) => {
      if (!message?.patch) return;
      applyRemotePatch(message.patch);
    });
    return unsub;
  }, [applyRemotePatch, enabled, projectId]);

  useEffect(() => {
    if (!enabled || !projectId) {
      setRemoteFlowSelections([]);
      setLockedNodeIds(new Set());
      lockedNodeMapRef.current = new Map();
      return;
    }

    const unsub = collaborationSocket.subscribeSelections((map) => {
      const selfUserId = collaborationSocket.getSelfUserId();
      const remote = dedupeByUserId(
        [...map.values()].filter((item) => item.userId !== selfUserId),
      );
      setRemoteFlowSelections(remote);

      const locks = new Map<string, RemoteFlowNodeLock>();
      for (const selection of remote) {
        for (const nodeId of selection.flowNodeIds ?? []) {
          locks.set(nodeId, {
            userId: selection.userId,
            name: selection.name,
            color: selection.color,
          });
        }
      }
      lockedNodeMapRef.current = locks;
      setLockedNodeIds(new Set(locks.keys()));
    });
    return unsub;
  }, [enabled, projectId]);

  const sendFlowPatch = useCallback(
    (patch: FlowPatchPayload) => {
      if (!enabled || !projectId) return;

      const prev = pendingPatch.current ?? {};
      pendingPatch.current = {
        upsertNodes: dedupById([...(prev.upsertNodes ?? []), ...(patch.upsertNodes ?? [])]),
        removeNodeIds: [...new Set([...(prev.removeNodeIds ?? []), ...(patch.removeNodeIds ?? [])])],
        upsertEdges: dedupById([...(prev.upsertEdges ?? []), ...(patch.upsertEdges ?? [])]),
        removeEdgeIds: [...new Set([...(prev.removeEdgeIds ?? []), ...(patch.removeEdgeIds ?? [])])],
      };

      const flush = () => {
        if (patchDebounce.current) {
          clearTimeout(patchDebounce.current);
          patchDebounce.current = null;
        }
        if (!projectId || !collaborationSocket.isReadyForProject(projectId)) {
          return;
        }
        const toSend = pendingPatch.current;
        pendingPatch.current = null;
        patchLastFlush.current = Date.now();
        if (!toSend) return;
        collaborationSocket.emitFlowPatch(projectId, toSend);
      };

      if (!collaborationSocket.isReadyForProject(projectId)) {
        return;
      }

      if (Date.now() - patchLastFlush.current >= PATCH_MAXWAIT_MS) {
        flush();
        return;
      }
      if (patchDebounce.current) clearTimeout(patchDebounce.current);
      patchDebounce.current = setTimeout(flush, PATCH_DEBOUNCE_MS);
    },
    [enabled, projectId],
  );

  useEffect(() => {
    if (!enabled || !projectId) return;

    const unsub = collaborationSocket.subscribeConnection(({ connected, projectId: activeId }) => {
      if (!connected || activeId !== projectId || !pendingPatch.current) return;
      if (patchDebounce.current) clearTimeout(patchDebounce.current);
      patchDebounce.current = setTimeout(() => {
        if (!projectId || !collaborationSocket.isReadyForProject(projectId)) return;
        const toSend = pendingPatch.current;
        pendingPatch.current = null;
        patchLastFlush.current = Date.now();
        if (toSend) {
          collaborationSocket.emitFlowPatch(projectId, toSend);
        }
      }, PATCH_DEBOUNCE_MS);
    });

    return unsub;
  }, [enabled, projectId]);

  const broadcastNodeChanges = useCallback(
    (changes: unknown[]) => {
      if (applyingRemoteRef.current || !Array.isArray(changes)) return;

      const upsertNodes: Record<string, unknown>[] = [];
      const removeNodeIds: string[] = [];

      for (const c of changes as Array<{ id?: string; type?: string; position?: { x: number; y: number } }>) {
        if (!c?.id) continue;
        if (c.type === 'position' && c.position) {
          upsertNodes.push({ id: c.id, position: c.position });
        } else if (c.type === 'remove') {
          removeNodeIds.push(String(c.id));
        }
      }

      if (upsertNodes.length > 0 || removeNodeIds.length > 0) {
        sendFlowPatch({
          ...(upsertNodes.length > 0 ? { upsertNodes } : {}),
          ...(removeNodeIds.length > 0 ? { removeNodeIds } : {}),
        });
      }
    },
    [sendFlowPatch],
  );

  const broadcastEdgeChanges = useCallback(
    (changes: unknown[]) => {
      if (applyingRemoteRef.current || !Array.isArray(changes)) return;

      const upsertEdges: Record<string, unknown>[] = [];
      const removeEdgeIds: string[] = [];

      for (const c of changes as Array<{ id?: string; type?: string }>) {
        if (!c?.id) continue;
        if (c.type === 'add') {
          // add 事件本身不含完整 edge，跳过；完整 edge 由 connect 回调单独广播
          continue;
        }
        if (c.type === 'remove') {
          removeEdgeIds.push(String(c.id));
        }
      }

      if (removeEdgeIds.length > 0) {
        sendFlowPatch({ removeEdgeIds });
      }
    },
    [sendFlowPatch],
  );

  const broadcastFlowSelection = useCallback(
    (nodeIds: string[]) => {
      if (!enabled || !projectId || !collaborationSocket.isReadyForProject(projectId)) return;
      const normalized = [...nodeIds].sort().join(',');
      if (normalized === lastBroadcastFlowSelectionRef.current) return;
      lastBroadcastFlowSelectionRef.current = normalized;
      collaborationSocket.emitSelection(projectId, { flowNodeIds: nodeIds });
    },
    [enabled, projectId],
  );

  const isNodeLockedByRemote = useCallback((nodeId: string) => {
    return lockedNodeMapRef.current.has(nodeId);
  }, []);

  const filterNodeChangesForLocks = useCallback(
    (changes: unknown[]) => {
      if (!Array.isArray(changes) || lockedNodeMapRef.current.size === 0) {
        return changes;
      }
      return changes.filter((change) => {
        const item = change as { type?: string; id?: string; selected?: boolean };
        if (item?.type !== 'select' || !item.selected || !item.id) return true;
        return !lockedNodeMapRef.current.has(item.id);
      });
    },
    [],
  );

  return {
    applyingRemoteRef,
    sendFlowPatch,
    broadcastNodeChanges,
    broadcastEdgeChanges,
    broadcastFlowSelection,
    remoteFlowSelections,
    lockedNodeIds,
    isNodeLockedByRemote,
    filterNodeChangesForLocks,
  };
}
