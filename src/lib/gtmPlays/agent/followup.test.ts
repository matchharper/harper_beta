import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FOLLOWUP_CLICKED_NOTE, FOLLOWUP_CLOSED_NOTE, FOLLOWUP_COACHING_CLICKED_NOTE, FOLLOWUP_NOTHING_NEW_NOTE, findFollowupPostings, followupDueAfterClick, followupSentNote, followupSubject,
  openedLink, planCoachingFollowup, planFollowup, planGeneralFollowup, renderAgentFollowup, threadHeaders, unsentPostings, type FollowupMatch, type FollowupPlan,
  type FollowupSearch,
} from "./followup";
import type { AgentPersonInput, AgentPosting, AgentPostingReview } from "./types";

const posting = (companyName: string, patch: Partial<AgentPosting> = {}): AgentPosting => ({
  kind: "external", roleId: null, url: null, companyName, title: "백엔드 엔지니어", location: "서울", why: "맞아요",
  summary: `${companyName}의 결제 서버를 맡는 자리예요.`, ...patch,
});

const URL_PAGE = "https://matchharper.com/jobs/invite/f1";
const URL_OFF = "https://matchharper.com/u/f1";
const FIRST_KO = "유나님께 소개드리고 싶은 팀이 있어 연락드려요";
const FIRST_EN = "Yuna, a few teams I'd like to introduce you to";

type SendPlan = Extract<FollowupPlan, { send: true }>;
const sendPlan = (plan: FollowupPlan): SendPlan => {
  assert.equal(plan.send, true);
  return plan as SendPlan;
};
const mail = (plan: FollowupPlan, language: "ko" | "en" = "ko", name: string | null = language === "ko" ? "유나" : "Yuna Kim") =>
  renderAgentFollowup({
    plan: sendPlan(plan), language, firstSubject: language === "ko" ? FIRST_KO : FIRST_EN, name, harperUrl: URL_PAGE,
    senderName: "Ashley Kim", unsubscribeUrl: URL_OFF,
  });

const a = posting("예시데이터웍스", { roleId: "r-a" });
const b = posting("데모핀테크랩", { roleId: "r-b" });
const c = posting("테스트러닝", { roleId: "r-c" });
const n1 = posting("샘플모빌리티", { roleId: "r-n1", title: "플랫폼 엔지니어", summary: "차량 공유 앱 팀이에요. 배차 서버를 맡게 됩니다." });
const n2 = posting("가상헬스", { roleId: "r-n2", title: "데이터 엔지니어", location: "판교", summary: "병원 예약 서비스예요. 데이터 파이프라인을 맡습니다." });

const KO_ASK = "궁금한 점이 있으면 이 메일에 편하게 답장 주세요.\n지금은 때가 아니시면 넘기셔도 괜찮아요. Harper에 가입해 두시면 잘 맞는 자리가 나왔을 때 알려드릴게요.";
const KO_END = ["감사합니다.", "Ashley Kim 드림\nTalent Partner, Harper · matchharper.com", `이런 메일을 더 받지 않으시려면 여기 (${URL_OFF})를 눌러 주세요.`];

// ---------------------------------------------------------------------------------------------------------------
// Which form

test("the form: A still open, B new and still open, C new after all closed, else no follow-up", () => {
  const A = planFollowup({ open: [a, b], closed: [], fresh: [], clicked: false });
  assert.deepEqual(A, { send: true, variant: "A", named: [a, b], fresh: [], postings: [a, b] });
  const B = planFollowup({ open: [a], closed: [b], fresh: [n1, n2], clicked: false });
  assert.deepEqual(B, { send: true, variant: "B", named: [a], fresh: [n1, n2], postings: [a, n1, n2] });
  const C = planFollowup({ open: [], closed: [a, b], fresh: [n1], clicked: false });
  assert.deepEqual(C, { send: true, variant: "C", named: [a, b], fresh: [n1], postings: [n1] });
  assert.deepEqual(planFollowup({ open: [], closed: [a, b], fresh: [], clicked: false }), { send: false, note: FOLLOWUP_CLOSED_NOTE });
  // At most two new postings.
  assert.deepEqual(sendPlan(planFollowup({ open: [a], closed: [], fresh: [n1, n2, c], clicked: false })).fresh, [n1, n2]);
});

test("someone who only opened the link gets B or C, never A; nothing new ends them quietly", () => {
  assert.deepEqual(planFollowup({ open: [a, b], closed: [], fresh: [], clicked: true }), { send: false, note: FOLLOWUP_CLICKED_NOTE });
  assert.equal(sendPlan(planFollowup({ open: [a, b], closed: [], fresh: [n1], clicked: true })).variant, "B");
  assert.equal(sendPlan(planFollowup({ open: [], closed: [a, b], fresh: [n1], clicked: true })).variant, "C");
  assert.deepEqual(planFollowup({ open: [], closed: [a], fresh: [], clicked: true }), { send: false, note: FOLLOWUP_CLOSED_NOTE });
});

test("a click keeps the follow-up due before it goes out, and clears it after", () => {
  assert.deepEqual(followupDueAfterClick(false), {});
  assert.deepEqual(followupDueAfterClick(true), { followupDueAt: null });
  assert.equal(openedLink([{ kind: "sent" }, { kind: "clicked" }]), true);
  assert.equal(openedLink([{ kind: "sent" }, { kind: "signed_up" }]), false);
});

// ---------------------------------------------------------------------------------------------------------------
// New postings: the first mail's matcher and grader, nothing already sent, no writer

test("new postings leave out any posting already sent: same Role, same link or a company already named", () => {
  const sent = [
    { roleId: "R-A", url: null, companyName: "예시데이터웍스" },
    { roleId: null, url: "https://jobs.example.com/42/", companyName: "(주)데모페이" },
  ];
  const found = [
    posting("다른이름", { roleId: "r-a" }),
    posting("링크같음", { url: "https://jobs.example.com/42" }),
    posting("데모페이", { roleId: "r-x" }),
    n1,
    posting("샘플모빌리티", { roleId: "r-n1b" }),
    n2,
  ];
  assert.deepEqual(unsentPostings(found, sent), [n1, n2]);
});

const person: AgentPersonInput = {
  name: "유나", headline: "백엔드 엔지니어", location: "서울", currentCompany: "지금회사", profileUrl: null, profileText: null,
  signalText: null, signalUrl: null, signalAt: null,
};
const grade = (value: AgentPostingReview["grade"]): AgentPostingReview => ({ grade: value, reason: "", at: "2026-12-02T00:00:00.000Z" });

/** A fake search that records every paid call; it has no writer to call. */
function fakeSearch(found: AgentPosting[], reviews: Array<AgentPostingReview | null>, opts: { failed?: string; notJobSeeking?: boolean } = {}) {
  const calls: string[] = [];
  const seen: { exclude?: string[]; reviewed?: AgentPosting[]; texts?: ReadonlyArray<string | null>; framed?: readonly AgentPosting[] } = {};
  const spent: number[] = [];
  const match: FollowupMatch = {
    postings: found, postingTexts: found.map((item) => `text of ${item.companyName}`), costUsd: 0.2, notJobSeeking: Boolean(opts.notJobSeeking),
    reason: "맞는 곳이 없어요",
    frame: async (postings) => {
      calls.push("frame");
      seen.framed = postings;
      return { postings: postings.map((item) => ({ ...item, summary: `${item.companyName} 새 한 줄` })), costUsd: 0.01 };
    },
  };
  const search: FollowupSearch = {
    match: async (_person, args) => { calls.push("match"); seen.exclude = args.excludeCompanyNames; return match; },
    review: async (args) => {
      calls.push("review");
      seen.reviewed = [...args.postings];
      seen.texts = args.texts;
      return { reviews: reviews.slice(0, args.postings.length), costUsd: 0.05, failed: opts.failed ?? null };
    },
    spend: async (usd) => { spent.push(usd); },
  };
  return { search, calls, seen, spent };
}

test("new postings: matcher, then the grader's 잘 맞음 only (two at most), then the mail lines; each cost logged", async () => {
  const already = posting("예시데이터웍스", { roleId: "r-a" });
  const found = [posting("예시데이터웍스", { roleId: "r-a" }), n1, posting("애매한곳", { roleId: "r-u" }), n2, c];
  const { search, calls, seen, spent } = fakeSearch(found, [grade("good"), grade("unsure"), grade("good"), grade("good")]);
  const result = await findFollowupPostings(person, { sent: [already], excludeCompanyNames: ["지금회사", null] }, search);
  assert.deepEqual(calls, ["match", "review", "frame"]);
  assert.deepEqual(seen.exclude, ["지금회사", "예시데이터웍스"]);
  assert.deepEqual(seen.reviewed?.map((item) => item.companyName), ["샘플모빌리티", "애매한곳", "가상헬스", "테스트러닝"]);
  assert.deepEqual(seen.texts, ["text of 샘플모빌리티", "text of 애매한곳", "text of 가상헬스", "text of 테스트러닝"]);
  assert.deepEqual(seen.framed?.map((item) => item.companyName), ["샘플모빌리티", "가상헬스"]);
  assert.deepEqual(result.postings.map((item) => item.summary), ["샘플모빌리티 새 한 줄", "가상헬스 새 한 줄"]);
  assert.deepEqual(spent, [0.2, 0.05, 0.01]);
  assert.equal(result.costUsd, 0.26);
  assert.equal(result.failed, null);
});

test("new postings: one 잘 맞음 gives one; none, not looking, or a failed grader give none", async () => {
  const one = fakeSearch([n1, n2], [grade("poor"), grade("good")]);
  assert.deepEqual((await findFollowupPostings(person, { sent: [], excludeCompanyNames: [] }, one.search)).postings.map((item) => item.companyName), ["가상헬스"]);

  const none = fakeSearch([n1], [grade("unsure")]);
  const nothing = await findFollowupPostings(person, { sent: [], excludeCompanyNames: [] }, none.search);
  assert.deepEqual(nothing.postings, []);
  assert.deepEqual(none.calls, ["match", "review"]);

  const away = fakeSearch([n1], [grade("good")], { notJobSeeking: true });
  assert.deepEqual((await findFollowupPostings(person, { sent: [], excludeCompanyNames: [] }, away.search)).postings, []);
  assert.deepEqual(away.calls, ["match"]);

  const broken = fakeSearch([n1], [null], { failed: "timeout" });
  const failed = await findFollowupPostings(person, { sent: [], excludeCompanyNames: [] }, broken.search);
  assert.match(failed.failed ?? "", /timeout/);
  assert.deepEqual(broken.calls, ["match", "review"]);
  assert.deepEqual(broken.spent, [0.2, 0.05]);
});

test("the follow-up has no AI writer: the run renders fixed copy, the first mail's writer has no follow-up path", () => {
  const run = readFileSync(new URL("./run.server.ts", import.meta.url), "utf8");
  const followUps = run.slice(run.indexOf("async function followUps("), run.indexOf("async function sendMails("));
  assert.ok(followUps.length > 1_000);
  assert.doesNotMatch(followUps, /composeAgentMail|gtmStructuredCall|renderAgentMail/);
  assert.match(followUps, /renderAgentFollowup/);
  const compose = readFileSync(new URL("./compose.server.ts", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /followup\??:|gtm-agent:followup|previousSubject|a week ago|last week/i);
});

// ---------------------------------------------------------------------------------------------------------------
// The words, Korean

test("A, Korean, word for word", () => {
  const sent = mail(planFollowup({ open: [a, b], closed: [], fresh: [], clicked: false }));
  assert.equal(sent.subject, `Re: ${FIRST_KO}`);
  assert.equal(sent.text, [
    "안녕하세요, 유나님.",
    "지난번에 보내드린 메일이 다른 메일에 묻혔을까 싶어 한 번만 더 연락드려요.\n그때 소개드린 예시데이터웍스, 데모핀테크랩 두 곳은 아직 사람을 찾고 있어요.",
    `두 곳 내용은 여기에 그대로 있어요.\n2곳 자세히 보기 (${URL_PAGE})`,
    KO_ASK,
    ...KO_END,
  ].join("\n\n"));
  // The link to the postings and the opt-out line are the only links.
  const hrefs = [...sent.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/\?.*$/, ""));
  assert.deepEqual([...new Set(hrefs)].sort(), [URL_PAGE, URL_OFF]);
  assert.doesNotMatch(sent.text, /언제쯤/);
});

test("A, Korean: one, three, and two postings of one company", () => {
  const one = mail(planFollowup({ open: [a], closed: [b], fresh: [], clicked: false })).text;
  assert.match(one, /그때 소개드린 예시데이터웍스 자리는 아직 사람을 찾고 있어요\./);
  assert.match(one, new RegExp(`자세한 내용은 여기에 그대로 있어요\\.\\n자세히 보기 \\(${URL_PAGE}\\)`));
  assert.doesNotMatch(one, /데모핀테크랩|1곳/);
  const three = mail(planFollowup({ open: [a, b, c], closed: [], fresh: [], clicked: false })).text;
  assert.match(three, /그때 소개드린 예시데이터웍스, 데모핀테크랩, 테스트러닝 세 곳은 아직 사람을 찾고 있어요\./);
  assert.match(three, /세 곳 내용은 여기에 그대로 있어요\.\n3곳 자세히 보기/);
  const sameCompany = mail(planFollowup({ open: [a, posting("예시데이터웍스", { roleId: "r-a2" })], closed: [], fresh: [], clicked: false })).text;
  assert.match(sameCompany, /그때 소개드린 예시데이터웍스 자리는 아직/);
  assert.match(sameCompany, /두 곳 내용은 여기에 그대로 있어요\.\n2곳 자세히 보기/);
});

test("B, Korean, word for word: no 'buried' opener, the new postings as bullets, all named on the page", () => {
  const sent = mail(planFollowup({ open: [a, b], closed: [], fresh: [n1, n2], clicked: true }));
  assert.equal(sent.subject, `Re: ${FIRST_KO}`);
  assert.equal(sent.text, [
    "안녕하세요, 유나님.",
    "지난번에 소개드린 예시데이터웍스, 데모핀테크랩 두 곳은 아직 사람을 찾고 있고, 그사이 유나님과 잘 맞을 것 같은 자리가 두 곳 더 보여서 한 번 더 연락드려요.",
    [
      "• 샘플모빌리티 · 플랫폼 엔지니어 · 서울\n차량 공유 앱 팀이에요. 배차 서버를 맡게 됩니다.",
      "• 가상헬스 · 데이터 엔지니어 · 판교\n병원 예약 서비스예요. 데이터 파이프라인을 맡습니다.",
    ].join("\n"),
    `예시데이터웍스, 데모핀테크랩까지 네 곳을 여기에 모아뒀어요.\n4곳 자세히 보기 (${URL_PAGE})`,
    KO_ASK,
    ...KO_END,
  ].join("\n\n"));
  assert.doesNotMatch(sent.text, /묻혔을까/);
});

test("B, Korean: one earlier still open and one new; three earlier and two new; no name", () => {
  const small = mail(planFollowup({ open: [a], closed: [b], fresh: [n1], clicked: false })).text;
  assert.match(small, /지난번에 소개드린 예시데이터웍스 자리는 아직 사람을 찾고 있고, 그사이 유나님과 잘 맞을 것 같은 자리가 한 곳 더 보여서 한 번 더 연락드려요\./);
  assert.match(small, /예시데이터웍스까지 두 곳을 여기에 모아뒀어요\.\n2곳 자세히 보기/);
  assert.doesNotMatch(small, /데모핀테크랩/);
  const big = mail(planFollowup({ open: [a, b, c], closed: [], fresh: [n1, n2], clicked: false })).text;
  assert.match(big, /지난번에 소개드린 예시데이터웍스, 데모핀테크랩, 테스트러닝 세 곳은 아직 사람을 찾고 있고, 그사이 유나님과 잘 맞을 것 같은 자리가 두 곳 더/);
  assert.match(big, /예시데이터웍스, 데모핀테크랩, 테스트러닝까지 다섯 곳을 여기에 모아뒀어요\.\n5곳 자세히 보기/);
  const nameless = mail(planFollowup({ open: [a], closed: [], fresh: [n1], clicked: false }), "ko", null);
  assert.match(nameless.text, /^안녕하세요\.\n\n/);
  assert.match(nameless.text, /그사이 잘 맞을 것 같은 자리가 한 곳 더/);
  assert.equal(nameless.subject, "Re: 유나님께 소개드리고 싶은 팀이 있어 연락드려요");
});

test("C, Korean, word for word, and with one new posting", () => {
  const sent = mail(planFollowup({ open: [], closed: [a, b], fresh: [n1, n2], clicked: false }));
  assert.equal(sent.text, [
    "안녕하세요, 유나님.",
    "지난번에 소개드린 예시데이터웍스, 데모핀테크랩 자리는 그사이 마감됐어요.\n대신 유나님과 잘 맞을 것 같은 자리가 새로 보여서 한 번 더 연락드려요.",
    [
      "• 샘플모빌리티 · 플랫폼 엔지니어 · 서울\n차량 공유 앱 팀이에요. 배차 서버를 맡게 됩니다.",
      "• 가상헬스 · 데이터 엔지니어 · 판교\n병원 예약 서비스예요. 데이터 파이프라인을 맡습니다.",
    ].join("\n"),
    `두 곳 내용은 여기에 모아뒀어요.\n2곳 자세히 보기 (${URL_PAGE})`,
    KO_ASK,
    ...KO_END,
  ].join("\n\n"));
  const one = mail(planFollowup({ open: [], closed: [a, b, c], fresh: [n1], clicked: false }));
  assert.match(one.text, /지난번에 소개드린 예시데이터웍스, 데모핀테크랩, 테스트러닝 자리는 그사이 마감됐어요\./);
  assert.match(one.text, new RegExp(`자세한 내용은 여기에 모아뒀어요\\.\\n자세히 보기 \\(${URL_PAGE}\\)`));
  // One bullet keeps its two lines in the HTML part too.
  assert.match(one.html, /<li style="margin:4px 0;white-space:pre-line">샘플모빌리티 · 플랫폼 엔지니어 · 서울\n차량 공유/);
});

// ---------------------------------------------------------------------------------------------------------------
// The words, English

const enA = posting("acmedata", { roleId: "r-a", title: "Backend Engineer", location: "Seoul" });
const enB = posting("데모핀테크랩", { roleId: "r-b", mailCompany: "Demo Fintech Lab", title: "Platform Engineer", location: "Remote" });
const enC = posting("Globex", { roleId: "r-c", title: "Data Engineer", location: "Berlin" });
const enN1 = posting("Northwind", { roleId: "r-n1", title: "Staff Engineer", location: "London", summary: "A logistics platform. You would own the routing service." });
const enN2 = posting("Initech", { roleId: "r-n2", title: "Payments Engineer", location: "Remote", summary: "A billing startup. You would own the payments API." });
const EN_END = [
  "If you have any questions, just reply to this email.\nAnd if now isn't the right time, that's completely fine. If you sign up on Harper, I'll let you know when a role that fits comes up.",
  "Thanks,",
  "Ashley Kim\nTalent Partner, Harper · matchharper.com",
  `If you'd rather not hear from Harper again, unsubscribe here (${URL_OFF}).`,
];

test("A, English, word for word (the first mail's English company names)", () => {
  const sent = mail(planFollowup({ open: [enA, enB], closed: [], fresh: [], clicked: false }), "en");
  assert.equal(sent.subject, `Re: ${FIRST_EN}`);
  assert.equal(sent.text, [
    "Hi Yuna,",
    "Just following up once in case my last email got buried.\nAcmedata and Demo Fintech Lab, the teams I mentioned, are still hiring.",
    `The details are still here.\nSee both roles (${URL_PAGE})`,
    ...EN_END,
  ].join("\n\n"));
  assert.doesNotMatch(sent.text, /when would suit you/);
  const one = mail(planFollowup({ open: [enC], closed: [enA], fresh: [], clicked: false }), "en").text;
  assert.match(one, /Globex, the team I mentioned, is still hiring\.\n\nThe details are still here\.\nSee the details/);
  const three = mail(planFollowup({ open: [enA, enB, enC], closed: [], fresh: [], clicked: false }), "en").text;
  assert.match(three, /Acmedata, Demo Fintech Lab, and Globex, the teams I mentioned, are still hiring\./);
  assert.match(three, /See all 3 roles/);
});

test("B, English, word for word, and with one earlier and one new", () => {
  const sent = mail(planFollowup({ open: [enA, enB], closed: [], fresh: [enN1, enN2], clicked: false }), "en");
  assert.equal(sent.text, [
    "Hi Yuna,",
    "Acmedata and Demo Fintech Lab, the teams I mentioned last time, are still hiring, and I've since come across two more roles that look like a good fit for you, so I wanted to reach out once more.",
    [
      "• Northwind · Staff Engineer · London\nA logistics platform. You would own the routing service.",
      "• Initech · Payments Engineer · Remote\nA billing startup. You would own the payments API.",
    ].join("\n"),
    `I've put all four, including Acmedata and Demo Fintech Lab, in one place.\nSee all 4 roles (${URL_PAGE})`,
    ...EN_END,
  ].join("\n\n"));
  assert.doesNotMatch(sent.text, /buried/);
  const small = mail(planFollowup({ open: [enC], closed: [], fresh: [enN1], clicked: false }), "en").text;
  assert.match(small, /Globex, the team I mentioned last time, is still hiring, and I've since come across one more role that looks like a good fit for you, so I wanted to reach out once more\./);
  assert.match(small, /I've put both, including Globex, in one place\.\nSee both roles/);
  const big = mail(planFollowup({ open: [enA, enB, enC], closed: [], fresh: [enN1, enN2], clicked: false }), "en").text;
  assert.match(big, /I've put all five, including Acmedata, Demo Fintech Lab, and Globex, in one place\.\nSee all 5 roles/);
});

test("C, English, word for word, and with one earlier and one new", () => {
  const sent = mail(planFollowup({ open: [], closed: [enA, enB], fresh: [enN1, enN2], clicked: true }), "en");
  assert.equal(sent.text, [
    "Hi Yuna,",
    "The Acmedata and Demo Fintech Lab roles I shared last time have since closed.\nI've come across two new ones that look like a good fit for you, so I wanted to reach out once more.",
    [
      "• Northwind · Staff Engineer · London\nA logistics platform. You would own the routing service.",
      "• Initech · Payments Engineer · Remote\nA billing startup. You would own the payments API.",
    ].join("\n"),
    `The details are here.\nSee both roles (${URL_PAGE})`,
    ...EN_END,
  ].join("\n\n"));
  const one = mail(planFollowup({ open: [], closed: [enC], fresh: [enN1], clicked: false }), "en").text;
  assert.match(one, /The Globex role I shared last time has since closed\.\nI've come across a new one that looks like a good fit for you/);
  assert.match(one, /The details are here\.\nSee the details/);
});

// ---------------------------------------------------------------------------------------------------------------
// Thread, subject, log

test("the follow-up threads under the first mail: Re: its subject, In-Reply-To and References its Message-ID", () => {
  assert.equal(followupSubject(`Re: re: ${FIRST_KO}`, "ko", "유나", 2), `Re: ${FIRST_KO}`);
  assert.equal(followupSubject(null, "ko", "유나", 2), `Re: ${FIRST_KO}`);
  assert.deepEqual(threadHeaders("ABC123@Send.Example.com"), { "In-Reply-To": "<abc123@send.example.com>", References: "<abc123@send.example.com>" });
  assert.deepEqual(threadHeaders(""), {});
  assert.deepEqual(threadHeaders(null), {});
});

test("the log line names the form and the new postings", () => {
  const note = followupSentNote(sendPlan(planFollowup({ open: [a], closed: [], fresh: [n1], clicked: false })), `Re: ${FIRST_KO}`);
  assert.equal(note, `후속 메일 보냄 (B · 새 공고 더함) · Re: ${FIRST_KO} · 새 공고: 샘플모빌리티 · 플랫폼 엔지니어`);
});

// ---------------------------------------------------------------------------------------------------------------
// D (상담) and E (일반) (Shaun 11/23 16:50)

const event = (title: string, startsAt: string) => ({
  title, url: `https://example.com/${encodeURIComponent(title)}`, startsAt, endsAt: null, place: null, online: true, organizer: null, why: "맞아요",
});

test("D: one more offer of the same help, never for someone who opened its link", () => {
  assert.deepEqual(planCoachingFollowup({ clicked: true }), { send: false, note: FOLLOWUP_COACHING_CLICKED_NOTE });
  const text = mail(planCoachingFollowup({ clicked: false })).text;
  assert.match(text, /묻혔을까 싶어 한 번만 더 연락드려요\.\nHarper에 이력서나 LinkedIn 프로필을 올려 주시면/);
  assert.match(text, /상담 받아 보기 \(/);
  assert.doesNotMatch(text, /•/);
});

test("E: postings follow A/B/C with the events block; E alone for something new, or a reminder for an unopened events-only mail", () => {
  const early = event("밋업", "2026-12-03"), late = event("세션", "2026-12-10");
  // A with events: new first, listed by day.
  const a = sendPlan(planGeneralFollowup({ open: [posting("예시랩스")], closed: [], fresh: [], clicked: false, upcoming: [early], freshEvents: [late] }));
  assert.equal(a.variant, "A");
  assert.deepEqual(a.events?.map((item) => item.title), ["밋업", "세션"]);
  assert.match(mail(a).text, /다가오는 행사도 함께 적어 둘게요\./);
  // Postings that all closed with nothing new, but a new event: E alone.
  const e = sendPlan(planGeneralFollowup({ open: [], closed: [posting("예시랩스")], fresh: [], clicked: false, upcoming: [], freshEvents: [late] }));
  assert.equal(e.variant, "E");
  assert.match(mail(e).text, /그사이 유나님께 맞을 만한 기회가 새로 보여서 한 번 더 연락드려요\.\n\n다가오는 행사/);
  // An events-only first mail: new postings come in as E; not opened with its events still ahead, a reminder.
  assert.equal(sendPlan(planGeneralFollowup({ open: [], closed: [], fresh: [posting("데모페이")], clicked: true, upcoming: [], freshEvents: [] })).variant, "E");
  const reminder = sendPlan(planGeneralFollowup({ open: [], closed: [], fresh: [], clicked: false, upcoming: [early], freshEvents: [] }));
  assert.equal(reminder.reminder, true);
  assert.match(mail(reminder).text, /소개드린 행사는 아직 열리기 전이에요\./);
  // Opened, nothing new: none.
  assert.deepEqual(planGeneralFollowup({ open: [], closed: [], fresh: [], clicked: true, upcoming: [early], freshEvents: [] }),
    { send: false, note: FOLLOWUP_NOTHING_NEW_NOTE });
  assert.match(followupSentNote(e, "Re: x"), /E · 새 기회\).*행사: 세션/);
});
