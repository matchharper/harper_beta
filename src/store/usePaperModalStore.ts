import { create } from "zustand";

type PaperPayload = {
  paperId: string;
  closeOnBackdrop?: boolean;
};

type PaperModalState = {
  isOpen: boolean;
  payload: PaperPayload | null;
  open: (payload: PaperPayload) => void;
  close: () => void;
  handleOpenPaper: (params: { paperId: string }) => Promise<void>;
};

export const usePaperModalStore = create<PaperModalState>((set, get) => ({
  isOpen: false,
  payload: null,

  open: (payload) => set({ isOpen: true, payload }),

  close: () => {
    const { isOpen } = get();
    if (!isOpen) return;
    set({ isOpen: false, payload: null });
  },

  handleOpenPaper: async ({ paperId }) => {
    const id = String(paperId ?? "").trim();
    if (!id) return;
    get().open({ paperId: id });
  },
}));
