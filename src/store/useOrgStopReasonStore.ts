import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_ORG_STOP_REASONS = [
  "너무 주니어",
  "너무 시니어",
  "높은 연봉을 요구할 것 같음",
  "이미 대화해본 후보자",
  "위치/지역 조건 불일치",
] as const;

const DEFAULT_ORG_STOP_REASON_SET = new Set<string>(DEFAULT_ORG_STOP_REASONS);

const isShortStopReason = (value: string) =>
  value.length > 0 && Array.from(value).length <= 20;

export function normalizeSavedOrgStopReasons(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(
          (item) =>
            isShortStopReason(item) && !DEFAULT_ORG_STOP_REASON_SET.has(item)
        )
    )
  );
}

export function extractCustomOrgStopReasons(
  note: string,
  knownReasons: readonly string[]
) {
  const knownReasonSet = new Set(knownReasons);

  return Array.from(
    new Set(
      note
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => isShortStopReason(line) && !knownReasonSet.has(line))
    )
  );
}

type OrgStopReasonStoreState = {
  savedReasons: string[];
  rememberReasons: (reasons: string[]) => void;
};

export const useOrgStopReasonStore = create<OrgStopReasonStoreState>()(
  persist(
    (set) => ({
      savedReasons: [],
      rememberReasons: (reasons) =>
        set((state) => ({
          savedReasons: normalizeSavedOrgStopReasons([
            ...state.savedReasons,
            ...reasons,
          ]),
        })),
    }),
    {
      name: "org-stop-reasons",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ savedReasons: state.savedReasons }),
      merge: (persistedState, currentState) => {
        const state = persistedState as Partial<OrgStopReasonStoreState> | null;

        return {
          ...currentState,
          savedReasons: normalizeSavedOrgStopReasons(state?.savedReasons),
        };
      },
    }
  )
);
