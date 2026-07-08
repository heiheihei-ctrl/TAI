import { create } from 'zustand';

export const FLOW_ONBOARDING_STORAGE_KEY = 'tanva-flow-onboarding-v1-completed';

export const FLOW_ONBOARDING_EXAMPLE_IMAGE_URL =
  'https://tai-ai.tos-cn-guangzhou.volces.com/uploads/ai/tasks/9dcf919c/1782978843157-19a59fbdc7b5.png';

export type FlowOnboardingTrack = 'text2img' | 'img2img' | 'img2video';
export type FlowOnboardingPhase = 'select' | 'guide';

export type FlowOnboardingStepTarget =
  | 'canvas-center'
  | 'node-palette-textPrompt'
  | 'node-palette-image'
  | 'node-palette-generate'
  | 'node-palette-generateRef'
  | 'node-palette-klingVideo'
  | 'text-prompt-input'
  | 'image-node-preview'
  | 'connect-nodes'
  | 'connect-image-nodes'
  | 'generate-run-button'
  | 'kling-run-button';

export type FlowOnboardingStepDef = {
  zh: string;
  en: string;
  target: FlowOnboardingStepTarget;
};

export const FLOW_ONBOARDING_TRACK_META: Record<
  FlowOnboardingTrack,
  { zh: string; en: string; descZh: string; descEn: string }
> = {
  text2img: {
    zh: '文生图',
    en: 'Text to Image',
    descZh: '输入提示词，生成图片',
    descEn: 'Generate images from text prompts',
  },
  img2img: {
    zh: '图生图',
    en: 'Image to Image',
    descZh: '上传参考图，生成新图片',
    descEn: 'Generate images from a reference image',
  },
  img2video: {
    zh: '图生视频',
    en: 'Image to Video',
    descZh: '用图片生成可灵视频',
    descEn: 'Generate Kling videos from an image',
  },
};

const TEXT2IMG_STEPS: FlowOnboardingStepDef[] = [
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas to open the node picker',
    target: 'canvas-center',
  },
  {
    zh: '选择文字节点',
    en: 'Choose a text prompt node',
    target: 'node-palette-textPrompt',
  },
  {
    zh: '输入图片描述提示词，例如:一只猫',
    en: 'Enter an image prompt, e.g. a cat',
    target: 'text-prompt-input',
  },
  {
    zh: '双击画布，选择节点',
    en: 'Double-click the canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择图像节点',
    en: 'Choose an image generation node',
    target: 'node-palette-generate',
  },
  {
    zh: '同色系节点相连',
    en: 'Connect nodes using matching handle colors',
    target: 'connect-nodes',
  },
  {
    zh: '点击此处，即可开始生成图片',
    en: 'Click here to start generating the image',
    target: 'generate-run-button',
  },
];

const IMG2IMG_STEPS: FlowOnboardingStepDef[] = [
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas to open the node picker',
    target: 'canvas-center',
  },
  {
    zh: '选择图片节点',
    en: 'Choose an image node',
    target: 'node-palette-image',
  },
  {
    zh: '示例图已加载，可查看图片节点',
    en: 'The sample image is loaded in the image node',
    target: 'image-node-preview',
  },
  {
    zh: '双击画布，选择节点',
    en: 'Double-click the canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择参考图生成节点',
    en: 'Choose a reference-image generate node',
    target: 'node-palette-generateRef',
  },
  {
    zh: '同色系节点相连',
    en: 'Connect nodes using matching handle colors',
    target: 'connect-image-nodes',
  },
  {
    zh: '点击此处，即可开始生成图片',
    en: 'Click here to start generating the image',
    target: 'generate-run-button',
  },
];

const IMG2VIDEO_STEPS: FlowOnboardingStepDef[] = [
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas to open the node picker',
    target: 'canvas-center',
  },
  {
    zh: '选择图片节点',
    en: 'Choose an image node',
    target: 'node-palette-image',
  },
  {
    zh: '示例图已加载，可查看图片节点',
    en: 'The sample image is loaded in the image node',
    target: 'image-node-preview',
  },
  {
    zh: '双击画布，选择节点',
    en: 'Double-click the canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择可灵节点',
    en: 'Choose a Kling node',
    target: 'node-palette-klingVideo',
  },
  {
    zh: '同色系节点相连',
    en: 'Connect nodes using matching handle colors',
    target: 'connect-image-nodes',
  },
  {
    zh: '点击此处，即可开始生成视频',
    en: 'Click here to start generating the video',
    target: 'kling-run-button',
  },
];

export function getFlowOnboardingSteps(
  track: FlowOnboardingTrack | null
): FlowOnboardingStepDef[] {
  if (track === 'img2img') return IMG2IMG_STEPS;
  if (track === 'img2video') return IMG2VIDEO_STEPS;
  return TEXT2IMG_STEPS;
}

/** @deprecated use getFlowOnboardingSteps */
export const FLOW_ONBOARDING_STEPS = TEXT2IMG_STEPS;

interface FlowOnboardingState {
  active: boolean;
  phase: FlowOnboardingPhase;
  track: FlowOnboardingTrack | null;
  step: number;
  initialNodeIds: Set<string>;
  textPromptNodeId: string | null;
  imageNodeId: string | null;
  targetNodeId: string | null;
  start: (existingNodeIds?: Iterable<string>) => void;
  skip: () => void;
  complete: () => void;
  selectTrack: (track: FlowOnboardingTrack) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  setTextPromptNodeId: (id: string) => void;
  setImageNodeId: (id: string) => void;
  setTargetNodeId: (id: string) => void;
}

const resetGuideNodes = {
  textPromptNodeId: null,
  imageNodeId: null,
  targetNodeId: null,
};

const persistCompleted = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FLOW_ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
};

export const useFlowOnboardingStore = create<FlowOnboardingState>((set) => ({
  active: false,
  phase: 'select',
  track: null,
  step: 0,
  initialNodeIds: new Set<string>(),
  textPromptNodeId: null,
  imageNodeId: null,
  targetNodeId: null,
  start: (existingNodeIds) =>
    set({
      active: true,
      phase: 'select',
      track: null,
      step: 0,
      initialNodeIds: new Set(existingNodeIds ?? []),
      ...resetGuideNodes,
    }),
  skip: () => {
    persistCompleted();
    set({
      active: false,
      phase: 'select',
      track: null,
      step: 0,
      ...resetGuideNodes,
    });
  },
  complete: () => {
    persistCompleted();
    set({
      active: false,
      phase: 'select',
      track: null,
      step: 0,
      ...resetGuideNodes,
    });
  },
  selectTrack: (track) =>
    set({
      phase: 'guide',
      track,
      step: 0,
      ...resetGuideNodes,
    }),
  setStep: (step) => set({ step }),
  nextStep: () =>
    set((state) => {
      const steps = getFlowOnboardingSteps(state.track);
      return {
        step: Math.min(Math.max(steps.length - 1, 0), state.step + 1),
      };
    }),
  setTextPromptNodeId: (id) => set({ textPromptNodeId: id }),
  setImageNodeId: (id) => set({ imageNodeId: id }),
  setTargetNodeId: (id) => set({ targetNodeId: id }),
}));

export function isFlowOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(FLOW_ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function advanceOnboardingWhenNodeVisible(
  nodeId: string,
  targetStep: number
) {
  const store = useFlowOnboardingStore.getState();
  let attempts = 0;

  const tick = () => {
    attempts += 1;
    const nodeEl = document.querySelector(
      `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
    );
    const box = nodeEl?.getBoundingClientRect();
    const isVisible = Boolean(box && box.width > 0 && box.height > 0);

    if (isVisible || attempts >= 40) {
      store.setStep(targetStep);
      return;
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}
