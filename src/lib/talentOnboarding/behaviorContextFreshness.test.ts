import assert from "node:assert/strict";
import test from "node:test";
import { hasPendingBehaviorContextChanges } from "./behaviorContextFreshness";

function createAdmin(result: {
  data: unknown;
  error: { message?: string } | null;
}) {
  const calls: Array<[string, unknown]> = [];
  const query = {
    eq(column: string, value: unknown) {
      calls.push([`eq:${column}`, value]);
      return query;
    },
    gt(column: string, value: unknown) {
      calls.push([`gt:${column}`, value]);
      return query;
    },
    limit(value: number) {
      calls.push(["limit", value]);
      return Promise.resolve(result);
    },
    lte(column: string, value: unknown) {
      calls.push([`lte:${column}`, value]);
      return query;
    },
    order(column: string, value: unknown) {
      calls.push([`order:${column}`, value]);
      return query;
    },
    select(value: string) {
      calls.push(["select", value]);
      return query;
    },
  };

  return {
    admin: {
      from(table: string) {
        calls.push(["from", table]);
        return query;
      },
    },
    calls,
  };
}

test("finds pending changes after the context cursor", async () => {
  const { admin, calls } = createAdmin({ data: [{ id: 43 }], error: null });

  assert.equal(
    await hasPendingBehaviorContextChanges({
      admin,
      lastConsumedChangeId: 42,
      userId: "talent-1",
    }),
    true
  );
  assert.deepEqual(calls, [
    ["from", "talent_behavior_context_changes"],
    ["select", "id"],
    ["eq:talent_id", "talent-1"],
    ["gt:id", 42],
    ["order:id", { ascending: true }],
    ["limit", 1],
  ]);
});

test("limits historical pending changes by occurrence and ingestion time", async () => {
  const { admin, calls } = createAdmin({ data: [], error: null });
  const asOf = "2026-08-13T00:00:00.000Z";

  assert.equal(
    await hasPendingBehaviorContextChanges({
      admin,
      asOf,
      lastConsumedChangeId: 42,
      userId: "talent-1",
    }),
    false
  );
  assert.ok(
    calls.some(([name, value]) => name === "lte:occurred_at" && value === asOf)
  );
  assert.ok(
    calls.some(([name, value]) => name === "lte:created_at" && value === asOf)
  );
});

test("fails closed when the pending-change lookup fails", async () => {
  const { admin } = createAdmin({
    data: null,
    error: { message: "database unavailable" },
  });

  await assert.rejects(
    hasPendingBehaviorContextChanges({
      admin,
      lastConsumedChangeId: 42,
      userId: "talent-1",
    }),
    /database unavailable/
  );
});
