import React from 'react';
import type { Connection } from 'reactflow';
import type { useReactFlow } from 'reactflow';
import { historyService } from '@/services/historyService';

type WorldPoint = { x: number; y: number };

const ALLOWED_NODE_TYPES = new Set(['textPrompt', 'generate', 'image']);

type AgentGraphNode = {
  tempId: string;
  type: string;
  data?: Record<string, unknown>;
  offset?: { x: number; y: number };
};

type AgentGraphEdge = {
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
};

type AgentApplyGraphCommand = {
  type: 'apply_graph';
  mode?: string;
  prompt?: string;
  nodes?: AgentGraphNode[];
  edges?: AgentGraphEdge[];
  runNodeIds?: string[];
  viewportCenter?: { x: number; y: number };
};

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  createNodeAtWorldCenter: (
    rawType: string,
    world: WorldPoint,
    paletteDefaultData?: Record<string, unknown>,
    paletteConfig?: Record<string, unknown>
  ) => string | null;
  onConnect: (params: Connection) => void;
  runNode: (nodeId: string) => Promise<void>;
  rf: ReturnType<typeof useReactFlow>;
};

function isRemoteUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (!t || /^(data:|blob:)/i.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^(templates|projects|uploads|videos)\//i.test(t.replace(/^\/+/, ''))) {
    return true;
  }
  if (t.startsWith('/api/assets/') || t.startsWith('/assets/')) return true;
  return false;
}

/**
 * 对话工作流 Agent：监听 flow:agent-apply，创建节点/连线/Run，回传 flow:agent-run-result。
 */
export default function FlowAgentApplyBridge({
  containerRef,
  createNodeAtWorldCenter,
  onConnect,
  runNode,
  rf,
}: Props) {
  const getViewportCenter = React.useCallback((): WorldPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    try {
      return rf.screenToFlowPosition({ x: centerX, y: centerY });
    } catch {
      return { x: 0, y: 0 };
    }
  }, [containerRef, rf]);

  React.useEffect(() => {
    let running = false;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { command?: AgentApplyGraphCommand; requestId?: string }
        | undefined;
      const command = detail?.command;
      const requestId =
        typeof detail?.requestId === 'string' ? detail.requestId : undefined;

      if (!command || command.type !== 'apply_graph') return;
      if (running) {
        window.dispatchEvent(
          new CustomEvent('flow:agent-run-result', {
            detail: {
              requestId,
              ok: false,
              error: '已有工作流 Agent 任务在执行',
            },
          })
        );
        return;
      }

      void (async () => {
        running = true;
        const idMap = new Map<string, string>();
        try {
          const center =
            command.viewportCenter &&
            Number.isFinite(command.viewportCenter.x) &&
            Number.isFinite(command.viewportCenter.y)
              ? command.viewportCenter
              : getViewportCenter();

          const nodes = Array.isArray(command.nodes) ? command.nodes : [];
          for (const n of nodes) {
            const type = String(n?.type || '');
            if (!ALLOWED_NODE_TYPES.has(type)) continue;
            const tempId = String(n?.tempId || '').trim();
            if (!tempId) continue;

            const ox = Number(n.offset?.x) || 0;
            const oy = Number(n.offset?.y) || 0;
            const world = { x: center.x + ox, y: center.y + oy };

            let paletteData: Record<string, unknown> | undefined;
            if (type === 'textPrompt') {
              const text =
                typeof n.data?.text === 'string'
                  ? n.data.text
                  : typeof command.prompt === 'string'
                    ? command.prompt
                    : '';
              paletteData = {
                text,
                title:
                  typeof n.data?.title === 'string' ? n.data.title : 'Agent Prompt',
              };
            } else if (type === 'image') {
              const url =
                (isRemoteUrl(n.data?.imageUrl) && n.data?.imageUrl) ||
                (isRemoteUrl(n.data?.imageData) && n.data?.imageData) ||
                null;
              if (!url) continue;
              paletteData = { imageUrl: url, imageData: undefined };
            } else if (type === 'generate' && n.data) {
              paletteData = { ...n.data };
            }

            const realId = createNodeAtWorldCenter(type, world, paletteData);
            if (!realId) continue;
            idMap.set(tempId, realId);

            // 再次确保 text / image 数据写入（部分类型 create 时 data 可能被默认覆盖）
            if (type === 'textPrompt' && paletteData) {
              window.dispatchEvent(
                new CustomEvent('flow:updateNodeData', {
                  detail: { id: realId, patch: paletteData },
                })
              );
            }
            if (type === 'image' && paletteData) {
              window.dispatchEvent(
                new CustomEvent('flow:updateNodeData', {
                  detail: { id: realId, patch: paletteData },
                })
              );
            }
          }

          // 等 React Flow 状态提交后再连线
          await new Promise((r) => setTimeout(r, 50));

          const edges = Array.isArray(command.edges) ? command.edges : [];
          for (const e of edges) {
            const source = idMap.get(String(e.source));
            const target = idMap.get(String(e.target));
            if (!source || !target) continue;
            onConnect({
              source,
              target,
              sourceHandle: e.sourceHandle ?? null,
              targetHandle: e.targetHandle ?? null,
            });
          }

          await new Promise((r) => setTimeout(r, 80));
          historyService.commit('agent:workflow').catch(() => {});

          const runTempIds = Array.isArray(command.runNodeIds)
            ? command.runNodeIds
            : [];
          const results: Array<{
            tempId: string;
            nodeId: string;
            imageUrl?: string;
            error?: string;
          }> = [];

          for (const tempId of runTempIds) {
            const nodeId = idMap.get(String(tempId));
            if (!nodeId) {
              results.push({
                tempId: String(tempId),
                nodeId: '',
                error: '节点未创建',
              });
              continue;
            }
            try {
              await runNode(nodeId);
              const node = rf.getNode(nodeId);
              const data = (node?.data || {}) as Record<string, unknown>;
              const imageUrl =
                (typeof data.imageUrl === 'string' && data.imageUrl) ||
                (typeof data.imageData === 'string' &&
                !String(data.imageData).startsWith('data:')
                  ? data.imageData
                  : undefined) ||
                undefined;
              const status = String(data.status || '');
              if (status === 'error') {
                results.push({
                  tempId: String(tempId),
                  nodeId,
                  error: String(data.error || '生成失败'),
                });
              } else {
                results.push({
                  tempId: String(tempId),
                  nodeId,
                  imageUrl,
                });
              }
            } catch (err) {
              results.push({
                tempId: String(tempId),
                nodeId,
                error: err instanceof Error ? err.message : 'Run 失败',
              });
            }
          }

          const firstOk = results.find((r) => r.nodeId && !r.error);
          const firstErr = results.find((r) => r.error);

          window.dispatchEvent(
            new CustomEvent('flow:agent-run-result', {
              detail: {
                requestId,
                ok: Boolean(firstOk) || (results.length === 0 && idMap.size > 0),
                nodeIds: Array.from(idMap.values()),
                idMap: Object.fromEntries(idMap.entries()),
                results,
                imageUrl: firstOk?.imageUrl,
                generateNodeId: firstOk?.nodeId || results[0]?.nodeId,
                error: firstOk ? undefined : firstErr?.error,
              },
            })
          );
        } catch (err) {
          window.dispatchEvent(
            new CustomEvent('flow:agent-run-result', {
              detail: {
                requestId,
                ok: false,
                error: err instanceof Error ? err.message : '应用工作流失败',
                nodeIds: Array.from(idMap.values()),
              },
            })
          );
        } finally {
          running = false;
        }
      })();
    };

    window.addEventListener('flow:agent-apply', handler as EventListener);
    return () => {
      window.removeEventListener('flow:agent-apply', handler as EventListener);
    };
  }, [createNodeAtWorldCenter, getViewportCenter, onConnect, rf, runNode]);

  return null;
}
