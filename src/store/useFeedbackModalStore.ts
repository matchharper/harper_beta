import { create } from "zustand";

type FeedbackModalState = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

export const useFeedbackModalStore = create<FeedbackModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
