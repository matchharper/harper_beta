import test from "node:test";
import assert from "node:assert/strict";
import { completeRun } from "./runs";

test("successful completion clears prior errors only on the completed run", async () => {
  const filters: unknown[] = [];
  const query: any = {
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
  };
  const rows = [{ id: "recommendation", role_id: "role" }];
  const admin: any = {
    rpc: async () => ({ data: rows, error: null }),
    from: (table: string) => {
      assert.equal(table, "external_recommendation_runs");
      return {
        update: (patch: unknown) => {
          assert.deepEqual(patch, { error: null });
          return query;
        },
      };
    },
  };
  assert.deepEqual(await completeRun(admin, "run", []), rows);
  assert.deepEqual(filters, [
    ["id", "run"],
    ["status", "completed"],
  ]);
});

test("failed completion does not clear error or pretend recommendations were saved", async () => {
  const admin: any = {
    rpc: async () => ({ error: { message: "lease mismatch" } }),
    from: () => assert.fail("Must not clear failed completion"),
  };
  await assert.rejects(completeRun(admin, "run", []), /lease mismatch/);
});
