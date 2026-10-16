import assert from "node:assert/strict";
import test from "node:test";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { fetchOpsTaskCosts, taskCostReceipt } from "./taskCostServer";
import { summarizeTaskCosts, taskGroupForSource } from "./taskCosts";

test("counts original receipts once and keeps unknown cost visible", () => {
  const base = {
    id: 1,
    source: "career/chat",
    model: "model-a",
    cost: 2,
    cost_status: "estimated",
  };
  assert.equal(
    taskCostReceipt({ ...base, costKind: "attribution" }, null, "2026-10-15"),
    null
  );
  assert.equal(
    taskCostReceipt(
      { ...base, cost: null, status: "queued" },
      "opportunity_discovery",
      "2026-10-15"
    ),
    null
  );
  const known = taskCostReceipt(base, null, "2026-10-15")!;
  const unknown = taskCostReceipt(
    { ...base, id: 2, cost: 0, cost_status: "unpriced" },
    null,
    "2026-10-16"
  )!;
  const partial = taskCostReceipt(
    { ...base, id: 3, unpriced: 1 },
    "opportunity_discovery",
    "2026-10-16"
  )!;
  assert.equal(unknown.unpricedRecords, 1);
  assert.equal(partial.amount, 2);
  assert.equal(partial.unpricedRecords, 1);
  assert.equal(
    taskGroupForSource("career_tool:recommend_job_postings"),
    "recommendation"
  );
  assert.equal(taskGroupForSource("company_first_search"), "company");
  assert.equal(taskGroupForSource("future_task"), "other");
  assert.equal(
    summarizeTaskCosts([known, unknown, partial], "2026-10-15")[0].records,
    1
  );
  assert.equal(
    summarizeTaskCosts([known, unknown, partial], null).reduce(
      (s, g) => s + g.amount,
      0
    ),
    4
  );
  assert.equal(
    summarizeTaskCosts([known, unknown, partial], "2026-10-14").length,
    0
  );
});

test("reads beyond 1,000 rows without double-counting Worker summary copies", async () => {
  const cursors: unknown[] = [];
  const admin = {
    from(table: string) {
      let lastId = 0;
      const query = {
        select() {
          return query;
        },
        gte() {
          return query;
        },
        lt() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        abortSignal() {
          return query;
        },
        gt(_field: string, id: number) {
          lastId = id;
          cursors.push(id);
          return query;
        },
        then(resolve: (result: unknown) => unknown) {
          const data =
            table === "llm_logs"
              ? lastId
                ? [
                    {
                      id: 1001,
                      source: "career/chat",
                      model: "a",
                      cost: 0,
                      cost_status: "unpriced",
                    },
                  ]
                : Array.from({ length: 1000 }, (_, i) => ({
                    id: i + 1,
                    source: "career/chat",
                    model: "a",
                    cost: 0.01,
                    cost_status: "estimated",
                  }))
              : table === "opportunity_discovery_run"
                ? [{ id: "worker", cost: 5, status: "completed" }]
                : [{ id: "company", cost: 1, status: "succeeded" }];
          return Promise.resolve(resolve({ data, error: null }));
        },
      };
      return query;
    },
  } as unknown as TalentAdminClient;
  const response = await fetchOpsTaskCosts(admin, {
    from: "2026-10-15",
    through: "2026-10-15",
    endExclusive: "2026-10-16",
  });
  assert.deepEqual(cursors, [1000]);
  const totals = summarizeTaskCosts(response.rows, null);
  assert.ok(Math.abs(totals.reduce((sum, g) => sum + g.amount, 0) - 16) < 1e-9);
  assert.equal(
    totals.reduce((sum, g) => sum + g.records, 0),
    1003
  );
  assert.equal(
    totals.reduce((sum, g) => sum + g.unpricedRecords, 0),
    1
  );
});
