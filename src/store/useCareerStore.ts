import { QueryType } from "@/types/type";
import { create } from "zustand";

// Profile Store State
interface CareerStoreState {
  isSettingsModalOpen: boolean;
  setIsSettingsModalOpen: (isSettingsModalOpen: boolean) => void;
}

export const useCareerStore = create<CareerStoreState>((set) => ({
  isSettingsModalOpen: false,
  setIsSettingsModalOpen: (isSettingsModalOpen) => set({ isSettingsModalOpen }),
}));

export default useCareerStore;
