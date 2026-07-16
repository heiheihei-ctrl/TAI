import React from 'react';
import type { Connection } from 'reactflow';
import type { useReactFlow } from 'reactflow';
import {
  FLOW_ONBOARDING_TEXT2IMG_DESC,
  getFlowOnboardingExampleImageUrl,
  getFlowOnboardingImg2imgPrompt,
  getFlowOnboardingImg2videoPrompt,
  useFlowOnboardingStore,
} from '@/stores/flowOnboardingStore';
import { getFlowNodeDefaultSize } from './constants/flowNodeDefaults';

type WorldPoint = { x: number; y: number };

const ONBOARDING_NODE_GAP = 120;
const ONBOARDING_COLUMN_GAP = 200;

function getNodeSize(
  node: { type?: string | null; data?: unknown } | null | undefined
): { w: number; h: number } {
  if (!node) return getFlowNodeDefaultSize(null);
  const data = node.data as { boxW?: number; boxH?: number } | undefined;
  const fallback = getFlowNodeDefaultSize(String(node.type || ''));
  return {
    w: Number(data?.boxW) || fallback.w,
    h: Number(data?.boxH) || fallback.h,
  };
}

function getNodeCenter(node: {
  position: { x: number; y: number };
  type?: string | null;
  data?: unknown;
}): WorldPoint {
  const size = getNodeSize(node);
  return {
    x: node.position.x + size.w / 2,
    y: node.position.y + size.h / 2,
  };
}

type Props = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  addPanelVisible: boolean;
  addPanelWorld: WorldPoint;
  runAutoStepRef: React.MutableRefObject<((step: number) => void) | null>;
  openAddPanelAtContainerCenter: (opts?: {
    tab?: string;
    allowedTabs?: string[];
  }) => void;
  createNodeAtWorldCenter: (
    rawType: string,
    world: WorldPoint,
    paletteDefaultData?: Record<string, unknown>,
    paletteConfig?: Record<string, unknown>
  ) => string | null;
  onConnect: (params: Connection) => void;
  rf: ReturnType<typeof useReactFlow>;
};

function getExampleImagePatch() {
  const imageUrl = getFlowOnboardingExampleImageUrl();
  return { imageUrl, imageData: imageUrl };
}

function patchImageNode(nodeId: string) {
  window.dispatchEvent(
    new CustomEvent('flow:updateNodeData', {
      detail: { id: nodeId, patch: getExampleImagePatch() },
    })
  );
}

function patchTextPrompt(nodeId: string, text: string) {
  window.dispatchEvent(
    new CustomEvent('flow:updateNodeData', {
      detail: { id: nodeId, patch: { text } },
    })
  );
}

/**
 * 每帧把最新 runAutoStep 写进 ref（不走 effect cleanup），
 * 避免「下一步」第一次点击打到 null。
 */
export default function FlowOnboardingAutoStepBridge({
  containerRef,
  addPanelVisible,
  addPanelWorld,
  runAutoStepRef,
  openAddPanelAtContainerCenter,
  createNodeAtWorldCenter,
  onConnect,
  rf,
}: Props) {
  runAutoStepRef.current = (currentStep: number) => {
    const store = useFlowOnboardingStore.getState();
    if (!store.active || store.phase !== 'guide' || !store.track) return;

    const track = store.track;
    const panel = { visible: addPanelVisible, world: addPanelWorld };

    const getWorldCenter = (): WorldPoint => {
      const rect = containerRef.current?.getBoundingClientRect();
      const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
      const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
      return rf.screenToFlowPosition({ x: centerX, y: centerY });
    };

    const placeTargetBelow = (
      sourceId: string | null,
      targetType: string,
      fallback: WorldPoint,
      gap = ONBOARDING_NODE_GAP
    ): WorldPoint => {
      if (!sourceId) return fallback;
      const sourceNode = rf.getNode(sourceId);
      if (!sourceNode?.position) return fallback;
      const sourceSize = getNodeSize(sourceNode);
      const targetSize = getFlowNodeDefaultSize(targetType);
      const sourceCenter = getNodeCenter(sourceNode);
      return {
        x: sourceCenter.x,
        y: sourceCenter.y + sourceSize.h / 2 + gap + targetSize.h / 2,
      };
    };

    const placeTargetRightOfNodes = (
      sourceIds: Array<string | null>,
      targetType: string,
      fallback: WorldPoint,
      gap = ONBOARDING_COLUMN_GAP
    ): WorldPoint => {
      const rects = sourceIds
        .filter((id): id is string => Boolean(id))
        .map((id) => rf.getNode(id))
        .filter(Boolean)
        .map((node) => {
          const size = getNodeSize(node);
          return {
            right: node!.position.x + size.w,
            top: node!.position.y,
            bottom: node!.position.y + size.h,
          };
        });

      if (!rects.length) return fallback;
      const maxRight = Math.max(...rects.map((r) => r.right));
      const minTop = Math.min(...rects.map((r) => r.top));
      const maxBottom = Math.max(...rects.map((r) => r.bottom));
      const targetSize = getFlowNodeDefaultSize(targetType);
      return {
        x: maxRight + gap + targetSize.w / 2,
        y: (minTop + maxBottom) / 2,
      };
    };

    const openNodePanel = () => {
      openAddPanelAtContainerCenter({
        tab: 'nodes',
        allowedTabs: ['nodes', 'beta', 'custom'],
      });
      store.nextStep();
    };

    const createTextPromptNode = (targetStep: number, sourceId?: string | null) => {
      const center = getWorldCenter();
      const fallback = {
        x: center.x - ONBOARDING_COLUMN_GAP,
        y: center.y,
      };
      const world = sourceId
        ? placeTargetBelow(sourceId, 'textPrompt', fallback)
        : panel.visible
          ? { ...panel.world }
          : fallback;
      const id = createNodeAtWorldCenter('textPrompt', world);
      if (id) store.setTextPromptNodeId(id);
      store.setStep(targetStep);
    };

    const createImageNode = (targetStep: number) => {
      const center = getWorldCenter();
      const world = panel.visible
        ? { ...panel.world }
        : {
            x: center.x - ONBOARDING_COLUMN_GAP,
            y: center.y - 80,
          };
      const id = createNodeAtWorldCenter('image', world, getExampleImagePatch());
      if (id) {
        store.setImageNodeId(id);
        patchImageNode(id);
      }
      store.setStep(targetStep);
    };

    const createGenerateNode = (targetStep: number) => {
      const center = getWorldCenter();
      const sourceIds =
        track === 'img2img'
          ? [store.imageNodeId, store.textPromptNodeId]
          : [store.textPromptNodeId];
      const world = placeTargetRightOfNodes(sourceIds, 'generate', {
        x: center.x + ONBOARDING_COLUMN_GAP,
        y: center.y,
      });
      const id = createNodeAtWorldCenter('generate', world);
      if (id) store.setTargetNodeId(id);
      store.setStep(targetStep);
    };

    const createSeedanceNode = (targetStep: number) => {
      const center = getWorldCenter();
      const sourceIds = [store.imageNodeId, store.textPromptNodeId];
      const world = placeTargetRightOfNodes(sourceIds, 'doubaoVideo', {
        x: center.x + ONBOARDING_COLUMN_GAP,
        y: center.y,
      });
      const id = createNodeAtWorldCenter('doubaoVideo', world);
      if (id) store.setTargetNodeId(id);
      store.setStep(targetStep);
    };

    if (track === 'text2img') {
      switch (currentStep) {
        case 0:
          openNodePanel();
          break;
        case 1:
          createTextPromptNode(2);
          break;
        case 2:
          if (store.textPromptNodeId) {
            patchTextPrompt(store.textPromptNodeId, FLOW_ONBOARDING_TEXT2IMG_DESC);
          }
          store.nextStep();
          break;
        case 3:
          openNodePanel();
          break;
        case 4:
          createGenerateNode(5);
          break;
        case 5:
          if (store.textPromptNodeId && store.targetNodeId) {
            onConnect({
              source: store.textPromptNodeId,
              sourceHandle: 'text',
              target: store.targetNodeId,
              targetHandle: 'text',
            });
          }
          store.nextStep();
          break;
        default:
          break;
      }
      return;
    }

    if (track === 'img2img') {
      switch (currentStep) {
        case 0:
          openNodePanel();
          break;
        case 1:
          createImageNode(2);
          break;
        case 2:
          if (store.imageNodeId) patchImageNode(store.imageNodeId);
          store.nextStep();
          break;
        case 3:
          openNodePanel();
          break;
        case 4:
          createTextPromptNode(5, store.imageNodeId);
          break;
        case 5:
          if (store.textPromptNodeId) {
            patchTextPrompt(store.textPromptNodeId, getFlowOnboardingImg2imgPrompt());
          }
          store.nextStep();
          break;
        case 6:
          openNodePanel();
          break;
        case 7:
          createGenerateNode(8);
          break;
        case 8:
          if (store.imageNodeId && store.targetNodeId) {
            onConnect({
              source: store.imageNodeId,
              sourceHandle: 'img',
              target: store.targetNodeId,
              targetHandle: 'img',
            });
          }
          if (store.textPromptNodeId && store.targetNodeId) {
            onConnect({
              source: store.textPromptNodeId,
              sourceHandle: 'text',
              target: store.targetNodeId,
              targetHandle: 'text',
            });
          }
          store.nextStep();
          break;
        default:
          break;
      }
      return;
    }

    if (track === 'img2video') {
      switch (currentStep) {
        case 0:
          openNodePanel();
          break;
        case 1:
          createImageNode(2);
          break;
        case 2:
          if (store.imageNodeId) patchImageNode(store.imageNodeId);
          store.nextStep();
          break;
        case 3:
          openNodePanel();
          break;
        case 4:
          createTextPromptNode(5, store.imageNodeId);
          break;
        case 5:
          if (store.textPromptNodeId) {
            patchTextPrompt(store.textPromptNodeId, getFlowOnboardingImg2videoPrompt());
          }
          store.nextStep();
          break;
        case 6:
          openNodePanel();
          break;
        case 7:
          createSeedanceNode(8);
          break;
        case 8:
          if (store.imageNodeId && store.targetNodeId) {
            onConnect({
              source: store.imageNodeId,
              sourceHandle: 'img',
              target: store.targetNodeId,
              targetHandle: 'image',
            });
          }
          if (store.textPromptNodeId && store.targetNodeId) {
            onConnect({
              source: store.textPromptNodeId,
              sourceHandle: 'text',
              target: store.targetNodeId,
              targetHandle: 'text',
            });
          }
          store.nextStep();
          break;
        default:
          break;
      }
    }
  };

  return null;
}
