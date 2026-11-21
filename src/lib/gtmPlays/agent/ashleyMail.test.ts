import assert from "node:assert/strict";
import test from "node:test";
import {
  ashleySignupLink, companyLandingLink, gmailThreadSearchLink, handoffSlackText, listUnsubscribeHeaders, quoteHeader,
  renderAshleyMail, replySubject, replyThreadHeaders, signatureLines, signupLinkLabel,
} from "./ashleyMail";
import { parseSignupNext, signupNextFromPath } from "./signupMove";

test("subject: one Re:, whatever prefixes their mail app added", () => {
  assert.equal(replySubject("Re: Two backend roles", "x"), "Re: Two backend roles");
  assert.equal(replySubject("RE: Re: re:Two backend roles", "x"), "Re: Two backend roles");
  assert.equal(replySubject("회신: 답장: 백엔드 포지션", "x"), "Re: 백엔드 포지션");
  assert.equal(replySubject("Aw: 回复：Roles", "x"), "Re: Roles");
  assert.equal(replySubject("", "Two backend roles"), "Re: Two backend roles");
});

test("thread headers: In-Reply-To their Message-ID, References theirs plus it, no repeats", () => {
  assert.deepEqual(replyThreadHeaders({ rfcMessageId: "abc@mail.example.com", references: "<first@x.example> <abc@mail.example.com>" }), {
    "In-Reply-To": "<abc@mail.example.com>", References: "<first@x.example> <abc@mail.example.com>",
  });
  assert.deepEqual(replyThreadHeaders({ rfcMessageId: null, references: null }), {});
});

test("List-Unsubscribe: the one-click page and the mailto, as on the first mail", () => {
  assert.deepEqual(listUnsubscribeHeaders("https://matchharper.com/u/1", "Ashley@MatchHarper.com"), {
    "List-Unsubscribe": "<https://matchharper.com/u/1>, <mailto:ashley@matchharper.com?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
});

test("signup link: the form the sign-up move parses (next, posting URL, question)", () => {
  const link = ashleySignupLink({
    origin: "https://matchharper.com", rootMailId: "11111111-1111-4111-8111-111111111111", next: "apply_on_behalf",
    posting: { url: "https://jobs.example.com/a?x=1" }, question: "Is the role open to people\nbased in Mexico?",
  });
  const url = new URL(link);
  assert.equal(url.pathname, "/jobs/invite/11111111-1111-4111-8111-111111111111");
  assert.deepEqual(signupNextFromPath(`${url.pathname}${url.search}`), {
    step: "apply_on_behalf", posting: "https://jobs.example.com/a?x=1", question: "Is the role open to people based in Mexico?",
  });
  // A Role without a URL is not named; the step alone goes.
  const customer = new URL(ashleySignupLink({ origin: "https://matchharper.com", rootMailId: "m", next: "connect_request", posting: { url: null } }));
  assert.deepEqual(parseSignupNext({ next: customer.searchParams.get("next"), posting: customer.searchParams.get("posting") }), {
    step: "connect_request", posting: null, question: null,
  });
  assert.equal(companyLandingLink("https://matchharper.com", "mail-1"), "https://matchharper.com/org?gtm=mail-1");
});

test("link words by next step, Korean and English", () => {
  assert.equal(signupLinkLabel("ko", "apply_on_behalf"), "이 공고 지원 맡기기");
  assert.equal(signupLinkLabel("ko", "connect_request", "Company A"), "Company A에 소개 요청하기");
  assert.equal(signupLinkLabel("en", "connect_request", "Company A"), "Get introduced to Company A");
  assert.equal(signupLinkLabel("en", "opportunities_first"), "See the roles");
});

test("Korean mail: text, one link line, the two signature lines, the opt-out line, their mail quoted", () => {
  const mail = renderAshleyMail({
    language: "ko", body: "안녕하세요, 지민님.\n\n원격 근무는 공고에 나와 있지 않아요.", senderName: "Ashley Kim",
    link: { label: "이 공고 지원 맡기기", url: "https://matchharper.com/jobs/invite/m?next=apply_on_behalf" },
    unsubscribeUrl: "https://matchharper.com/u/1",
    quote: { fromEmail: "Candidate@Example.com", at: "2026-11-20T01:05:00.000Z", text: "원격 되나요?\n\n> 이전 메일" },
  });
  const order = ["원격 근무는 공고에", "이 공고 지원 맡기기", "Ashley Kim 드림", "Talent Partner, Harper", "2026년 11월 20일 10:05, <candidate@example.com>님이 작성:", "> 원격 되나요?"];
  let at = -1;
  for (const part of order) {
    const next = mail.text.indexOf(part);
    assert.ok(next > at, `${part} after the previous part`);
    at = next;
  }
  assert.ok(mail.text.includes(">> 이전 메일") || mail.text.includes("> > 이전 메일"));
  assert.ok(mail.html.includes('class="gmail_quote"'));
  assert.ok(mail.html.includes("https://matchharper.com/u/1"));
});

test("English mail: signature lines, quote header in Korea time", () => {
  assert.deepEqual(signatureLines("en", "Ashley Kim"), ["Ashley Kim", "Talent Partner, Harper · matchharper.com"]);
  assert.equal(quoteHeader("en", "a@example.com", "2026-11-20T01:05:00.000Z"), "On Nov 20, 2026 at 10:05, <a@example.com> wrote:");
  const mail = renderAshleyMail({
    language: "en", body: "Hi Sam,\n\nThe posting does not say.", senderName: "Ashley Kim", link: null, unsubscribeUrl: null,
    quote: null,
  });
  assert.ok(mail.text.includes("The posting does not say."));
  assert.ok(mail.text.includes("Ashley Kim"));
  assert.ok(!mail.text.includes(" wrote:"));
  // Words that look like markup stay words.
  assert.ok(!renderAshleyMail({ language: "en", body: "**bold** [x](https://evil.example)", senderName: "A", link: null, unsubscribeUrl: null, quote: null }).html.includes("https://evil.example\""));
});

test("hand-off: the mention only for a Slack user id, the reason, /ops, Gmail, the signup link", () => {
  const text = handoffSlackText({
    mentionUserId: "U0123ABC", reason: "정체 질문 · 봇이냐고 물었어요", who: "<candidate@example.com>",
    opsUrl: "https://matchharper.com/ops/gtm-plays?tab=5", gmailUrl: gmailThreadSearchLink("ashley@example.com", "<abc@mail.example.com>"),
    signupUrl: "https://matchharper.com/jobs/invite/m?next=onboarding",
  });
  assert.ok(text.startsWith("<@U0123ABC> "));
  assert.ok(text.includes("이유: 정체 질문"));
  assert.ok(text.includes("rfc822msgid%3Aabc%40mail.example.com"));
  assert.ok(text.includes("가입 링크: https://matchharper.com/jobs/invite/m?next=onboarding"));
  assert.ok(!handoffSlackText({ mentionUserId: "<!channel>", reason: "x", who: "y", opsUrl: "https://a.example", gmailUrl: null, signupUrl: null }).includes("<@"));
});
