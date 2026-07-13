import { create } from 'zustand';

interface CommentStore {
  activeThreadId: string | null;
  searchQuery: string;
  sortNewestFirst: boolean;
  setActiveThreadId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleSortOrder: () => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  activeThreadId: null as string | null,
  searchQuery: '',
  sortNewestFirst: true,
};

export const useCommentStore = create<CommentStore>((set, get) => ({
  ...DEFAULT_STATE,
  setActiveThreadId: (id) => {
    if (get().activeThreadId === id) return;
    set({ activeThreadId: id });
  },
  setSearchQuery: (query) => {
    if (get().searchQuery === query) return;
    set({ searchQuery: query });
  },
  toggleSortOrder: () => set((state) => ({ sortNewestFirst: !state.sortNewestFirst })),
  reset: () => {
    const state = get();
    if (
      state.activeThreadId === DEFAULT_STATE.activeThreadId &&
      state.searchQuery === DEFAULT_STATE.searchQuery &&
      state.sortNewestFirst === DEFAULT_STATE.sortNewestFirst
    ) {
      return;
    }
    set(DEFAULT_STATE);
  },
}));
