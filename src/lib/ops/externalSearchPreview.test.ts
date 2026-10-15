import test from "node:test";
import assert from "node:assert/strict";
import {
  createPreviewPlanCache,
  previewExternalSearch,
} from "./externalSearchPreview.server";

type Dependencies = NonNullable<Parameters<typeof previewExternalSearch>[2]>;
const userId = "00000000-0000-4000-8000-000000000001";

test("Ops reuses only unchanged completed plans; context, user, saved default and expiry invalidate", async () => {
  let calls = 0,
    time = 0;
  const cache = createPreviewPlanCache(
    async () => {
      calls++;
      return {
        plan: { roleTitles: ["Backend"] },
        titleVectors: [[1]],
        targetSalaryKrw: 100e6,
        planCall: true,
      } as any;
    },
    () => time
  );
  const args = { userId } as any;
  const loaded = { contextFingerprint: "v1", setting: {} } as any;
  const first = await cache(args, loaded);
  first.plan.roleTitles[0] = "mutated";
  const second = await cache(args, loaded);
  assert.equal(calls, 1);
  assert.equal(second.planCall, false);
  assert.equal(second.plan.roleTitles[0], "Backend");
  await cache(args, { ...loaded, contextFingerprint: "v2" });
  await cache({ ...args, userId: "another" }, loaded);
  await cache(args, {
    ...loaded,
    setting: { external_search_default: { revision: "new" } },
  });
  assert.equal(calls, 4);
  time = 5 * 60_000;
  await cache(args, loaded);
  assert.equal(calls, 5);
});

test("preview uses the selected user's runtime plan without saving and retains retrieval order", async () => {
  const loaded = {
    context: { search_brief: [{ content: "Current criteria" }] },
    blockedCompanies: ["Blocked company"],
  } as Awaited<ReturnType<Dependencies["loadExternalContext"]>>;
  const plan = {
    plan: { roleTitles: ["Engineer"] },
    titleVectors: [[0.5]],
    targetSalaryKrw: 100_000_000,
  } as Awaited<ReturnType<Dependencies["getSearchPlan"]>>;
  const admin = {} as ReturnType<Dependencies["getSupabaseAdmin"]>;
  const result = await previewExternalSearch({ talentId: userId }, undefined, {
    getSupabaseAdmin: () => admin,
    loadExternalContext: async (client, id) => {
      assert.equal(client, admin);
      assert.equal(id, userId);
      return loaded;
    },
    getSearchPlan: async (args, context) => {
      assert.equal(args.userId, userId);
      assert.equal(args.dryRun, true);
      assert.equal(args.surface, "worker");
      assert.equal(context, loaded);
      return plan;
    },
    retrieveRoles: async (args) => {
      assert.equal(args.userId, userId);
      assert.equal(args.plan, plan.plan);
      assert.equal(args.vectors, plan.titleVectors);
      assert.equal(args.targetSalaryKrw, 100_000_000);
      assert.equal(args.blockedCompanies, loaded.blockedCompanies);
      assert.equal(args.limit, 500);
      assert.equal(args.listOnly, true);
      return {
        sql: "private SQL",
        rows: [
          {
            role_id: "second",
            role_name: "Engineer",
            salary_min: 80_000_000,
            salary_max: 120_000_000,
            salary_currency: "KRW",
            salary_period: "year",
            salary_is_predicted: true,
            description: "Full JD should not reach the browser",
          },
          { role_id: "first", role_name: "Developer" },
        ],
      };
    },
  });
  assert.deepEqual(
    result.rows.map((row) => row.roleId),
    ["second", "first"]
  );
  assert.equal(result.rows[0].salaryIsPredicted, true);
  assert.equal(result.rows[0].salaryMinKrw, 80_000_000);
  assert.equal(result.rows[1].salaryMinKrw, null);
  assert.equal(result.rows[1].salaryMaxKrw, null);
  assert.ok(!JSON.stringify(result).includes("Full JD"));
  assert.ok(!JSON.stringify(result).includes("private SQL"));
});

test("invalid user identifiers stop before data access or paid calls", async () => {
  const forbidden = () => {
    throw new Error("Must not access data");
  };
  await assert.rejects(
    previewExternalSearch({ talentId: "not-an-id" }, undefined, {
      getSupabaseAdmin: forbidden,
      loadExternalContext: forbidden,
      getSearchPlan: forbidden,
      retrieveRoles: forbidden,
    }),
    (error: unknown) =>
      error instanceof Error && "status" in error && error.status === 400
  );
});
