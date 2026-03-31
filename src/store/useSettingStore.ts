// stores/useSettingStore.ts
import {
  CANDIDATE_MARK_STATUS_VALUES,
  type CandidateMarkStatus,
} from "@/lib/candidateMark";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewType = "card" | "table";
export type CandidateSortMode = "best_matched" | "custom";
export type CandidateMarkFilter = CandidateMarkStatus[];
export const SEARCH_CANDIDATE_MARK_FILTER_KEY = "candidate-mark-filter:search";
export const MYLIST_CANDIDATE_MARK_FILTER_KEY = "candidate-mark-filter:mylist";

export function getCandidateMarkFilterStorageKey(isMyList: boolean) {
  return isMyList
    ? MYLIST_CANDIDATE_MARK_FILTER_KEY
    : SEARCH_CANDIDATE_MARK_FILTER_KEY;
}

export function normalizeCandidateMarkFilter(
  statuses: CandidateMarkFilter = []
): CandidateMarkFilter {
  return CANDIDATE_MARK_STATUS_VALUES.filter((status) =>
    statuses.includes(status)
  );
}

type SettingState = {
  viewType: ViewType;
  setViewType: (v: ViewType) => void;
  columnOrderByKey: Record<string, string[]>;
  setColumnOrder: (key: string, order: string[]) => void;
  candidateSortModeByKey: Record<string, CandidateSortMode>;
  setCandidateSortMode: (key: string, mode: CandidateSortMode) => void;
  candidateSortOrderByKey: Record<string, string[]>;
  setCandidateSortOrder: (key: string, order: string[]) => void;
  candidateMarkFilterByKey: Record<string, CandidateMarkFilter>;
  setCandidateMarkFilter: (key: string, statuses: CandidateMarkFilter) => void;
  candidateExcludeUnopenedByKey: Record<string, boolean>;
  setCandidateExcludeUnopened: (key: string, exclude: boolean) => void;
};

export const useSettingStore = create<SettingState>()(
  persist(
    (set) => ({
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
      candidateMarkFilterByKey: {},
      setCandidateMarkFilter: (key, statuses) =>
        set((state) => ({
          candidateMarkFilterByKey: {
            ...state.candidateMarkFilterByKey,
            [key]: normalizeCandidateMarkFilter(statuses),
          },
        })),
      candidateExcludeUnopenedByKey: {},
      setCandidateExcludeUnopened: (key, exclude) =>
        set((state) => ({
          candidateExcludeUnopenedByKey: {
            ...state.candidateExcludeUnopenedByKey,
            [key]: exclude === true,
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
        candidateMarkFilterByKey: s.candidateMarkFilterByKey,
        candidateExcludeUnopenedByKey: s.candidateExcludeUnopenedByKey,
      }),
    }
  )
);
