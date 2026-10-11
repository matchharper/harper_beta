import assert from "node:assert/strict";
import test from "node:test";
import { fetchActiveInternalFitHoldQuestion, recordInternalFitReevaluationInformation } from "./internalFitHoldQuestion";

const admin = { from() { throw new Error("Retired path must not read or write role criteria"); } } as any;
test("legacy task readers do not resurrect fit-based question lists", async () => {
  assert.equal(await fetchActiveInternalFitHoldQuestion({admin,userId:"fixture-talent"}),null);
});
test("a stale reevaluation tool does not propagate an answer or invoke another model", async () => {
  const result = await recordInternalFitReevaluationInformation({admin,userId:"fixture-talent",fitId:"legacy-fit",newInformation:"Only for this role",source:"chat"});
  assert.equal(result.ok,false);
  assert.equal(result.reason,"retired_tool");
});
