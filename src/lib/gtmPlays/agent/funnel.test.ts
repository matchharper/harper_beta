import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AGENT_EXCLUDE_BUCKETS, agentFunnelBySource, agentRate, columnCount, excludeBucket, FUNNEL_COLUMNS, inFunnelColumn, tallyAgentPeople,
  type AgentFunnelRow,
} from "./funnel";

const base: AgentFunnelRow = {
  source: "linkedin", status: "found", excludeReason: null, channel: null, sentAt: null, clickedAt: null,
  signedUpAt: null, repliedAt: null, interested: false, connected: false, costUsd: 0,
};
const row = (patch: Partial<AgentFunnelRow>): AgentFunnelRow => ({ ...base, ...patch });

test("each step counts its own people; a sign-up is a click too", () => {
  const numbers = tallyAgentPeople([
    row({ status: "excluded", excludeReason: "member", costUsd: 0 }),
    row({ status: "excluded", excludeReason: "member" }),
    row({ status: "excluded", excludeReason: "recent_contact" }),
    row({ status: "no_fit", costUsd: 0.05 }),
    row({ status: "drafted" }),
    row({ status: "sent", channel: "email", sentAt: "2026-11-17T00:00:00Z", clickedAt: "2026-11-17T01:00:00Z", costUsd: 0.12 }),
    row({ status: "sent", channel: "email", sentAt: "2026-11-17T00:00:00Z", signedUpAt: "2026-11-17T02:00:00Z", interested: true, connected: true }),
    row({ status: "replied", channel: "email", sentAt: "2026-11-17T00:00:00Z", repliedAt: "2026-11-17T03:00:00Z" }),
    row({ status: "skipped" }),
  ]);
  assert.equal(numbers.found, 9);
  // 맞는 회사 없음 and left out by Ops are 제외 too: every person is in one of 제외 / 대기 / 연락.
  assert.equal(numbers.excluded, 5);
  assert.deepEqual(numbers.excludedBy, { member: 2, recent_contact: 1, no_fit: 1, skipped: 1 });
  assert.equal(numbers.waiting, 1);
  assert.equal(numbers.excluded + numbers.waiting + numbers.contacted, numbers.found);
  assert.equal(numbers.contacted, 3);
  assert.deepEqual(numbers.contactedBy, { email: 3 });
  assert.equal(numbers.clicked, 2);
  assert.equal(numbers.signedUp, 1);
  assert.equal(numbers.interested, 1);
  assert.equal(numbers.connected, 1);
  assert.equal(numbers.replied, 1);
  assert.equal(numbers.costUsd, 0.17);
});

test("제외 and 대기: no address is 제외; being checked or written and not sent yet is 대기", () => {
  const numbers = tallyAgentPeople([
    row({ status: "excluded", excludeReason: "no_email" }), // lookup found no address the agent may mail
    row({ status: "excluded", excludeReason: null }),
    row({ status: "found" }), // lookup or posting pick still running
    row({ status: "approved" }), // written, waiting for send hours or the cap
    row({ status: "failed" }), // the send failed before going out
    row({ status: "failed", sentAt: "2026-11-17T00:00:00Z" }), // a later step failed after the mail went out
  ]);
  assert.equal(numbers.excluded, 3);
  assert.deepEqual(numbers.excludedBy, { no_email: 2, failed: 1 });
  assert.equal(numbers.waiting, 2);
  assert.equal(numbers.contacted, 1);
  assert.equal(numbers.excluded + numbers.waiting + numbers.contacted, numbers.found);
});

test("제외 without an address is split by why, and the same people are 제외 as before", () => {
  const reasons = ["no_lookup_source", "lookup_not_found", "lookup_not_found", "lookup_other_person", "no_email"] as const;
  const split = tallyAgentPeople(reasons.map((excludeReason) => row({ status: "excluded", excludeReason })));
  const before = tallyAgentPeople(reasons.map(() => row({ status: "excluded", excludeReason: "no_email" })));
  assert.equal(split.excluded, before.excluded);
  assert.equal(split.waiting + split.contacted, before.waiting + before.contacted);
  assert.deepEqual(split.excludedBy, { no_lookup_source: 1, lookup_not_found: 2, lookup_other_person: 1, no_email: 1 });
  assert.equal(excludeBucket(row({ status: "excluded", excludeReason: "lookup_other_person" })), "lookup_other_person");
  // The 제외 이유 filter lists every reason once, the address ones first.
  assert.equal(new Set(AGENT_EXCLUDE_BUCKETS).size, AGENT_EXCLUDE_BUCKETS.length);
  assert.deepEqual(AGENT_EXCLUDE_BUCKETS.slice(0, 5), ["no_lookup_source", "lookup_not_found", "lookup_other_person", "lookup_skipped", "no_email"]);
  assert.ok(AGENT_EXCLUDE_BUCKETS.includes("no_fit") && AGENT_EXCLUDE_BUCKETS.includes("failed"));
});

test("the table accepts exactly the exclusion reasons the code writes", () => {
  const sql = readFileSync(new URL("../../../../supabase/migrations/20261117140000_gtm_agent.sql", import.meta.url), "utf8");
  const list = /exclude_reason text check \(exclude_reason in \(([^)]*)\)\)/.exec(sql)?.[1] ?? "";
  const allowed = [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
  const reasons = AGENT_EXCLUDE_BUCKETS.filter((bucket) => !["no_fit", "skipped", "failed"].includes(bucket)).sort();
  assert.deepEqual(allowed, reasons);
});

test("신호 뒤 24시간 안에 보냄: first mails within 24 hours of a known signal time", () => {
  const numbers = tallyAgentPeople([
    row({ status: "sent", sentAt: "2026-11-17T10:00:00Z", signalAt: "2026-11-17T01:00:00Z" }), // 9 hours
    row({ status: "sent", sentAt: "2026-11-18T01:00:00Z", signalAt: "2026-11-17T01:00:00Z" }), // exactly 24 hours
    row({ status: "sent", sentAt: "2026-11-19T01:00:00Z", signalAt: "2026-11-17T01:00:00Z" }), // 2 days
    row({ status: "sent", sentAt: "2026-11-19T01:00:00Z", signalAt: null }), // signal time unknown
    row({ status: "approved", signalAt: "2026-11-17T01:00:00Z" }), // not sent yet
  ]);
  assert.equal(numbers.contacted, 4);
  assert.equal(numbers.signalKnown, 3);
  assert.equal(numbers.sentWithin24h, 2);
  assert.equal(agentRate(numbers.sentWithin24h, numbers.signalKnown), 67);
  const bySource = agentFunnelBySource([row({ source: "x", sentAt: "2026-11-17T02:00:00Z", signalAt: "2026-11-17T01:00:00Z" })], ["linkedin"]);
  assert.equal(bySource.x.sentWithin24h, 1);
  assert.equal(bySource.linkedin.sentWithin24h, 0);
});

test("per source: the turned-on sources first (even when empty), then any other source a person came from", () => {
  const bySource = agentFunnelBySource([row({ source: "threads" }), row({ source: "threads", status: "no_fit" }), row({ source: "velog" })], ["linkedin", "threads"]);
  assert.deepEqual(Object.keys(bySource), ["linkedin", "threads", "velog"]);
  assert.equal(bySource.threads.found, 2);
  assert.deepEqual(bySource.threads.excludedBy, { no_fit: 1 });
  assert.equal(bySource.linkedin.found, 0);
  assert.equal(bySource.velog.found, 1);
  assert.equal(agentRate(1, 3), 33);
  assert.equal(agentRate(1, 0), null);
});

test("Ashley 답함, 답 안 함 by reason, 답장 후 가입: each counts people once, inside 연락", () => {
  const replied = { status: "replied" as const, channel: "email" as const, sentAt: "2026-11-17T00:00:00Z", repliedAt: "2026-11-17T03:00:00Z" };
  const numbers = tallyAgentPeople([
    row({ ...replied, ashleyRepliedAt: "2026-11-17T04:00:00Z" }),
    row({ ...replied, ashleyRepliedAt: "2026-11-17T04:00:00Z", signedUpAt: "2026-11-17T06:00:00Z" }),
    row({ ...replied, noReplyReason: "돈 요구·악의" }),
    row({ ...replied, noReplyReason: "돈 요구·악의" }),
    row({ ...replied, ashleyRepliedAt: "2026-11-17T04:00:00Z", noReplyReason: "다른 목적" }),
    row({ ...replied, signedUpAt: "2026-11-16T00:00:00Z" }), // signed up before the reply
    row({ ...replied, repliedAt: null, signedUpAt: "2026-11-17T06:00:00Z" }), // reply time unknown
    row({ status: "found", ashleyRepliedAt: "2026-11-17T04:00:00Z", noReplyReason: "관심" }), // never mailed
  ]);
  assert.equal(numbers.replied, 7);
  assert.equal(numbers.ashleyReplied, 3);
  assert.equal(numbers.noReply, 3);
  assert.deepEqual(numbers.noReplyBy, { "돈 요구·악의": 2, "다른 목적": 1 });
  assert.equal(numbers.signedUpAfterReply, 1);
  assert.equal(tallyAgentPeople([]).noReply, 0);
  assert.deepEqual(tallyAgentPeople([]).noReplyBy, {});
});

test("반송/스팸신고/수신거부: of the mailed, a delivery failure, a spam report and an opt-out each count once", () => {
  const sent = { status: "ended" as const, channel: "email" as const, sentAt: "2026-11-19T00:00:00Z" };
  const numbers = tallyAgentPeople([
    row({ ...sent, deliveryStatus: "bounced" }),
    row({ ...sent, deliveryStatus: "failed" }),
    row({ ...sent, deliveryStatus: "complained" }),
    row({ ...sent, unsubscribed: true }),
    row({ ...sent, status: "replied", repliedAt: "2026-11-19T01:00:00Z", unsubscribed: true }),
    row({ ...sent, status: "sent" }),
    // Not mailed: nothing to bounce or opt out of.
    row({ status: "excluded", excludeReason: "suppressed", unsubscribed: true }),
  ]);
  assert.equal(numbers.contacted, 6);
  assert.deepEqual([numbers.bounced, numbers.complained, numbers.unsubscribed], [2, 1, 2]);
});

test("사람에게 넘김 · 연락 그만: people whose mail went to a person, and whom Ashley stopped writing to, inside 연락", () => {
  const replied = { status: "replied" as const, channel: "email" as const, sentAt: "2026-11-22T00:00:00Z", repliedAt: "2026-11-22T03:00:00Z" };
  const rows = [
    row({ ...replied, handedOffAt: "2026-11-22T04:00:00Z" }),
    row({ ...replied, handedOffAt: "2026-11-22T04:00:00Z", stoppedAt: "2026-11-22T05:00:00Z", noReplyReason: "연락 그만" }),
    row({ ...replied, stoppedAt: "2026-11-22T05:00:00Z", noReplyReason: "연락 그만" }),
    row({ status: "found", handedOffAt: "2026-11-22T04:00:00Z", stoppedAt: "2026-11-22T05:00:00Z" }), // never mailed
  ];
  const numbers = tallyAgentPeople(rows);
  assert.deepEqual([numbers.handedOff, numbers.stopped, numbers.noReply], [2, 2, 2]);
  // Every column's number is the count of its own predicate.
  for (const column of FUNNEL_COLUMNS) {
    assert.equal(columnCount(numbers, column), rows.filter((item) => inFunnelColumn(column, item)).length, column);
  }
  assert.equal(tallyAgentPeople([]).handedOff + tallyAgentPeople([]).stopped, 0);
});
