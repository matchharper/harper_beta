import assert from "node:assert/strict";
import test from "node:test";
import { columnCount, FUNNEL_COLUMNS, inFunnelColumn, tallyAgentPeople, type AgentFunnelRow } from "./funnel";
import {
  AGENT_STAGES, LOG_AFTER_FILTERS, LOG_FIND_FILTERS, afterMatches, contactOutcome, filtersForColumn, inStage, logFiltersMatch, stageOf,
} from "./stage";

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
  { ...base, status: "ended", sentAt: sent, unsubscribed: true, eventKinds: ["sent", "unsubscribed"] },
  { ...base, status: "ended", sentAt: sent, deliveryStatus: "bounced", eventKinds: ["sent", "bounced"] },
];

/** Every number cell's filters pick exactly the people the number counts. */
function assertCellsMatch(rows: typeof people) {
  const numbers = tallyAgentPeople(rows);
  for (const column of FUNNEL_COLUMNS) {
    const shown = rows.filter((row) => logFiltersMatch(filtersForColumn(column), row));
    assert.equal(shown.length, columnCount(numbers, column), column);
    assert.deepEqual(shown, rows.filter((row) => inFunnelColumn(column, row)), column);
  }
}

test("a number cell's filters pick exactly the people the number counts", () => {
  assertCellsMatch(people);
});

test("Ashley 답함 · 답 안 함 · 답장 후 가입: their cells' filters pick exactly their people, all inside 연락", () => {
  const replied = { ...base, status: "replied" as const, sentAt: sent, repliedAt: "2026-11-17T03:00:00Z", eventKinds: ["sent", "replied"] };
  const rows = [
    ...people,
    { ...replied, ashleyRepliedAt: "2026-11-17T04:00:00Z", signedUpAt: "2026-11-17T05:00:00Z" },
    { ...replied, noReplyReason: "돈 요구·악의" },
    { ...replied, ashleyRepliedAt: "2026-11-17T04:00:00Z", noReplyReason: "보통 거절" },
    // Signed up before replying: 가입, not 답장 후 가입.
    { ...replied, signedUpAt: "2026-11-17T01:00:00Z" },
  ];
  assertCellsMatch(rows);
  const numbers = tallyAgentPeople(rows);
  assert.deepEqual([numbers.ashleyReplied, numbers.noReply, numbers.signedUpAfterReply], [2, 2, 1]);
  for (const filter of ["ashley_replied", "no_reply", "signed_up_after_reply"] as const) {
    assert.ok(rows.filter((row) => afterMatches(filter, row)).every((row) => row.sentAt), filter);
  }
});

test("사람에게 넘김 · 답 안 함 · 수신 거부: their cells' filters pick exactly their people, all inside 연락", () => {
  const replied = { ...base, status: "replied" as const, sentAt: sent, repliedAt: "2026-11-17T03:00:00Z", eventKinds: ["sent", "replied"] };
  const rows = [
    ...people,
    { ...replied, handedOffAt: "2026-11-17T04:00:00Z" },
    { ...replied, handedOffAt: "2026-11-17T04:00:00Z", noReplyReason: "연락 그만", unsubscribed: true },
    { ...replied, noReplyReason: "연락 그만", unsubscribed: true },
    // Never mailed (a stray row): counted nowhere.
    { ...base, handedOffAt: "2026-11-17T04:00:00Z", unsubscribed: true, eventKinds: [] },
  ];
  assertCellsMatch(rows);
  const numbers = tallyAgentPeople(rows);
  // 수신 거부: the two here plus the fixture's one link opt-out.
  assert.deepEqual([numbers.handedOff, numbers.noReply, numbers.unsubscribed], [2, 2, 3]);
  assert.deepEqual(filtersForColumn("handedOff"), { stage: null, after: "handed_off", find: null });
  assert.deepEqual(filtersForColumn("unsubscribed"), { stage: null, after: "unsubscribed", find: null });
  for (const filter of ["handed_off", "unsubscribed", "no_reply"] as const) {
    assert.ok(rows.filter((row) => afterMatches(filter, row)).every((row) => row.sentAt), filter);
  }
});

test("every number column has a log filter that shows exactly it", () => {
  for (const column of FUNNEL_COLUMNS) {
    const { stage, after, find } = filtersForColumn(column);
    assert.ok(column === "found" || stage || after || find, column);
  }
});

test("찾기: 이메일 찾기 opens the people a lookup was tried for, 연락 가능 the people with an address, mailed or not", () => {
  const rows = [
    ...people,
    // Tried and found (then mailed), tried and not found (제외), an address on the page (no lookup), a file's address.
    { ...base, status: "sent" as const, sentAt: sent, lookupTried: true, hasEmail: true, eventKinds: ["sent"] },
    { ...base, status: "excluded" as const, excludeReason: "lookup_not_found" as const, lookupTried: true, eventKinds: [] },
    { ...base, status: "matched" as const, hasEmail: true, eventKinds: [] },
    { ...base, source: "applicants-acme", status: "excluded" as const, excludeReason: "member" as const, hasEmail: true, eventKinds: [] },
  ];
  assertCellsMatch(rows);
  assert.deepEqual(filtersForColumn("lookupTried"), { stage: null, after: null, find: "lookupTried" });
  assert.deepEqual(filtersForColumn("withAddress"), { stage: null, after: null, find: "withAddress" });
  const numbers = tallyAgentPeople(rows);
  assert.deepEqual([numbers.lookupTried, numbers.withAddress], [2, 3]);
  // Not a 메일 반응: the 찾기 people are found people, the ones never mailed too.
  for (const find of LOG_FIND_FILTERS) {
    assert.ok(rows.some((row) => logFiltersMatch({ find }, row) && !row.sentAt), find);
    assert.ok(!(LOG_AFTER_FILTERS as readonly string[]).includes(find), find);
  }
  // With 단계 too, both apply (제외 people a lookup was tried for).
  assert.equal(rows.filter((row) => logFiltersMatch({ stage: "excluded", find: "lookupTried" }, row)).length, 1);
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
