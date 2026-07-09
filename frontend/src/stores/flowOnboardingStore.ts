import { create } from 'zustand';
import flowOnboardingExampleImage from '@/assets/flow_1783419642525.png';

export const FLOW_ONBOARDING_STORAGE_KEY = 'tanva-flow-onboarding-v1-completed';

export const FLOW_ONBOARDING_EXAMPLE_IMAGE_URL = flowOnboardingExampleImage;

/** 文生图步骤示例：图片描述式短提示词 */
export const FLOW_ONBOARDING_TEXT2IMG_DESC = '城市综合体';

export const FLOW_ONBOARDING_PROMPTS = {
  text2img:
    '你是建筑设计师，帮我设计一个城市综合体。Luxigon 风格渲染，自然色彩搭配，精致构图，效果图，高级且克制',
  img2img:
    '严格保留原图城市天际线与路网结构，超写实城市日景，自然漫射天光，建筑材质清晰，晴朗蓝天，8K 高清物理级全局光照。',
  img2video:
    '5 秒建筑漫游视频，镜头平稳缓慢向前推近滨水商业综合体建筑群，完整保留原图建筑结构、水系路网与环境细节，光影自然连贯，4K 高清流畅无畸变，写实建筑表现质感。',
} as const;

export type FlowOnboardingTrack = 'text2img' | 'img2img' | 'img2video';
export type FlowOnboardingPhase = 'select' | 'guide';

export type FlowOnboardingStepTarget =
  | 'canvas-center'
  | 'node-palette-textPrompt'
  | 'node-palette-image'
  | 'node-palette-generate'
  | 'node-palette-generateRef'
  | 'node-palette-klingVideo'
  | 'node-palette-doubaoVideo'
  | 'text-prompt-input'
  | 'image-node-upload'
  | 'image-node-preview'
  | 'connect-nodes'
  | 'connect-image-nodes'
  | 'connect-img2img-nodes'
  | 'connect-img2video-nodes'
  | 'generate-run-button'
  | 'kling-run-button';

export type FlowOnboardingStepDef = {
  zh: string;
  en: string;
  target: FlowOnboardingStepTarget;
  hintZh?: string;
  hintEn?: string;
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
    descZh: '上传参考图并输入修改要求，生成新图片',
    descEn: 'Upload a reference image and prompt to generate a new image',
  },
  img2video: {
    zh: '图生视频',
    en: 'Image to Video',
    descZh: '上传参考图并输入视频需求，生成 Seedance 视频',
    descEn: 'Upload a reference image and prompt to generate Seedance videos',
  },
};

const TEXT2IMG_STEPS: FlowOnboardingStepDef[] = [
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas to open the node picker',
    target: 'canvas-center',
  },
  {
    zh: '选择文字节点，Prompt',
    en: 'Choose a Prompt text node',
    target: 'node-palette-textPrompt',
  },
  {
    zh: '输入提示词',
    en: 'Enter your prompt',
    target: 'text-prompt-input',
    hintZh: FLOW_ONBOARDING_TEXT2IMG_DESC,
    hintEn: FLOW_ONBOARDING_TEXT2IMG_DESC,
  },
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas again to add another node',
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
    zh: '选择图像节点，Image',
    en: 'Choose the Image node',
    target: 'node-palette-image',
  },
  {
    zh: '双击节点框内空白处，上传 jpg、png 格式的图（手绘彩图、SU 截图、CAD 线稿图、参考图等）',
    en: 'Double-click inside the node and upload a JPG/PNG image (sketches, SU screenshots, CAD drafts, references, etc.)',
    target: 'image-node-upload',
  },
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择文字节点，Prompt',
    en: 'Choose a Prompt text node',
    target: 'node-palette-textPrompt',
  },
  {
    zh: '输入修改要求',
    en: 'Enter your modification requirements',
    target: 'text-prompt-input',
    hintZh: FLOW_ONBOARDING_PROMPTS.img2img,
    hintEn: FLOW_ONBOARDING_PROMPTS.img2img,
  },
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas again to add another node',
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
    target: 'connect-img2img-nodes',
    hintZh: '将图片节点的橙色输出口连到生成节点的橙色输入口，将 Prompt 节点的绿色输出口连到生成节点的绿色输入口',
    hintEn:
      'Connect the orange image output to the orange image input, and the green prompt output to the green prompt input',
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
    zh: '选择图像节点，Image',
    en: 'Choose the Image node',
    target: 'node-palette-image',
  },
  {
    zh: '双击节点框内上传图片',
    en: 'Double-click inside the node to upload an image',
    target: 'image-node-upload',
  },
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择文字节点，Prompt',
    en: 'Choose a Prompt text node',
    target: 'node-palette-textPrompt',
  },
  {
    zh: '输入视频需求',
    en: 'Enter your video requirements',
    target: 'text-prompt-input',
    hintZh: FLOW_ONBOARDING_PROMPTS.img2video,
    hintEn: FLOW_ONBOARDING_PROMPTS.img2video,
  },
  {
    zh: '双击画布空白处，选择节点',
    en: 'Double-click the empty canvas again to add another node',
    target: 'canvas-center',
  },
  {
    zh: '选择视频节点，Seedance',
    en: 'Choose the Seedance video node',
    target: 'node-palette-doubaoVideo',
  },
  {
    zh: '同色系节点相连',
    en: 'Connect nodes using matching handle colors',
    target: 'connect-img2video-nodes',
    hintZh:
      '将图片节点的橙色输出口连到 Seedance 节点的橙色图片输入口，将 Prompt 节点的绿色输出口连到 Seedance 节点的绿色文字输入口',
    hintEn:
      'Connect the orange image output to the orange image input, and the green prompt output to the green text input on the Seedance node',
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
