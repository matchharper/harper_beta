import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { OpsTalentMetricInterval } from "@/lib/ops/talentMetrics";

export type OpsTalentMetricsQuickRangeDays = 30 | 90 | 180;

export type OpsTalentMetricsStoredFilters = {
  from: string;
  interval: OpsTalentMetricInterval;
  to: string;
};

type OpsTalentMetricsFilterStoreState = OpsTalentMetricsStoredFilters & {
  hasHydrated: boolean;
  setDateRange: (from: string, to: string) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setInterval: (interval: OpsTalentMetricInterval) => void;
  setQuickRange: (days: OpsTalentMetricsQuickRangeDays, nowMs?: number) => void;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function toKstDateOnly(valueMs: number) {
  return new Date(valueMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function normalizeDateOnly(value: unknown) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }
  return normalized;
}

function normalizeInterval(value: unknown): OpsTalentMetricInterval {
  if (value === "day" || value === "month") return value;
  return "week";
}

export function createOpsTalentMetricsPresetRange(
  days: OpsTalentMetricsQuickRangeDays,
  nowMs = Date.now()
) {
  return {
    from: toKstDateOnly(nowMs - (days - 1) * DAY_MS),
    to: toKstDateOnly(nowMs),
  };
}

export function normalizeOpsTalentMetricsStoredFilters(
  value: Partial<OpsTalentMetricsStoredFilters> | null | undefined
): OpsTalentMetricsStoredFilters {
  const from = normalizeDateOnly(value?.from);
  const to = normalizeDateOnly(value?.to);
  if (!from || !to) {
    return {
      from: "",
      interval: normalizeInterval(value?.interval),
      to: "",
    };
  }

  return {
    from: from <= to ? from : to,
    interval: normalizeInterval(value?.interval),
    to: from <= to ? to : from,
  };
}

export const useOpsTalentMetricsFilterStore =
  create<OpsTalentMetricsFilterStoreState>()(
    persist(
      (set) => ({
        from: "",
        hasHydrated: false,
        interval: "week",
        to: "",
        setDateRange: (from, to) =>
          set((state) =>
            normalizeOpsTalentMetricsStoredFilters({
              from,
              interval: state.interval,
              to,
            })
          ),
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
        setInterval: (interval) =>
          set({ interval: normalizeInterval(interval) }),
        setQuickRange: (days, nowMs) =>
          set(createOpsTalentMetricsPresetRange(days, nowMs)),
      }),
      {
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...normalizeOpsTalentMetricsStoredFilters(
            persistedState as Partial<OpsTalentMetricsStoredFilters> | null
          ),
        }),
        name: "ops-talent-metrics-filters",
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
        partialize: (state) => ({
          from: state.from,
          interval: state.interval,
          to: state.to,
        }),
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    )
  );
