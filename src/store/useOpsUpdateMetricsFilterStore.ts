import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createOpsTalentMetricsPresetRange,
  normalizeOpsTalentMetricsStoredFilters,
  type OpsTalentMetricsQuickRangeDays,
} from "@/store/useOpsTalentMetricsFilterStore";

// 배포 후 실험중인 지표의 범위와 단위. /ops/metrics와 같은 30·90·180일 버튼과 직접 선택을 쓰고, 단위는 일·주만 둔다.

export type OpsUpdateMetricsInterval = "day" | "week";

type State = {
  from: string;
  hasHydrated: boolean;
  interval: OpsUpdateMetricsInterval;
  quickRangeDays: OpsTalentMetricsQuickRangeDays | null;
  setDateRange: (from: string, to: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setInterval: (interval: OpsUpdateMetricsInterval) => void;
  setQuickRange: (days: OpsTalentMetricsQuickRangeDays) => void;
  to: string;
};

const normalizeInterval = (value: unknown): OpsUpdateMetricsInterval =>
  value === "week" ? "week" : "day";

export const useOpsUpdateMetricsFilterStore = create<State>()(
  persist(
    (set) => ({
      from: "",
      hasHydrated: false,
      interval: "day",
      quickRangeDays: null,
      setDateRange: (from, to) => {
        const range = normalizeOpsTalentMetricsStoredFilters({ from, quickRangeDays: null, to });
        set({ from: range.from, quickRangeDays: null, to: range.to });
      },
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setInterval: (interval) => set({ interval: normalizeInterval(interval) }),
      setQuickRange: (days) =>
        set({ ...createOpsTalentMetricsPresetRange(days), quickRangeDays: days }),
      to: "",
    }),
    {
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<State>;
        const range = normalizeOpsTalentMetricsStoredFilters(stored);
        return {
          ...current,
          from: range.from,
          interval: normalizeInterval(stored.interval),
          quickRangeDays: range.quickRangeDays,
          to: range.to,
        };
      },
      name: "ops-update-metrics-filters",
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      partialize: (state) => ({
        from: state.from,
        interval: state.interval,
        quickRangeDays: state.quickRangeDays,
        to: state.to,
      }),
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
