import React from 'react';
import { Handle, Position, useReactFlow, useStore, useUpdateNodeInternals, type ReactFlowState, type Edge } from 'reactflow';
import { resolveTextFromSourceNode } from '../utils/textSource';
import { collectPromptNodeImageMentionItems } from '../utils/imageMentionCandidates';
import { useLocaleText } from '@/utils/localeText';
import { useFlowOnboardingStore, getFlowOnboardingSteps } from '@/stores/flowOnboardingStore';
import { useCanvasStore } from '@/stores';
import FlowResizableNodeShell from './FlowResizableNodeShell';
import InlineImageMentionEditor from '@/components/common/InlineImageMentionEditor';

type Props = {
  id: string;
  data: { text?: string; boxW?: number; boxH?: number; title?: string };
  selected?: boolean;
};

const DEFAULT_TITLE = 'Prompt';

function TextPromptNodeInner({ id, data, selected }: Props) {
  const { lt } = useLocaleText();
  const onboardingActive = useFlowOnboardingStore((s) => s.active);
  const onboardingPhase = useFlowOnboardingStore((s) => s.phase);
  const onboardingTrack = useFlowOnboardingStore((s) => s.track);
  const onboardingStep = useFlowOnboardingStore((s) => s.step);
  const onboardingTextId = useFlowOnboardingStore((s) => s.textPromptNodeId);
  const rf = useReactFlow();
  const edges = useStore((state: ReactFlowState) => state.edges);
  const [value, setValue] = React.useState<string>(data.text || '');
  const [hover, setHover] = React.useState<string | null>(null);
  const [incomingTexts, setIncomingTexts] = React.useState<string[]>([]);
  const edgesRef = React.useRef<Edge[]>(edges);
  const onboardingInputHint = React.useMemo(() => {
    if (!onboardingActive || onboardingPhase !== 'guide' || onboardingTextId !== id) {
      return null;
    }
    const steps = getFlowOnboardingSteps(onboardingTrack);
    const current = steps[onboardingStep];
    if (!current || current.target !== 'text-prompt-input') return null;
    if ((value || '').trim().length > 0) return null;
    return current.hintZh || current.hintEn || null;
  }, [
    id,
    onboardingActive,
    onboardingPhase,
    onboardingStep,
    onboardingTextId,
    onboardingTrack,
    value,
  ]);

  const borderColor = selected ? '#2563eb' : '#e5e7eb';
  const boxShadow = selected ? '0 0 0 2px rgba(37,99,235,0.12)' : '0 1px 2px rgba(0,0,0,0.04)';
  const normalizedTitle = typeof data.title === 'string' && data.title.trim().length
    ? data.title.trim()
    : DEFAULT_TITLE;
  const [title, setTitle] = React.useState<string>(normalizedTitle);
  const [titleDraft, setTitleDraft] = React.useState<string>(normalizedTitle);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const incomingCount = incomingTexts.length;
  const hasIncoming = incomingCount > 0;
  const shouldPassWheelToCanvas = React.useCallback((event: React.WheelEvent<Element>) => {
    const store = useCanvasStore.getState();
    const isModifierWheel = event.ctrlKey || event.metaKey;
    return store.wheelZoomMode === 'direct' ? !isModifierWheel : isModifierWheel;
  }, []);
  const imageMentionItems = React.useMemo(
    () => collectPromptNodeImageMentionItems(id, edges, (nodeId) => rf.getNode(nodeId)),
    [edges, id, rf]
  );
  const isInlineMentionInteractiveTarget = React.useCallback((target: EventTarget | null) => {
    return target instanceof HTMLElement && Boolean(target.closest("[data-inline-mention-interactive='true']"));
  }, []);

  const commitValue = React.useCallback((nextValue: string) => {
    setValue(nextValue);
    const ev = new CustomEvent('flow:updateNodeData', { detail: { id, patch: { text: nextValue } } });
    window.dispatchEvent(ev);
  }, [id]);

  const applyIncomingText = React.useCallback((incoming: string) => {
    setValue((prev) => (prev === incoming ? prev : incoming));
    const currentDataText = typeof data.text === 'string' ? data.text : '';
    if (currentDataText !== incoming) {
      window.dispatchEvent(new CustomEvent('flow:updateNodeData', {
        detail: { id, patch: { text: incoming } }
      }));
    }
  }, [data.text, id]);

  const syncFromSource = React.useCallback((sourceId: string, sourceHandle?: string | null) => {
    const srcNode = rf.getNode(sourceId);
    const upstream = resolveTextFromSourceNode(srcNode, sourceHandle) || '';
    applyIncomingText(upstream);
  }, [rf, applyIncomingText]);

  const handleDisconnectInputs = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const currentEdges = rf.getEdges();
    const remain = currentEdges.filter(edge => !(edge.target === id && edge.targetHandle === 'text'));
    if (remain.length === currentEdges.length) return;
    setIncomingTexts([]);
    rf.setEdges(remain);
  }, [rf, id]);

  const collectIncomingTexts = React.useCallback((edgeList: Edge[]) => {
    const incomingEdges = edgeList
      .filter((edge) => edge.target === id && edge.targetHandle === 'text');
    if (!incomingEdges.length) return [];

    const decorated = incomingEdges.map((edge, index) => {
      const handle = (edge as any).sourceHandle as string | undefined;
      let order = 1000 + index;
      if (typeof handle === 'string') {
        const promptMatch = handle.match(/^prompt(\d+)$/);
        if (promptMatch) {
          order = Number(promptMatch[1]);
        } else {
          const numericMatch = handle.match(/(\d+)/);
          if (numericMatch) {
            order = Number(numericMatch[1]);
          }
        }
      }
      return { edge, order, index };
    });

    decorated.sort((a, b) => (a.order - b.order) || (a.index - b.index));

    return decorated
      .map(({ edge }) => {
        const node = rf.getNode(edge.source);
        const resolved = resolveTextFromSourceNode(node, (edge as any).sourceHandle);
        return typeof resolved === 'string' && resolved.trim().length ? resolved.trim() : '';
      })
      .filter((text) => text.length > 0);
  }, [id, rf]);

  React.useEffect(() => {
    // keep internal state in sync if external changes happen
    const nextValue = data.text || '';
    if (nextValue !== value) setValue(nextValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.text]);

  React.useEffect(() => {
    setTitle(normalizedTitle);
    if (!isEditingTitle) {
      setTitleDraft(normalizedTitle);
    }
  }, [normalizedTitle, isEditingTitle]);

  React.useEffect(() => {
    if (!isEditingTitle) return;
    requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
  }, [isEditingTitle]);

  React.useEffect(() => {
    edgesRef.current = edges;
    const texts = collectIncomingTexts(edges);
    setIncomingTexts(texts);
    if (texts.length) {
      applyIncomingText(texts.join('\n\n'));
    }
  }, [edges, collectIncomingTexts, applyIncomingText]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; patch: Record<string, unknown> }>).detail;
      if (!detail?.id || detail.id === id) return;
      const isSourceLinked = edgesRef.current.some(
        (edge) => edge.target === id && edge.targetHandle === 'text' && edge.source === detail.id
      );
      if (!isSourceLinked) return;

      const texts = collectIncomingTexts(edgesRef.current);
      setIncomingTexts(texts);
      if (texts.length) {
        applyIncomingText(texts.join('\n\n'));
        return;
      }

      const incoming = edgesRef.current.find((edge) => edge.target === id && edge.targetHandle === 'text' && edge.source === detail.id);
      const patch = detail.patch || {};
      const textPatch = typeof patch.text === 'string' ? patch.text : undefined;
      if (typeof textPatch === 'string') return applyIncomingText(textPatch);
      const promptPatch = typeof patch.prompt === 'string' ? patch.prompt : undefined;
      if (typeof promptPatch === 'string') return applyIncomingText(promptPatch);
      if (incoming) {
        syncFromSource(detail.id, incoming.sourceHandle);
      }
    };
    window.addEventListener('flow:updateNodeData', handler as EventListener);
    return () => window.removeEventListener('flow:updateNodeData', handler as EventListener);
  }, [id, applyIncomingText, syncFromSource, collectIncomingTexts]);

  const startTitleEditing = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    setTitleDraft(title);
    setIsEditingTitle(true);
  }, [title]);

  const commitTitle = React.useCallback((raw: string) => {
    const trimmed = raw.trim();
    const nextTitle = trimmed.length ? trimmed : DEFAULT_TITLE;
    setTitle(nextTitle);
    setTitleDraft(nextTitle);
    setIsEditingTitle(false);
    window.dispatchEvent(new CustomEvent('flow:updateNodeData', {
      detail: { id, patch: { title: nextTitle } }
    }));
  }, [id]);

  const cancelTitleEditing = React.useCallback(() => {
    setIsEditingTitle(false);
    setTitleDraft(title);
  }, [title]);

  React.useLayoutEffect(() => {
    updateNodeInternals(id);
  }, [id, isEditingTitle, updateNodeInternals]);

  return (
    <FlowResizableNodeShell
      id={id}
      data={data}
      selected={selected}
      nodeType="textPrompt"
      defaultHeight={104}
      minWidth={180}
      minHeight={88}
      heightMode="fixed"
      style={{
        padding: 8,
        background: '#fff',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        boxShadow,
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => commitTitle(titleDraft)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTitle(titleDraft);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelTitleEditing();
              }
            }}
            style={{
              fontWeight: 600,
              fontSize: 13,
              border: '1px solid #d1d5db',
              borderRadius: 4,
              padding: '2px 4px',
              outline: 'none',
              width: '100%'
            }}
          />
        ) : (
          <span
            onDoubleClick={startTitleEditing}
            title={lt("双击编辑标题", "Double-click to edit title")}
            style={{ cursor: 'text', userSelect: 'none' }}
          >
            {title}
          </span>
        )}
        {hasIncoming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {lt(`已拼接 ${incomingCount} 条输入`, `${incomingCount} inputs merged`)}
            </span>
            <button
              onClick={handleDisconnectInputs}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#374151',
                cursor: 'pointer'
              }}
            >
              {lt("内置", "Builtin")}
            </button>
          </div>
        )}
      </div>
      <div
        data-flow-onboarding={
          onboardingActive && onboardingTextId === id
            ? 'text-prompt-input'
            : undefined
        }
        style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}
      >
      {onboardingInputHint ? (
        <div className="flow-onboarding-input-hint" aria-hidden="true">
          {onboardingInputHint}
        </div>
      ) : null}
      <InlineImageMentionEditor
        value={value}
        items={imageMentionItems}
        onChange={commitValue}
        emptyText={lt("下游模型暂无已连接图片", "No connected images")}
        placeholder={onboardingInputHint ? '' : lt("输入提示词", "Enter prompt")}
        menuStyle={{ position: 'absolute', left: 8, bottom: 8 }}
        containerStyle={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
        onWheelCapture={(event) => {
          if (isInlineMentionInteractiveTarget(event.target)) return;
          if (shouldPassWheelToCanvas(event)) return;
          event.stopPropagation();
          if ((event.nativeEvent as Event & { stopImmediatePropagation?: () => void })?.stopImmediatePropagation) {
            (event.nativeEvent as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
          }
        }}
        onPointerDownCapture={(event) => {
          if (isInlineMentionInteractiveTarget(event.target)) return;
          event.stopPropagation();
          (event.nativeEvent as Event & { stopImmediatePropagation?: () => void })?.stopImmediatePropagation?.();
        }}
        onMouseDownCapture={(event) => {
          if (isInlineMentionInteractiveTarget(event.target)) return;
          event.stopPropagation();
        }}
        style={{
          width: '100%',
          flex: 1,
          minHeight: 0,
          maxHeight: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          fontSize: 12,
          lineHeight: 1.4,
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: 6,
          background: 'rgba(255,255,255,0.92)',
          color: '#111827',
          pointerEvents: 'auto',
          cursor: 'text'
        }}
      />
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        style={{ top: '50%' }}
        onMouseEnter={() => setHover('prompt-in')}
        onMouseLeave={() => setHover(null)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="text"
        style={{ top: '50%' }}
        onMouseEnter={() => setHover('prompt-out')}
        onMouseLeave={() => setHover(null)}
      />
      {hover === 'prompt-in' && (
        <div className="flow-tooltip" style={{ left: -8, top: '50%', transform: 'translate(-100%, -50%)' }}>prompt</div>
      )}
      {hover === 'prompt-out' && (
        <div className="flow-tooltip" style={{ right: -8, top: '50%', transform: 'translate(100%, -50%)' }}>prompt</div>
      )}
    </FlowResizableNodeShell>
  );
}

export default React.memo(TextPromptNodeInner);
