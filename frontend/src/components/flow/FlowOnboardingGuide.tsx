import React from 'react';
import { createPortal } from 'react-dom';
import type { Edge, Node } from 'reactflow';
import { useLocaleText } from '@/utils/localeText';
import {
  FLOW_ONBOARDING_STEPS,
  useFlowOnboardingStore,
} from '@/stores/flowOnboardingStore';

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const PADDING = 10;
const CONNECT_NODES_PADDING = 72;
const TEXT_HANDLE_COLOR = '#22c55e';
const CANVAS_CENTER_COVERAGE = 0.8;

function mergeRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  };
}

function inflateRect(rect: Rect, pad: number): Rect {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function getElementRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
}

function getCanvasCenterRect(): Rect | null {
  const pane =
    getElementRect('.react-flow__pane') ||
    getElementRect('.react-flow__viewport') ||
    getElementRect('.tanva-flow-overlay');
  if (!pane) return null;

  const width = pane.width * CANVAS_CENTER_COVERAGE;
  const height = pane.height * CANVAS_CENTER_COVERAGE;

  return {
    top: pane.top + (pane.height - height) / 2,
    left: pane.left + (pane.width - width) / 2,
    width,
    height,
  };
}

function getTargetRect(
  stepTarget: string,
  textPromptNodeId: string | null,
  generateNodeId: string | null
): Rect | null {
  switch (stepTarget) {
    case 'canvas-center':
      return getCanvasCenterRect();
    case 'node-palette-textPrompt':
      return getElementRect('[data-flow-onboarding-target="textPrompt"]');
    case 'node-palette-generate':
      return getElementRect('[data-flow-onboarding-target="generate"]');
    case 'text-prompt-input':
      return (
        getElementRect('[data-flow-onboarding="text-prompt-input"]') ||
        (textPromptNodeId
          ? getElementRect(`.react-flow__node[data-id="${CSS.escape(textPromptNodeId)}"]`)
          : null)
      );
    case 'connect-nodes': {
      const rects: Rect[] = [];
      if (textPromptNodeId) {
        const rect = getElementRect(
          `.react-flow__node[data-id="${CSS.escape(textPromptNodeId)}"]`
        );
        if (rect) rects.push(rect);
      }
      if (generateNodeId) {
        const rect = getElementRect(
          `.react-flow__node[data-id="${CSS.escape(generateNodeId)}"]`
        );
        if (rect) rects.push(rect);
      }
      const merged = mergeRects(rects);
      return merged ? inflateRect(merged, CONNECT_NODES_PADDING) : null;
    }
    case 'generate-run-button':
      return getElementRect('[data-flow-onboarding="generate-run-button"]');
    default:
      return null;
  }
}

function findNewNodeId(
  nodes: Node[],
  type: string,
  initialNodeIds: Set<string>
): string | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (node.type === type && !initialNodeIds.has(node.id)) {
      return node.id;
    }
  }
  return null;
}

function hasTextToTextConnection(
  edges: Edge[],
  sourceId: string,
  targetId: string
): boolean {
  return edges.some((edge) => {
    if (edge.source !== sourceId || edge.target !== targetId) return false;
    const sourceHandle = String(edge.sourceHandle || 'text').toLowerCase();
    const targetHandle = String(edge.targetHandle || 'text').toLowerCase();
    const isTextSource =
      sourceHandle === 'text' || sourceHandle.startsWith('text-');
    const isTextTarget =
      targetHandle === 'text' || targetHandle.startsWith('text-');
    return isTextSource && isTextTarget;
  });
}

function buildCardStyle(
  stepTarget: string,
  spotRect: Rect | null
): React.CSSProperties {
  if (stepTarget === 'canvas-center' && spotRect) {
    return {
      bottom: 24,
      left: '50%',
      top: 'auto',
      transform: 'translateX(-50%)',
    };
  }

  if (spotRect) {
    if (spotRect.top > window.innerHeight * 0.55) {
      return {
        top: Math.max(16, spotRect.top - 12),
        left: Math.min(Math.max(16, spotRect.left), window.innerWidth - 360),
        transform: 'translateY(-100%)',
      };
    }
    return {
      top: Math.min(spotRect.top + spotRect.height + 16, window.innerHeight - 180),
      left: Math.min(Math.max(16, spotRect.left), window.innerWidth - 360),
    };
  }

  return {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  };
}

type Props = {
  addPanelVisible: boolean;
  nodes: Node[];
  edges: Edge[];
};

export default function FlowOnboardingGuide({
  addPanelVisible,
  nodes,
  edges,
}: Props) {
  const { lt } = useLocaleText();
  const active = useFlowOnboardingStore((s) => s.active);
  const step = useFlowOnboardingStore((s) => s.step);
  const initialNodeIds = useFlowOnboardingStore((s) => s.initialNodeIds);
  const textPromptNodeId = useFlowOnboardingStore((s) => s.textPromptNodeId);
  const generateNodeId = useFlowOnboardingStore((s) => s.generateNodeId);
  const setStep = useFlowOnboardingStore((s) => s.setStep);
  const setTextPromptNodeId = useFlowOnboardingStore((s) => s.setTextPromptNodeId);
  const setGenerateNodeId = useFlowOnboardingStore((s) => s.setGenerateNodeId);
  const skip = useFlowOnboardingStore((s) => s.skip);
  const complete = useFlowOnboardingStore((s) => s.complete);

  const [spotRect, setSpotRect] = React.useState<Rect | null>(null);

  const currentStep = FLOW_ONBOARDING_STEPS[step];
  const stepTarget = currentStep?.target ?? 'canvas-center';
  const isCanvasCenterStep = stepTarget === 'canvas-center';
  const skipExtraSpotlightPadding =
    isCanvasCenterStep || stepTarget === 'connect-nodes';

  React.useEffect(() => {
    if (!active) return;

    if (step === 0 && addPanelVisible) {
      setStep(1);
      return;
    }

    if (step === 1) {
      const nodeId = findNewNodeId(nodes, 'textPrompt', initialNodeIds);
      if (nodeId) {
        setTextPromptNodeId(nodeId);
        setStep(2);
      }
      return;
    }

    if (step === 2 && textPromptNodeId) {
      const node = nodes.find((item) => item.id === textPromptNodeId);
      const text = String(node?.data?.text || '').trim();
      if (text.length > 0) {
        setStep(3);
      }
      return;
    }

    if (step === 3 && addPanelVisible) {
      setStep(4);
      return;
    }

    if (step === 4) {
      const nodeId = findNewNodeId(nodes, 'generate', initialNodeIds);
      if (nodeId) {
        setGenerateNodeId(nodeId);
        setStep(5);
      }
      return;
    }

    if (step === 5 && textPromptNodeId && generateNodeId) {
      if (hasTextToTextConnection(edges, textPromptNodeId, generateNodeId)) {
        setStep(6);
      }
    }
  }, [
    active,
    addPanelVisible,
    edges,
    generateNodeId,
    initialNodeIds,
    nodes,
    setGenerateNodeId,
    setStep,
    setTextPromptNodeId,
    step,
    textPromptNodeId,
  ]);

  React.useLayoutEffect(() => {
    if (!active) {
      setSpotRect(null);
      return;
    }

    const updateRect = () => {
      const rect = getTargetRect(stepTarget, textPromptNodeId, generateNodeId);
      setSpotRect(
        rect ? inflateRect(rect, skipExtraSpotlightPadding ? 0 : PADDING) : null
      );
    };

    updateRect();
    const raf = window.requestAnimationFrame(updateRect);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    const observer = new MutationObserver(updateRect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    const interval = window.setInterval(updateRect, 400);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [active, generateNodeId, skipExtraSpotlightPadding, stepTarget, textPromptNodeId]);

  React.useEffect(() => {
    if (!active || step !== 6) return;
    const onRunClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('[data-flow-onboarding="generate-run-button"]')) {
        return;
      }
      complete();
    };
    document.addEventListener('click', onRunClick, true);
    return () => document.removeEventListener('click', onRunClick, true);
  }, [active, complete, step]);

  if (!active || !currentStep) return null;

  const cardStyle = buildCardStyle(stepTarget, spotRect);

  return createPortal(
    <div className="flow-onboarding-root" aria-live="polite">
      {spotRect ? (
        <div
          className={`flow-onboarding-spotlight${
            isCanvasCenterStep ? ' flow-onboarding-spotlight-center' : ''
          }`}
          style={{
            top: spotRect.top,
            left: spotRect.left,
            width: spotRect.width,
            height: spotRect.height,
          }}
        />
      ) : (
        <div className="flow-onboarding-backdrop" />
      )}
      <div className="flow-onboarding-card" style={cardStyle}>
        <div className="flow-onboarding-card-header">
          <span className="flow-onboarding-step-badge">
            {lt('新手引导', 'Guide')} {step + 1}/{FLOW_ONBOARDING_STEPS.length}
          </span>
          <button type="button" className="flow-onboarding-skip" onClick={skip}>
            {lt('跳过', 'Skip')}
          </button>
        </div>
        <p className="flow-onboarding-text">{lt(currentStep.zh, currentStep.en)}</p>
        {stepTarget === 'connect-nodes' ? (
          <div className="flow-onboarding-hint">
            <span
              className="flow-onboarding-color-dot"
              style={{ background: TEXT_HANDLE_COLOR }}
            />
            {lt(
              '将绿色文字接口从提示词节点拖到生成节点的绿色文字输入口',
              'Drag the green text handle from the prompt node to the green text input on the generate node'
            )}
          </div>
        ) : null}
        {isCanvasCenterStep ? (
          <div className="flow-onboarding-hint flow-onboarding-hint-muted">
            {lt('在画布空白处双击即可', 'Double-click on empty canvas space')}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
