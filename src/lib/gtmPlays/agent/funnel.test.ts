import assert from "node:assert/strict";
import test from "node:test";
import { agentFunnelBySource, agentRate, looksLikeStopRequest, tallyAgentPeople, type AgentFunnelRow } from "./funnel";

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
  assert.equal(numbers.excluded, 3);
  assert.deepEqual(numbers.excludedBy, { member: 2, recent_contact: 1 });
  assert.equal(numbers.noFit, 1);
  assert.equal(numbers.waiting, 1);
  assert.equal(numbers.contacted, 3);
  assert.deepEqual(numbers.contactedBy, { email: 3 });
  assert.equal(numbers.clicked, 2);
  assert.equal(numbers.signedUp, 1);
  assert.equal(numbers.interested, 1);
  assert.equal(numbers.connected, 1);
  assert.equal(numbers.replied, 1);
  assert.equal(numbers.skipped, 1);
  assert.equal(numbers.costUsd, 0.17);
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
  assert.equal(bySource.threads.noFit, 1);
  assert.equal(bySource.linkedin.found, 0);
  assert.equal(bySource.velog.found, 1);
  assert.equal(agentRate(1, 3), 33);
  assert.equal(agentRate(1, 0), null);
});

test("a reply asking not to be contacted is pre-checked", () => {
  assert.equal(looksLikeStopRequest("앞으로 연락하지 마세요"), true);
  assert.equal(looksLikeStopRequest("이런 연락 원치 않습니다"), true);
  assert.equal(looksLikeStopRequest("수신거부 부탁드려요"), true);
  assert.equal(looksLikeStopRequest("Please stop contacting me."), true);
  assert.equal(looksLikeStopRequest("Remove me from your list"), true);
  assert.equal(looksLikeStopRequest("관심 있어요! 통화 가능할까요?"), false);
  assert.equal(looksLikeStopRequest("지금은 이직 생각이 없어요"), false);
  assert.equal(looksLikeStopRequest(null), false);
});
