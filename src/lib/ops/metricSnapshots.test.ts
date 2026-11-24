import assert from "node:assert/strict";
import test from "node:test";
import {
  OPS_METRIC_SNAPSHOT_REFRESH_LEASE_MS,
  OPS_METRIC_SNAPSHOT_STALE_MS,
  opsMetricExclusionKey,
  readOpsMetricSnapshot,
  type OpsMetricSnapshotRow,
  type OpsMetricSnapshotStore,
} from "@/lib/ops/metricSnapshots";
import { opsTalentMetricsSnapshotRange } from "@/lib/ops/talentMetrics";

const T0 = Date.parse("2026-11-23T03:00:00.000Z");

/** Same claim rule as the Supabase store's conditional update. */
function memoryStore(clock: { now: number }) {
  const rows = new Map<string, OpsMetricSnapshotRow>();
  const store: OpsMetricSnapshotStore = {
    async claimRefresh(key, { retryFailed, staleLeaseBefore }) {
      const row = rows.get(key);
      if (!row) return false;
      const free =
        row.refreshStartedAt === null ||
        Date.parse(row.refreshStartedAt) < staleLeaseBefore.getTime() ||
        (retryFailed && row.refreshError !== null);
      if (!free) return false;
      rows.set(key, {
        ...row,
        refreshError: null,
        refreshStartedAt: new Date(clock.now).toISOString(),
      });
      return true;
    },
    async failRefresh(key, message) {
      const row = rows.get(key);
      if (row) rows.set(key, { ...row, refreshError: message });
    },
    async read(key) {
      return rows.get(key) ?? null;
    },
    async save(key, value, computedBy) {
      const computedAt = new Date(clock.now).toISOString();
      rows.set(key, {
        computedAt,
        computedBy,
        refreshError: null,
        refreshStartedAt: null,
        value,
      });
      return computedAt;
    },
  };
  return { rows, store };
}

function harness() {
  const clock = { now: T0 };
  const { rows, store } = memoryStore(clock);
  const scheduled: Array<() => Promise<void>> = [];
  let computeCount = 0;
  let nextValue: (() => { n: number }) | null = null;
  const read = (overrides: { build?: string; force?: boolean } = {}) =>
    readOpsMetricSnapshot<{ n: number }>({
      build: overrides.build ?? "dpl_1",
      compute: async () => {
        computeCount += 1;
        return nextValue ? nextValue() : { n: computeCount };
      },
      force: overrides.force,
      key: "production:update-metrics:2026-11-20:",
      nowMs: clock.now,
      schedule: (task) => scheduled.push(task),
      store,
    });
  return {
    clock,
    computeCount: () => computeCount,
    read,
    rows,
    runScheduled: async () => {
      for (const task of scheduled.splice(0)) await task();
    },
    scheduled,
    setNextValue: (value: (() => { n: number }) | null) => {
      nextValue = value;
    },
  };
}

test("first view waits for the computation and stores it", async () => {
  const h = harness();
  const result = await h.read();
  assert.equal(result.n, 1);
  assert.deepEqual(result.snapshot, {
    computedAt: new Date(T0).toISOString(),
    refreshError: null,
    refreshing: false,
  });
  assert.equal(h.rows.size, 1);
});

test("a recent snapshot is returned without computing", async () => {
  const h = harness();
  await h.read();
  h.clock.now += OPS_METRIC_SNAPSHOT_STALE_MS - 1;
  const result = await h.read();
  assert.equal(result.n, 1);
  assert.equal(result.snapshot.refreshing, false);
  assert.equal(h.computeCount(), 1);
  assert.equal(h.scheduled.length, 0);
});

test("a stale snapshot is returned at once and recomputed after the response", async () => {
  const h = harness();
  await h.read();
  h.clock.now += OPS_METRIC_SNAPSHOT_STALE_MS;
  const stale = await h.read();
  assert.equal(stale.n, 1);
  assert.equal(stale.snapshot.refreshing, true);
  assert.equal(h.computeCount(), 1);

  // Other views while it runs: same value, no second refresh.
  const polling = await h.read();
  assert.equal(polling.snapshot.refreshing, true);
  assert.equal(h.scheduled.length, 1);

  await h.runScheduled();
  const fresh = await h.read();
  assert.equal(fresh.n, 2);
  assert.deepEqual(fresh.snapshot, {
    computedAt: new Date(h.clock.now).toISOString(),
    refreshError: null,
    refreshing: false,
  });
});

test("a new deployment recomputes even a recent snapshot", async () => {
  const h = harness();
  await h.read({ build: "dpl_1" });
  const result = await h.read({ build: "dpl_2" });
  assert.equal(result.n, 1);
  assert.equal(result.snapshot.refreshing, true);
  await h.runScheduled();
  assert.equal(h.rows.get("production:update-metrics:2026-11-20:")?.computedBy, "dpl_2");
});

test("a failed refresh keeps the last value, shows the error and is not retried until its lease ends", async () => {
  const h = harness();
  await h.read();
  h.clock.now += OPS_METRIC_SNAPSHOT_STALE_MS;
  await h.read();
  h.setNextValue(() => {
    throw new Error("statement timeout");
  });
  const consoleError = console.error;
  console.error = () => {};
  try {
    await h.runScheduled();
  } finally {
    console.error = consoleError;
  }

  const failed = await h.read();
  assert.equal(failed.n, 1);
  assert.equal(failed.snapshot.refreshing, false);
  assert.equal(failed.snapshot.refreshError, "statement timeout");
  assert.equal(h.scheduled.length, 0);

  // The refresh button retries right away.
  h.setNextValue(null);
  const retried = await h.read({ force: true });
  assert.equal(retried.snapshot.refreshing, true);
  assert.equal(retried.snapshot.refreshError, null);
  await h.runScheduled();
  assert.equal((await h.read()).snapshot.refreshError, null);
});

test("a refresh that died with its function is taken over after the lease", async () => {
  const h = harness();
  await h.read();
  h.clock.now += OPS_METRIC_SNAPSHOT_STALE_MS;
  await h.read();
  h.scheduled.splice(0); // the function ended before its refresh ran

  h.clock.now += OPS_METRIC_SNAPSHOT_REFRESH_LEASE_MS - 1;
  assert.equal((await h.read()).snapshot.refreshing, true);
  assert.equal(h.scheduled.length, 0);

  h.clock.now += 2;
  assert.equal((await h.read()).snapshot.refreshing, true);
  assert.equal(h.scheduled.length, 1);
});

test("the refresh button recomputes a recent snapshot", async () => {
  const h = harness();
  await h.read();
  const result = await h.read({ force: true });
  assert.equal(result.snapshot.refreshing, true);
  await h.runScheduled();
  assert.equal((await h.read()).n, 2);
});

test("quick ranges keep one snapshot per span and are recomputed for the current dates", () => {
  const nowMs = Date.parse("2026-11-23T01:00:00.000Z"); // 2026-11-23 10:00 KST
  const last90 = opsTalentMetricsSnapshotRange({ from: "2026-08-26", to: "2026-11-23" }, nowMs);
  assert.equal(last90.key, "last90");
  assert.deepEqual(last90.resolve(nowMs + 24 * 60 * 60 * 1_000), {
    from: "2026-08-27",
    to: "2026-11-24",
  });

  const custom = opsTalentMetricsSnapshotRange({ from: "2026-08-25", to: "2026-11-23" }, nowMs);
  assert.equal(custom.key, "2026-08-25~2026-11-23");
  assert.deepEqual(custom.resolve(nowMs + 24 * 60 * 60 * 1_000), {
    from: "2026-08-25",
    to: "2026-11-23",
  });
});

test("exclusion terms form the same key in any order or case", () => {
  assert.equal(opsMetricExclusionKey([" B@x.com", "a@x.com", "b@x.com", ""]), "a@x.com,b@x.com");
});
