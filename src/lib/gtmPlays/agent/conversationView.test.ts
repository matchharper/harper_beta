import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage } from "./conversation";
import {
  awaitingHuman, conversationEntries, conversationFactsByPerson, decisionReasonLabel, mailLineWords, unmatchedToRecord,
} from "./conversationView";

const message = (patch: Partial<ConversationMessage>): ConversationMessage => ({
  id: "m", personId: "p1", counterpartKind: "candidate", counterpartEmail: "candidate@example.com", author: "counterpart",
  direction: "inbound", gmailMessageId: null, gmailThreadId: "t1", rfcMessageId: null, inReplyTo: null, references: null,
  subject: "Re: hello", bodyText: "text", newText: "text", rootMailId: "root1", decision: null, decisionReason: null, signals: [],
  answeredByMessageId: null, sendStatus: null, providerMessageId: null, error: null,
  occurredAt: "2026-11-20T05:00:00.000Z", createdAt: "2026-11-20T05:00:00.000Z", ...patch,
});

test("a decision reason's label is the part before ' · ' (the code's own reasons too)", () => {
  assert.equal(decisionReasonLabel("돈 요구·악의 · asks for money to prove it is real"), "돈 요구·악의");
  assert.equal(decisionReasonLabel("회원"), "회원");
  assert.equal(decisionReasonLabel("보내기 전 점검 · a link that is not Harper's"), "보내기 전 점검");
  assert.equal(decisionReasonLabel("  "), "이유 없음");
  assert.equal(decisionReasonLabel(null), "이유 없음");
  assert.equal(decisionReasonLabel("x".repeat(80)).length, 30);
});

test("per person: the first Ashley reply that went out, and the latest reply left unanswered on purpose", () => {
  const facts = conversationFactsByPerson([
    message({ id: "1", decision: "no_reply", decisionReason: "다른 목적 · sales", occurredAt: "2026-11-20T01:00:00Z" }),
    message({ id: "2", decision: "stop", decisionReason: "연락 그만 · asks to stop", occurredAt: "2026-11-20T03:00:00Z" }),
    message({ id: "3", decision: "reply", decisionReason: "질문 · salary", occurredAt: "2026-11-20T04:00:00Z" }),
    message({ id: "4", author: "ashley", direction: "outbound", sendStatus: "held", occurredAt: "2026-11-20T02:00:00Z" }),
    message({ id: "5", author: "ashley", direction: "outbound", sendStatus: "sent", occurredAt: "2026-11-20T06:00:00Z" }),
    message({ id: "6", author: "ashley", direction: "outbound", sendStatus: "sent", occurredAt: "2026-11-20T05:00:00Z" }),
    message({ id: "7", personId: "p2", author: "ashley", direction: "outbound", sendStatus: "failed" }),
    message({ id: "8", personId: null, decision: "no_reply", decisionReason: "회사 그 밖 · x" }), // a company's, no person
  ]);
  assert.deepEqual(facts.get("p1"), { ashleyRepliedAt: "2026-11-20T05:00:00.000Z", noReplyReason: "연락 그만" });
  assert.deepEqual(facts.get("p2"), { ashleyRepliedAt: null, noReplyReason: null });
  assert.equal(facts.size, 2);
});

test("사람이 볼 답장: a handed-over reply stays until a human row comes after it in its thread", () => {
  const handed = message({ id: "h1", decision: "hand_to_human", occurredAt: "2026-11-20T05:00:00Z" });
  const otherThread = message({ id: "h2", decision: "hand_to_human", rootMailId: "root2", gmailThreadId: "t2", occurredAt: "2026-11-20T06:00:00Z" });
  const humanBefore = message({ id: "x1", author: "human", direction: "outbound", occurredAt: "2026-11-20T04:00:00Z" });
  const ashleyAfter = message({ id: "x2", author: "ashley", direction: "outbound", sendStatus: "sent", occurredAt: "2026-11-20T07:00:00Z" });
  assert.deepEqual(awaitingHuman([handed, otherThread, humanBefore, ashleyAfter]).map((row) => row.id), ["h1", "h2"]);
  // A human answer in the same Gmail thread (no root mail on it) clears h1 only.
  const humanAfter = message({ id: "x3", author: "human", direction: "outbound", rootMailId: null, occurredAt: "2026-11-20T08:00:00Z" });
  assert.deepEqual(awaitingHuman([handed, otherThread, humanAfter]).map((row) => row.id), ["h2"]);
  // Rows with neither a root mail nor a Gmail thread fall back to the address.
  const bare = { rootMailId: null, gmailThreadId: null };
  assert.deepEqual(awaitingHuman([
    message({ id: "h3", decision: "hand_to_human", ...bare }),
    message({ id: "x4", author: "human", direction: "outbound", ...bare, counterpartEmail: "Candidate@Example.com", occurredAt: "2026-11-21T00:00:00Z" }),
  ]), []);
  // Other decisions never make the red line.
  assert.deepEqual(awaitingHuman([message({ id: "r", decision: "reply" }), message({ id: "n", decision: null })]), []);
});

test("대화: mails and conversation rows in one time order, each once; our mail first, then the reply, then the answer", () => {
  const mails = [
    { id: "follow", sentAt: "2026-11-21T00:00:00Z" },
    { id: "first", sentAt: "2026-11-18T00:00:00Z" },
    { id: "first", sentAt: "2026-11-18T00:00:00Z" },
  ];
  const entries = conversationEntries(mails, [
    message({ id: "ashley", author: "ashley", direction: "outbound", occurredAt: "2026-11-20T05:00:00Z" }),
    message({ id: "in", occurredAt: "2026-11-20T05:00:00Z" }),
    message({ id: "in", occurredAt: "2026-11-20T05:00:00Z" }),
    message({ id: "early", occurredAt: "2026-11-18T00:00:00Z" }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.key), ["mail:first", "msg:early", "msg:in", "msg:ashley", "mail:follow"]);
  assert.equal(entries[0].type === "mail" && entries[0].mail.id, "first");
});

test("a mail line's words: 받음 with Ashley's decision and reason label, 보냄 with how the send went", () => {
  assert.deepEqual(mailLineWords({ direction: "inbound", author: "counterpart", decision: "no_reply", decisionReason: "돈 요구·악의 · $500" }),
    { way: "받음", what: "답 안 함 · 돈 요구·악의", trouble: false });
  assert.equal(mailLineWords({ direction: "inbound", author: "counterpart", decision: null }).what, "판단 전");
  // The 대화 shows the whole reason under the line, so its words leave the label out.
  assert.equal(mailLineWords({ direction: "inbound", author: "counterpart", decision: "reply", decisionReason: "질문 · salary" }, { reasonLabel: false }).what, "답함");
  assert.equal(mailLineWords({ direction: "outbound", author: "ashley", sendStatus: "failed", error: "provider 500" }, { reasonLabel: false }).what, "Ashley · 실패");
  assert.deepEqual(mailLineWords({ direction: "outbound", author: "ashley", sendStatus: "held", error: "보내기 전 점검 · link" }),
    { way: "보냄", what: "Ashley · 안 보냄 · 보내기 전 점검", trouble: true });
  assert.equal(mailLineWords({ direction: "outbound", author: "ashley", sendStatus: "sent" }).what, "Ashley · 보냄");
  assert.equal(mailLineWords({ direction: "outbound", author: "human" }).what, "사람 (Ashley 계정)");
  assert.deepEqual(mailLineWords({ direction: "outbound", author: "agent_mail", mailKind: "first", mailStatus: "sent", deliveryStatus: "bounced" }),
    { way: "보냄", what: "첫 메일 · 반송", trouble: true });
  assert.equal(mailLineWords({ direction: "outbound", author: "agent_mail", mailKind: "company", mailStatus: "sent" }).what, "회사 메일 · 보냄");
});

test("unmatched mails are recorded only from a read that finished", () => {
  assert.deepEqual(unmatchedToRecord([
    { mailbox: "a@example.com", unmatched: 3 },
    { mailbox: "b@example.com", unmatched: 2, error: "auth" },
    { mailbox: "c@example.com", unmatched: 0 },
    { mailbox: "d@example.com" },
  ]), [{ mailbox: "a@example.com", count: 3 }]);
});
