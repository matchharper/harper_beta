import assert from "node:assert/strict";
import test from "node:test";
import { completeBriefPreparation } from "./briefPreparation";
import { enqueueOrgAgenticMatchingSearch } from "../agent/matchingSearch";

test("search snapshots the saved Brief after an existing writer finishes its canonical save", async () => {
  const events: string[] = [];
  let writing = true;
  // The session has fresh signals, but the evaluation Brief still has the old text.
  let evaluationBrief = "old";
  await completeBriefPreparation({
    isWriting: async (writer) => writer === "signals" && writing,
    refreshSignals: async () => { events.push("signals-current"); },
    refreshSummary: async () => { evaluationBrief += "+summary"; events.push("summary-saved"); },
    wait: async () => { evaluationBrief = "all-audio"; events.push("signals-saved"); writing = false; },
  });
  await enqueueOrgAgenticMatchingSearch({
    admin: { rpc: async () => {
      events.push("enqueue");
      assert.equal(evaluationBrief, "all-audio+summary");
      return { data: { status: "queued", briefVersion: evaluationBrief }, error: null };
    } } as any,
    roleId: "role", userId: "actor", workspaceId: "workspace", requestId: "search",
    input: { scope: "all", startStage: 2 },
  });
  assert.deepEqual(events, ["signals-saved", "signals-current", "summary-saved", "enqueue"]);
});

test("a competing refresh is joined even if it claims the lease after the idle check", async () => {
  let writing = false;
  const saved: string[] = [];
  await completeBriefPreparation({
    isWriting: async () => writing,
    refreshSignals: async () => { writing = true; },
    refreshSummary: async () => { assert.deepEqual(saved, ["signals"]); writing = true; },
    wait: async () => { saved.push(saved.length ? "summary" : "signals"); writing = false; },
  });
  assert.deepEqual(saved, ["signals", "summary"]);
});

test("a preparation failure is propagated before search enqueue without a hidden retry", async () => {
  let calls = 0;
  await assert.rejects(completeBriefPreparation({
    isWriting: async () => false,
    refreshSignals: async () => { calls++; throw new Error("Brief save failed"); },
    refreshSummary: async () => { assert.fail("summary must not run after a save failure"); },
  }), /Brief save failed/);
  assert.equal(calls, 1);
});
