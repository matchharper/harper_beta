import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_STAGES, STAGE_STATUSES, contactOutcome, stageOf } from "./stage";
import type { AgentStatus } from "./types";

const ALL: AgentStatus[] = ["found", "excluded", "no_fit", "matched", "drafted", "approved", "sent", "skipped", "replied", "ended", "failed"];

test("each status has one stage; the 연락 filter also shows the people who replied", () => {
  for (const status of ALL) assert.ok(AGENT_STAGES.includes(stageOf(status)), status);
  assert.deepEqual(ALL.filter((status) => !STAGE_STATUSES.contacted.includes(status) && !STAGE_STATUSES.working.includes(status)
    && !STAGE_STATUSES.excluded.includes(status)), []);
  assert.equal(stageOf("approved"), "working");
  assert.equal(stageOf("no_fit"), "excluded");
  assert.equal(stageOf("failed"), "excluded");
  assert.equal(stageOf("ended"), "contacted");
  assert.equal(stageOf("replied"), "replied");
  assert.ok(STAGE_STATUSES.contacted.includes("replied"));
});

test("a mailed person's furthest step", () => {
  const none = { clicked: false, signedUp: false, interested: false, connected: false };
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["found", "sent"], reached: none }), "sent");
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent", "clicked"] }), "clicked");
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent"], reached: { ...none, clicked: true, signedUp: true } }), "signed_up");
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent"], reached: { ...none, signedUp: true, interested: true, connected: true } }), "connected");
  assert.equal(contactOutcome({ status: "ended", eventKinds: ["sent", "followup_sent", "ended"] }), "ended");
  assert.equal(contactOutcome({ status: "ended", eventKinds: ["sent", "clicked", "unsubscribed"] }), "unsubscribed");
  assert.equal(contactOutcome({ status: "ended", eventKinds: ["sent", "bounced"] }), "bounced");
});
