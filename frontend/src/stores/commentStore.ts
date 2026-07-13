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

export const useCommentStore = create<CommentStore>((set) => ({
  activeThreadId: null,
  searchQuery: '',
  sortNewestFirst: true,
  setActiveThreadId: (id) => set({ activeThreadId: id }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  toggleSortOrder: () => set((state) => ({ sortNewestFirst: !state.sortNewestFirst })),
  reset: () => set({ activeThreadId: null, searchQuery: '', sortNewestFirst: true }),
}));
