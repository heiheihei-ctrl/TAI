import React from 'react';
import type { Connection } from 'reactflow';
import { useReactFlow } from 'reactflow';
import {
  FLOW_ONBOARDING_EXAMPLE_IMAGE_URL,
  FLOW_ONBOARDING_PROMPTS,
  FLOW_ONBOARDING_TEXT2IMG_DESC,
  advanceOnboardingWhenNodeVisible,
  type FlowOnboardingTrack,
  useFlowOnboardingStore,
} from '@/stores/flowOnboardingStore';
import { getFlowNodeDefaultSize } from './constants/flowNodeDefaults';

type WorldPoint = { x: number; y: number };

/** 节点边缘之间的最小间距 */
const ONBOARDING_NODE_GAP = 120;
/** 图生图等多节点流程的列间距 */
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

const EXAMPLE_IMAGE_PATCH = {
  imageUrl: FLOW_ONBOARDING_EXAMPLE_IMAGE_URL,
  imageData: FLOW_ONBOARDING_EXAMPLE_IMAGE_URL,
};

function patchImageNode(nodeId: string) {
  window.dispatchEvent(
    new CustomEvent('flow:updateNodeData', {
      detail: { id: nodeId, patch: EXAMPLE_IMAGE_PATCH },
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

export default function FlowOnboardingAutoStepBridge({
  containerRef,
  openAddPanelAtContainerCenter,
  createNodeAtWorldCenter,
  onConnect,
  rf,
}: Props) {
  React.useEffect(() => {
    const handleAutoStep = (event: Event) => {
      const detail = (event as CustomEvent<{ step?: number }>).detail;
      const currentStep = detail?.step;
      if (typeof currentStep !== 'number') return;

      const store = useFlowOnboardingStore.getState();
      if (!store.active || store.phase !== 'guide' || !store.track) return;

      const track = store.track;
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
          y:
            sourceCenter.y +
            sourceSize.h / 2 +
            gap +
            targetSize.h / 2,
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
              centerY: node!.position.y + size.h / 2,
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
          : fallback;
        const id = createNodeAtWorldCenter('textPrompt', world);
        if (id) {
          store.setTextPromptNodeId(id);
          advanceOnboardingWhenNodeVisible(id, targetStep);
        } else {
          store.setStep(targetStep);
        }
      };

      const createImageNode = (targetStep: number) => {
        const center = getWorldCenter();
        const id = createNodeAtWorldCenter(
          'image',
          {
            x: center.x - ONBOARDING_COLUMN_GAP,
            y: center.y - 80,
          },
          EXAMPLE_IMAGE_PATCH
        );
        if (id) {
          store.setImageNodeId(id);
          patchImageNode(id);
          advanceOnboardingWhenNodeVisible(id, targetStep);
        } else {
          store.setStep(targetStep);
        }
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
        if (id) {
          store.setTargetNodeId(id);
          advanceOnboardingWhenNodeVisible(id, targetStep);
        } else {
          store.setStep(targetStep);
        }
      };

      const createSeedanceNode = (targetStep: number) => {
        const center = getWorldCenter();
        const sourceIds = [store.imageNodeId, store.textPromptNodeId];
        const world = placeTargetRightOfNodes(sourceIds, 'doubaoVideo', {
          x: center.x + ONBOARDING_COLUMN_GAP,
          y: center.y,
        });
        const id = createNodeAtWorldCenter('doubaoVideo', world);
        if (id) {
          store.setTargetNodeId(id);
          advanceOnboardingWhenNodeVisible(id, targetStep);
        } else {
          store.setStep(targetStep);
        }
      };

      const connectImageAndTextToVideo = () => {
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
      };

      const connectTextToTarget = () => {
        if (store.textPromptNodeId && store.targetNodeId) {
          onConnect({
            source: store.textPromptNodeId,
            sourceHandle: 'text',
            target: store.targetNodeId,
            targetHandle: 'text',
          });
        }
        store.nextStep();
      };

      const connectImageToGenerate = () => {
        if (store.imageNodeId && store.targetNodeId) {
          onConnect({
            source: store.imageNodeId,
            sourceHandle: 'img',
            target: store.targetNodeId,
            targetHandle: 'img',
          });
        }
      };

      const runText2ImgStep = (step: number) => {
        switch (step) {
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
            connectTextToTarget();
            break;
          default:
            break;
        }
      };

      const runImg2ImgStep = (step: number) => {
        switch (step) {
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
              patchTextPrompt(store.textPromptNodeId, FLOW_ONBOARDING_PROMPTS.img2img);
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
            connectImageToGenerate();
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
      };

      const runImg2VideoStep = (step: number) => {
        switch (step) {
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
              patchTextPrompt(store.textPromptNodeId, FLOW_ONBOARDING_PROMPTS.img2video);
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
            connectImageAndTextToVideo();
            break;
          default:
            break;
        }
      };

      if (track === 'text2img') runText2ImgStep(currentStep);
      else if (track === 'img2img') runImg2ImgStep(currentStep);
      else if (track === 'img2video') runImg2VideoStep(currentStep);
    };

    window.addEventListener('flow:onboarding-auto-step', handleAutoStep as EventListener);
    return () =>
      window.removeEventListener(
        'flow:onboarding-auto-step',
        handleAutoStep as EventListener
      );
  }, [
    containerRef,
    createNodeAtWorldCenter,
    onConnect,
    openAddPanelAtContainerCenter,
    rf,
  ]);

  return null;
}
