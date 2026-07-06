import { create } from 'zustand';
import { projectApi, type Project } from '@/services/projectApi';
import { deleteProjectCache } from '@/services/projectCacheStore';
import { useProjectContentStore } from '@/stores/projectContentStore';
import {
  getDefaultProjectName,
  getActiveWorkspaceProjectStorageKey,
  saveWorkspaceProjectId,
  clearWorkspaceProjectId,
  resolveWorkspaceProject,
} from '@/utils/projectName';

type ProjectState = {
  projects: Project[];
  currentProjectId: string | null;
  currentProject: Project | null;
  loading: boolean;
  modalOpen: boolean;
  error: string | null;
  load: () => Promise<void>;
  openModal: () => void;
  closeModal: () => void;
  create: (name?: string) => Promise<Project>;
  open: (id: string) => void;
  rename: (id: string, name: string) => Promise<void>;
  updateMeta: (id: string, payload: { name?: string; thumbnailUrl?: string | null }) => Promise<Project>;
  remove: (id: string) => Promise<void>;
  optimisticRenameLocal: (id: string, name: string) => void;
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProjectId: null,
  currentProject: null,
  loading: false,
  modalOpen: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await projectApi.list();
      const storageKey = getActiveWorkspaceProjectStorageKey();
      const current = resolveWorkspaceProject(projects, storageKey);

      if (!current) {
        if (projects.length > 0) {
          const first = projects[0];
          saveWorkspaceProjectId(storageKey, first.id);
          set({ projects, currentProjectId: first.id, currentProject: first, loading: false });
          return;
        }
          // 没有项目，自动创建一个默认项目
          try {
            const project = await projectApi.create({ name: getDefaultProjectName() });
            const all = [project, ...projects];
            saveWorkspaceProjectId(storageKey, project.id);
            set({ projects: all, currentProjectId: project.id, currentProject: project, loading: false });
            return;
          } catch (err: any) {
            set({ projects, currentProjectId: null, currentProject: null, loading: false, error: err?.message || null, modalOpen: true });
            return;
          }
      }

      saveWorkspaceProjectId(storageKey, current.id);
      set({ projects, currentProjectId: current.id, currentProject: current as Project, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message || '加载项目失败' });
    }
  },

  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),

  create: async (name?: string) => {
    const normalizedName = name?.trim();
    const project = await projectApi.create({ name: normalizedName || getDefaultProjectName() });
    set((s) => ({ projects: [project, ...s.projects] }));
    get().open(project.id);
    return project;
  },

  open: (id: string) => {
    const prevId = get().currentProjectId;
    const found = get().projects.find((x) => x.id === id) || null;

    if (found) {
      if (prevId !== found.id) {
        useProjectContentStore.getState().beginSwitch();
      }
      set({ currentProjectId: found.id, currentProject: found, modalOpen: false });
      saveWorkspaceProjectId(getActiveWorkspaceProjectStorageKey(), found.id);
      return;
    }

    // 未在本地列表中，尝试从后端获取并补充
    (async () => {
      try {
        const proj = await projectApi.get(id);
        set((s) => {
          const exists = s.projects.some((p) => p.id === proj.id);
          const projects = exists ? s.projects.map((p) => p.id === proj.id ? proj : p) : [proj, ...s.projects];
          if (s.currentProjectId !== proj.id) {
            useProjectContentStore.getState().beginSwitch();
          }
          return {
            projects,
            currentProjectId: proj.id,
            currentProject: proj,
            modalOpen: false, // 确保关闭模态框
            error: null // 清除任何之前的错误
          };
        });
        try { saveWorkspaceProjectId(getActiveWorkspaceProjectStorageKey(), id); } catch {}
      } catch (e: any) {
        console.warn('Failed to load project:', e);
        useProjectContentStore.getState().completeSwitch();
        set({ error: e?.message || '无法加载项目', modalOpen: true });
      }
    })();
  },

  updateMeta: async (id, payload) => {
    try {
      const project = await projectApi.update(id, payload);
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? project : p)),
        currentProject: s.currentProject?.id === id ? project : s.currentProject,
        error: null,
      }));
      return project;
    } catch (e: any) {
      console.warn('Failed to update project meta:', e);
      set({ error: e?.message || '更新项目信息失败' });
      throw e;
    }
  },
  rename: async (id, name) => {
    await get().updateMeta(id, { name });
  },

  remove: async (id) => {
    await projectApi.remove(id);

    // 清理本地缓存
    deleteProjectCache(id).catch(() => {});

    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      const removedCurrent = state.currentProjectId === id;

      if (removedCurrent) {
        clearWorkspaceProjectId(getActiveWorkspaceProjectStorageKey());
      }

      return {
        projects,
        currentProjectId: removedCurrent ? null : state.currentProjectId,
        currentProject: removedCurrent ? null : state.currentProject,
        modalOpen: projects.length === 0 ? true : state.modalOpen
      };
    });

    const stateAfterRemoval = get();

    if (stateAfterRemoval.projects.length === 0) {
      try {
        const fallback = await projectApi.create({ name: getDefaultProjectName() });
        set({
          projects: [fallback],
          currentProjectId: fallback.id,
          currentProject: fallback,
          modalOpen: true,
        });
        saveWorkspaceProjectId(getActiveWorkspaceProjectStorageKey(), fallback.id);
      } catch (error) {
        console.warn('自动创建新项目失败:', error);
      }
      return;
    }

    if (!stateAfterRemoval.currentProjectId) {
      const fallback = stateAfterRemoval.projects[0];
      set({
        currentProjectId: fallback.id,
        currentProject: fallback,
      });
      saveWorkspaceProjectId(getActiveWorkspaceProjectStorageKey(), fallback.id);
    } else if (stateAfterRemoval.currentProjectId !== id) {
      saveWorkspaceProjectId(
        getActiveWorkspaceProjectStorageKey(),
        stateAfterRemoval.currentProjectId,
      );
    }
  },
  optimisticRenameLocal: (id, name) => set((s) => ({
    projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    currentProject: s.currentProject?.id === id ? { ...(s.currentProject as Project), name } : s.currentProject,
  })),
}));
