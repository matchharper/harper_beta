import assert from "node:assert/strict";
import test from "node:test";
import { agentFunnelBySource, agentRate, tallyAgentPeople, type AgentFunnelRow } from "./funnel";

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
