import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from 'reactflow';
import { useCollab } from '@/collab/CollabContext';
import type { NodePatchPayload } from '@/collab/types';
import {
  buildCollabNodeDataUpsert,
  buildCollabNodeUpsert,
  sanitizeCollabDataPatch,
} from '@/utils/flowCollabPatch';

type NormalizeNodeType = (rawType?: string) => string | null;

export interface RemoteFlowNodeLock {
  userId: string;
  name: string;
  color: string;
}

/** 与旧 Socket.IO FlowPatch 形状兼容；实际经 useCollab.sendPatch → /ws/collab。 */
export type FlowPatchPayload = NodePatchPayload;

interface Options {
  projectId: string | null;
  enabled: boolean;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  normalizeNodeType: NormalizeNodeType;
  knownNodeTypes: ReadonlySet<string>;
}

/**
 * Flow 协同：走 CollabProvider 的原生 /ws/collab（与 Tanva 一致），
 * 不再依赖已下线的 Socket.IO collaborationSocket。
 */
export function useFlowCollabIntegration({
  projectId,
  enabled,
  setNodes,
  setEdges,
  normalizeNodeType,
  knownNodeTypes,
}: Options) {
  const collab = useCollab();
  const applyingRemoteRef = useRef(false);
  const prevCollabDataRef = useRef(new Map<string, string>());
  const remoteDataSkipRef = useRef(new Set<string>());
  const lockedNodeMapRef = useRef<Map<string, RemoteFlowNodeLock>>(new Map());
  const [remoteFlowSelections, setRemoteFlowSelections] = useState<
    Array<{
      peerId: string;
      userId: string;
      name: string;
      color: string;
      imageIds: string[];
      modelIds: string[];
      videoIds: string[];
      textIds: string[];
      pathBounds: [];
      flowNodeIds: string[];
    }>
  >([]);
  const [lockedNodeIds, setLockedNodeIds] = useState<Set<string>>(() => new Set());

  const applyRemotePatch = useCallback(
    (payload: FlowPatchPayload) => {
      applyingRemoteRef.current = true;
      try {
        if (Array.isArray(payload.upsertNodes) && payload.upsertNodes.length > 0) {
          for (const incoming of payload.upsertNodes as Record<string, unknown>[]) {
            if (incoming?.id && incoming.data) {
              remoteDataSkipRef.current.add(String(incoming.id));
            }
          }
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
    if (!enabled || !projectId || !collab) {
      setRemoteFlowSelections([]);
      setLockedNodeIds(new Set());
      lockedNodeMapRef.current = new Map();
      return;
    }

    const unsubPatch = collab.subscribe('node_patch', (env) => {
      const payload = env?.payload as FlowPatchPayload | undefined;
      if (!payload) return;
      applyRemotePatch(payload);
    });

    const unsubLock = collab.subscribe('node_lock', (env) => {
      const p = env?.payload as
        | { nodeId?: string; holderUserId?: string; holderName?: string; released?: boolean }
        | undefined;
      if (!p?.nodeId) return;
      const next = new Map(lockedNodeMapRef.current);
      if (p.released) {
        next.delete(p.nodeId);
      } else if (p.holderUserId) {
        next.set(p.nodeId, {
          userId: p.holderUserId,
          name: p.holderName || p.holderUserId.slice(0, 8),
          color: '#3b82f6',
        });
      }
      lockedNodeMapRef.current = next;
      setLockedNodeIds(new Set(next.keys()));
      setRemoteFlowSelections(
        [...next.entries()].map(([nodeId, lock]) => ({
          peerId: lock.userId,
          userId: lock.userId,
          name: lock.name,
          color: lock.color,
          imageIds: [],
          modelIds: [],
          videoIds: [],
          textIds: [],
          pathBounds: [],
          flowNodeIds: [nodeId],
        })),
      );
    });

    return () => {
      unsubPatch();
      unsubLock();
    };
  }, [applyRemotePatch, collab, enabled, projectId]);

  const sendFlowPatch = useCallback(
    (patch: FlowPatchPayload, _options?: { immediate?: boolean }) => {
      if (!enabled || !projectId || applyingRemoteRef.current) return;
      if (!collab?.connected) return;
      try {
        collab.sendPatch(patch);
      } catch {}
    },
    [collab, enabled, projectId],
  );

  const broadcastNodeChanges = useCallback(
    (changes: unknown[]) => {
      if (applyingRemoteRef.current || !Array.isArray(changes)) return;

      const upsertNodes: Record<string, unknown>[] = [];
      const removeNodeIds: string[] = [];

      for (const c of changes as Array<{ id?: string; type?: string; position?: { x: number; y: number } }>) {
        if (!c?.id) continue;
        if (lockedNodeMapRef.current.has(String(c.id))) continue;
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

      const removeEdgeIds: string[] = [];
      for (const c of changes as Array<{ id?: string; type?: string }>) {
        if (!c?.id) continue;
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
      if (!enabled || !projectId || !collab?.connected) return;
      // 选中即尝试 claim 锁（与 Tanva 行为对齐的简化版）
      for (const id of nodeIds) {
        void collab.claimLock(id).catch(() => {});
      }
    },
    [collab, enabled, projectId],
  );

  const isNodeLockedByRemote = useCallback((nodeId: string) => {
    return lockedNodeMapRef.current.has(nodeId);
  }, []);

  const filterNodeChangesForLocks = useCallback((changes: unknown[]) => {
    if (!Array.isArray(changes) || lockedNodeMapRef.current.size === 0) {
      return changes;
    }
    return changes.filter((change) => {
      const item = change as { type?: string; id?: string; selected?: boolean };
      if (item?.type !== 'select' || !item.selected || !item.id) return true;
      return !lockedNodeMapRef.current.has(item.id);
    });
  }, []);

  const broadcastNodeUpserts = useCallback(
    (nodes: Node[]) => {
      if (!nodes.length) return;
      sendFlowPatch({
        upsertNodes: nodes.map((node) => buildCollabNodeUpsert(node)),
      });
      for (const node of nodes) {
        const sanitized = sanitizeCollabDataPatch((node.data ?? {}) as Record<string, unknown>);
        prevCollabDataRef.current.set(node.id, JSON.stringify(sanitized ?? {}));
      }
    },
    [sendFlowPatch],
  );

  const broadcastNodeDataChange = useCallback(
    (
      nodeId: string,
      patch: Record<string, unknown>,
      position?: { x: number; y: number },
    ) => {
      const upsert = buildCollabNodeDataUpsert(nodeId, patch, position);
      if (upsert) {
        sendFlowPatch({ upsertNodes: [upsert] });
      }
    },
    [sendFlowPatch],
  );

  const syncLocalNodeDataChanges = useCallback(
    (nodes: Node[]) => {
      if (!enabled || !projectId || applyingRemoteRef.current) return;

      const skip = remoteDataSkipRef.current;
      const prev = prevCollabDataRef.current;
      const nextPrev = new Map<string, string>();

      for (const node of nodes) {
        const sanitized = sanitizeCollabDataPatch(
          (node.data ?? {}) as Record<string, unknown>,
        );
        const serialized = JSON.stringify(sanitized ?? {});
        nextPrev.set(node.id, serialized);

        if (skip.has(node.id)) continue;

        const prior = prev.get(node.id);
        if (prior === undefined || prior === serialized) continue;

        let priorObj: Record<string, unknown> = {};
        const nextObj = sanitized ?? {};
        try {
          priorObj = JSON.parse(prior) as Record<string, unknown>;
        } catch {
          priorObj = {};
        }

        const patch: Record<string, unknown> = {};
        const keys = new Set([...Object.keys(priorObj), ...Object.keys(nextObj)]);
        for (const key of keys) {
          if (JSON.stringify(priorObj[key]) !== JSON.stringify(nextObj[key])) {
            patch[key] = nextObj[key];
          }
        }

        const upsert = buildCollabNodeDataUpsert(node.id, patch);
        if (upsert) {
          sendFlowPatch({ upsertNodes: [upsert] });
        }
      }

      prevCollabDataRef.current = nextPrev;
      if (skip.size > 0) skip.clear();
    },
    [enabled, projectId, sendFlowPatch],
  );

  return {
    applyingRemoteRef,
    sendFlowPatch,
    broadcastNodeChanges,
    broadcastEdgeChanges,
    broadcastFlowSelection,
    broadcastNodeUpserts,
    broadcastNodeDataChange,
    syncLocalNodeDataChanges,
    remoteFlowSelections,
    lockedNodeIds,
    isNodeLockedByRemote,
    filterNodeChangesForLocks,
  };
}
