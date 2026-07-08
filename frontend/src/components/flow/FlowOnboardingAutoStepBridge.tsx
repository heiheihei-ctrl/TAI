import React from 'react';
import type { Connection } from 'reactflow';
import { useReactFlow } from 'reactflow';
import {
  FLOW_ONBOARDING_EXAMPLE_IMAGE_URL,
  advanceOnboardingWhenNodeVisible,
  type FlowOnboardingTrack,
  useFlowOnboardingStore,
} from '@/stores/flowOnboardingStore';
import { getFlowNodeDefaultSize } from './constants/flowNodeDefaults';

type WorldPoint = { x: number; y: number };

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

      const placeTargetRightOf = (
        sourceId: string | null,
        fallback: WorldPoint,
        gap = 96
      ): WorldPoint => {
        if (!sourceId) return fallback;
        const sourceNode = rf.getNode(sourceId);
        if (!sourceNode?.position) return fallback;
        const nodeData = sourceNode.data as { boxW?: number } | undefined;
        const sourceType = String(sourceNode.type || 'textPrompt');
        const sourceW =
          Number(nodeData?.boxW) || getFlowNodeDefaultSize(sourceType as any).w;
        return {
          x: sourceNode.position.x + sourceW + gap,
          y: sourceNode.position.y,
        };
      };

      const openNodePanel = () => {
        openAddPanelAtContainerCenter({
          tab: 'nodes',
          allowedTabs: ['nodes', 'beta', 'custom'],
        });
        store.nextStep();
      };

      const createTextPromptNode = () => {
        const center = getWorldCenter();
        const id = createNodeAtWorldCenter('textPrompt', {
          x: center.x - 220,
          y: center.y,
        });
        if (id) {
          store.setTextPromptNodeId(id);
          advanceOnboardingWhenNodeVisible(id, 2);
        } else {
          store.setStep(2);
        }
      };

      const createImageNode = (targetStep: number) => {
        const center = getWorldCenter();
        const id = createNodeAtWorldCenter(
          'image',
          { x: center.x - 220, y: center.y },
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

      const createGenerateNode = () => {
        const center = getWorldCenter();
        const world = placeTargetRightOf(store.textPromptNodeId, {
          x: center.x + 220,
          y: center.y,
        });
        const id = createNodeAtWorldCenter('generate', world);
        if (id) {
          store.setTargetNodeId(id);
          advanceOnboardingWhenNodeVisible(id, 5);
        } else {
          store.setStep(5);
        }
      };

      const createGenerateRefNode = () => {
        const center = getWorldCenter();
        const world = placeTargetRightOf(store.imageNodeId, {
          x: center.x + 220,
          y: center.y,
        });
        const id = createNodeAtWorldCenter('generateRef', world);
        if (id) {
          store.setTargetNodeId(id);
          advanceOnboardingWhenNodeVisible(id, 5);
        } else {
          store.setStep(5);
        }
      };

      const createKlingNode = () => {
        const center = getWorldCenter();
        const world = placeTargetRightOf(store.imageNodeId, {
          x: center.x + 220,
          y: center.y,
        });
        const id = createNodeAtWorldCenter('klingVideo', world);
        if (id) {
          store.setTargetNodeId(id);
          advanceOnboardingWhenNodeVisible(id, 5);
        } else {
          store.setStep(5);
        }
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

      const connectImageToTarget = (trackKind: FlowOnboardingTrack) => {
        if (!store.imageNodeId || !store.targetNodeId) {
          store.nextStep();
          return;
        }
        onConnect({
          source: store.imageNodeId,
          sourceHandle: 'img',
          target: store.targetNodeId,
          targetHandle: trackKind === 'img2img' ? 'image1' : 'image',
        });
        store.nextStep();
      };

      const runText2ImgStep = (step: number) => {
        switch (step) {
          case 0:
            openNodePanel();
            break;
          case 1:
            createTextPromptNode();
            break;
          case 2:
            if (store.textPromptNodeId) {
              patchTextPrompt(store.textPromptNodeId, '一只猫');
            }
            store.nextStep();
            break;
          case 3:
            openNodePanel();
            break;
          case 4:
            createGenerateNode();
            break;
          case 5:
            connectTextToTarget();
            break;
          default:
            break;
        }
      };

      const runImageTrackStep = (step: number, trackKind: 'img2img' | 'img2video') => {
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
            if (trackKind === 'img2img') createGenerateRefNode();
            else createKlingNode();
            break;
          case 5:
            connectImageToTarget(trackKind);
            break;
          default:
            break;
        }
      };

      if (track === 'text2img') runText2ImgStep(currentStep);
      else if (track === 'img2img') runImageTrackStep(currentStep, 'img2img');
      else if (track === 'img2video') runImageTrackStep(currentStep, 'img2video');
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
