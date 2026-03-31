import { create } from "zustand";

type RepoPayload = {
  repoId: string;
  repoFullName?: string;
  closeOnBackdrop?: boolean;
};

type RepoModalState = {
  isOpen: boolean;
  payload: RepoPayload | null;
  open: (payload: RepoPayload) => void;
  close: () => void;
  handleOpenRepo: (params: {
    repoId: string;
    repoFullName?: string;
  }) => Promise<void>;
};

export const useRepoModalStore = create<RepoModalState>((set, get) => ({
  isOpen: false,
  payload: null,

  open: (payload) => set({ isOpen: true, payload }),

  close: () => {
    const { isOpen } = get();
    if (!isOpen) return;
    set({ isOpen: false, payload: null });
  },

  handleOpenRepo: async ({ repoId, repoFullName }) => {
    const id = String(repoId ?? "").trim();
    if (!id) return;
    get().open({ repoId: id, repoFullName });
  },
}));
