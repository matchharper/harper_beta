// stores/useSettingStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewType = "card" | "table";
export type CandidateSortMode = "best_matched" | "custom";

type SettingState = {
  viewType: ViewType;
  setViewType: (v: ViewType) => void;
  columnOrderByKey: Record<string, string[]>;
  setColumnOrder: (key: string, order: string[]) => void;
  candidateSortModeByKey: Record<string, CandidateSortMode>;
  setCandidateSortMode: (key: string, mode: CandidateSortMode) => void;
  candidateSortOrderByKey: Record<string, string[]>;
  setCandidateSortOrder: (key: string, order: string[]) => void;
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
      candidateSortModeByKey: {},
      setCandidateSortMode: (key, mode) =>
        set((state) => ({
          candidateSortModeByKey: {
            ...state.candidateSortModeByKey,
            [key]: mode,
          },
        })),
      candidateSortOrderByKey: {},
      setCandidateSortOrder: (key, order) =>
        set((state) => ({
          candidateSortOrderByKey: {
            ...state.candidateSortOrderByKey,
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
        candidateSortModeByKey: s.candidateSortModeByKey,
        candidateSortOrderByKey: s.candidateSortOrderByKey,
      }),
    }
  )
);
