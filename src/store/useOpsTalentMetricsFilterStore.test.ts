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
