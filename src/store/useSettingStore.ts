// stores/useSettingStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewType = "card" | "table";

type SettingState = {
  viewType: ViewType;
  setViewType: (v: ViewType) => void;
  columnOrderByKey: Record<string, string[]>;
  setColumnOrder: (key: string, order: string[]) => void;
};

export const useSettingStore = create<SettingState>()(
  persist(
    (set, get) => ({
      viewType: "card",
      setViewType: (v) => set({ viewType: v }),
      columnOrderByKey: {},
      setColumnOrder: (key, order) =>
        set((state) => ({
          columnOrderByKey: {
            ...state.columnOrderByKey,
            [key]: order,
          },
        })),
    }),
    {
      name: "settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        viewType: s.viewType,
        columnOrderByKey: s.columnOrderByKey,
      }),
    }
  )
);
