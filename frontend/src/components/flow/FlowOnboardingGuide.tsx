import React from 'react';
import { createPortal } from 'react-dom';
import type { Edge, Node } from 'reactflow';
import { useLocaleText } from '@/utils/localeText';
import {
  FLOW_ONBOARDING_EXAMPLE_IMAGE_URL,
  FLOW_ONBOARDING_TRACK_META,
  advanceOnboardingWhenNodeVisible,
  getFlowOnboardingSteps,
  type FlowOnboardingStepTarget,
  type FlowOnboardingTrack,
  useFlowOnboardingStore,
} from '@/stores/flowOnboardingStore';

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type ConnectGuideVisual = {
  sourceRing: Rect;
  targetRing: Rect;
  arrow: { x1: number; y1: number; x2: number; y2: number };
  arrowColor: string;
  sourceLabelZh: string;
  sourceLabelEn: string;
  targetLabelZh: string;
  targetLabelEn: string;
  hintZh: string;
  hintEn: string;
};

const PADDING = 10;
const NODE_RING_PADDING = 22;
const TEXT_HANDLE_COLOR = '#22c55e';
const IMAGE_HANDLE_COLOR = '#f97316';
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

function getNodeRect(nodeId: string): Rect | null {
  return getElementRect(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
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

function buildConnectGuideVisual(
  sourceId: string | null,
  targetId: string | null,
  kind: 'text' | 'image',
  track: FlowOnboardingTrack | null
): ConnectGuideVisual | null {
  if (!sourceId || !targetId) return null;
  const sourceNode = getNodeRect(sourceId);
  const targetNode = getNodeRect(targetId);
  if (!sourceNode || !targetNode) return null;

  if (kind === 'text') {
    return {
      sourceRing: inflateRect(sourceNode, NODE_RING_PADDING),
      targetRing: inflateRect(targetNode, NODE_RING_PADDING),
      arrow: {
        x1: sourceNode.left + sourceNode.width,
        y1: sourceNode.top + sourceNode.height * 0.5,
        x2: targetNode.left,
        y2: targetNode.top + targetNode.height * 0.65,
      },
      arrowColor: TEXT_HANDLE_COLOR,
      sourceLabelZh: '提示词节点',
      sourceLabelEn: 'Prompt node',
      targetLabelZh: '生成节点',
      targetLabelEn: 'Generate node',
      hintZh: '沿箭头方向，将绿色文字输出口连到生成节点的绿色文字输入口',
      hintEn:
        'Follow the arrow to connect the green text output to the green text input',
    };
  }

  const targetY =
    track === 'img2video'
      ? targetNode.top + targetNode.height * 0.6
      : targetNode.top + targetNode.height * 0.3;

  return {
    sourceRing: inflateRect(sourceNode, NODE_RING_PADDING),
    targetRing: inflateRect(targetNode, NODE_RING_PADDING),
    arrow: {
      x1: sourceNode.left + sourceNode.width,
      y1: sourceNode.top + sourceNode.height * 0.5,
      x2: targetNode.left,
      y2: targetY,
    },
    arrowColor: IMAGE_HANDLE_COLOR,
    sourceLabelZh: '图片节点',
    sourceLabelEn: 'Image node',
    targetLabelZh: track === 'img2video' ? '可灵节点' : '生成节点',
    targetLabelEn: track === 'img2video' ? 'Kling node' : 'Generate node',
    hintZh: '沿箭头方向，将橙色图片输出口连到目标节点的橙色图片输入口',
    hintEn:
      'Follow the arrow to connect the orange image output to the orange image input',
  };
}

function getTargetRect(
  stepTarget: FlowOnboardingStepTarget,
  textPromptNodeId: string | null,
  imageNodeId: string | null,
  targetNodeId: string | null
): Rect | null {
  switch (stepTarget) {
    case 'canvas-center':
      return getCanvasCenterRect();
    case 'node-palette-textPrompt':
      return getElementRect('[data-flow-onboarding-target="textPrompt"]');
    case 'node-palette-image':
      return getElementRect('[data-flow-onboarding-target="image"]');
    case 'node-palette-generate':
      return getElementRect('[data-flow-onboarding-target="generate"]');
    case 'node-palette-generateRef':
      return getElementRect('[data-flow-onboarding-target="generateRef"]');
    case 'node-palette-klingVideo':
      return getElementRect('[data-flow-onboarding-target="klingVideo"]');
    case 'text-prompt-input':
      return (
        getElementRect('[data-flow-onboarding="text-prompt-input"]') ||
        (textPromptNodeId ? getNodeRect(textPromptNodeId) : null)
      );
    case 'image-node-preview':
      return (
        getElementRect('[data-flow-onboarding="image-node-preview"]') ||
        (imageNodeId ? getNodeRect(imageNodeId) : null)
      );
    case 'connect-nodes':
    case 'connect-image-nodes': {
      const sourceId =
        stepTarget === 'connect-nodes' ? textPromptNodeId : imageNodeId;
      const rects: Rect[] = [];
      if (sourceId) {
        const rect = getNodeRect(sourceId);
        if (rect) rects.push(rect);
      }
      if (targetNodeId) {
        const rect = getNodeRect(targetNodeId);
        if (rect) rects.push(rect);
      }
      return mergeRects(rects);
    }
    case 'generate-run-button':
      return getElementRect('[data-flow-onboarding="generate-run-button"]');
    case 'kling-run-button':
      return getElementRect('[data-flow-onboarding="kling-run-button"]');
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
    return (
      (sourceHandle === 'text' || sourceHandle.startsWith('text-')) &&
      (targetHandle === 'text' || targetHandle.startsWith('text-'))
    );
  });
}

function hasImageToTargetConnection(
  edges: Edge[],
  sourceId: string,
  targetId: string,
  track: FlowOnboardingTrack
): boolean {
  const targetHandles =
    track === 'img2img'
      ? new Set(['image1', 'img', 'image'])
      : new Set(['image', 'img', 'image1']);

  return edges.some((edge) => {
    if (edge.source !== sourceId || edge.target !== targetId) return false;
    const sourceHandle = String(edge.sourceHandle || 'img').toLowerCase();
    const targetHandle = String(edge.targetHandle || '').toLowerCase();
    const isImageSource =
      sourceHandle === 'img' || sourceHandle.startsWith('img');
    return isImageSource && targetHandles.has(targetHandle);
  });
}

function nodeHasExampleImage(node: Node | undefined): boolean {
  if (!node) return false;
  const imageUrl = String(node.data?.imageUrl || '').trim();
  const imageData = String(node.data?.imageData || '').trim();
  return (
    imageUrl === FLOW_ONBOARDING_EXAMPLE_IMAGE_URL ||
    imageData === FLOW_ONBOARDING_EXAMPLE_IMAGE_URL ||
    imageUrl.length > 0 ||
    imageData.length > 0
  );
}

function buildCardStyle(
  stepTarget: FlowOnboardingStepTarget,
  spotRect: Rect | null
): React.CSSProperties {
  if (
    (stepTarget === 'canvas-center' ||
      stepTarget === 'connect-nodes' ||
      stepTarget === 'connect-image-nodes') &&
    spotRect
  ) {
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

function rectToStyle(rect: Rect): React.CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

type Props = {
  addPanelVisible: boolean;
  nodes: Node[];
  edges: Edge[];
  scrollNodesIntoView?: (nodeIds: string[]) => void | Promise<void>;
};

export default function FlowOnboardingGuide({
  addPanelVisible,
  nodes,
  edges,
  scrollNodesIntoView,
}: Props) {
  const { lt } = useLocaleText();
  const active = useFlowOnboardingStore((s) => s.active);
  const phase = useFlowOnboardingStore((s) => s.phase);
  const track = useFlowOnboardingStore((s) => s.track);
  const step = useFlowOnboardingStore((s) => s.step);
  const initialNodeIds = useFlowOnboardingStore((s) => s.initialNodeIds);
  const textPromptNodeId = useFlowOnboardingStore((s) => s.textPromptNodeId);
  const imageNodeId = useFlowOnboardingStore((s) => s.imageNodeId);
  const targetNodeId = useFlowOnboardingStore((s) => s.targetNodeId);
  const setStep = useFlowOnboardingStore((s) => s.setStep);
  const setTextPromptNodeId = useFlowOnboardingStore((s) => s.setTextPromptNodeId);
  const setImageNodeId = useFlowOnboardingStore((s) => s.setImageNodeId);
  const setTargetNodeId = useFlowOnboardingStore((s) => s.setTargetNodeId);
  const selectTrack = useFlowOnboardingStore((s) => s.selectTrack);
  const skip = useFlowOnboardingStore((s) => s.skip);
  const complete = useFlowOnboardingStore((s) => s.complete);

  const [spotRect, setSpotRect] = React.useState<Rect | null>(null);
  const [connectVisual, setConnectVisual] = React.useState<ConnectGuideVisual | null>(
    null
  );
  const autoAdvanceKeyRef = React.useRef<string | null>(null);
  const scrolledConnectKeyRef = React.useRef<string | null>(null);

  const steps = getFlowOnboardingSteps(track);
  const currentStep = phase === 'guide' ? steps[step] : null;
  const stepTarget = currentStep?.target ?? 'canvas-center';
  const isCanvasCenterStep = stepTarget === 'canvas-center';
  const isConnectStep =
    stepTarget === 'connect-nodes' || stepTarget === 'connect-image-nodes';
  const isLastStep = phase === 'guide' && step >= steps.length - 1;
  const skipExtraSpotlightPadding = isCanvasCenterStep;

  React.useEffect(() => {
    if (!active) {
      autoAdvanceKeyRef.current = null;
      scrolledConnectKeyRef.current = null;
    }
  }, [active]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'img2img') return;
    if (step !== 5 || stepTarget !== 'connect-image-nodes') return;
    if (!imageNodeId || !targetNodeId || !scrollNodesIntoView) return;

    const connectKey = `${imageNodeId}:${targetNodeId}`;
    if (scrolledConnectKeyRef.current === connectKey) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const sourceVisible = Boolean(getNodeRect(imageNodeId));
      const targetVisible = Boolean(getNodeRect(targetNodeId));
      if ((!sourceVisible || !targetVisible) && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      scrolledConnectKeyRef.current = connectKey;
      void scrollNodesIntoView([imageNodeId, targetNodeId]);
    };

    window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [
    active,
    imageNodeId,
    phase,
    scrollNodesIntoView,
    step,
    stepTarget,
    targetNodeId,
    track,
  ]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || !track) return;

    if (track === 'text2img') {
      if (step === 0 && addPanelVisible) {
        setStep(1);
        return;
      }
      if (step === 1) {
        const nodeId = findNewNodeId(nodes, 'textPrompt', initialNodeIds);
        const advanceKey = nodeId ? `text:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTextPromptNodeId(nodeId);
          advanceOnboardingWhenNodeVisible(nodeId, 2);
        }
        return;
      }
      if (step === 2 && textPromptNodeId) {
        const node = nodes.find((item) => item.id === textPromptNodeId);
        if (String(node?.data?.text || '').trim().length > 0) setStep(3);
        return;
      }
      if (step === 3 && addPanelVisible) {
        setStep(4);
        return;
      }
      if (step === 4) {
        const nodeId = findNewNodeId(nodes, 'generate', initialNodeIds);
        const advanceKey = nodeId ? `generate:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTargetNodeId(nodeId);
          advanceOnboardingWhenNodeVisible(nodeId, 5);
        }
        return;
      }
      if (step === 5 && textPromptNodeId && targetNodeId) {
        if (hasTextToTextConnection(edges, textPromptNodeId, targetNodeId)) {
          setStep(6);
        }
      }
      return;
    }

    if (track === 'img2img' || track === 'img2video') {
      const targetType = track === 'img2img' ? 'generateRef' : 'klingVideo';

      if (step === 0 && addPanelVisible) {
        setStep(1);
        return;
      }
      if (step === 1) {
        const nodeId = findNewNodeId(nodes, 'image', initialNodeIds);
        const advanceKey = nodeId ? `image:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setImageNodeId(nodeId);
          advanceOnboardingWhenNodeVisible(nodeId, 2);
        }
        return;
      }
      if (step === 2 && imageNodeId) {
        const node = nodes.find((item) => item.id === imageNodeId);
        if (nodeHasExampleImage(node)) setStep(3);
        return;
      }
      if (step === 3 && addPanelVisible) {
        setStep(4);
        return;
      }
      if (step === 4) {
        const nodeId = findNewNodeId(nodes, targetType, initialNodeIds);
        const advanceKey = nodeId ? `${targetType}:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTargetNodeId(nodeId);
          advanceOnboardingWhenNodeVisible(nodeId, 5);
        }
        return;
      }
      if (step === 5 && imageNodeId && targetNodeId) {
        if (hasImageToTargetConnection(edges, imageNodeId, targetNodeId, track)) {
          setStep(6);
        }
      }
    }
  }, [
    active,
    addPanelVisible,
    edges,
    imageNodeId,
    initialNodeIds,
    nodes,
    phase,
    setImageNodeId,
    setStep,
    setTargetNodeId,
    setTextPromptNodeId,
    step,
    targetNodeId,
    textPromptNodeId,
    track,
  ]);

  React.useLayoutEffect(() => {
    if (!active || phase !== 'guide') {
      setSpotRect(null);
      setConnectVisual(null);
      return;
    }

    const updateRect = () => {
      if (isConnectStep) {
        const sourceId =
          stepTarget === 'connect-nodes' ? textPromptNodeId : imageNodeId;
        const kind = stepTarget === 'connect-nodes' ? 'text' : 'image';
        setConnectVisual(
          buildConnectGuideVisual(sourceId, targetNodeId, kind, track)
        );
        setSpotRect(null);
        return;
      }

      setConnectVisual(null);
      const rect = getTargetRect(
        stepTarget,
        textPromptNodeId,
        imageNodeId,
        targetNodeId
      );
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
  }, [
    active,
    imageNodeId,
    isConnectStep,
    phase,
    skipExtraSpotlightPadding,
    stepTarget,
    targetNodeId,
    textPromptNodeId,
    track,
  ]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || !isLastStep) return;
    const onRunClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        !target?.closest?.('[data-flow-onboarding="generate-run-button"]') &&
        !target?.closest?.('[data-flow-onboarding="kling-run-button"]')
      ) {
        return;
      }
      complete();
    };
    document.addEventListener('click', onRunClick, true);
    return () => document.removeEventListener('click', onRunClick, true);
  }, [active, complete, isLastStep, phase]);

  const handleNext = React.useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('flow:onboarding-auto-step', { detail: { step } })
    );
  }, [step]);

  if (!active) return null;

  if (phase === 'select') {
    return createPortal(
      <div className="flow-onboarding-root" aria-live="polite">
        <div className="flow-onboarding-backdrop" />
        <div className="flow-onboarding-picker">
          <div className="flow-onboarding-picker-header">
            <h3 className="flow-onboarding-picker-title">
              {lt('选择新手引导', 'Choose a guide')}
            </h3>
            <button type="button" className="flow-onboarding-skip" onClick={skip}>
              {lt('跳过', 'Skip')}
            </button>
          </div>
          <p className="flow-onboarding-picker-desc">
            {lt('请选择一种创作流程开始学习', 'Pick a workflow to get started')}
          </p>
          <div className="flow-onboarding-picker-grid">
            {(Object.keys(FLOW_ONBOARDING_TRACK_META) as FlowOnboardingTrack[]).map(
              (key) => {
                const meta = FLOW_ONBOARDING_TRACK_META[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="flow-onboarding-picker-card"
                    onClick={() => selectTrack(key)}
                  >
                    <span className="flow-onboarding-picker-card-title">
                      {lt(meta.zh, meta.en)}
                    </span>
                    <span className="flow-onboarding-picker-card-desc">
                      {lt(meta.descZh, meta.descEn)}
                    </span>
                  </button>
                );
              }
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!currentStep) return null;

  const cardStyle = buildCardStyle(stepTarget, spotRect);
  const arrow = connectVisual?.arrow;
  const arrowMidX = arrow ? (arrow.x1 + arrow.x2) / 2 : 0;
  const arrowPath = arrow
    ? `M ${arrow.x1} ${arrow.y1} C ${arrowMidX} ${arrow.y1}, ${arrowMidX} ${arrow.y2}, ${arrow.x2} ${arrow.y2}`
    : '';

  return createPortal(
    <div className="flow-onboarding-root" aria-live="polite">
      {isConnectStep ? (
        <>
          <div className="flow-onboarding-backdrop" />
          {connectVisual ? (
            <>
              <div
                className="flow-onboarding-node-ring"
                style={rectToStyle(connectVisual.sourceRing)}
              >
                <span className="flow-onboarding-node-label">
                  {lt(connectVisual.sourceLabelZh, connectVisual.sourceLabelEn)}
                </span>
              </div>
              <div
                className="flow-onboarding-node-ring"
                style={rectToStyle(connectVisual.targetRing)}
              >
                <span className="flow-onboarding-node-label">
                  {lt(connectVisual.targetLabelZh, connectVisual.targetLabelEn)}
                </span>
              </div>
              <svg className="flow-onboarding-connect-arrow" aria-hidden="true">
                <defs>
                  <marker
                    id="flow-onboarding-arrowhead"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path
                      d="M0,0 L8,4 L0,8 Z"
                      fill={connectVisual.arrowColor}
                    />
                  </marker>
                </defs>
                {arrow ? (
                  <>
                    <path
                      d={arrowPath}
                      markerEnd="url(#flow-onboarding-arrowhead)"
                      stroke={connectVisual.arrowColor}
                    />
                    <circle
                      className="flow-onboarding-handle-dot flow-onboarding-handle-dot-source"
                      cx={arrow.x1}
                      cy={arrow.y1}
                      r="6"
                      fill={connectVisual.arrowColor}
                    />
                    <circle
                      className="flow-onboarding-handle-dot flow-onboarding-handle-dot-target"
                      cx={arrow.x2}
                      cy={arrow.y2}
                      r="6"
                      fill={connectVisual.arrowColor}
                    />
                  </>
                ) : null}
              </svg>
            </>
          ) : null}
        </>
      ) : spotRect ? (
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
            {track
              ? `${lt(FLOW_ONBOARDING_TRACK_META[track].zh, FLOW_ONBOARDING_TRACK_META[track].en)} · ${step + 1}/${steps.length}`
              : `${lt('新手引导', 'Guide')} ${step + 1}/${steps.length}`}
          </span>
          <button type="button" className="flow-onboarding-skip" onClick={skip}>
            {lt('跳过', 'Skip')}
          </button>
        </div>
        <p className="flow-onboarding-text">{lt(currentStep.zh, currentStep.en)}</p>
        {isConnectStep && connectVisual ? (
          <div className="flow-onboarding-hint">
            <span
              className="flow-onboarding-color-dot"
              style={{ background: connectVisual.arrowColor }}
            />
            {lt(connectVisual.hintZh, connectVisual.hintEn)}
          </div>
        ) : null}
        {isCanvasCenterStep ? (
          <div className="flow-onboarding-hint flow-onboarding-hint-muted">
            {lt('在画布空白处双击即可', 'Double-click on empty canvas space')}
          </div>
        ) : null}
        {!isLastStep ? (
          <div className="flow-onboarding-card-footer">
            <button
              type="button"
              className="flow-onboarding-nav-btn flow-onboarding-nav-btn-primary"
              onClick={handleNext}
            >
              {lt('下一步', 'Next')}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
