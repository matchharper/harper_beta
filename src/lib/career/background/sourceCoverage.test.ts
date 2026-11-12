import assert from "node:assert/strict";
import test from "node:test";
import { careerContactSourceIds } from "./sourceCoverage";

test("message coverage must name its own source receipts, without requiring every source", () => {
  const run = { trigger_payload: { sourceEvents: [{dailySourceId:"closure"},{dailySourceId:"followup"}] } };
  assert.deepEqual(careerContactSourceIds(run,undefined),[]);
  assert.throws(()=>careerContactSourceIds(run,["another-candidate"]),/this invocation/);
  assert.deepEqual(careerContactSourceIds(run,["closure","closure"]),["closure"]);
  assert.deepEqual(careerContactSourceIds(run,[]),[]);
  assert.deepEqual(careerContactSourceIds({trigger_payload:{sourceEvents:[{sourceKind:"agent_contact"}]}},undefined),[]);
});
