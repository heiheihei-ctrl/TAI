import React from 'react';
import { createPortal } from 'react-dom';
import type { Edge, Node } from 'reactflow';
import { useLocaleText } from '@/utils/localeText';
import {
  FLOW_ONBOARDING_TRACK_META,
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
      targetLabelZh: track === 'img2video' ? 'Seedance 节点' : '生成节点',
      targetLabelEn: track === 'img2video' ? 'Seedance node' : 'Generate node',
      hintZh: '沿虚线方向，将绿色文字输出口连到生成节点的绿色文字输入口',
      hintEn:
        'Follow the dashed line to connect the green text output to the green text input',
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
    targetLabelZh: track === 'img2video' ? 'Seedance 节点' : '生成节点',
    targetLabelEn: track === 'img2video' ? 'Seedance node' : 'Generate node',
    hintZh: '沿虚线方向，将橙色图片输出口连到目标节点的橙色图片输入口',
    hintEn:
      'Follow the dashed line to connect the orange image output to the orange image input',
  };
}

/** 图生图 / 图生视频需同时展示橙线（图）+ 绿线（文） */
function buildConnectGuideVisuals(
  stepTarget: FlowOnboardingStepTarget,
  textPromptNodeId: string | null,
  imageNodeId: string | null,
  targetNodeId: string | null,
  track: FlowOnboardingTrack | null
): ConnectGuideVisual[] {
  if (stepTarget === 'connect-nodes') {
    const visual = buildConnectGuideVisual(
      textPromptNodeId,
      targetNodeId,
      'text',
      track
    );
    return visual ? [visual] : [];
  }
  if (stepTarget === 'connect-image-nodes') {
    const visual = buildConnectGuideVisual(
      imageNodeId,
      targetNodeId,
      'image',
      track
    );
    return visual ? [visual] : [];
  }
  if (
    stepTarget === 'connect-img2img-nodes' ||
    stepTarget === 'connect-img2video-nodes'
  ) {
    return [
      buildConnectGuideVisual(imageNodeId, targetNodeId, 'image', track),
      buildConnectGuideVisual(textPromptNodeId, targetNodeId, 'text', track),
    ].filter((v): v is ConnectGuideVisual => Boolean(v));
  }
  return [];
}

function ringKey(rect: Rect): string {
  return `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
}

function collectConnectRings(
  visuals: ConnectGuideVisual[]
): Array<{
  rect: Rect;
  labelZh: string;
  labelEn: string;
  color: string;
}> {
  const rings: Array<{
    rect: Rect;
    labelZh: string;
    labelEn: string;
    color: string;
  }> = [];
  const seen = new Set<string>();

  for (const visual of visuals) {
    const sourceKey = `s:${ringKey(visual.sourceRing)}`;
    if (!seen.has(sourceKey)) {
      seen.add(sourceKey);
      rings.push({
        rect: visual.sourceRing,
        labelZh: visual.sourceLabelZh,
        labelEn: visual.sourceLabelEn,
        color: visual.arrowColor,
      });
    }
  }

  // 目标节点共用一个环，避免绿/橙双环叠字
  const first = visuals[0];
  if (first) {
    const targetKey = `t:${ringKey(first.targetRing)}`;
    if (!seen.has(targetKey)) {
      seen.add(targetKey);
      rings.push({
        rect: first.targetRing,
        labelZh: first.targetLabelZh,
        labelEn: first.targetLabelEn,
        color: visuals.length > 1 ? TEXT_HANDLE_COLOR : first.arrowColor,
      });
    }
  }

  return rings;
}

function arrowPath(arrow: ConnectGuideVisual['arrow']): string {
  const midX = (arrow.x1 + arrow.x2) / 2;
  return `M ${arrow.x1} ${arrow.y1} C ${midX} ${arrow.y1}, ${midX} ${arrow.y2}, ${arrow.x2} ${arrow.y2}`;
}

function ringTintStyle(color: string): React.CSSProperties {
  return {
    borderColor: color,
    boxShadow: `0 0 0 6px ${color}24, 0 10px 28px ${color}33`,
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
    case 'node-palette-doubaoVideo':
      return getElementRect('[data-flow-onboarding-target="doubaoVideo"]');
    case 'text-prompt-input':
      return (
        getElementRect('[data-flow-onboarding="text-prompt-input"]') ||
        (textPromptNodeId ? getNodeRect(textPromptNodeId) : null)
      );
    case 'image-node-upload':
      return (
        getElementRect('[data-flow-onboarding="image-node-upload"]') ||
        (imageNodeId ? getNodeRect(imageNodeId) : null)
      );
    case 'image-node-preview':
      return (
        getElementRect('[data-flow-onboarding="image-node-preview"]') ||
        (imageNodeId ? getNodeRect(imageNodeId) : null)
      );
    case 'connect-nodes':
    case 'connect-image-nodes':
    case 'connect-img2img-nodes':
    case 'connect-img2video-nodes': {
      const sourceId =
        stepTarget === 'connect-nodes' ? textPromptNodeId : imageNodeId;
      const rects: Rect[] = [];
      if (sourceId) {
        const rect = getNodeRect(sourceId);
        if (rect) rects.push(rect);
      }
      if (
        (stepTarget === 'connect-img2img-nodes' ||
          stepTarget === 'connect-img2video-nodes') &&
        textPromptNodeId
      ) {
        const rect = getNodeRect(textPromptNodeId);
        if (rect) rects.push(rect);
      }
      if (targetNodeId) {
        const rect = getNodeRect(targetNodeId);
        if (rect) rects.push(rect);
      }
      return mergeRects(rects);
    }
    case 'generate-run-button':
      return (
        getElementRect('[data-flow-onboarding="generate-run-button"]') ||
        (targetNodeId ? getNodeRect(targetNodeId) : null)
      );
    case 'kling-run-button':
      return (
        getElementRect('[data-flow-onboarding="kling-run-button"]') ||
        (targetNodeId ? getNodeRect(targetNodeId) : null)
      );
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

function hasImageToGenerateConnection(
  edges: Edge[],
  sourceId: string,
  targetId: string
): boolean {
  return edges.some((edge) => {
    if (edge.source !== sourceId || edge.target !== targetId) return false;
    const sourceHandle = String(edge.sourceHandle || 'img').toLowerCase();
    const targetHandle = String(edge.targetHandle || '').toLowerCase();
    return (
      (sourceHandle === 'img' || sourceHandle.startsWith('img')) &&
      (targetHandle === 'img' ||
        targetHandle === 'image' ||
        targetHandle === 'image1' ||
        targetHandle.startsWith('img'))
    );
  });
}

function hasImg2ImgConnections(
  edges: Edge[],
  imageNodeId: string,
  textPromptNodeId: string,
  targetNodeId: string
): boolean {
  return (
    hasImageToGenerateConnection(edges, imageNodeId, targetNodeId) &&
    hasTextToTextConnection(edges, textPromptNodeId, targetNodeId)
  );
}

function hasImg2VideoConnections(
  edges: Edge[],
  imageNodeId: string,
  textPromptNodeId: string,
  targetNodeId: string
): boolean {
  return (
    hasImageToTargetConnection(edges, imageNodeId, targetNodeId, 'img2video') &&
    hasTextToTextConnection(edges, textPromptNodeId, targetNodeId)
  );
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

function buildCardStyle(
  stepTarget: FlowOnboardingStepTarget,
  spotRect: Rect | null,
  connectBounds: Rect | null = null
): React.CSSProperties {
  const isConnectTarget =
    stepTarget === 'connect-nodes' ||
    stepTarget === 'connect-image-nodes' ||
    stepTarget === 'connect-img2img-nodes' ||
    stepTarget === 'connect-img2video-nodes';

  // 连线步骤：弹窗固定在底部，避免居中遮挡节点
  if (isConnectTarget) {
    const bounds = connectBounds || spotRect;
    if (bounds) {
      const cardWidth = Math.min(340, window.innerWidth - 32);
      const spaceRight = window.innerWidth - (bounds.left + bounds.width);
      const spaceLeft = bounds.left;
      // 优先放到底部；若节点贴近底部则改放到左右空位
      const nearBottom = bounds.top + bounds.height > window.innerHeight - 220;
      if (nearBottom && spaceRight >= cardWidth + 24) {
        return {
          top: Math.max(16, bounds.top),
          left: Math.min(bounds.left + bounds.width + 16, window.innerWidth - cardWidth - 16),
          bottom: 'auto',
          transform: 'none',
        };
      }
      if (nearBottom && spaceLeft >= cardWidth + 24) {
        return {
          top: Math.max(16, bounds.top),
          left: Math.max(16, bounds.left - cardWidth - 16),
          bottom: 'auto',
          transform: 'none',
        };
      }
    }
    return {
      bottom: 24,
      left: '50%',
      top: 'auto',
      transform: 'translateX(-50%)',
    };
  }

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

function rectToStyle(rect: Rect): React.CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** 底部引导弹窗占用高度，fitView 需额外预留避免节点被遮挡 */
const ONBOARDING_CARD_RESERVE_BOTTOM = 260;

function scrollPaletteTargetIntoView(selector: string) {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
  return true;
}

type OnboardingScrollOptions = {
  reserveBottom?: number;
  /** 限制最大缩放，避免 Run 步 fitView 把另一节点甩出视野 */
  preferZoom?: number;
};

type Props = {
  addPanelVisible: boolean;
  nodes: Node[];
  edges: Edge[];
  /** 由 FlowOverlay 提供的稳定「下一步」处理（含 2/7→3/7 同步创建） */
  onNext: () => void;
  scrollNodesIntoView?: (
    nodeIds: string[],
    options?: OnboardingScrollOptions
  ) => void | Promise<void>;
};

export default function FlowOnboardingGuide({
  addPanelVisible,
  nodes,
  edges,
  onNext,
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
  const hideSkipButton = useFlowOnboardingStore((s) => s.hideSkipButton);

  const [spotRect, setSpotRect] = React.useState<Rect | null>(null);
  const [connectVisuals, setConnectVisuals] = React.useState<ConnectGuideVisual[]>(
    []
  );
  const autoAdvanceKeyRef = React.useRef<string | null>(null);
  const scrolledLayoutKeyRef = React.useRef<string | null>(null);

  const steps = getFlowOnboardingSteps(track);
  const currentStep = phase === 'guide' ? steps[step] : null;
  const stepTarget = currentStep?.target ?? 'canvas-center';
  const isCanvasCenterStep = stepTarget === 'canvas-center';
  const isConnectStep =
    stepTarget === 'connect-nodes' ||
    stepTarget === 'connect-image-nodes' ||
    stepTarget === 'connect-img2img-nodes' ||
    stepTarget === 'connect-img2video-nodes';
  const isLastStep = phase === 'guide' && step >= steps.length - 1;
  const skipExtraSpotlightPadding = isCanvasCenterStep;

  React.useEffect(() => {
    if (!active) {
      autoAdvanceKeyRef.current = null;
      scrolledLayoutKeyRef.current = null;
      return;
    }
    // 换步时清滚动缓存，确保连线步 → Run 步会重新 fitView
    scrolledLayoutKeyRef.current = null;
  }, [active, step]);

  // 文生图：连线步 / Run 步都要把 Prompt+生成节点滚进视野，避免 6→7「节点消失」
  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'text2img') return;
    if (step !== 5 && step !== 6) return;
    if (!textPromptNodeId || !targetNodeId || !scrollNodesIntoView) return;

    const layoutKey = `text2img-focus:${textPromptNodeId}:${targetNodeId}:${step}`;
    if (scrolledLayoutKeyRef.current === layoutKey) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const promptVisible = Boolean(getNodeRect(textPromptNodeId));
      const generateVisible = Boolean(getNodeRect(targetNodeId));
      const runBtnVisible =
        step === 6 &&
        Boolean(getElementRect('[data-flow-onboarding="generate-run-button"]'));
      if ((!promptVisible || !generateVisible) && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      // Run 步尽量等到按钮也出现再聚焦（含 fallback）
      if (step === 6 && !runBtnVisible && !generateVisible && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      scrolledLayoutKeyRef.current = layoutKey;
      void scrollNodesIntoView([textPromptNodeId, targetNodeId], {
        reserveBottom: ONBOARDING_CARD_RESERVE_BOTTOM,
        preferZoom: step === 6 ? 0.85 : undefined,
      });
    };

    window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [
    active,
    phase,
    scrollNodesIntoView,
    step,
    targetNodeId,
    textPromptNodeId,
    track,
  ]);

  // 进入「输入提示词」时把节点滚入视野
  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'text2img') return;
    if (step !== 2 || !textPromptNodeId || !scrollNodesIntoView) return;
    const key = `text2img-input:${textPromptNodeId}`;
    if (scrolledLayoutKeyRef.current === key) return;
    scrolledLayoutKeyRef.current = key;
    void scrollNodesIntoView([textPromptNodeId], {
      reserveBottom: ONBOARDING_CARD_RESERVE_BOTTOM,
    });
  }, [active, phase, scrollNodesIntoView, step, textPromptNodeId, track]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'img2video') return;
    if (step !== 7 || stepTarget !== 'node-palette-doubaoVideo' || !addPanelVisible) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const scrolled = scrollPaletteTargetIntoView(
        '[data-flow-onboarding-target="doubaoVideo"]'
      );
      if (!scrolled && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
    };

    window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [active, addPanelVisible, phase, step, stepTarget, track]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'img2img') return;
    if (step !== 8 || stepTarget !== 'connect-img2img-nodes') return;
    if (!imageNodeId || !textPromptNodeId || !targetNodeId || !scrollNodesIntoView) return;

    const connectKey = `${imageNodeId}:${textPromptNodeId}:${targetNodeId}`;
    if (scrolledLayoutKeyRef.current === connectKey) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const allVisible = [imageNodeId, textPromptNodeId, targetNodeId].every((id) =>
        Boolean(getNodeRect(id))
      );
      if (!allVisible && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      scrolledLayoutKeyRef.current = connectKey;
      void scrollNodesIntoView([imageNodeId, textPromptNodeId, targetNodeId], {
        reserveBottom: ONBOARDING_CARD_RESERVE_BOTTOM,
      });
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
    textPromptNodeId,
    track,
  ]);

  React.useEffect(() => {
    if (!active || phase !== 'guide' || track !== 'img2video') return;
    if (step !== 7 && step !== 8 && step !== 9) return;
    if (step === 7 && !targetNodeId) return;
    if (!targetNodeId || !scrollNodesIntoView) return;

    const nodeIds = [imageNodeId, textPromptNodeId, targetNodeId].filter(
      (id): id is string => Boolean(id)
    );
    if (nodeIds.length < 2) return;

    const layoutKey = `${nodeIds.join(':')}:${step}`;
    if (scrolledLayoutKeyRef.current === layoutKey) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const allVisible = nodeIds.every((id) => Boolean(getNodeRect(id)));
      if (!allVisible && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      scrolledLayoutKeyRef.current = layoutKey;
      void scrollNodesIntoView(nodeIds, {
        reserveBottom: ONBOARDING_CARD_RESERVE_BOTTOM,
      });
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
    targetNodeId,
    textPromptNodeId,
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
          setStep(2);
        }
        return;
      }
      // 「输入提示词」仅由「下一步」推进，有文字时不要自动跳过
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
          setStep(5);
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

    if (track === 'img2img') {
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
          setStep(2);
        }
        return;
      }
      if (step === 3 && addPanelVisible) {
        setStep(4);
        return;
      }
      if (step === 4) {
        const nodeId = findNewNodeId(nodes, 'textPrompt', initialNodeIds);
        const advanceKey = nodeId ? `text:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTextPromptNodeId(nodeId);
          setStep(5);
        }
        return;
      }
      if (step === 6 && addPanelVisible) {
        setStep(7);
        return;
      }
      if (step === 7) {
        const nodeId = findNewNodeId(nodes, 'generate', initialNodeIds);
        const advanceKey = nodeId ? `generate:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTargetNodeId(nodeId);
          setStep(8);
        }
        return;
      }
      if (step === 8 && imageNodeId && textPromptNodeId && targetNodeId) {
        if (hasImg2ImgConnections(edges, imageNodeId, textPromptNodeId, targetNodeId)) {
          setStep(9);
        }
      }
      return;
    }

    if (track === 'img2video') {
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
          setStep(2);
        }
        return;
      }
      if (step === 3 && addPanelVisible) {
        setStep(4);
        return;
      }
      if (step === 4) {
        const nodeId = findNewNodeId(nodes, 'textPrompt', initialNodeIds);
        const advanceKey = nodeId ? `text:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTextPromptNodeId(nodeId);
          setStep(5);
        }
        return;
      }
      if (step === 6 && addPanelVisible) {
        setStep(7);
        return;
      }
      if (step === 7) {
        const nodeId = findNewNodeId(nodes, 'doubaoVideo', initialNodeIds);
        const advanceKey = nodeId ? `doubaoVideo:${nodeId}` : null;
        if (nodeId && autoAdvanceKeyRef.current !== advanceKey) {
          autoAdvanceKeyRef.current = advanceKey;
          setTargetNodeId(nodeId);
          setStep(8);
        }
        return;
      }
      if (step === 8 && imageNodeId && textPromptNodeId && targetNodeId) {
        if (hasImg2VideoConnections(edges, imageNodeId, textPromptNodeId, targetNodeId)) {
          setStep(9);
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
      setConnectVisuals([]);
      return;
    }

    const updateRect = () => {
      if (isConnectStep) {
        setConnectVisuals(
          buildConnectGuideVisuals(
            stepTarget,
            textPromptNodeId,
            imageNodeId,
            targetNodeId,
            track
          )
        );
        setSpotRect(null);
        return;
      }

      setConnectVisuals([]);
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
    if (!active || phase !== 'guide') return;

    const selectorMap: Partial<Record<FlowOnboardingStepTarget, string>> = {
      'node-palette-textPrompt': '[data-flow-onboarding-target="textPrompt"]',
      'node-palette-image': '[data-flow-onboarding-target="image"]',
      'node-palette-generate': '[data-flow-onboarding-target="generate"]',
      'node-palette-generateRef': '[data-flow-onboarding-target="generateRef"]',
      'node-palette-klingVideo': '[data-flow-onboarding-target="klingVideo"]',
      'node-palette-doubaoVideo': '[data-flow-onboarding-target="doubaoVideo"]',
      'text-prompt-input': '[data-flow-onboarding="text-prompt-input"]',
      'image-node-upload': '[data-flow-onboarding="image-node-upload"]',
      'image-node-preview': '[data-flow-onboarding="image-node-preview"]',
      'generate-run-button': '[data-flow-onboarding="generate-run-button"]',
      'kling-run-button': '[data-flow-onboarding="kling-run-button"]',
    };

    const selector = selectorMap[stepTarget];
    if (!selector) return;

    let cancelled = false;
    let currentEl: Element | null = null;

    const apply = () => {
      if (cancelled) return;
      const el = document.querySelector(selector);
      if (el === currentEl) return;
      if (currentEl) currentEl.classList.remove('flow-onboarding-pulse');
      currentEl = el;
      if (currentEl) currentEl.classList.add('flow-onboarding-pulse');
    };

    apply();
    const interval = window.setInterval(apply, 300);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (currentEl) currentEl.classList.remove('flow-onboarding-pulse');
    };
  }, [active, phase, stepTarget]);

  React.useEffect(() => {
    if (!active || phase !== 'guide') return;
    if (
      stepTarget !== 'generate-run-button' &&
      stepTarget !== 'kling-run-button'
    ) {
      return;
    }
    // 文生图 Run 步已由 text2img-focus effect 处理
    if (track === 'text2img') return;
    if (!targetNodeId || !scrollNodesIntoView) return;

    const key = `run:${targetNodeId}:${stepTarget}`;
    if (scrolledLayoutKeyRef.current === key) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const buttonVisible = Boolean(
        getElementRect(`[data-flow-onboarding="${stepTarget}"]`)
      );
      const nodeVisible = Boolean(getNodeRect(targetNodeId));
      if (!buttonVisible && !nodeVisible && attempts < 40) {
        window.requestAnimationFrame(run);
        return;
      }
      scrolledLayoutKeyRef.current = key;
      const nodeIds = [imageNodeId, textPromptNodeId, targetNodeId].filter(
        (id): id is string => Boolean(id)
      );
      void scrollNodesIntoView(nodeIds.length ? nodeIds : [targetNodeId], {
        reserveBottom: ONBOARDING_CARD_RESERVE_BOTTOM,
        preferZoom: 0.85,
      });
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
    onNext();
  }, [onNext]);

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
            {!hideSkipButton ? (
              <button type="button" className="flow-onboarding-skip" onClick={skip}>
                {lt('跳过', 'Skip')}
              </button>
            ) : null}
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

  const connectRings = collectConnectRings(connectVisuals);
  const connectBounds = connectRings.length
    ? mergeRects(connectRings.map((ring) => ring.rect))
    : null;
  const cardStyle = buildCardStyle(stepTarget, spotRect, connectBounds);
  const connectHintFallback = connectVisuals[0];

  return createPortal(
    <div className="flow-onboarding-root" aria-live="polite">
      {isConnectStep ? (
        <>
          <div className="flow-onboarding-backdrop" />
          {connectVisuals.length > 0 ? (
            <>
              {connectRings.map((ring) => (
                <div
                  key={ringKey(ring.rect)}
                  className="flow-onboarding-node-ring"
                  style={{
                    ...rectToStyle(ring.rect),
                    ...ringTintStyle(ring.color),
                  }}
                >
                  <span
                    className="flow-onboarding-node-label"
                    style={{ background: ring.color }}
                  >
                    {lt(ring.labelZh, ring.labelEn)}
                  </span>
                </div>
              ))}
              <svg className="flow-onboarding-connect-line" aria-hidden="true">
                {connectVisuals.map((visual) => (
                  <path
                    key={`${visual.arrowColor}:${visual.arrow.x1}:${visual.arrow.y1}:${visual.arrow.x2}:${visual.arrow.y2}`}
                    d={arrowPath(visual.arrow)}
                    stroke={visual.arrowColor}
                  />
                ))}
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
          {!hideSkipButton && !isLastStep ? (
            <button type="button" className="flow-onboarding-skip" onClick={skip}>
              {lt('跳过', 'Skip')}
            </button>
          ) : null}
          {isLastStep ? (
            <button type="button" className="flow-onboarding-skip" onClick={complete}>
              {lt('完成', 'Complete')}
            </button>
          ) : null}
        </div>
        <p className="flow-onboarding-text">{lt(currentStep.zh, currentStep.en)}</p>
        {currentStep.hintZh && !isConnectStep ? (
          <div className="flow-onboarding-hint flow-onboarding-hint-muted flow-onboarding-prompt-hint">
            {lt(currentStep.hintZh, currentStep.hintEn || currentStep.hintZh)}
          </div>
        ) : null}
        {isConnectStep && connectHintFallback ? (
          <div className="flow-onboarding-hint">
            {connectVisuals.map((visual) => (
              <span
                key={visual.arrowColor}
                className="flow-onboarding-color-dot"
                style={{ background: visual.arrowColor }}
              />
            ))}
            {lt(
              currentStep.hintZh || connectHintFallback.hintZh,
              currentStep.hintEn || connectHintFallback.hintEn
            )}
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
        ) : (
          <div className="flow-onboarding-card-footer">
            <button
              type="button"
              className="flow-onboarding-nav-btn flow-onboarding-nav-btn-primary"
              onClick={complete}
            >
              {lt('完成', 'Complete')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
