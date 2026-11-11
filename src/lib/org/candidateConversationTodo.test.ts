import assert from "node:assert/strict";
import test from "node:test";
import {
  answeredByOf,
  applyCandidateConversations,
  candidateMessageExcerpt,
  readCandidateConversations,
  type AnsweredBy,
  type ConversationRow,
} from "./candidateConversationTodo";
import { orgTodoBadge, orgTodoMyTurn, type OrgTodoItem } from "./todo";

const now = new Date("2026-11-08T12:00:00.000Z");
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
const fromCandidate = (id: string, at: string, extra: Record<string, unknown> = {}): ConversationRow => ({
  id,
  talent_id: "t1",
  created_at: at,
  metadata: { eventType: "candidate_message_delivered", relayId: `relay-${id}`, ...extra },
});
const fromCompany = (id: string, at: string, requestId: string): ConversationRow => ({
  id,
  talent_id: "t1",
  created_at: at,
  metadata: { eventType: "candidate_contact_sent", requestId },
});
const talents = new Map([["t1", { id: "t1", name: "Candidate A", recommendationId: "rec-1" }]]);
// The 알림 line the feed gives each candidate message (id `activity:<row id>`).
const notice = (id: string, at: string): OrgTodoItem => ({
  id: `activity:${id}`,
  column: "notice",
  kind: "candidate_message",
  at,
  detail: "candidate_message",
  talent: talents.get("t1")!,
});

function todo(args: {
  rows: ConversationRow[];
  notices: OrgTodoItem[];
  dismissed?: string[];
  answeredBy?: Map<string, AnsweredBy>;
}) {
  const read = readCandidateConversations(args.rows, { now, days: 7 });
  return applyCandidateConversations({
    items: args.notices,
    ...read,
    answeredBy: args.answeredBy ?? new Map(),
    dismissed: new Set(args.dismissed ?? []),
    talents,
    excerpts: new Map([["relay-m2", "Could we talk on Friday?"]]),
  });
}
const lines = (items: OrgTodoItem[]) =>
  items.map((item) => `${item.column}:${item.id}${item.answeredBy ? `:${item.answeredBy.by}` : ""}`);

test("an unanswered message is one 결정할 것 card in place of its 알림 lines, counted once", () => {
  const items = todo({
    rows: [fromCandidate("m1", hoursAgo(5)), fromCandidate("m2", hoursAgo(2))],
    notices: [notice("m1", hoursAgo(5)), notice("m2", hoursAgo(2))],
  });
  assert.deepEqual(lines(items), ["my_turn:unanswered:m2"]);
  assert.equal(items[0].kind, "unanswered_message");
  assert.equal(items[0].at, hoursAgo(2));
  assert.equal(items[0].detail, "Could we talk on Friday?");
  assert.deepEqual(items[0].talent, talents.get("t1"));
  // In the To-do number as a thing to decide, and not again as an update.
  assert.equal(orgTodoMyTurn(items), 1);
  assert.equal(orgTodoBadge(items), 1);
  // Before: the same messages were two updates and nothing to decide.
  const before = [notice("m1", hoursAgo(5)), notice("m2", hoursAgo(2))];
  assert.equal(orgTodoMyTurn(before), 0);
});

test("a team member's reply after the latest message drops the card back to 알림, with who answered", () => {
  const rows = [fromCandidate("m1", hoursAgo(5)), fromCompany("c1", hoursAgo(1), "req-1")];
  const read = readCandidateConversations(rows, { now, days: 7 });
  assert.deepEqual(read.unanswered, []);
  assert.equal(read.answers.get("m1"), "req-1");
  const member = answeredByOf({ message_type: "slack", company_user_id: "u1" }, new Map([["u1", "Member B"]]));
  assert.deepEqual(member, { by: "team", name: "Member B" });
  const items = todo({ rows, notices: [notice("m1", hoursAgo(5))], answeredBy: new Map([["req-1", member!]]) });
  assert.deepEqual(lines(items), ["notice:activity:m1:team"]);
  assert.deepEqual(items[0].answeredBy, { by: "team", name: "Member B" });
  assert.equal(orgTodoMyTurn(items), 0);
  // A web or email reply is a team member's too; without a name, still the team.
  assert.deepEqual(answeredByOf({ message_type: "chat", company_user_id: "u2" }, new Map()), { by: "team", name: null });
});

test("a reply Harper sent on its own also drops the card, and the 알림 line says Harper answered", () => {
  const rows = [fromCandidate("m1", hoursAgo(5)), fromCompany("c1", hoursAgo(1), "req-h")];
  // Harper's own run (no team member's message behind it).
  const harper = answeredByOf({ message_type: "web_action", company_user_id: "u1" }, new Map([["u1", "Member B"]]));
  assert.deepEqual(harper, { by: "harper" });
  const items = todo({ rows, notices: [notice("m1", hoursAgo(5))], answeredBy: new Map([["req-h", harper!]]) });
  assert.deepEqual(lines(items), ["notice:activity:m1:harper"]);
  // Unknown sender: no label rather than a guess.
  assert.equal(answeredByOf(null, new Map()), null);
});

test("only a company message after the candidate's latest one answers it; a reply to the candidate's answer counts too", () => {
  const items = todo({
    rows: [
      fromCompany("c0", hoursAgo(30), "req-0"),
      fromCandidate("m1", hoursAgo(20), { eventType: "candidate_response_received", relayId: null }),
      fromCompany("c1", hoursAgo(10), "req-1"),
      fromCandidate("m2", hoursAgo(2)),
    ],
    notices: [notice("m1", hoursAgo(20)), notice("m2", hoursAgo(2))],
    answeredBy: new Map([["req-1", { by: "harper" }]]),
  });
  assert.deepEqual(lines(items), ["my_turn:unanswered:m2", "notice:activity:m1:harper"]);
});

test("set aside, the message goes back to 알림 until the candidate writes again", () => {
  const first = [fromCandidate("m1", hoursAgo(5))];
  const dismissed = ["unanswered:m1"];
  const aside = todo({ rows: first, notices: [notice("m1", hoursAgo(5))], dismissed });
  assert.deepEqual(lines(aside), ["notice:activity:m1"]);
  assert.equal(orgTodoMyTurn(aside), 0);
  // The candidate writes again: a new card, covering both messages.
  const again = todo({
    rows: [...first, fromCandidate("m2", hoursAgo(1))],
    notices: [notice("m1", hoursAgo(5)), notice("m2", hoursAgo(1))],
    dismissed,
  });
  assert.deepEqual(lines(again), ["my_turn:unanswered:m2"]);
  assert.equal(orgTodoBadge(again), 1);
});

test("only messages of the last 7 days become cards; older ones stay as they are", () => {
  const items = todo({
    rows: [fromCandidate("m1", hoursAgo(8 * 24))],
    notices: [notice("m1", hoursAgo(8 * 24))],
  });
  assert.deepEqual(lines(items), ["notice:activity:m1"]);
});

test("one card per candidate, and a candidate the board hides gets none", () => {
  const read = readCandidateConversations(
    [
      fromCandidate("m1", hoursAgo(3)),
      { ...fromCandidate("x1", hoursAgo(2)), talent_id: "hidden" },
      { id: "other", talent_id: "t1", created_at: hoursAgo(1), metadata: { eventType: "intro_to_company" } },
    ],
    { now, days: 7 }
  );
  assert.deepEqual(read.unanswered.map((row) => row.id), ["unanswered:m1", "unanswered:x1"]);
  const items = applyCandidateConversations({
    items: [], ...read, answeredBy: new Map(), dismissed: new Set(), talents, excerpts: new Map(),
  });
  assert.deepEqual(lines(items), ["my_turn:unanswered:m1"]);
  assert.equal(items[0].detail, null);
});

test("the card's excerpt is short and carries no contact details", () => {
  assert.equal(
    candidateMessageExcerpt("Thanks!\nMail me at someone@example.com or call 010-1234-5678, see https://example.com/me"),
    "Thanks! Mail me at … or call …, see …"
  );
  assert.equal(candidateMessageExcerpt("Meet on 2026-11-10 at 3pm?"), "Meet on 2026-11-10 at 3pm?");
  const long = candidateMessageExcerpt("a".repeat(200))!;
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
  assert.equal(candidateMessageExcerpt("   "), null);
});

// PR-9: the Role's agent mailbox is read as the same conversation.
test("mailbox messages answer and open candidate conversations; introductions and withdrawn ones do not", async () => {
  const { readMailboxConversations } = await import("./candidateConversationTodo");
  const mail = (id: string, at: string, direction: string, extra: Record<string, unknown> = {}) => ({
    id, root_id: "root", talent_id: "t1", direction, body: `body ${id} jane@example.com`,
    source: { kind: "company_event" }, created_at: at, rootCancelled: false, ...extra,
  });
  const mailbox = readMailboxConversations([
    // The introduction itself is the pending connection, not a message to answer.
    mail("root", hoursAgo(10), "to_company", { source: { kind: "career" } }),
    mail("asked", hoursAgo(8), "to_talent", { source: { kind: "company", userId: "member" } }),
    mail("answer", hoursAgo(6), "to_company", { source: { kind: "career" } }),
    // A withdrawn conversation adds nothing.
    mail("gone", hoursAgo(5), "to_company", { root_id: "withdrawn", rootCancelled: true }),
  ], { now, days: 7 });
  assert.deepEqual(mailbox.conversationRows.map((row) => row.id), ["agent:asked", "agent:answer"]);
  assert.equal(mailbox.senders.get("agent:asked"), "member");
  assert.equal(mailbox.excerpts.get("agent:answer"), "body answer …");
  // The newest message of the conversation is the candidate side's: nothing waits on the candidate.
  assert.deepEqual(mailbox.waiting, []);
  const { unanswered } = readCandidateConversations(mailbox.conversationRows, { now, days: 7 });
  assert.deepEqual(unanswered.map((row) => [row.id, row.relayId]), [["unanswered:agent:answer", "agent:answer"]]);

  // Harper's own reply (a company event) answers a legacy relay message but waits for nothing.
  const later = readMailboxConversations([
    mail("root2", hoursAgo(3), "to_company", { root_id: "root2", source: { kind: "career", legacyCorrespondence: true } }),
    mail("reply", hoursAgo(1), "to_talent", { root_id: "root2" }),
  ], { now, days: 7 });
  assert.deepEqual(later.waiting, []);
  assert.equal(later.senders.get("agent:reply"), null);
  const merged = readCandidateConversations(
    [fromCandidate("legacy", hoursAgo(4)), ...later.conversationRows],
    { now, days: 7 }
  );
  assert.deepEqual(merged.unanswered, []);
  assert.equal(merged.answers.get("legacy"), "agent:reply");
});

test("only a team member's message waits for the candidate, within the recent window in every view", async () => {
  const { readMailboxConversations } = await import("./candidateConversationTodo");
  const mail = (id: string, at: string, direction: string, source: Record<string, unknown>, root = "root") => ({
    id, root_id: root, talent_id: "t1", direction, body: id, source, created_at: at, rootCancelled: false,
  });
  const member = { kind: "company", userId: "member", messageId: 1 };
  const harper = { kind: "company_event" };
  const read = (rows: ReturnType<typeof mail>[]) =>
    readMailboxConversations(rows, { now, days: 7 }).waiting.map((row) => row.id);
  // A member's question waits, even after Harper's own follow-up in the same conversation.
  assert.deepEqual(read([
    mail("intro", hoursAgo(30), "to_company", { kind: "career" }),
    mail("question", hoursAgo(20), "to_talent", member),
    mail("ack", hoursAgo(10), "to_talent", harper),
  ]), ["question"]);
  // The candidate's answer ends the wait; Harper's acknowledgement alone never starts one.
  assert.deepEqual(read([
    mail("question", hoursAgo(20), "to_talent", member),
    mail("answer", hoursAgo(5), "to_company", { kind: "career" }),
    mail("ack", hoursAgo(4), "to_talent", harper),
  ]), []);
  // Older than the recent window: not a waiting line, also when the whole history was read ("all").
  assert.deepEqual(read([mail("old", hoursAgo(24 * 8), "to_talent", member)]), []);
});

test("an old request the candidate answered in the mailbox no longer waits", async () => {
  const { requestsAnsweredInMailbox } = await import("./candidateConversationTodo");
  const request = (id: string, talent: string, at: string, status = "awaiting_talent") =>
    ({ id, talent_id: talent, created_at: at, workflow_status: status });
  const answered = requestsAnsweredInMailbox(
    [
      request("answered", "t1", hoursAgo(48)),
      request("before-answer", "t2", hoursAgo(10)),
      request("sending", "t1", hoursAgo(48), "queued"),
      request("no-answer", "t3", hoursAgo(48)),
    ],
    [
      { talent_id: "t1", created_at: hoursAgo(2) },
      { talent_id: "t1", created_at: hoursAgo(60) },
      // Written before the request was made: not an answer to it.
      { talent_id: "t2", created_at: hoursAgo(20) },
    ]
  );
  assert.deepEqual([...answered], ["answered"]);
});
