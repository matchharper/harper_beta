// stores/useSettingStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewType = "card" | "table";

type SettingState = {
  viewType: ViewType;
  setViewType: (v: ViewType) => void;
};

export const useSettingStore = create<SettingState>()(
  persist(
    (set, get) => ({
      viewType: "card",
      setViewType: (v) => set({ viewType: v }),
    }),
    {
      name: "settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ viewType: s.viewType }),
    }
  )
);
