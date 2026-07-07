import { create } from 'zustand';

export const FLOW_ONBOARDING_STORAGE_KEY = 'tanva-flow-onboarding-v1-completed';

export const FLOW_ONBOARDING_STEPS = [
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
] as const;

interface FlowOnboardingState {
  active: boolean;
  step: number;
  initialNodeIds: Set<string>;
  textPromptNodeId: string | null;
  generateNodeId: string | null;
  start: (existingNodeIds?: Iterable<string>) => void;
  skip: () => void;
  complete: () => void;
  setStep: (step: number) => void;
  setTextPromptNodeId: (id: string) => void;
  setGenerateNodeId: (id: string) => void;
}

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
  step: 0,
  initialNodeIds: new Set<string>(),
  textPromptNodeId: null,
  generateNodeId: null,
  start: (existingNodeIds) =>
    set({
      active: true,
      step: 0,
      initialNodeIds: new Set(existingNodeIds ?? []),
      textPromptNodeId: null,
      generateNodeId: null,
    }),
  skip: () => {
    persistCompleted();
    set({
      active: false,
      step: 0,
      textPromptNodeId: null,
      generateNodeId: null,
    });
  },
  complete: () => {
    persistCompleted();
    set({
      active: false,
      step: 0,
      textPromptNodeId: null,
      generateNodeId: null,
    });
  },
  setStep: (step) => set({ step }),
  setTextPromptNodeId: (id) => set({ textPromptNodeId: id }),
  setGenerateNodeId: (id) => set({ generateNodeId: id }),
}));

export function isFlowOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(FLOW_ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}
