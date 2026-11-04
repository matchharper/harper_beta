import assert from "node:assert/strict";
import test from "node:test";
import { internalScoringDatabase } from "./database";

// Explicit opt-in: exercises the deployed Postgres protocol, using only SELECT
// in a read-only transaction. PGlite does not reproduce postgres.js binding.
test("Postgres keeps serialized evaluation payloads as JSON objects and arrays", {
  skip: process.env.HARPER_INTERNAL_SCORING_DB_TEST !== "1",
}, async () => {
  const db = internalScoringDatabase();
  const payload = {
    executor: "career_internal_beta_v1",
    roleIds: ["30000000-0000-4000-8000-000000000001"],
    sourceEvents: [],
  };
  await db.transaction(async (query) => {
    await query("SET TRANSACTION READ ONLY");
    const [row] = await query(
      "SELECT $1::jsonb AS payload, $1::jsonb->>'executor' AS executor, $2::jsonb AS events, $3::uuid[] AS roles",
      [JSON.stringify(payload), JSON.stringify([{ kind: "fixture" }]), payload.roleIds],
    );
    assert.deepEqual(row.payload, payload);
    assert.equal(row.executor, payload.executor);
    assert.deepEqual(row.events, [{ kind: "fixture" }]);
    assert.deepEqual(row.roles, payload.roleIds);
  });
  const [row] = await db.query("SELECT $1::jsonb AS coverage", [
    JSON.stringify({ evaluationIds: [], failures: [] }),
  ]);
  assert.deepEqual(row.coverage, { evaluationIds: [], failures: [] });
});
