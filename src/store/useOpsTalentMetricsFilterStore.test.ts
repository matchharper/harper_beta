import assert from "node:assert/strict";
import test, { before } from "node:test";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

let metricsStoreModule: typeof import("@/store/useOpsTalentMetricsFilterStore");

before(async () => {
  metricsStoreModule = await import("@/store/useOpsTalentMetricsFilterStore");
});

test("creates inclusive quick ranges using the KST calendar date", () => {
  const { createOpsTalentMetricsPresetRange } = metricsStoreModule;
  const nowMs = Date.UTC(2026, 8, 8, 10, 0, 0);

  assert.deepEqual(createOpsTalentMetricsPresetRange(30, nowMs), {
    from: "2026-08-10",
    to: "2026-09-08",
  });
  assert.deepEqual(createOpsTalentMetricsPresetRange(180, nowMs), {
    from: "2026-03-13",
    to: "2026-09-08",
  });
});

test("normalizes persisted dates and intervals", () => {
  const { normalizeOpsTalentMetricsStoredFilters } = metricsStoreModule;
  assert.deepEqual(
    normalizeOpsTalentMetricsStoredFilters({
      from: "2026-09-08",
      interval: "day",
      to: "2026-09-01",
    }),
    {
      from: "2026-09-01",
      interval: "day",
      quickRangeDays: null,
      to: "2026-09-08",
    }
  );

  assert.deepEqual(
    normalizeOpsTalentMetricsStoredFilters({
      from: "2026-02-30",
      interval: "month",
      to: "2026-09-08",
    }),
    {
      from: "",
      interval: "month",
      quickRangeDays: null,
      to: "",
    }
  );
});

test("persists and rehydrates the selected date range and interval", async () => {
  const { useOpsTalentMetricsFilterStore } = metricsStoreModule;
  useOpsTalentMetricsFilterStore.getState().setInterval("month");
  useOpsTalentMetricsFilterStore
    .getState()
    .setDateRange("2026-08-01", "2026-09-08");

  const stored = storage.getItem("ops-talent-metrics-filters");
  assert.ok(stored);

  useOpsTalentMetricsFilterStore.setState({
    from: "",
    hasHydrated: false,
    interval: "week",
    quickRangeDays: null,
    to: "",
  });
  storage.setItem("ops-talent-metrics-filters", stored);
  await useOpsTalentMetricsFilterStore.persist.rehydrate();

  assert.deepEqual(
    {
      from: useOpsTalentMetricsFilterStore.getState().from,
      hasHydrated: useOpsTalentMetricsFilterStore.getState().hasHydrated,
      interval: useOpsTalentMetricsFilterStore.getState().interval,
      to: useOpsTalentMetricsFilterStore.getState().to,
    },
    {
      from: "2026-08-01",
      hasHydrated: true,
      interval: "month",
      to: "2026-09-08",
    }
  );
});

test("a quick range is kept as the last N days and moves with today", async () => {
  const { normalizeOpsTalentMetricsStoredFilters, useOpsTalentMetricsFilterStore } = metricsStoreModule;
  const pickedMs = Date.UTC(2026, 10, 2, 3, 0, 0); // 11.02 KST
  useOpsTalentMetricsFilterStore.getState().setQuickRange(90, pickedMs);
  assert.equal(useOpsTalentMetricsFilterStore.getState().quickRangeDays, 90);
  const stored = storage.getItem("ops-talent-metrics-filters");
  assert.ok(stored);

  // Opened again two weeks later: the range ends today, not on the day it was picked.
  const reopenedMs = Date.UTC(2026, 10, 16, 1, 0, 0); // 11.16 KST
  const persisted = JSON.parse(stored).state;
  assert.deepEqual(normalizeOpsTalentMetricsStoredFilters(persisted, reopenedMs), {
    from: "2026-08-19",
    interval: "month",
    quickRangeDays: 90,
    to: "2026-11-16",
  });

  // Picking dates by hand keeps those dates.
  useOpsTalentMetricsFilterStore.getState().setDateRange("2026-10-01", "2026-10-31");
  assert.equal(useOpsTalentMetricsFilterStore.getState().quickRangeDays, null);
  assert.deepEqual(
    normalizeOpsTalentMetricsStoredFilters(
      JSON.parse(storage.getItem("ops-talent-metrics-filters") ?? "{}").state,
      reopenedMs
    ),
    { from: "2026-10-01", interval: "month", quickRangeDays: null, to: "2026-10-31" }
  );
});

test("version 1 dates spanning exactly 30, 90 or 180 days become that quick range", async () => {
  const { inferOpsTalentMetricsQuickRangeDays, useOpsTalentMetricsFilterStore } = metricsStoreModule;
  assert.equal(inferOpsTalentMetricsQuickRangeDays({ from: "2026-08-10", to: "2026-11-07" }), 90);
  assert.equal(inferOpsTalentMetricsQuickRangeDays({ from: "2026-10-09", to: "2026-11-07" }), 30);
  assert.equal(inferOpsTalentMetricsQuickRangeDays({ from: "2026-10-01", to: "2026-10-31" }), null);
  assert.equal(inferOpsTalentMetricsQuickRangeDays({ from: "", to: "2026-10-31" }), null);

  storage.setItem(
    "ops-talent-metrics-filters",
    JSON.stringify({ state: { from: "2026-08-10", interval: "day", to: "2026-11-07" }, version: 1 })
  );
  await useOpsTalentMetricsFilterStore.persist.rehydrate();
  const state = useOpsTalentMetricsFilterStore.getState();
  assert.equal(state.quickRangeDays, 90);
  assert.equal(state.interval, "day");
  // Recomputed from today, so it no longer ends on 11.07.
  assert.notEqual(state.to, "2026-11-07");
  assert.equal(
    (Date.parse(`${state.to}T00:00:00Z`) - Date.parse(`${state.from}T00:00:00Z`)) / 86_400_000 + 1,
    90
  );
});
