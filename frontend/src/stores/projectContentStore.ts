import { create } from 'zustand';
import { createEmptyProjectContent, type ProjectContentSnapshot } from '@/types/project';

type UpdateOptions = {
  markDirty?: boolean;
};

/**
 * 画布被冻结（staleContent）的原因，决定弹窗文案。
 */
export type StaleReason = 'other-tab' | 'remote-newer' | 'save-rejected';

type ProjectContentState = {
  projectId: string | null;
  content: ProjectContentSnapshot | null;
  version: number;
  dirty: boolean;
  dirtySince: number | null;
  dirtyCounter: number;
  saving: boolean;
  manualSaving: boolean;
  lastSavedAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
  hydrated: boolean;
  /** 正在切换/加载项目内容（用于全屏 loading） */
  switching: boolean;
  /** 远端项目列表变更后，等待本地内容校验期间暂停自动保存。 */
  cacheValidationPending: boolean;
  staleContent: boolean;
  staleReason: StaleReason | null;
  setProject: (projectId: string | null) => void;
  beginSwitch: () => void;
  completeSwitch: () => void;
  hydrate: (content: ProjectContentSnapshot, version: number, savedAt?: string | null) => void;
  updatePartial: (partial: Partial<ProjectContentSnapshot>, options?: UpdateOptions) => void;
  setSaving: (saving: boolean) => void;
  setManualSaving: (saving: boolean) => void;
  setCacheValidationPending: (pending: boolean) => void;
  setStaleContent: (stale: boolean, reason?: StaleReason | null) => void;
  markSaved: (version: number, savedAt: string | null, savedAtCounter?: number) => void;
  setError: (error: string | null) => void;
  setWarning: (warning: string | null) => void;
  reset: () => void;
};

const createInitialState = (): Omit<ProjectContentState,
  'setProject' | 'beginSwitch' | 'completeSwitch' | 'hydrate' | 'updatePartial' | 'setSaving' | 'setManualSaving' | 'setCacheValidationPending' | 'setStaleContent' | 'markSaved' | 'setError' | 'setWarning' | 'reset'> => ({
  projectId: null,
  content: null,
  version: 1,
  dirty: false,
  dirtySince: null,
  dirtyCounter: 0,
  saving: false,
  manualSaving: false,
  lastSavedAt: null,
  lastError: null,
  lastWarning: null,
  hydrated: false,
  switching: false,
  cacheValidationPending: false,
  staleContent: false,
  staleReason: null,
});

export const useProjectContentStore = create<ProjectContentState>((set) => ({
  ...createInitialState(),
  setProject: (projectId) => {
    set(() => ({
      ...createInitialState(),
      projectId,
      switching: !!projectId,
    }));
  },
  beginSwitch: () => set({ switching: true, hydrated: false }),
  completeSwitch: () => set({ switching: false }),
  hydrate: (content, version, savedAt) => {
    set((state) => ({
      ...state,
      content,
      version,
      dirty: false,
      dirtySince: null,
      dirtyCounter: 0,
      saving: false,
      manualSaving: false,
      lastSavedAt: savedAt ?? state.lastSavedAt,
      lastError: null,
      lastWarning: null,
      hydrated: true,
      staleContent: false,
      staleReason: null,
      cacheValidationPending: false,
    }));
  },
  updatePartial: (partial, options) => {
    const markDirty = options?.markDirty ?? true;
    set((state) => {
      if (!state.projectId) {
        return state;
      }

      const baseContent = state.content ?? createEmptyProjectContent();
      const nextContent: ProjectContentSnapshot = {
        ...baseContent,
        ...partial,
        canvas: partial.canvas ? { ...baseContent.canvas, ...partial.canvas } : baseContent.canvas,
        updatedAt: markDirty ? new Date().toISOString() : baseContent.updatedAt,
      };

      if (partial.layers) {
        nextContent.layers = partial.layers;
      }
      if (partial.activeLayerId !== undefined) {
        nextContent.activeLayerId = partial.activeLayerId;
      }
      if (partial.updatedAt && !markDirty) {
        nextContent.updatedAt = partial.updatedAt;
      }

      if (!markDirty) {
        if (partial.layers || partial.activeLayerId !== undefined) {
          const currentLayers = baseContent.layers ?? [];
          const nextLayers = nextContent.layers ?? [];
          const layersUnchanged =
            currentLayers.length === nextLayers.length &&
            currentLayers.every((layer, index) => {
              const next = nextLayers[index];
              return (
                next &&
                layer.id === next.id &&
                layer.name === next.name &&
                layer.visible === next.visible &&
                layer.locked === next.locked
              );
            });
          if (
            layersUnchanged &&
            baseContent.activeLayerId === nextContent.activeLayerId
          ) {
            return state;
          }
        }
        if (partial.canvas) {
          const currentCanvas = baseContent.canvas;
          const nextCanvas = nextContent.canvas;
          if (
            currentCanvas.zoom === nextCanvas.zoom &&
            currentCanvas.panX === nextCanvas.panX &&
            currentCanvas.panY === nextCanvas.panY
          ) {
            return state;
          }
        }
        return {
          ...state,
          content: nextContent,
        };
      }

      if (partial.layers || partial.activeLayerId !== undefined) {
        const currentLayers = baseContent.layers ?? [];
        const nextLayers = nextContent.layers ?? [];
        const layersUnchanged =
            currentLayers.length === nextLayers.length &&
            currentLayers.every((layer, index) => {
                const next = nextLayers[index];
                return (
                    next &&
                    layer.id === next.id &&
                    layer.name === next.name &&
                    layer.visible === next.visible &&
                    layer.locked === next.locked
                );
            });
        if (
            layersUnchanged &&
            baseContent.activeLayerId === nextContent.activeLayerId
        ) {
            return state;
        }
      }

      const now = Date.now();
      return {
        ...state,
        content: nextContent,
        dirty: true,
        dirtySince: state.dirtySince ?? now,
        dirtyCounter: state.dirtyCounter + 1,
        lastError: null,
      };
    });
  },
  setSaving: (saving) => set({ saving }),
  setManualSaving: (manualSaving) => set({ manualSaving }),
  setCacheValidationPending: (cacheValidationPending) => set({ cacheValidationPending }),
  setStaleContent: (staleContent, reason) => set({
    staleContent,
    staleReason: staleContent ? (reason ?? null) : null,
  }),
  markSaved: (version, savedAt, savedAtCounter?: number) => {
    set((state) => {
      // 如果提供了 savedAtCounter，检查保存期间是否有新修改
      // 只有当 dirtyCounter 没有增加时才清除 dirty 状态
      const hasNewChanges = savedAtCounter !== undefined && state.dirtyCounter > savedAtCounter;

      return {
        ...state,
        version,
        dirty: hasNewChanges ? state.dirty : false,
        dirtySince: hasNewChanges ? state.dirtySince : null,
        dirtyCounter: hasNewChanges ? state.dirtyCounter : 0,
        saving: false,
        manualSaving: false,
        lastSavedAt: savedAt ?? new Date().toISOString(),
      };
    });
  },
  setError: (error) => set((state) => ({
    lastError: error,
    saving: false,
    manualSaving: false,
    dirtySince: error ? Date.now() : state.dirtySince,
  })),
  setWarning: (warning) => set({ lastWarning: warning }),
  reset: () => set(() => createInitialState()),
}));
