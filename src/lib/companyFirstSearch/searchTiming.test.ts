import assert from "node:assert/strict";
import test from "node:test";
import {
  readCompanySearchTiming,
  readRoleFirstSearchStart,
  typicalSearchMinutes,
} from "./searchTiming";

type Query = {
  table: string;
  selected: string;
  filters: Array<[string, string, unknown]>;
};
type Answer = { data: unknown; error: unknown };

const now = new Date("2026-10-14T14:20:00Z");
const minutesAgo = (minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();
const run = (minutes: number) => ({
  started_at: "2026-10-01T00:00:00Z",
  finished_at: new Date(Date.parse("2026-10-01T00:00:00Z") + minutes * 60_000).toISOString(),
});
const has = (query: Query, op: string, key: string, value?: unknown) =>
  query.filters.some(([o, k, v]) => o === op && k === key && (value === undefined || v === value));

function fakeAdmin(answer: (query: Query) => Answer) {
  const queries: Query[] = [];
  return {
    queries,
    from(table: string) {
      const query: Query = { table, selected: "", filters: [] };
      queries.push(query);
      const filter = (op: string) => (key: string, value: unknown) => {
        query.filters.push([op, key, value]);
        return builder;
      };
      const builder: any = {
        select(value: string) { query.selected = value; return builder; },
        eq: filter("eq"), in: filter("in"), gte: filter("gte"), lte: filter("lte"),
        not(key: string, op: string, value: unknown) { query.filters.push(["not", key, [op, value]]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { return builder; },
        then(resolve: (value: Answer) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve().then(() => answer(query)).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

/** Recent explicit searches took 14, 29 and 22 minutes; workers are moving. */
function healthyAnswer(query: Query): Answer {
  if (query.selected === "started_at,finished_at") {
    return has(query, "eq", "trigger_reason", "company_requested")
      ? { data: [run(14.4), run(29.2), run(22.1)], error: null }
      : { data: [run(13), run(14)], error: null };
  }
  if (has(query, "lte", "available_at")) return { data: [{ id: "due" }], error: null };
  if (has(query, "gte", "started_at")) return { data: [{ id: "recent" }], error: null };
  if (has(query, "gte", "finished_at")) return { data: [], error: null };
  throw new Error(`Unexpected query: ${JSON.stringify(query)}`);
}

test("typical duration prefers the same kind of search and is rounded to five minutes", () => {
  assert.equal(typicalSearchMinutes([run(14.4), run(29.2), run(22.1)], [run(13)]), 20);
  // Fewer than three explicit searches: use every recent search kind.
  assert.equal(typicalSearchMinutes([run(22)], [run(9), run(13), run(14), run(19)]), 15);
  assert.equal(typicalSearchMinutes([run(1), run(2), run(1)], []), 5);
  assert.equal(typicalSearchMinutes([], []), null);
  assert.equal(
    typicalSearchMinutes([{ started_at: null, finished_at: "x" }, { ...run(10), started_at: "2026-10-02T00:00:00Z" }], []),
    null
  );
});

test("a new explicit search gets the measured duration of recent explicit searches", async () => {
  const admin = fakeAdmin(healthyAnswer);
  const timing = await readCompanySearchTiming({
    admin: admin as any, now, runId: "run-1", status: "queued",
  });
  assert.deepEqual(timing, {
    startedAt: null,
    startedMinutesAgo: null,
    startMayBeDelayed: false,
    typicalMinutes: 20,
  });
  assert.ok(admin.queries.every(query => query.table === "company_first_search_runs"));
  assert.ok(!admin.queries.some(query => has(query, "eq", "id")));
  const typical = admin.queries.filter(query => query.selected === "started_at,finished_at");
  assert.ok(typical.every(query => has(query, "eq", "status", "succeeded")));
});

test("a reused running search reports when it started, in absolute and relative time", async () => {
  const startedAt = minutesAgo(12);
  const admin = fakeAdmin(query =>
    has(query, "eq", "id", "run-9")
      ? { data: { started_at: startedAt }, error: null }
      : healthyAnswer(query));
  const timing = await readCompanySearchTiming({
    admin: admin as any, now, runId: "run-9", status: "already_running",
  });
  assert.equal(timing.startedAt, startedAt);
  assert.equal(timing.startedMinutesAgo, 12);
});

test("searches waiting an hour with nothing started or finished are reported as delayed", async () => {
  const stalled = (query: Query): Answer =>
    has(query, "gte", "started_at") || has(query, "gte", "finished_at")
      ? { data: [], error: null }
      : healthyAnswer(query);
  const timing = await readCompanySearchTiming({
    admin: fakeAdmin(stalled) as any, now, runId: "run-1", status: "queued",
  });
  assert.equal(timing.startMayBeDelayed, true);

  const finishedRecently = (query: Query): Answer =>
    has(query, "gte", "finished_at") ? { data: [{ id: "done" }], error: null } : stalled(query);
  const moving = await readCompanySearchTiming({
    admin: fakeAdmin(finishedRecently) as any, now, runId: "run-1", status: "queued",
  });
  assert.equal(moving.startMayBeDelayed, false);
});

test("a failed timing read leaves that fact out instead of failing the request", async (t) => {
  t.mock.method(console, "warn", () => {});
  const admin = fakeAdmin(query =>
    query.selected === "started_at,finished_at"
      ? { data: null, error: new Error("statement timeout") }
      : healthyAnswer(query));
  const timing = await readCompanySearchTiming({
    admin: admin as any, now, runId: "run-1", status: "already_queued",
  });
  assert.equal(timing.typicalMinutes, null);
  assert.equal(timing.startMayBeDelayed, false);
});

test("Role activation reads the queued first search and checks delay only when it is due", async (t) => {
  t.mock.method(console, "warn", () => {});
  const roleQuery = (startsAt: string, status = "queued") => (query: Query): Answer => {
    if (has(query, "eq", "role_id")) {
      assert.ok(has(query, "eq", "trigger_reason", "role_activated"));
      assert.ok(query.filters.some(([op, key, value]) =>
        op === "in" && key === "status" && JSON.stringify(value) === JSON.stringify(["queued", "running"])));
      return { data: [{ available_at: startsAt, status }], error: null };
    }
    if (has(query, "gte", "started_at") || has(query, "gte", "finished_at")) return { data: [], error: null };
    return healthyAnswer(query);
  };

  const futureAdmin = fakeAdmin(roleQuery("2026-10-16T00:00:00Z"));
  assert.deepEqual(
    await readRoleFirstSearchStart({ admin: futureAdmin as any, now, roleId: "role-1" }),
    { startsAt: "2026-10-16T00:00:00Z", startsNow: false, startMayBeDelayed: false }
  );
  assert.equal(futureAdmin.queries.length, 1);

  assert.deepEqual(
    await readRoleFirstSearchStart({ admin: fakeAdmin(roleQuery(minutesAgo(200))) as any, now, roleId: "role-1" }),
    { startsAt: minutesAgo(200), startsNow: true, startMayBeDelayed: true }
  );

  const none = fakeAdmin(query => has(query, "eq", "role_id") ? { data: [], error: null } : healthyAnswer(query));
  assert.equal(await readRoleFirstSearchStart({ admin: none as any, now, roleId: "role-1" }), null);
  const failed = fakeAdmin(() => ({ data: null, error: new Error("unavailable") }));
  assert.equal(await readRoleFirstSearchStart({ admin: failed as any, now, roleId: "role-1" }), null);
});
