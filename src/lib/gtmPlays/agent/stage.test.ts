import assert from "node:assert/strict";
import test from "node:test";
import { FUNNEL_COLUMNS, inFunnelColumn, tallyAgentPeople, type AgentFunnelRow } from "./funnel";
import { AGENT_STAGES, LOG_AFTER_FILTERS, afterMatches, contactOutcome, filtersForColumn, inStage, stageOf } from "./stage";

const base: AgentFunnelRow = {
  source: "linkedin", status: "found", excludeReason: null, channel: null, sentAt: null, clickedAt: null,
  signedUpAt: null, repliedAt: null, interested: false, connected: false, costUsd: 0,
};
const sent = "2026-11-17T00:00:00Z";
const people: Array<AgentFunnelRow & { eventKinds: string[] }> = [
  { ...base, eventKinds: [] },
  { ...base, status: "approved", eventKinds: [] },
  { ...base, status: "excluded", excludeReason: "no_email", eventKinds: [] },
  { ...base, status: "no_fit", eventKinds: [] },
  { ...base, status: "failed", eventKinds: [] },
  { ...base, status: "sent", sentAt: sent, eventKinds: ["sent"] },
  { ...base, status: "sent", sentAt: sent, clickedAt: sent, eventKinds: ["sent", "clicked"] },
  { ...base, status: "sent", sentAt: sent, signedUpAt: sent, interested: true, eventKinds: ["sent"] },
  { ...base, status: "sent", sentAt: sent, signedUpAt: sent, interested: true, connected: true, eventKinds: ["sent"] },
  { ...base, status: "replied", sentAt: sent, repliedAt: sent, eventKinds: ["sent", "replied"] },
  { ...base, status: "ended", sentAt: sent, eventKinds: ["sent", "followup_sent", "ended"] },
  { ...base, status: "ended", sentAt: sent, eventKinds: ["sent", "unsubscribed"] },
  { ...base, status: "ended", sentAt: sent, eventKinds: ["sent", "bounced"] },
];

test("a number cell's filters pick exactly the people the number counts", () => {
  const numbers = tallyAgentPeople(people);
  const count: Record<(typeof FUNNEL_COLUMNS)[number], number> = {
    found: numbers.found, excluded: numbers.excluded, contacted: numbers.contacted, clicked: numbers.clicked,
    signedUp: numbers.signedUp, interested: numbers.interested, connected: numbers.connected, replied: numbers.replied,
  };
  for (const column of FUNNEL_COLUMNS) {
    const { stage, after } = filtersForColumn(column);
    const shown = people.filter((row) => (!stage || inStage(stage, row)) && (!after || afterMatches(after, row)));
    assert.equal(shown.length, count[column], column);
    assert.deepEqual(shown, people.filter((row) => inFunnelColumn(column, row)), column);
  }
});

test("stages: 찾음 = 처리 중 + 제외 + 연락, 답장 is inside 연락", () => {
  const by = (stage: (typeof AGENT_STAGES)[number]) => people.filter((row) => inStage(stage, row)).length;
  assert.equal(by("working") + by("excluded") + by("contacted"), people.length);
  assert.deepEqual([by("working"), by("excluded"), by("contacted"), by("replied")], [2, 3, 8, 1]);
  assert.equal(stageOf(people[9]), "replied");
  assert.equal(stageOf(people[4]), "excluded");
  assert.equal(stageOf(people[1]), "working");
});

test("그 뒤: 반응 없음 is mailed with no click, reply, opt-out or bounce; every filter is a subset of 연락", () => {
  const pick = (filter: (typeof LOG_AFTER_FILTERS)[number]) => people.filter((row) => afterMatches(filter, row)).length;
  assert.equal(pick("none"), 2);
  assert.equal(pick("clicked"), 3);
  assert.equal(pick("unsubscribed"), 1);
  assert.equal(pick("bounced"), 1);
  for (const filter of LOG_AFTER_FILTERS) {
    assert.ok(people.filter((row) => afterMatches(filter, row)).every((row) => row.sentAt), filter);
  }
});

test("a mailed person's furthest step", () => {
  const none = { clicked: false, signedUp: false, interested: false, connected: false };
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent"], reached: none }), "sent");
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent"], reached: { ...none, clicked: true } }), "clicked");
  assert.equal(contactOutcome({ status: "sent", eventKinds: ["sent"], reached: { ...none, clicked: true, signedUp: true, connected: true } }), "connected");
  assert.equal(contactOutcome({ status: "ended", eventKinds: ["sent", "followup_sent", "ended"] }), "ended");
  assert.equal(contactOutcome({ status: "ended", eventKinds: ["sent", "unsubscribed"] }), "unsubscribed");
});
