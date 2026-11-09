import assert from "node:assert/strict";
import test from "node:test";
import { setOpportunityStages } from "./opportunityStages";
import { formatCareerMatchingResult } from "./formatters";

function client(found = true, currentId = "rec") {
  const filters: unknown[] = [], writes: any[] = [];
  const query = { select: () => query, eq: (key: string, value: unknown) => {
    filters.push([key, value]); return query;
  }, maybeSingle: async () => ({ data: found ? { id: "rec", role_id: "role" } : null, error: null }) };
  const admin = { from: () => query, rpc: async (name: string, input: any) => {
    writes.push({ name, input });
    return { data: name === "current_talent_recommendation_for_talent_v1" ? currentId : null, error: null };
  } } as any;
  return { admin, filters, writes };
}

test("closing uses the owned Jobs stage executor without changing candidate feedback", async () => {
  const c = client();
  const result = await setOpportunityStages({ admin: c.admin, userId: "owner", items: [{ roleId: "role", savedStage: "closed" }] });
  assert.deepEqual(c.filters, [["talent_id", "owner"], ["role_id", "role"]]);
  assert.deepEqual(c.writes.at(-1), { name: "move_talent_role_saved_stage_v1", input: {
    p_record_activity: true, p_recommendation_id: "rec", p_saved_stage: "closed", p_talent_id: "owner",
  } });
  assert.match(formatCareerMatchingResult(result), /saved stage closed/);
});

test("missing ownership and superseded recommendations cannot be moved", async () => {
  for (const c of [client(false), client(true, "replacement")]) {
    const result = await setOpportunityStages({ admin: c.admin, userId: "owner", items: [{ recommendationId: "rec", savedStage: "closed" }] });
    assert.ok(result.stageUpdates[0].error);
    assert.equal(result.status, "failed");
    assert.equal(c.writes.some(w => w.name === "move_talent_role_saved_stage_v1"), false);
  }
});
