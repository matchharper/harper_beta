import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailMessage, getGmailHeaders, type GmailMessage } from "@/lib/contentsEngine/gmail";
import * as replies from "./replies";
import {
  addressSearches, autoReplyReason, cutQuotedText, isPermanentFailure, isUnsubscribeSubject, mailboxErrorText,
  matchAgentBounce, matchAgentReply, matchAgentUnsubscribe, matchHumanReply, matchInboundReply, maybeDeliveryReport,
  normalizeMessageId, referencedMessageIds, replyAlertText, replyExcerpt, replyMailboxes, replyReadingTroubles,
  type AgentSentMail, type InboundMail, type MailboxReadState, type ThreadMessage,
} from "./replies";

const mail = (patch: Partial<AgentSentMail> = {}): AgentSentMail => ({
  mailId: "mail-1", personId: "person-1", audience: "candidate", toEmail: "candidate@example.com", rfcMessageId: "abc123@send.example.com",
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

test("without the Message-ID: the same sender within 60 days, whatever the subject (design 4장: address only)", () => {
  const mails = [mail({ rfcMessageId: null })];
  assert.equal(matchAgentReply(inbound(), mails)?.by, "from");
  assert.equal(matchAgentReply(inbound({ subject: "백엔드 포지션 두 곳을 골라 봤어요 관련" }), mails)?.by, "from");
  assert.equal(matchAgentReply(inbound({ subject: "회신: 안녕하세요" }), mails)?.by, "from");
  assert.equal(matchAgentReply(inbound({ fromEmail: "Candidate <CANDIDATE@example.com>" }), mails)?.by, "from");
  // A new subject from the same address is still them (it used to be missed).
  assert.equal(matchAgentReply(inbound({ subject: "질문이 하나 있어요" }), mails)?.by, "from");
  // Another sender, older than 60 days, or before the mail went out: no match.
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

test("automatic answers: mail-system markers only, never words in the subject", () => {
  const person = { fromEmail: "candidate@example.com", headers: {} };
  assert.equal(autoReplyReason(person), null);
  assert.equal(autoReplyReason({ ...person, headers: { "Auto-Submitted": "auto-replied" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "auto-submitted": "no" } }), null);
  assert.equal(autoReplyReason({ ...person, headers: { Precedence: "auto_reply" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { Precedence: "bulk" } }), "bulk_or_list");
  assert.equal(autoReplyReason({ ...person, headers: { "X-Autoreply": "yes" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "X-Autorespond": "yes" } }), "auto_submitted");
  assert.equal(autoReplyReason({ ...person, headers: { "List-Id": "<news.example.com>" } }), "mailing_list");
  assert.equal(autoReplyReason({ ...person, fromEmail: "no-reply@example.com" }), "automated_sender");
  assert.equal(autoReplyReason({ ...person, fromEmail: "mailer-daemon@example.com" }), "automated_sender");
});

test("words decide nothing: an out-of-office or stop request in words is a reply for Ashley's decide", () => {
  // The word rules are gone from the code (design 4장 "규칙 판단의 누락").
  for (const name of ["stopRequestIn", "stopRequestPhrase", "looksLikeStopRequest", "isReplySubject"]) {
    assert.equal(name in replies, false, name);
  }
  const mails = [mail({ rfcMessageId: null })];
  for (const subject of ["Automatic reply: 제안", "자동 회신: 제안", "[부재중] 휴가입니다", "Out of Office: back Monday", "Re: 연락하지 마세요", "Re: unsubscribe me", "수신 거부"]) {
    assert.equal(isUnsubscribeSubject(subject), false, subject);
    assert.equal(matchAgentReply(inbound({ subject }), mails)?.by, "from", subject);
  }
});

test("an opt-out mail titled 'unsubscribe' (the List-Unsubscribe mailto)", () => {
  assert.equal(isUnsubscribeSubject("unsubscribe"), true);
  assert.equal(isUnsubscribeSubject(" Unsubscribe "), true);
  assert.equal(isUnsubscribeSubject("Re: unsubscribe"), true);
  assert.equal(isUnsubscribeSubject("UNSUBSCRIBE"), true);
  // Words a person writes are theirs for Ashley to judge.
  assert.equal(isUnsubscribeSubject("수신거부"), false);
  assert.equal(isUnsubscribeSubject("unsubscribe me"), false);
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

// Quote headers as mail apps write them (two of the first 16 real replies were Chinese and Ukrainian Gmail and kept
// our quoted mail as their text).
const QUOTE_CASES: Array<[string, string, string]> = [
  ["English Gmail", "Sounds good.\n\nOn Thu, Nov 19, 2026 at 1:52 PM Ashley Kim <ashley@example.com> wrote:\n\n> Hi there", "Sounds good."],
  ["English Gmail, wrapped", "Yes!\n\nOn Thu, Nov 19, 2026 at 1:52 PM Ashley Kim <\nashley@example.com> wrote:\n> Hi", "Yes!"],
  ["Apple Mail", "Sure\n\nOn Nov 19, 2026, at 13:52, Ashley Kim <ashley@example.com> wrote:\n\n> Hi", "Sure"],
  ["Korean Gmail", "좋아요!\n\n2026년 11월 19일 (목) 오후 1:52, Ashley Kim <ashley@example.com>님이 작성:\n\n> 안녕하세요", "좋아요!"],
  ["Korean, name first", "네 좋습니다\n\nAshley Kim <ashley@example.com>님이 작성:\n> 안녕하세요", "네 좋습니다"],
  ["Chinese Gmail, 于…写道", "感谢联系，我很感兴趣。\n\nAshley Kim <ashley@example.com> 于2026年11月19日周四 13:52写道：\n\n> Hi there", "感谢联系，我很感兴趣。"],
  ["Chinese Gmail, date first", "可以聊聊。\n\n2026年11月19日周四 13:52，Ashley Kim <ashley@example.com> 写道：\n\n> Hi", "可以聊聊。"],
  ["Chinese Gmail, wrapped", "好的\n\nAshley Kim <ashley@example.com> 于2026年11月19日周四\n13:52写道：\n> Hi", "好的"],
  ["Chinese, ASCII colon", "好的\n\nAshley Kim <ashley@example.com> 于2026年11月19日周四 13:52写道:\n> Hi", "好的"],
  ["Traditional Chinese", "謝謝\n\nAshley Kim <ashley@example.com> 於 2026年11月19日 週四 下午1:52寫道：\n\n> Hi", "謝謝"],
  ["Chinese, no blank line above", "好的\nAshley Kim <ashley@example.com> 于2026年11月19日周四 13:52写道：\n> Hi", "好的"],
  ["Ukrainian Gmail", "Дякую, цікаво.\n\nчт, 19 лист. 2026 р. о 13:52 Ashley Kim <ashley@example.com> пише:\n\n> Hi", "Дякую, цікаво."],
  ["Ukrainian Gmail, wrapped", "Так\n\nчт, 19 лист. 2026 р. о 13:52 Ashley Kim <\nashley@example.com> пише:\n> Hi", "Так"],
  ["Russian Gmail", "Да, интересно\n\nчт, 19 нояб. 2026 г. в 13:52, Ashley Kim <ashley@example.com>:\n\n> Hi", "Да, интересно"],
  ["German Gmail", "Gerne!\n\nAm Do., 19. Nov. 2026 um 13:52 Uhr schrieb Ashley Kim <ashley@example.com>:\n\n> Hi", "Gerne!"],
  ["Spanish Gmail", "Me interesa\n\nEl jue, 19 nov 2026 a las 13:52, Ashley Kim (<ashley@example.com>) escribió:\n\n> Hi", "Me interesa"],
  ["Outlook block", "Yes please\n\nFrom: Ashley Kim <ashley@example.com>\nSubject: Harper", "Yes please"],
  ["Chinese Outlook block", "好的\n\n发件人：Ashley Kim <ashley@example.com>\n主题：Harper", "好的"],
  ["QQ Mail", "好的\n\n------------------ 原始邮件 ------------------\n发件人: Ashley", "好的"],
  ["'>' quoted lines between answers", "Yes\n> Are you open to remote?\nI am in Seoul\n> Salary?", "Yes\nI am in Seoul"],
  ["the person's own 'I wrote:'", "Here is what I wrote:\nI build payment APIs.", "Here is what I wrote:\nI build payment APIs."],
  ["the person's own year and colon", "In 2025 I wrote:\nmostly Go.", "In 2025 I wrote:\nmostly Go."],
  ["no quote", "Interested. When can we talk?", "Interested. When can we talk?"],
];

test("quoted text is cut: the reply's own new text only, in every mail app's format", () => {
  for (const [name, body, expected] of QUOTE_CASES) assert.equal(cutQuotedText(body), expected, name);
  // Full length (the store keeps it); the excerpt caps it.
  assert.equal(cutQuotedText("가".repeat(9_000)).length, 9_000);
  assert.equal(cutQuotedText("Hi\r\n\r\nOn Thu, Nov 19, 2026 Ashley wrote:\r\n> x"), "Hi");
});

const thread = (patch: Partial<ThreadMessage> = {}): ThreadMessage => ({
  rootMailId: "mail-1", rfcMessageId: "<ashley-reply-1@send.example.com>", gmailThreadId: "gmail-thread-1", ...patch,
});
const threaded = (patch: Partial<InboundMail & { threadId: string | null }> = {}) => ({ ...inbound(), threadId: "other-thread", ...patch });

test("a reply is matched to its thread: our Message-ID, a stored message of the thread, the Gmail thread, the address", () => {
  const mails = [mail(), mail({ mailId: "mail-2", personId: "person-2", toEmail: "second@example.com", rfcMessageId: "second@send.example.com" })];
  // Our mail's Message-ID.
  assert.deepEqual(
    matchInboundReply(threaded({ references: "<ABC123@send.example.com>" }), mails, []),
    { mail: mails[0], by: "message_id", otherSender: false },
  );
  // A later reply that names only Ashley's reply (stored), or is in the same Gmail thread as a stored message.
  const later = matchInboundReply(threaded({ fromEmail: "second@example.com", inReplyTo: "<Ashley-Reply-1@send.example.com>" }), mails, [thread({ rootMailId: "mail-2" })]);
  assert.equal(later?.mail.mailId, "mail-2");
  assert.equal(later?.by, "thread");
  assert.equal(later?.otherSender, false);
  assert.equal(matchInboundReply(threaded({ fromEmail: "second@example.com", threadId: "gmail-thread-1" }), mails, [thread({ rootMailId: "mail-2" })])?.by, "thread");
  // The address alone.
  assert.equal(matchInboundReply(threaded(), mails, [])?.by, "from");
  // Nothing threads it: unmatched (never opened).
  assert.equal(matchInboundReply(threaded({ fromEmail: "notices@example.net", subject: "People you may know" }), mails, [thread()]), null);
});

test("sender check: a Message-ID or thread match from another address is handed to a person, never answered by Ashley", () => {
  const mails = [mail()];
  const colleague = matchInboundReply(threaded({ fromEmail: "Colleague <colleague@example.org>", references: "<abc123@send.example.com>" }), mails, []);
  assert.equal(colleague?.by, "message_id");
  assert.equal(colleague?.otherSender, true);
  const inThread = matchInboundReply(threaded({ fromEmail: "colleague@example.org", threadId: "gmail-thread-1" }), mails, [thread()]);
  assert.equal(inThread?.by, "thread");
  assert.equal(inThread?.otherSender, true);
  // The recipient in another case or display form is the same sender.
  assert.equal(matchInboundReply(threaded({ fromEmail: "Candidate <CANDIDATE@example.com>", references: "<abc123@send.example.com>" }), mails, [])?.otherSender, false);
  assert.equal(replies.OTHER_ADDRESS_NOTE, "다른 주소에서 옴");
});

test("a person's answer from the mailbox (SENT) counts only in one of our threads, never by address", () => {
  const mails = [mail()];
  const sent = (patch: Partial<{ inReplyTo: string | null; references: string | null; threadId: string | null; receivedAt: string }> = {}) => ({
    inReplyTo: null, references: null, threadId: "unrelated-thread", receivedAt: "2026-11-12T05:00:00.000Z", ...patch,
  });
  // Names our mail, names a stored message of the thread, or shares a Gmail thread with a stored one.
  assert.equal(matchHumanReply(sent({ references: "<candidate-reply@mail.example.com> <abc123@send.example.com>" }), mails, [])?.mailId, "mail-1");
  assert.equal(matchHumanReply(sent({ inReplyTo: "<candidate-reply@mail.example.com>" }), mails, [thread({ rfcMessageId: "<Candidate-Reply@mail.example.com>" })])?.mailId, "mail-1");
  assert.equal(matchHumanReply(sent({ threadId: "gmail-thread-1" }), mails, [thread()])?.mailId, "mail-1");
  // Other work done from the mailbox (even to an address we mailed): ignored.
  assert.equal(matchHumanReply(sent(), mails, [thread()]), null);
  assert.equal(matchHumanReply(sent({ inReplyTo: "<someone-else@mail.example.com>" }), mails, [thread()]), null);
  // A stored message whose root mail is not loaded gives nothing.
  assert.equal(matchHumanReply(sent({ threadId: "gmail-thread-1" }), [], [thread()]), null);
});

test("the one-time backfill searches every mail from or to our recipients, a few addresses per search", () => {
  const addresses = Array.from({ length: 45 }, (_, index) => `person${index}@example.com`);
  const searches = addressSearches([...addresses, "PERSON0@example.com", "bad address", "x{y}@example.com"], 14);
  assert.equal(searches.length, 3);
  assert.ok(searches[0].startsWith("newer_than:14d {from:person0@example.com to:person0@example.com from:person1@example.com"));
  assert.ok(searches[2].endsWith("from:person44@example.com to:person44@example.com}"));
  assert.equal(searches.join(" ").includes("bad"), false);
  assert.equal(searches.join(" ").includes("{y}"), false);
  assert.deepEqual(addressSearches([], 14), []);
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
  assert.equal(autoReplyReason({ fromEmail: parsed.fromEmail, headers }), null);
  assert.equal(matchAgentReply(parsed, [mail()])?.by, "message_id");
  assert.equal(replyExcerpt(parsed.body), "네, 관심 있어요.");
});

test("the Slack message for a reply: the title, who, the reply quoted, and a link that opens the person on /ops #5", () => {
  const base = {
    personId: "00000000-0000-4000-8000-000000000001", name: "Kim Minji", email: "candidate@example.com", source: "linkedin",
    isTest: false, otherSender: null, reply: "Thanks, I'd love to hear more.\nWhen can we talk?", origin: "https://matchharper.com",
  };
  assert.equal(replyAlertText(base), [
    "*[gtm agent · 답장]*",
    "Kim Minji · candidate@example.com · 링크드인",
    "> Thanks, I'd love to hear more.",
    "> When can we talk?",
    "<https://matchharper.com/ops/gtm-plays?tab=5&open=person&person=00000000-0000-4000-8000-000000000001&q=candidate%40example.com|/ops에서 이 사람 보기>",
  ].join("\n"));
  // A reply from another sender and a test person are marked; no name (or the address as the name) shows the address
  // once; an unknown source shows as it is.
  const other = replyAlertText({ ...base, name: null, source: "old-source", isTest: true, otherSender: "colleague@example.org" });
  assert.equal(other.split("\n")[0], "*[gtm agent · 답장]* (다른 주소에서 옴 colleague@example.org, 테스트)");
  assert.equal(other.split("\n")[1], "candidate@example.com · old-source");
  assert.equal(replyAlertText({ ...base, name: "Candidate@example.com" }).split("\n")[1], "candidate@example.com · 링크드인");
  assert.equal(replyAlertText({ ...base, source: "explore" }).split("\n")[1], "Kim Minji · candidate@example.com · 열린 웹");
  // A reply with no new text of its own, and Slack's special characters never turning into a link or mention.
  assert.equal(replyAlertText({ ...base, reply: "  " }).split("\n")[2], "> (새로 쓴 글 없이 답장만 왔어요)");
  const escaped = replyAlertText({ ...base, name: "<!channel>", reply: "a < b & <https://x.example|click>" });
  assert.equal(escaped.split("\n")[1], "&lt;!channel&gt; · candidate@example.com · 링크드인");
  assert.equal(escaped.split("\n")[2], "> a &lt; b &amp; &lt;https://x.example|click&gt;");
});

test("a reply from the same mailbox under a plain address is the recipient's own (name+hn@gmail.com, 11/21)", async () => {
  const { mailboxKey, sameMailbox } = await import("./replies");
  assert.equal(mailboxKey("Candidate <Name+HN@gmail.com>"), "name@gmail.com");
  assert.equal(mailboxKey("na.me@googlemail.com"), "name@gmail.com");
  assert.equal(mailboxKey("first.last+jobs@example.com"), "first.last@example.com");
  assert.equal(sameMailbox("name+hn@gmail.com", "name@gmail.com"), true);
  assert.equal(sameMailbox("first.last@example.com", "firstlast@example.com"), false);
  assert.equal(sameMailbox("colleague@example.com", "name@example.com"), false);
  const mails = [{ mailId: "m1", personId: "p1", audience: "candidate" as const, toEmail: "name+hn@gmail.com", rfcMessageId: "abc@send.example.com", subject: "Roles", sentAt: "2026-11-19T00:00:00.000Z" }];
  const inbound = {
    fromEmail: "name@gmail.com", subject: "Re: Roles", receivedAt: "2026-11-19T04:52:00.000Z", inReplyTo: "<abc@send.example.com>",
    references: "<abc@send.example.com>", threadId: null,
  };
  assert.equal(matchInboundReply(inbound as never, mails, [])?.otherSender, false);
  assert.equal(matchInboundReply({ ...inbound, inReplyTo: null, references: null } as never, mails, [])?.mail.mailId, "m1");
  assert.equal(matchInboundReply({ ...inbound, fromEmail: "colleague@example.com" } as never, mails, [])?.otherSender, true);
});
