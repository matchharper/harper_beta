import assert from "node:assert/strict";
import test from "node:test";
import {
  flattenSignals, HISTORY_LIMIT, HISTORY_TEXT_CHARS, historyPostings, mergeHistory, replyBlockReason, threadKeyOf,
  type HistoryMail, type HistoryMessage,
} from "./conversationRules";

const mail = (patch: Partial<HistoryMail> = {}): HistoryMail => ({
  id: "mail-first", toEmail: "candidate@example.com", kind: "first", subject: "Two backend roles", text: "Hi, two roles…",
  postings: [{ companyName: "Company A", title: "Backend Engineer", url: "https://example.com/a" }], sentAt: "2026-11-18T01:00:00.000Z",
  ...patch,
});
const message = (patch: Partial<HistoryMessage> = {}): HistoryMessage => ({
  id: "msg-1", counterpartEmail: "candidate@example.com", author: "counterpart", direction: "inbound", subject: "Re: Two backend roles",
  bodyText: "Interested!\n\nOn Wed, Nov 18, 2026 at 10:00 AM Ashley Kim <ashley@example.com> wrote:\n> Hi, two roles…",
  newText: "Interested!", rootMailId: "mail-first", gmailThreadId: "gmail-thread-1", sendStatus: null,
  occurredAt: "2026-11-19T04:52:00.000Z", ...patch,
});

test("history: our mails and the conversation rows of one address, in time order", () => {
  const entries = mergeHistory("Candidate@Example.com ", [mail()], [
    message({ id: "ashley-1", author: "ashley", direction: "outbound", bodyText: "Happy to help.", newText: "Happy to help.", sendStatus: "sent", occurredAt: "2026-11-19T06:00:00.000Z" }),
    message(),
  ]);
  assert.deepEqual(entries.map((entry) => [entry.author, entry.kind, entry.text]), [
    ["agent_mail", "first", "Hi, two roles…"],
    ["counterpart", "reply", "Interested!"],
    ["ashley", "reply", "Happy to help."],
  ]);
  assert.deepEqual(entries[0].postings, [{ companyName: "Company A", title: "Backend Engineer", url: "https://example.com/a" }]);
  assert.equal(entries[1].threadKey, "mail-first");
});

test("history never carries another address's mails or messages, whatever the caller passed", () => {
  const entries = mergeHistory("candidate@example.com", [
    mail(), mail({ id: "company-mail", toEmail: "jobs@company-a.example", kind: "company", text: "We have a candidate who…" }),
  ], [
    message(),
    message({ id: "company-reply", counterpartEmail: "jobs@company-a.example", newText: "Remote is fine.", rootMailId: "company-mail" }),
    // A forwarded colleague's mail in the candidate's thread is the colleague's, not the candidate's.
    message({ id: "colleague", counterpartEmail: "colleague@example.org", newText: "I am their colleague" }),
  ]);
  assert.equal(entries.length, 2);
  assert.ok(entries.every((entry) => !/candidate who|Remote is fine|colleague/.test(entry.text)));
  assert.deepEqual(mergeHistory("", [mail()], [message()]), []);
});

test("history: only what reached them, quoted text cut, each text capped", () => {
  const entries = mergeHistory("candidate@example.com", [mail({ text: "x".repeat(HISTORY_TEXT_CHARS + 500) })], [
    message({ id: "queued", author: "ashley", direction: "outbound", sendStatus: "queued", newText: "not sent yet" }),
    message({ id: "held", author: "ashley", direction: "outbound", sendStatus: "held", newText: "held" }),
    message({ id: "failed", author: "ashley", direction: "outbound", sendStatus: "failed", newText: "failed" }),
    // No stored new text: the full text with the quote cut.
    message({ id: "human", author: "human", direction: "outbound", sendStatus: "sent", newText: "", bodyText: "Shaun here.\n\n2026년 11월 19일 (목) 오후 1:52, Candidate <candidate@example.com>님이 작성:\n> Interested!", occurredAt: "2026-11-19T07:00:00.000Z" }),
  ]);
  assert.deepEqual(entries.map((entry) => entry.author), ["agent_mail", "human"]);
  assert.equal(entries[0].text.length, HISTORY_TEXT_CHARS);
  assert.ok(entries[0].text.endsWith("…"));
  assert.equal(entries[1].text, "Shaun here.");
});

test("history: at most the last 10, the current thread first", () => {
  const replies = Array.from({ length: 14 }, (_, index) => message({
    id: `r${index}`, newText: `reply ${index}`, occurredAt: new Date(Date.parse("2026-11-19T00:00:00Z") + index * 3_600_000).toISOString(),
    rootMailId: index % 2 ? "mail-first" : "mail-followup",
  }));
  const all = mergeHistory("candidate@example.com", [mail(), mail({ id: "mail-followup", kind: "followup" })], replies);
  assert.equal(all.length, HISTORY_LIMIT);
  assert.deepEqual(all.map((entry) => entry.text), Array.from({ length: 10 }, (_, index) => `reply ${index + 4}`));
  // The follow-up's thread first (time order), then the rest (time order).
  const current = mergeHistory("candidate@example.com", [mail(), mail({ id: "mail-followup", kind: "followup" })], replies, { threadKey: "mail-followup", limit: 6 });
  assert.deepEqual(current.map((entry) => entry.threadKey), ["mail-followup", "mail-followup", "mail-followup", "mail-followup", "mail-followup", "mail-followup"]);
  assert.deepEqual(current.map((entry) => entry.text), ["reply 2", "reply 4", "reply 6", "reply 8", "reply 10", "reply 12"]);
  const mixed = mergeHistory("candidate@example.com", [mail(), mail({ id: "mail-followup", kind: "followup", sentAt: "2026-11-25T00:00:00.000Z" })], replies.slice(0, 4), { threadKey: "mail-followup" });
  assert.deepEqual(mixed.map((entry) => entry.threadKey), ["mail-followup", "mail-followup", "mail-followup", "mail-first", "mail-first", "mail-first"]);
  assert.equal(mixed[2].kind, "followup");
  assert.equal(mergeHistory("candidate@example.com", [mail()], replies, { limit: 0 }).length, 1);
});

test("thread keys and posting snapshots", () => {
  assert.equal(threadKeyOf({ id: "m", rootMailId: "mail-1", gmailThreadId: "t" }), "mail-1");
  assert.equal(threadKeyOf({ id: "m", rootMailId: null, gmailThreadId: "t" }), "gmail:t");
  assert.equal(threadKeyOf({ id: "m", rootMailId: null, gmailThreadId: null }), "message:m");
  assert.deepEqual(historyPostings([{ kind: "external", companyName: "Company B", title: "Data Engineer", url: "", why: "…" }, null, { title: 3 }]), [
    { companyName: "Company B", title: "Data Engineer", url: null },
  ]);
  assert.deepEqual(historyPostings(null), []);
});

test("one inbound mail gets at most one Ashley reply", () => {
  assert.equal(replyBlockReason({ direction: "inbound", author: "counterpart", answeredByMessageId: null }), null);
  assert.equal(replyBlockReason({ direction: "inbound", author: "counterpart", answeredByMessageId: "reply-1" }), "already_answered");
  // Never a reply to our own or a person's message, or to nothing.
  assert.equal(replyBlockReason({ direction: "outbound", author: "ashley", answeredByMessageId: null }), "not_inbound");
  assert.equal(replyBlockReason({ direction: "outbound", author: "human", answeredByMessageId: null }), "not_inbound");
  assert.equal(replyBlockReason(null), "not_found");
});

test("interest signals: newest first, the row's id and time, by posting and time", () => {
  const signal = { personId: "person-1", postingUrl: "https://example.com/a", companyName: "Company A", postingTitle: "Backend Engineer", question: "Remote?", summaryConsent: false, at: "stale", messageId: "stale" };
  const rows = [
    { id: "msg-old", occurredAt: "2026-11-19T00:00:00.000Z", signals: [signal] },
    { id: "msg-new", occurredAt: "2026-11-20T00:00:00.000Z", signals: [signal, { ...signal, postingUrl: "https://example.com/b" }, { bad: true }] },
    { id: "msg-none", occurredAt: "2026-11-20T01:00:00.000Z", signals: "not an array" },
  ];
  const all = flattenSignals(rows);
  assert.deepEqual(all.map((item) => [item.messageId, item.postingUrl]), [
    ["msg-new", "https://example.com/a"], ["msg-new", "https://example.com/b"], ["msg-old", "https://example.com/a"],
  ]);
  assert.equal(all[0].at, "2026-11-20T00:00:00.000Z");
  assert.deepEqual(flattenSignals(rows, { postingUrl: "https://example.com/a", since: "2026-11-19T12:00:00.000Z" }).map((item) => item.messageId), ["msg-new"]);
});
