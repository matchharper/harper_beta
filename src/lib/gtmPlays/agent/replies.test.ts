import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailMessage, getGmailHeaders, type GmailMessage } from "@/lib/contentsEngine/gmail";
import {
  autoReplyReason, isPermanentFailure, isReplySubject, matchAgentBounce, matchAgentReply, maybeDeliveryReport,
  normalizeMessageId, referencedMessageIds, replyExcerpt, replyMailboxes, type AgentSentMail, type InboundMail,
} from "./replies";

const mail = (patch: Partial<AgentSentMail> = {}): AgentSentMail => ({
  mailId: "mail-1", personId: "person-1", toEmail: "candidate@example.com", rfcMessageId: "abc123@send.example.com",
  subject: "백엔드 포지션 두 곳을 골라 봤어요", sentAt: "2026-11-10T01:00:00.000Z", ...patch,
});
const inbound = (patch: Partial<InboundMail> = {}): InboundMail => ({
  fromEmail: "candidate@example.com", subject: "Re: 백엔드 포지션 두 곳을 골라 봤어요", inReplyTo: null, references: null,
  receivedAt: "2026-11-12T03:00:00.000Z", ...patch,
});

test("mailboxes: the configured list plus the sender, lower-cased, valid and once each", () => {
  assert.deepEqual(
    replyMailboxes(" Ops@Example.com, team@example.com;other@example.com  not-an-address ", "ops@example.com"),
    ["ops@example.com", "team@example.com", "other@example.com"],
  );
  assert.deepEqual(replyMailboxes(undefined, "Sender@Example.com"), ["sender@example.com"]);
  assert.deepEqual(replyMailboxes("", null), []);
});

test("Message-IDs are compared without brackets and case", () => {
  assert.equal(normalizeMessageId("<ABC123@Send.Example.com>"), "abc123@send.example.com");
  assert.equal(normalizeMessageId("  "), null);
  assert.equal(normalizeMessageId("no-at-sign"), null);
  assert.deepEqual(
    referencedMessageIds("<x1@example.com>", "<y2@example.com>\n <X1@example.com>"),
    ["x1@example.com", "y2@example.com"],
  );
  assert.deepEqual(referencedMessageIds("bare@example.com", null), ["bare@example.com"]);
});

test("a reply naming the mail's Message-ID matches, from any address and with any subject", () => {
  const match = matchAgentReply(
    inbound({ fromEmail: "other-address@example.org", subject: "질문 있어요", references: "<ABC123@send.example.com>" }),
    [mail()],
  );
  assert.equal(match?.by, "message_id");
  assert.equal(match?.mail.mailId, "mail-1");
});

test("without the Message-ID: the same sender within 60 days and a reply-like subject", () => {
  const mails = [mail({ rfcMessageId: null })];
  assert.equal(matchAgentReply(inbound(), mails)?.by, "from");
  // The mail's own subject without a prefix also reads as a reply.
  assert.equal(matchAgentReply(inbound({ subject: "백엔드 포지션 두 곳을 골라 봤어요 관련" }), mails)?.by, "from");
  assert.equal(matchAgentReply(inbound({ subject: "회신: 안녕하세요" }), mails)?.by, "from");
  assert.equal(matchAgentReply(inbound({ fromEmail: "Candidate <CANDIDATE@example.com>" }), mails)?.by, "from");
  // Not reply-like, another sender, older than 60 days, or before the mail went out: no match.
  assert.equal(matchAgentReply(inbound({ subject: "뉴스레터 11월호" }), mails), null);
  assert.equal(matchAgentReply(inbound({ fromEmail: "someone@example.com" }), mails), null);
  assert.equal(matchAgentReply(inbound({ receivedAt: "2027-01-20T00:00:00.000Z" }), mails), null);
  assert.equal(matchAgentReply(inbound({ receivedAt: "2026-11-09T00:00:00.000Z" }), mails), null);
});

test("the latest mail sent before the reply wins (the follow-up over the first mail)", () => {
  const mails = [
    mail({ rfcMessageId: null }),
    mail({ mailId: "followup", rfcMessageId: null, sentAt: "2026-11-11T01:00:00.000Z" }),
    mail({ mailId: "later", rfcMessageId: null, sentAt: "2026-11-20T01:00:00.000Z" }),
  ];
  assert.equal(matchAgentReply(inbound(), mails)?.mail.mailId, "followup");
});

test("reply subjects", () => {
  assert.equal(isReplySubject("RE: hello", "other"), true);
  assert.equal(isReplySubject("Re[2]: hello", "other"), true);
  assert.equal(isReplySubject("AW: hello", "other"), true);
  assert.equal(isReplySubject("답장: 감사합니다", "other"), true);
  assert.equal(isReplySubject("Fwd: Harper 제안", "Harper 제안"), true);
  assert.equal(isReplySubject("Fwd: something else", "Harper 제안"), false);
  assert.equal(isReplySubject("Hi", "Hi"), false); // too short to tell
});

test("automatic answers never count as replies", () => {
  const person = { fromEmail: "candidate@example.com", subject: "Re: 제안", headers: {} };
  assert.equal(autoReplyReason(person), null);
  assert.equal(autoReplyReason({ ...person, headers: { "Auto-Submitted": "auto-replied" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "auto-submitted": "no" } }), null);
  assert.equal(autoReplyReason({ ...person, headers: { Precedence: "auto_reply" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "X-Autoreply": "yes" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "List-Id": "<news.example.com>" } }), "mailing_list");
  assert.equal(autoReplyReason({ ...person, fromEmail: "no-reply@example.com" }), "automated_sender");
  assert.equal(autoReplyReason({ ...person, subject: "Automatic reply: 제안" }), "out_of_office");
  assert.equal(autoReplyReason({ ...person, subject: "자동 회신: 제안" }), "out_of_office");
  assert.equal(autoReplyReason({ ...person, subject: "[부재중] 휴가입니다" }), "out_of_office");
  assert.equal(autoReplyReason({ ...person, subject: "Out of Office: back Monday" }), "out_of_office");
  // A person writing about being out is still a person.
  assert.equal(autoReplyReason({ ...person, subject: "Re: 제안 (다음 주에 부재중이에요)" }), null);
});

test("an unsubscribe-style reply is still a reply (Ops decides on the opt-out)", () => {
  const person = { fromEmail: "candidate@example.com", subject: "Re: 제안", headers: {} };
  assert.equal(autoReplyReason({ ...person, subject: "Re: unsubscribe" }), null);
  assert.equal(matchAgentReply(inbound({ subject: "Re: 연락하지 마세요" }), [mail({ rfcMessageId: null })])?.by, "from");
});

test("excerpt: the new text only, at most 500 characters", () => {
  assert.equal(
    replyExcerpt("관심 있어요. 통화 가능할까요?\n\nOn Tue, Nov 17, 2026 at 3:00 PM Sender <\nsender@example.com> wrote:\n> 안녕하세요"),
    "관심 있어요. 통화 가능할까요?",
  );
  assert.equal(
    replyExcerpt("좋아요!\n\n2026년 11월 17일 (화) 오후 3:00, Sender <sender@example.com>님이 작성:\n\n안녕하세요 원문"),
    "좋아요!",
  );
  assert.equal(replyExcerpt("Sounds good.\n\n-----Original Message-----\nFrom: Sender\nHi"), "Sounds good.");
  assert.equal(replyExcerpt("Thanks\n________________________________\nFrom: Sender <sender@example.com>\nSent: today"), "Thanks");
  assert.equal(replyExcerpt("Yes please\n\nFrom: Sender <sender@example.com>\nSubject: Harper"), "Yes please");
  assert.equal(replyExcerpt("네 좋습니다\n\niPhone에서 보냄"), "네 좋습니다");
  assert.equal(replyExcerpt("Line one\n> quoted\nLine two"), "Line one\nLine two");
  assert.equal(replyExcerpt(""), "");
  const long = replyExcerpt("가".repeat(800));
  assert.equal(long.length, 500);
  assert.ok(long.endsWith("…"));
});

test("bounces: only permanent failures, by Message-ID or the failed address", () => {
  const report = { inReplyTo: null, references: null, receivedAt: "2026-11-10T02:00:00.000Z" };
  const failure = { status: "5.1.1", finalRecipient: "candidate@example.com", diagnosticCode: "smtp; 550 no such user" };
  assert.equal(isPermanentFailure(failure), true);
  assert.equal(isPermanentFailure({ ...failure, status: "4.2.2" }), false);
  assert.equal(matchAgentBounce(failure, report, [mail()])?.mailId, "mail-1");
  assert.equal(matchAgentBounce({ ...failure, status: "4.4.7" }, report, [mail()]), null);
  assert.equal(matchAgentBounce({ ...failure, finalRecipient: "else@example.com" }, report, [mail()]), null);
  assert.equal(
    matchAgentBounce({ ...failure, finalRecipient: null }, { ...report, references: "<abc123@send.example.com>" }, [mail()])?.mailId,
    "mail-1",
  );
});

test("a delivery report is recognised by its type or sender, and parsed from the Gmail message", () => {
  assert.equal(maybeDeliveryReport({ fromEmail: "mailer-daemon@example.com", headers: {} }), true);
  assert.equal(maybeDeliveryReport({ fromEmail: "x@example.com", headers: { "Content-Type": "multipart/report; report-type=delivery-status" } }), true);
  assert.equal(maybeDeliveryReport({ fromEmail: "candidate@example.com", headers: { "Content-Type": "text/plain" } }), false);

  const message: GmailMessage = {
    id: "gmail-1", threadId: "thread-1", internalDate: String(Date.parse("2026-11-12T03:00:00Z")), labelIds: ["INBOX"],
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "Candidate <candidate@example.com>" },
        { name: "To", value: "ops@example.com" },
        { name: "Subject", value: "Re: 백엔드 포지션 두 곳을 골라 봤어요" },
        { name: "In-Reply-To", value: "<abc123@send.example.com>" },
        { name: "Auto-Submitted", value: "no" },
      ],
      parts: [{ mimeType: "text/plain", body: { data: Buffer.from("네, 관심 있어요.\n\nOn Mon, Nov 10, 2026 Sender wrote:\n> 원문").toString("base64url") } }],
    },
  };
  const parsed = parseGmailMessage(message);
  const headers = getGmailHeaders(message);
  assert.equal(autoReplyReason({ fromEmail: parsed.fromEmail, subject: parsed.subject, headers }), null);
  assert.equal(matchAgentReply(parsed, [mail()])?.by, "message_id");
  assert.equal(replyExcerpt(parsed.body), "네, 관심 있어요.");
});
