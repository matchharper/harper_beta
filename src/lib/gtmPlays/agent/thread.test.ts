import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersonThread, kstMonthDay, QUEUED_LATE_MS, whoLabel, type ThreadCompanyMail, type ThreadFacts, type ThreadMail,
  type ThreadMessage, type ThreadRow,
} from "./thread";

const PERSON = "00000000-0000-4000-8000-000000000001";
const FIRST = "00000000-0000-4000-8000-0000000000f1";
const FOLLOWUP = "00000000-0000-4000-8000-0000000000f2";
const COMPANY_MAIL = "00000000-0000-4000-8000-0000000000c1";

const facts = (patch: Partial<ThreadFacts> = {}): ThreadFacts => ({
  person: {
    id: PERSON, createdAt: "2026-11-18T00:00:00.000Z", source: "linkedin", method: "signal_post", searchQuery: "백엔드 이직",
    signalText: "이직 준비 중이에요", signalUrl: "https://example.com/post", signalAt: "2026-11-17T00:00:00.000Z",
    signalScore: 80, matchScore: 70, profileUrl: null, email: "a@example.com", mailId: FIRST, followupMailId: null, events: [],
  },
  postings: [{ companyName: "고객사 A", title: "백엔드", kind: "customer" }],
  mails: [], messages: [], companyMails: [], relays: [], introRequests: [], harperMessages: [], stages: [], connections: [],
  ...patch,
});

const mail = (patch: Partial<ThreadMail> = {}): ThreadMail => ({
  id: FIRST, kind: "first", subject: "후보 A님께 소개하고 싶은 팀", textBody: "안녕하세요", html: null, toEmail: "a@example.com",
  fromEmail: "ashley@example.com", status: "sent", deliveryStatus: null, deliveryEventAt: null, sentAt: "2026-11-18T01:00:00.000Z",
  firstOpenedAt: null, openCount: 0, unsubscribedAt: null, signedUpAt: null, postings: [], rfcMessageId: "<first@example.com>", ...patch,
});

const message = (patch: Partial<ThreadMessage>): ThreadMessage => ({
  id: "m", personId: PERSON, counterpartKind: "candidate", counterpartEmail: "a@example.com", fromEmail: null, author: "counterpart",
  direction: "inbound", gmailThreadId: "t1", rfcMessageId: null, inReplyTo: null, subject: "Re: 소개", bodyText: "full", newText: "new",
  rootMailId: FIRST, decision: null, decisionReason: null, signals: [], answeredByMessageId: null, sendStatus: null,
  providerMessageId: null, error: null, occurredAt: "2026-11-18T02:00:00.000Z", answersMessageId: null, decidedAt: null,
  answeredWithLater: false, ...patch,
});

const companyMail = (patch: Partial<ThreadCompanyMail> = {}): ThreadCompanyMail => ({
  id: COMPANY_MAIL, toEmail: "jobs@company-b.example", subject: "관심 보인 후보가 있어요", sentAt: "2026-11-19T01:00:00.000Z", status: "sent",
  deliveryStatus: null, companyName: "고객사 B", postingTitle: "프론트엔드", postingUrl: "https://company-b.example/jobs/1",
  rfcMessageId: "<company@example.com>", claimedAt: null, workspaceName: null,
  facts: {
    interestedPersonIds: [PERSON], newPersonIds: [PERSON], askedPersonIds: [PERSON], threadRootId: null,
    lines: [{ kind: "interested", id: PERSON, line1: "백엔드 5년 · 서울", line2: "결제 시스템을 만들었어요" }],
  }, ...patch,
});

const keys = (rows: readonly ThreadRow[]) => rows.map((row) => row.key);
const byKey = (rows: readonly ThreadRow[], key: string) => {
  const found = rows.find((row) => row.key === key);
  assert.ok(found, `row ${key}`);
  return found;
};

test("nothing but the person: one 찾음 row and no list summary", () => {
  const thread = buildPersonThread(facts());
  assert.deepEqual(keys(thread.rows), ["found"]);
  assert.equal(thread.rows[0].what, "찾음");
  assert.equal(thread.rows[0].found?.query, "백엔드 이직");
  assert.deepEqual(thread.rows[0].who, { kind: "agent" });
  assert.equal(thread.summary, null);
});

test("one time order: at the same moment our mail, then the click, then their reply, its decision and Ashley's answer", () => {
  const at = "2026-11-18T05:00:00.000Z";
  const thread = buildPersonThread(facts({
    mails: [mail({ sentAt: at, firstOpenedAt: at })],
    messages: [
      message({ id: "reply", author: "ashley", direction: "outbound", sendStatus: "sent", answersMessageId: "in", occurredAt: at }),
      message({ id: "in", occurredAt: at, decision: "reply", decisionReason: "질문 · 연봉을 물어봄", decidedAt: at }),
    ],
  }));
  assert.deepEqual(keys(thread.rows), ["found", `mail:${FIRST}`, `mail:${FIRST}:clicked`, "msg:in", "decision:in", "msg:reply"]);
});

test("a decision sits right under the mail it judged, even when it was decided after later rows", () => {
  const thread = buildPersonThread(facts({
    mails: [mail({ firstOpenedAt: "2026-11-18T03:00:00.000Z" })],
    messages: [message({ id: "in", occurredAt: "2026-11-18T02:00:00.000Z", decision: "no_reply", decisionReason: "고마움만 · 감사 인사", decidedAt: "2026-11-18T04:00:00.000Z" })],
  }));
  assert.deepEqual(keys(thread.rows), ["found", `mail:${FIRST}`, "msg:in", "decision:in", `mail:${FIRST}:clicked`]);
  const decision = byKey(thread.rows, "decision:in");
  assert.equal(decision.what, "판단: 답 안 함");
  assert.equal(decision.text, "고마움만 · 감사 인사");
  assert.equal(decision.at, "2026-11-18T04:00:00.000Z");
  assert.deepEqual(decision.who, { kind: "ashley" });
});

test("links: their reply names our first mail (In-Reply-To, else the thread's root); Ashley's reply names their reply", () => {
  const thread = buildPersonThread(facts({
    mails: [mail(), mail({ id: FOLLOWUP, kind: "followup", sentAt: "2026-11-20T01:00:00.000Z", rfcMessageId: "<followup@example.com>" })],
    messages: [
      message({ id: "in1", inReplyTo: "<FIRST@example.com>", rootMailId: FOLLOWUP, decision: "reply" }),
      message({ id: "in2", inReplyTo: null, rootMailId: FOLLOWUP, occurredAt: "2026-11-20T02:00:00.000Z", decision: "reply" }),
      message({ id: "reply", author: "ashley", direction: "outbound", sendStatus: "sent", answersMessageId: "in2", occurredAt: "2026-11-20T03:00:00.000Z", rfcMessageId: "<ashley@example.com>" }),
      message({ id: "in3", inReplyTo: "<ashley@example.com>", occurredAt: "2026-11-21T02:00:00.000Z" }),
    ],
  }));
  const in1 = byKey(thread.rows, "msg:in1");
  assert.equal(in1.what, "답장");
  assert.deepEqual(in1.link, { refs: [{ key: `mail:${FIRST}`, at: "2026-11-18T01:00:00.000Z" }], words: "첫 메일에" });
  assert.deepEqual(byKey(thread.rows, "msg:in2").link?.words, "후속 메일에");
  const reply = byKey(thread.rows, "msg:reply");
  assert.equal(reply.what, "답장");
  assert.deepEqual(reply.link, { refs: [{ key: "msg:in2", at: "2026-11-20T02:00:00.000Z" }], words: "답장에" });
  assert.deepEqual(byKey(thread.rows, "msg:in3").link, { refs: [{ key: "msg:reply", at: "2026-11-20T03:00:00.000Z" }], words: "답장에" });
});

test("mails answered together: the reply names all of them, and the closed one's decision points to that reply", () => {
  const thread = buildPersonThread(facts({
    mails: [mail()],
    messages: [
      message({ id: "early", occurredAt: "2026-11-19T01:00:00.000Z", decision: "no_reply", decisionReason: "함께 답함", answeredWithLater: true }),
      message({ id: "late", occurredAt: "2026-11-19T05:00:00.000Z", decision: "reply", decisionReason: "질문 · 근무지" }),
      message({ id: "reply", author: "ashley", direction: "outbound", sendStatus: "sent", answersMessageId: "late", occurredAt: "2026-11-20T00:00:00.000Z" }),
    ],
  }));
  const reply = byKey(thread.rows, "msg:reply");
  assert.deepEqual(reply.link?.refs.map((item) => item.key), ["msg:early", "msg:late"]);
  const early = byKey(thread.rows, "decision:early");
  assert.equal(early.what, "판단: 함께 답함");
  assert.equal(early.text, null);
  assert.deepEqual(early.link, { refs: [{ key: "msg:reply", at: "2026-11-20T00:00:00.000Z" }], words: "답장에서" });
  // The newest one handed to a person instead: the closed one was judged with it.
  const handed = buildPersonThread(facts({
    messages: [
      message({ id: "early", occurredAt: "2026-11-19T01:00:00.000Z", decision: "no_reply", answeredWithLater: true }),
      message({ id: "late", occurredAt: "2026-11-19T05:00:00.000Z", decision: "hand_to_human", decisionReason: "봇인지 물어봄" }),
    ],
  }));
  assert.deepEqual(byKey(handed.rows, "decision:early").link, { refs: [{ key: "msg:late", at: "2026-11-19T05:00:00.000Z" }], words: "답장과 함께" });
  const late = byKey(handed.rows, "decision:late");
  assert.equal(late.what, "판단: 사람에게");
  assert.equal(late.trouble, true, "no one answered the handed-over mail yet");
});

test("held, failed and long-queued Ashley replies are red with why; a sent one is not", () => {
  const now = new Date("2026-11-22T00:00:00.000Z");
  const thread = buildPersonThread(facts({
    messages: [
      message({ id: "in", decision: "reply" }),
      message({ id: "held", author: "ashley", direction: "outbound", sendStatus: "held", error: "보내기 전 점검 · 링크", answersMessageId: "in" }),
      message({ id: "queued", author: "ashley", direction: "outbound", sendStatus: "queued", occurredAt: new Date(now.getTime() - QUEUED_LATE_MS - 1).toISOString() }),
      message({ id: "fresh", author: "ashley", direction: "outbound", sendStatus: "queued", occurredAt: now.toISOString() }),
      message({ id: "sent", author: "ashley", direction: "outbound", sendStatus: "sent", occurredAt: "2026-11-21T00:00:00.000Z" }),
    ],
  }), now);
  const held = byKey(thread.rows, "msg:held");
  assert.equal(held.what, "답장 · 안 보냄");
  assert.equal(held.trouble, true);
  assert.equal(held.note, "보내기 전 점검 · 링크");
  assert.equal(byKey(thread.rows, "msg:queued").trouble, true);
  assert.equal(byKey(thread.rows, "msg:fresh").trouble, false);
  assert.equal(byKey(thread.rows, "msg:sent").trouble, false);
  assert.equal(byKey(thread.rows, "msg:sent").what, "메일");
});

test("company rows sit in the same time order, the company in 누가, each linked to what it answers", () => {
  const thread = buildPersonThread(facts({
    mails: [mail()],
    messages: [
      message({ id: "in", occurredAt: "2026-11-18T02:00:00.000Z", decision: "reply", signals: [{
        personId: PERSON, postingUrl: "https://company-b.example/jobs/1", companyName: "고객사 B", postingTitle: "프론트엔드",
        question: "재택이 되나요?", summaryConsent: true, at: "2026-11-18T02:00:00.000Z", messageId: "in",
      }] }),
      message({ id: "company-in", personId: null, counterpartKind: "company", counterpartEmail: "jobs@company-b.example", rootMailId: COMPANY_MAIL, occurredAt: "2026-11-20T01:00:00.000Z", decision: "reply" }),
      message({ id: "to-company", personId: null, author: "ashley", direction: "outbound", counterpartKind: "company", counterpartEmail: "jobs@company-b.example", rootMailId: COMPANY_MAIL, sendStatus: "sent", answersMessageId: "company-in", occurredAt: "2026-11-20T02:00:00.000Z" }),
      message({ id: "relay", author: "ashley", direction: "outbound", sendStatus: "sent", answersMessageId: "company-in", occurredAt: "2026-11-20T03:00:00.000Z" }),
      message({ id: "tell", author: "ashley", direction: "outbound", sendStatus: "sent", providerMessageId: "provider-1", occurredAt: "2026-11-23T01:00:00.000Z" }),
    ],
    companyMails: [companyMail({ claimedAt: "2026-11-21T00:00:00.000Z", workspaceName: "고객사 B" })],
    relays: [{ companyEmail: "jobs@company-b.example", kind: "answer", companyMailId: COMPANY_MAIL, inboundMessageId: "company-in", createdAt: "2026-11-20T03:00:00.000Z", joinedNotedAt: null }],
    introRequests: [{
      id: "ask", companyMailId: COMPANY_MAIL, status: "invited", createdAt: "2026-11-22T00:00:00.000Z", invitedAt: "2026-11-23T01:00:00.000Z",
      acceptedAt: null, connectedAt: null, errorCode: null, reason: null, providerMessageId: "provider-1", appeal: "이야기 나눠 보고 싶어요",
      companyName: "고객사 B", roleName: "프론트엔드",
    }],
  }));
  assert.deepEqual(keys(thread.rows), [
    "found", `mail:${FIRST}`, "msg:in", "decision:in", `company-mail:${COMPANY_MAIL}`, "msg:company-in", "decision:company-in",
    "msg:to-company", "msg:relay", `company-mail:${COMPANY_MAIL}:claimed`, "intro:ask", "msg:tell",
  ]);
  const sent = byKey(thread.rows, `company-mail:${COMPANY_MAIL}`);
  assert.deepEqual(sent.who, { kind: "ashleyToCompany", name: "고객사 B" });
  assert.equal(sent.what, "회사 메일");
  assert.equal(sent.text, "백엔드 5년 · 서울\n결제 시스템을 만들었어요\n질문: 재택이 되나요?");
  const answer = byKey(thread.rows, "msg:company-in");
  assert.deepEqual(answer.who, { kind: "company", name: "고객사 B" });
  assert.equal(answer.what, "답");
  assert.deepEqual(answer.link, { refs: [{ key: `company-mail:${COMPANY_MAIL}`, at: "2026-11-19T01:00:00.000Z" }], words: "회사 메일에" });
  assert.deepEqual(byKey(thread.rows, "msg:to-company").who, { kind: "ashleyToCompany", name: "고객사 B" });
  assert.equal(byKey(thread.rows, "msg:to-company").link?.words, "답에");
  const relay = byKey(thread.rows, "msg:relay");
  assert.equal(relay.what, "회사 답 전함");
  assert.equal(relay.link?.words, "답에");
  assert.equal(byKey(thread.rows, `company-mail:${COMPANY_MAIL}:claimed`).what, "가입");
  assert.equal(byKey(thread.rows, "intro:ask").what, "연결 요청");
  assert.equal(byKey(thread.rows, "msg:tell").what, "연결 요청 알림");
  // The relay and the request's notice were found as mails: no extra fact rows for them.
  assert.ok(!thread.rows.some((row) => row.kind === "relay" || row.key === "intro:ask:invited"));
  assert.equal(byKey(thread.rows, "decision:in").signals[0], "관심: 고객사 B · 프론트엔드 · 질문: 재택이 되나요? · 회사에 요약 보내도 된다고 함");
});

test("inside Harper: messages with customer companies and the proposed postings' recorded stages", () => {
  const thread = buildPersonThread(facts({
    mails: [mail({ signedUpAt: "2026-11-18T03:00:00.000Z" })],
    harperMessages: [
      { id: "h1", rootId: "h1", direction: "to_company", body: "소개 부탁드려요", createdAt: "2026-11-18T04:00:00.000Z", cancelledAt: null, companyName: "고객사 A", roleName: "백엔드" },
      { id: "h2", rootId: "h1", direction: "to_talent", body: "반가워요", createdAt: "2026-11-18T05:00:00.000Z", cancelledAt: null, companyName: "고객사 A", roleName: "백엔드" },
    ],
    stages: [{ key: "s1", stage: "connected", at: "2026-11-18T04:00:00.000Z", companyName: "고객사 A", roleName: "백엔드" }],
  }));
  assert.deepEqual(keys(thread.rows), ["found", `mail:${FIRST}`, `mail:${FIRST}:signed_up`, "harper:h1", "stage:s1", "harper:h2"]);
  const out = byKey(thread.rows, "harper:h1");
  assert.deepEqual(out.who, { kind: "harper" });
  assert.equal(out.what, "후보 → 고객사 A");
  assert.equal(out.text, "소개 부탁드려요");
  assert.equal(byKey(thread.rows, "harper:h2").what, "고객사 A → 후보");
  assert.equal(byKey(thread.rows, "stage:s1").what, "관심·지원 · 연결 수락");
  assert.equal(thread.summary?.words, "고객사 A → 후보");
});

test("the person's own steps: shown unless a row above already shows them; a person's step is 운영팀's", () => {
  const thread = buildPersonThread(facts({
    person: {
      ...facts().person,
      events: [
        { at: "2026-11-18T00:00:00.000Z", kind: "found", by: "agent" },
        { at: "2026-11-18T00:30:00.000Z", kind: "matched", by: "agent", note: "고객사 A · 백엔드" },
        { at: "2026-11-18T01:00:00.000Z", kind: "sent", by: "agent", note: "메일 보냄" },
        { at: "2026-11-18T02:00:00.000Z", kind: "replied", by: "ops-user", note: "링크드인으로 답장" },
        { at: "2026-11-18T03:00:00.000Z", kind: "note", by: "agent", note: "Ashley가 물어봄 · title" },
      ],
    },
    mails: [mail()],
  }));
  assert.deepEqual(keys(thread.rows), ["found", "step:1", `mail:${FIRST}`, "step:3", "step:4"]);
  assert.deepEqual(byKey(thread.rows, "step:3").who, { kind: "team" });
  assert.deepEqual(byKey(thread.rows, "step:4").who, { kind: "ashley" });
  assert.equal(byKey(thread.rows, "step:3").what, null);
  assert.deepEqual(byKey(thread.rows, "step:3").step, { kind: "replied", note: "링크드인으로 답장" });
  // The first mail shows the proposed postings when its own snapshot is missing.
  assert.deepEqual(byKey(thread.rows, `mail:${FIRST}`).postings, [{ companyName: "고객사 A", title: "백엔드", kind: "customer" }]);
});

test("지금 on the list: the latest row in the numbers' column words", () => {
  const sent = buildPersonThread(facts({
    mails: [mail()],
    messages: [
      message({ id: "in", decision: "reply" }),
      message({ id: "reply", author: "ashley", direction: "outbound", sendStatus: "sent", answersMessageId: "in", occurredAt: "2026-11-19T00:00:00.000Z" }),
    ],
  }));
  assert.deepEqual(sent.summary, { at: "2026-11-19T00:00:00.000Z", column: "ashleyReplied", words: null, step: null, trouble: false });
  assert.equal(buildPersonThread(facts({ mails: [mail()] })).summary?.column, "contacted");
  assert.equal(buildPersonThread(facts({ mails: [mail({ firstOpenedAt: "2026-11-18T02:00:00.000Z" })] })).summary?.column, "clicked");
  assert.equal(buildPersonThread(facts({
    mails: [mail({ signedUpAt: "2026-11-18T05:00:00.000Z" })], messages: [message({ id: "in", decision: "reply" })],
  })).summary?.column, "signedUpAfterReply");
  assert.equal(buildPersonThread(facts({ mails: [mail()], messages: [message({ id: "in", decision: "stop" })] })).summary?.column, "stopped");
  assert.equal(buildPersonThread(facts({ mails: [mail({ deliveryStatus: "bounced", deliveryEventAt: "2026-11-18T01:01:00.000Z" })] })).summary?.column, "bounced");
  const handed = buildPersonThread(facts({ mails: [mail()], messages: [message({ id: "in", decision: "hand_to_human" })] })).summary;
  assert.equal(handed?.column, "handedOff");
  assert.equal(handed?.trouble, true);
});

test("누가 in words, and the links' and the list's Korea-time dates", () => {
  assert.equal(whoLabel({ kind: "agent" }, "후보 A"), "에이전트");
  assert.equal(whoLabel({ kind: "candidate" }, "후보 A"), "후보 A");
  assert.equal(whoLabel({ kind: "ashleyToCompany", name: "고객사 A" }, "후보 A"), "Ashley → 고객사 A");
  assert.equal(whoLabel({ kind: "harper" }, "후보 A"), "하퍼 안");
  assert.equal(kstMonthDay("2026-11-19T15:30:00.000Z"), "11.20");
  assert.equal(kstMonthDay("2026-11-08T00:00:00.000Z"), "11.8");
  assert.equal(kstMonthDay(null), "");
});
