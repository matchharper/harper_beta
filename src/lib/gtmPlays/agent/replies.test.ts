import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailMessage, getGmailHeaders, type GmailMessage } from "@/lib/contentsEngine/gmail";
import {
  autoReplyReason, isPermanentFailure, isReplySubject, isUnsubscribeSubject, looksLikeStopRequest, mailboxErrorText,
  matchAgentBounce, matchAgentReply, matchAgentUnsubscribe, maybeDeliveryReport, normalizeMessageId, referencedMessageIds,
  replyAlertText, replyExcerpt, replyMailboxes, replyReadingTroubles, stopRequestIn, stopRequestPhrase, type AgentSentMail,
  type InboundMail, type MailboxReadState,
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

test("an unsubscribe-style reply is still a reply, and reads as a stop request", () => {
  const person = { fromEmail: "candidate@example.com", subject: "Re: 제안", headers: {} };
  assert.equal(autoReplyReason({ ...person, subject: "Re: unsubscribe" }), null);
  assert.equal(matchAgentReply(inbound({ subject: "Re: 연락하지 마세요" }), [mail({ rfcMessageId: null })])?.by, "from");
  assert.equal(stopRequestIn({ text: "", subject: "Re: 연락하지 마세요", sentSubject: mail().subject }), "연락하지 마");
});

test("stop requests: asking not to be contacted again, in Korean and English", () => {
  for (const text of [
    "앞으로 연락하지 마세요", "이런 연락 원치 않습니다", "수신거부 부탁드려요", "수신 거부합니다", "연락 주지 마세요",
    "메일 그만 보내 주세요", "더 이상 메일 받고 싶지 않아요", "이메일 보내지 마세요", "그만", "그만요!", "그만하세요.",
    "Please stop contacting me.", "Remove me from your list", "unsubscribe", "Please UNSUBSCRIBE me", "opt me out",
    "Do not email me again", "Don't contact me", "no more emails please", "STOP", "Take me off this list",
    "앞으로 보내지 마세요", "더 이상 이런 거 보내지 마세요", "보내지 마세요.",
  ]) {
    assert.equal(looksLikeStopRequest(text), true, text);
  }
  for (const text of [
    "관심 있어요! 통화 가능할까요?", "지금은 이직 생각이 없어요", "회사를 그만두고 쉬는 중이에요", "그만큼 좋은 자리면 보고 싶어요",
    "Not interested right now, thanks", "Please do not email my work address, use this one", "Do not email members of my team", "I stopped by your site",
    "Could you send me more details?", "링크만 보내지 마시고 설명도 같이 주세요", "", null,
  ]) {
    assert.equal(looksLikeStopRequest(text), false, String(text));
  }
  assert.equal(stopRequestPhrase("감사하지만 앞으로 연락하지 마세요."), "연락하지 마");
  assert.equal(stopRequestPhrase("  그만  "), "그만");
});

test("stop requests: our own opt-out line and subject quoted back are not the person's words", () => {
  const sentSubject = "Unsubscribe 걱정 없는 백엔드 포지션";
  // Our footer quoted in a reply the quote cutting did not catch.
  assert.equal(stopRequestIn({ text: "좋아요, 다음 주에 통화해요\n이런 메일을 더 받지 않으시려면 여기를 눌러 주세요.", subject: "Re: x", sentSubject }), null);
  assert.equal(stopRequestIn({ text: "Sounds good!\nIf you'd rather not hear from Harper again, unsubscribe here.", subject: "Re: x", sentSubject }), null);
  assert.equal(stopRequestIn({ text: "Sounds good!\nIf you’d rather not hear from Harper again,\nunsubscribe here (https://example.com/u).", subject: "Re: x", sentSubject }), null);
  assert.equal(stopRequestIn({ text: "Please unsubscribe me.\nIf you'd rather not hear from Harper again, unsubscribe here.", subject: "Re: x", sentSubject }), "unsubscribe");
  // The mail's own subject with a reply prefix is not a request; words the person added to it are.
  assert.equal(stopRequestIn({ text: "네 관심 있어요", subject: `Re: ${sentSubject}`, sentSubject }), null);
  assert.equal(stopRequestIn({ text: "", subject: `Re: ${sentSubject} - 수신거부`, sentSubject }), "수신거부");
  assert.equal(stopRequestIn({ text: "Please remove me from this list.", subject: "Re: x", sentSubject }), "remove me");
});

test("an opt-out mail titled 'unsubscribe' (the List-Unsubscribe mailto)", () => {
  assert.equal(isUnsubscribeSubject("unsubscribe"), true);
  assert.equal(isUnsubscribeSubject(" Unsubscribe "), true);
  assert.equal(isUnsubscribeSubject("Re: unsubscribe"), true);
  assert.equal(isUnsubscribeSubject("수신거부"), true);
  assert.equal(isUnsubscribeSubject("수신 거부합니다"), true);
  assert.equal(isUnsubscribeSubject("How to unsubscribe from LinkedIn alerts"), false);
  assert.equal(isUnsubscribeSubject("Re: 백엔드 포지션 두 곳을 골라 봤어요"), false);
  assert.equal(isUnsubscribeSubject(""), false);

  const optOut = { fromEmail: "Candidate <CANDIDATE@example.com>", inReplyTo: null, references: null, receivedAt: "2027-06-01T00:00:00.000Z" };
  const mails = [
    mail({ rfcMessageId: null }),
    mail({ mailId: "followup", rfcMessageId: null, sentAt: "2026-11-17T01:00:00.000Z" }),
    mail({ mailId: "other", personId: "person-2", toEmail: "someone@example.com", rfcMessageId: "other@send.example.com" }),
  ];
  // From an address an agent mail went to, however long after: the latest mail to it.
  assert.equal(matchAgentUnsubscribe(optOut, mails)?.mailId, "followup");
  // Naming a mail by Message-ID, from any address.
  assert.equal(matchAgentUnsubscribe({ ...optOut, fromEmail: "x@example.org", references: "<other@send.example.com>" }, mails)?.mailId, "other");
  // From an address no agent mail went to, or before any mail went out: nothing.
  assert.equal(matchAgentUnsubscribe({ ...optOut, fromEmail: "stranger@example.com" }, mails), null);
  assert.equal(matchAgentUnsubscribe({ ...optOut, receivedAt: "2026-11-01T00:00:00.000Z" }, mails), null);
});

test("reply reading health: an error, never read, or no read for 30 minutes, while agent mail is recent", () => {
  const now = new Date("2026-11-17T06:00:00.000Z");
  const ok: MailboxReadState = { email: "ops@example.com", lastSyncedAt: "2026-11-17T05:55:00.000Z", lastError: null };
  const base = { recentMail: true, configured: true, mailboxes: ["ops@example.com"], states: [ok], now };
  assert.deepEqual(replyReadingTroubles(base), []);
  // Nothing to read without recent agent mail.
  assert.deepEqual(replyReadingTroubles({ ...base, recentMail: false, configured: false, states: [] }), []);
  assert.deepEqual(replyReadingTroubles({ ...base, configured: false }), [
    { mailbox: null, problem: "이 서버에 메일함을 읽는 설정이 없어요", lastReadAt: null },
  ]);
  assert.equal(replyReadingTroubles({ ...base, mailboxes: [] })[0].mailbox, null);
  // The last read failed: the mailbox and why, in plain words, with the last good read.
  const denied = replyReadingTroubles({
    ...base, states: [{ ...ok, lastError: "unauthorized_client: Client is unauthorized to retrieve access tokens using this method" }],
  });
  assert.deepEqual(denied, [{ mailbox: "ops@example.com", problem: "권한 없음(관리 콘솔에서 읽기 권한 추가 필요)", lastReadAt: ok.lastSyncedAt }]);
  // Never read, and no read for more than 30 minutes.
  assert.equal(replyReadingTroubles({ ...base, states: [] })[0].problem, "아직 한 번도 읽지 못했어요");
  assert.equal(replyReadingTroubles({ ...base, states: [{ ...ok, lastSyncedAt: "2026-11-17T05:29:00.000Z" }] })[0].problem, "30분 넘게 읽지 못했어요");
  assert.deepEqual(replyReadingTroubles({ ...base, states: [{ ...ok, lastSyncedAt: "2026-11-17T05:31:00.000Z" }] }), []);
  // One line per mailbox that is not read; a mailbox no longer configured is not checked.
  const two = replyReadingTroubles({
    ...base, mailboxes: ["ops@example.com", "team@example.com"],
    states: [ok, { email: "old@example.com", lastSyncedAt: null, lastError: "Gmail API 403: forbidden" }],
  });
  assert.deepEqual(two.map((item) => item.mailbox), ["team@example.com"]);
});

test("mailbox errors in plain words", () => {
  assert.equal(mailboxErrorText("Gmail API 403: {\"error\":{\"message\":\"Delegation denied\"}}"), "권한 없음(관리 콘솔에서 읽기 권한 추가 필요)");
  assert.equal(mailboxErrorText("invalid_grant: Invalid email or User ID"), "메일함을 찾지 못함(주소가 맞는지, Gmail을 쓰는 계정인지 확인 필요)");
  assert.equal(mailboxErrorText("reply sync ran out of time"), "시간 안에 다 읽지 못함(다음 확인 때 이어서 읽어요)");
  assert.equal(mailboxErrorText("The operation was aborted due to timeout"), "시간 안에 다 읽지 못함(다음 확인 때 이어서 읽어요)");
  assert.equal(mailboxErrorText("Gmail API 429: rateLimitExceeded"), "Gmail 요청 한도 초과(잠시 뒤 다시 읽어요)");
  assert.equal(mailboxErrorText("Gmail API 503: backend error"), "Gmail 연결 오류(잠시 뒤 다시 읽어요)");
  assert.equal(mailboxErrorText("something else"), "오류: something else");
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

test("the Slack message for a reply: who, address and source, the reply quoted, and the /ops #5 link", () => {
  const base = {
    name: "Kim Minji", email: "candidate@example.com", source: "linkedin", isTest: false, stopWords: null,
    reply: "Thanks, I'd love to hear more.\nWhen can we talk?", origin: "https://matchharper.com",
  };
  assert.equal(replyAlertText(base), [
    "[#5 답장] Kim Minji",
    "candidate@example.com · 링크드인",
    "> Thanks, I'd love to hear more.",
    "> When can we talk?",
    "<https://matchharper.com/ops/gtm-plays?tab=5|/ops #5에서 보기>",
  ].join("\n"));
  // A stop request and a test person are marked; no name falls back to the address; an unknown source shows as it is.
  const stop = replyAlertText({ ...base, name: null, source: "old-source", isTest: true, stopWords: "unsubscribe" });
  assert.equal(stop.split("\n")[0], "[#5 답장] candidate@example.com (연락 그만 요청, 테스트)");
  assert.equal(stop.split("\n")[1], "candidate@example.com · old-source");
  assert.equal(replyAlertText({ ...base, source: "explore" }).split("\n")[1], "candidate@example.com · 열린 웹");
  // A reply with no new text of its own, and Slack's special characters never turning into a link or mention.
  assert.equal(replyAlertText({ ...base, reply: "  " }).split("\n")[2], "> (새로 쓴 글 없이 답장만 왔어요)");
  const escaped = replyAlertText({ ...base, name: "<!channel>", reply: "a < b & <https://x.example|click>" });
  assert.equal(escaped.split("\n")[0], "[#5 답장] &lt;!channel&gt;");
  assert.equal(escaped.split("\n")[2], "> a &lt; b &amp; &lt;https://x.example|click&gt;");
});
