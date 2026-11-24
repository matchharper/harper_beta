import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  opsTalentMetricsRollingRange,
  type OpsTalentMetricInterval,
} from "@/lib/ops/talentMetrics";

export type OpsTalentMetricsQuickRangeDays = 30 | 90 | 180;

const QUICK_RANGE_DAYS: readonly OpsTalentMetricsQuickRangeDays[] = [30, 90, 180];

export type OpsTalentMetricsStoredFilters = {
  from: string;
  interval: OpsTalentMetricInterval;
  /**
   * 30/90/180일 버튼으로 고른 기간은 "최근 N일"로 저장해 다시 열 때 오늘 기준으로 다시 계산한다.
   * 날짜를 직접 고른 기간은 null(그 날짜 그대로).
   */
  quickRangeDays: OpsTalentMetricsQuickRangeDays | null;
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

function normalizeQuickRangeDays(value: unknown): OpsTalentMetricsQuickRangeDays | null {
  return QUICK_RANGE_DAYS.find((days) => days === value) ?? null;
}

/**
 * Version 1 kept only dates, so a quick range stayed on the day it was picked. A stored span of exactly
 * 30, 90 or 180 days is taken as that quick range; any other span stays as dates.
 */
export function inferOpsTalentMetricsQuickRangeDays(
  value: Partial<OpsTalentMetricsStoredFilters> | null | undefined
): OpsTalentMetricsQuickRangeDays | null {
  const from = normalizeDateOnly(value?.from);
  const to = normalizeDateOnly(value?.to);
  if (!from || !to) return null;
  const span = Math.abs(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return normalizeQuickRangeDays(span);
}

export function createOpsTalentMetricsPresetRange(
  days: OpsTalentMetricsQuickRangeDays,
  nowMs = Date.now()
) {
  return opsTalentMetricsRollingRange(days, nowMs);
}

export function normalizeOpsTalentMetricsStoredFilters(
  value: Partial<OpsTalentMetricsStoredFilters> | null | undefined,
  nowMs = Date.now()
): OpsTalentMetricsStoredFilters {
  const interval = normalizeInterval(value?.interval);
  const quickRangeDays = normalizeQuickRangeDays(value?.quickRangeDays);
  if (quickRangeDays) {
    return {
      ...createOpsTalentMetricsPresetRange(quickRangeDays, nowMs),
      interval,
      quickRangeDays,
    };
  }

  const from = normalizeDateOnly(value?.from);
  const to = normalizeDateOnly(value?.to);
  if (!from || !to) {
    return { from: "", interval, quickRangeDays: null, to: "" };
  }

  return {
    from: from <= to ? from : to,
    interval,
    quickRangeDays: null,
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
        quickRangeDays: null,
        to: "",
        setDateRange: (from, to) =>
          set((state) =>
            normalizeOpsTalentMetricsStoredFilters({
              from,
              interval: state.interval,
              quickRangeDays: null,
              to,
            })
          ),
        setHasHydrated: (hasHydrated) => set({ hasHydrated }),
        setInterval: (interval) =>
          set({ interval: normalizeInterval(interval) }),
        setQuickRange: (days, nowMs) =>
          set({ ...createOpsTalentMetricsPresetRange(days, nowMs), quickRangeDays: days }),
      }),
      {
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...normalizeOpsTalentMetricsStoredFilters(
            persistedState as Partial<OpsTalentMetricsStoredFilters> | null
          ),
        }),
        migrate: (persistedState, version) => {
          const state = (persistedState ?? {}) as Partial<OpsTalentMetricsStoredFilters>;
          return normalizeOpsTalentMetricsStoredFilters(
            version < 2
              ? { ...state, quickRangeDays: inferOpsTalentMetricsQuickRangeDays(state) }
              : state
          );
        },
        name: "ops-talent-metrics-filters",
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
        partialize: (state) => ({
          from: state.from,
          interval: state.interval,
          quickRangeDays: state.quickRangeDays,
          to: state.to,
        }),
        storage: createJSONStorage(() => localStorage),
        version: 2,
      }
    )
  );
