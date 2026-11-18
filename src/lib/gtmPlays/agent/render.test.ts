import assert from "node:assert/strict";
import test from "node:test";
import { agentLeadLine, agentMailSubject, agentPostingList, agentSubject, mailWhy, renderAgentMail } from "./render";
import type { AgentPosting } from "./types";

const postings: AgentPosting[] = [
  {
    kind: "external", roleId: null, url: null, companyName: "예시데이터웍스", title: "시니어 프론트엔드 엔지니어 (디자인 시스템)", location: "서울 강남구",
    why: "디자인 시스템 경험이 맞아요", summary: "기업용 데이터 분석 화면을 만드는 곳이에요. 화면의 기반을 다지고 디자인 시스템을 이끄는 자리입니다.",
  },
  {
    kind: "external", roleId: null, url: null, companyName: "데모핀테크랩", title: "시니어 프론트엔드 엔지니어 (디자인 시스템)", location: "서울",
    why: "맞아요", summary: "개인 자산 관리 앱 팀이에요. 화면과 공통 기반을 함께 설계하게 됩니다.",
  },
  {
    kind: "gtm", roleId: null, url: null, companyName: "테스트러닝", title: "프론트엔드 엔지니어", location: "서울",
    why: "맞아요", summary: "개발자 교육 서비스입니다. 화면 개발을 하면서 디자인 시스템 컴포넌트도 같이 다듬어요.",
  },
];

const firstMail = (patch: Partial<Parameters<typeof renderAgentMail>[0]> & { focus?: string } = {}) => {
  const { focus = "디자인 시스템", ...rest } = patch;
  const language = rest.language ?? "ko";
  const shown = rest.postings ?? postings;
  const name = rest.name === undefined ? "유나" : rest.name;
  return renderAgentMail({
    language, subject: agentSubject({ language, name, count: shown.length }),
    body: [agentLeadLine(language, focus), agentPostingList(shown)].filter(Boolean).join("\n\n"),
    name, harperUrl: "https://matchharper.com/jobs/invite/abc", postings: shown, senderName: "Ashly", senderEmail: "s@example.com",
    unsubscribeUrl: "https://matchharper.com/u/abc", ...rest,
  });
};

test("the first mail is the one 11/18 form, word for word", () => {
  const mail = firstMail();
  assert.equal(mail.subject, "유나님께 소개드리고 싶은 팀이 있어 연락드려요");
  assert.equal(mail.text, [
    "안녕하세요, 유나님.\nHarper에서 회사 채용을 돕고 있는 Ashly입니다.",
    "디자인 시스템을 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요. 유나님 이력을 보고 이 세 팀이 잘 맞겠다 싶어서 메일 드립니다.",
    [
      "• 예시데이터웍스 · 시니어 프론트엔드 엔지니어 (디자인 시스템) · 서울\n기업용 데이터 분석 화면을 만드는 곳이에요. 화면의 기반을 다지고 디자인 시스템을 이끄는 자리입니다.",
      "• 데모핀테크랩 · 시니어 프론트엔드 엔지니어 (디자인 시스템) · 서울\n개인 자산 관리 앱 팀이에요. 화면과 공통 기반을 함께 설계하게 됩니다.",
      "• 테스트러닝 · 프론트엔드 엔지니어 · 서울\n개발자 교육 서비스입니다. 화면 개발을 하면서 디자인 시스템 컴포넌트도 같이 다듬어요.",
    ].join("\n"),
    "세 곳 내용은 여기에 모아뒀어요.\n3곳 자세히 보기 (https://matchharper.com/jobs/invite/abc)",
    "보시고 궁금한 점 있으면 뭐든 물어봐 주세요. 팀 분위기든 처우든, 제가 확인해서 알려드리겠습니다.\n지금은 생각이 없으시면 그냥 넘기셔도 괜찮아요.",
    "감사합니다.",
    "Ashly 드림\nHarper 커리어 매니저 · matchharper.com",
    "이런 메일을 더 받지 않으시려면 여기 (https://matchharper.com/u/abc)를 눌러 주세요.",
  ].join("\n\n"));
  // A normal mail: no buttons, no bold names; the link to the roles and the opt-out line are the only links.
  assert.doesNotMatch(mail.html, /<table|<strong>/);
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replace(/\?.*$/, ""));
  assert.deepEqual([...new Set(hrefs)].sort(), ["https://matchharper.com/jobs/invite/abc", "https://matchharper.com/u/abc"]);
});

test("no name, one posting, no focus: the same form without them", () => {
  const mail = firstMail({ name: null, postings: postings.slice(0, 1), focus: "" });
  assert.equal(mail.subject, "소개드리고 싶은 팀이 있어 연락드려요");
  assert.match(mail.text, /^안녕하세요\.\nHarper에서 회사 채용을 돕고 있는 Ashly입니다\.\n\n이력을 보고 이 팀이 잘 맞겠다 싶어서 메일 드립니다\.\n\n/);
  assert.match(mail.text, /\n\n자세한 내용은 여기에 모아뒀어요\.\n자세히 보기 \(/);
  assert.match(firstMail({ postings: postings.slice(0, 2) }).text, /이 두 팀이 잘 맞겠다[\s\S]*두 곳 내용은 여기에 모아뒀어요\.\n2곳 자세히 보기/);
  // The particle follows the focus's last sound.
  assert.equal(agentLeadLine("ko", "결제 백엔드 경험"), "결제 백엔드를 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요.");
  assert.equal(agentLeadLine("ko", "데이터 플랫폼"), "데이터 플랫폼을 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요.");
  assert.equal(agentLeadLine("ko", "[결제](https://evil.example)"), "결제를 직접 맡아 오신 분을 찾는 팀이 요즘 몇 곳 있어요.");
  assert.equal(agentLeadLine("ko", "  "), "");
});

test("an English mail: the same form in English", () => {
  const mail = firstMail({ language: "en", name: "Yuna Kim", focus: "design systems" });
  assert.equal(mail.subject, "Yuna, a few teams I'd like to introduce you to");
  assert.match(mail.text, /^Hi Yuna,\nI'm Ashly, and I help companies hire at Harper\.\n\nA few teams are looking for someone who has owned design systems hands-on\. Looking at your background, I thought these three teams would be a good fit, so I'm reaching out\./);
  assert.match(mail.text, /I've put the details of all three here\.\nSee all 3 \(https:\/\/matchharper\.com\/jobs\/invite\/abc\)/);
  assert.match(mail.text, /If you have any questions about the team, the culture or the pay, just ask/);
  assert.match(mail.text, /Thanks,\n\nAshly\nCareer manager, Harper · matchharper\.com/);
  assert.equal(agentSubject({ language: "en", name: null, count: 1 }), "A team I'd like to introduce you to");
  // Two postings read "both", not "all two".
  assert.match(firstMail({ language: "en", postings: postings.slice(0, 2) }).text,
    /these two teams would be a good fit[\s\S]*I've put the details of both here\.\nSee both \(/);
});

test("a follow-up keeps its sentences in place of the lead, without the intro", () => {
  const shown = postings.slice(0, 2);
  const mail = renderAgentMail({
    language: "ko", subject: "Re: 유나님께 소개드리고 싶은 팀이 있어 연락드려요", body: `지난주에 소개드린 팀들이 아직 사람을 찾고 있어요.\n\n${agentPostingList(shown)}`,
    name: "유나", harperUrl: "https://matchharper.com/x", postings: shown, senderName: "Ashly", senderEmail: "s@example.com", followup: true,
  });
  assert.match(mail.text, /^안녕하세요, 유나님\.\n\n지난주에 소개드린 팀들이 아직 사람을 찾고 있어요\.\n\n• 예시데이터웍스/);
  assert.doesNotMatch(mail.text, /돕고 있는 Ashly입니다|잘 맞겠다 싶어서/);
  assert.match(mail.text, /두 곳 내용은 여기에 모아뒀어요/);
});

test("a posting that closed since is not counted: the words follow the postings shown", () => {
  const mail = firstMail({ postings: postings.slice(0, 2), body: `${agentLeadLine("ko", "디자인 시스템")}\n\n${agentPostingList(postings)}` });
  assert.match(mail.text, /이 두 팀이 잘 맞겠다/);
  assert.equal(mail.text.split("테스트러닝").length - 1, 0);
});

test("a cold mail keeps the fit and leaves the reviewer's caveat on the log", () => {
  assert.equal(mailWhy("결제 API를 직접 설계해 본 경험이 이 팀의 정산 시스템과 맞아요. 다만 게임 서버 업무도 섞여 있어 확인이 필요합니다."),
    "결제 API를 직접 설계해 본 경험이 이 팀의 정산 시스템과 맞아요.");
  assert.equal(mailWhy("Payments backend work matches. However the role is mid-level."), "Payments backend work matches.");
  assert.equal(mailWhy("정산 자동화 경험이 맞아요"), "정산 자동화 경험이 맞아요");
});

test("the body's own greeting is dropped (the per-person greeting is added)", async () => {
  const { dropLeadingGreeting } = await import("./render");
  assert.equal(dropLeadingGreeting("안녕하세요, Harper의 Chris예요. 연락드렸어요."), "Harper의 Chris예요. 연락드렸어요.");
  assert.equal(dropLeadingGreeting("안녕하세요. 연락드렸어요."), "연락드렸어요.");
  assert.equal(dropLeadingGreeting("Hi, I'm Chris."), "I'm Chris.");
  assert.equal(dropLeadingGreeting("Harper의 Chris예요."), "Harper의 Chris예요.");
});


test("only the link to the roles and the opt-out line are links: a page's or the model's links never reach the mail", () => {
  const sneaky: AgentPosting[] = [
    { ...postings[0], summary: "데이터 화면을 만드는 곳이에요 [지원](https://evil.example/apply) www.evil.example" },
    postings[1],
  ];
  const body = "결제를 [직접](https://evil.example/a) 맡아 https://evil.example/b <a href=\"https://evil.example/c\">c</a> evil-site.com 오신 분."
    + `\n\n${agentPostingList(sneaky)}`;
  const mail = renderAgentMail({
    language: "ko", subject: "**[공고](https://evil.example)** 골라 봤어요 https://evil.example", body,
    name: "[홍길동](https://evil.example)", harperUrl: "https://matchharper.com/jobs/invite/abc", postings: sneaky,
    senderName: "Ashly", senderEmail: "sender@example.com", unsubscribeUrl: "https://matchharper.com/u/abc",
  });
  assert.equal(mail.subject, "공고 골라 봤어요");
  assert.equal(/evil/.test(mail.html) || /evil/.test(mail.text), false);
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(hrefs.map((href) => href.replace(/\?.*$/, "")))].sort(),
    ["https://matchharper.com/jobs/invite/abc", "https://matchharper.com/u/abc"]);
  assert.match(mail.text, /안녕하세요, 홍길동님\./);
  assert.match(mail.text, /데이터 화면을 만드는 곳이에요 지원/);
});

test("a name longer than 60 characters is left out; an empty subject gets the one form without a name", () => {
  const mail = renderAgentMail({
    language: "en", subject: "https://evil.example", body: "", name: `${"Jane ".repeat(13)}Doe`,
    harperUrl: "https://matchharper.com/x", postings, senderName: "Sender", senderEmail: "sender@example.com",
  });
  assert.match(mail.text, /^Hi,/m);
  assert.equal(mail.subject, "A few teams I'd like to introduce you to");
  assert.equal(agentMailSubject("  ", "ko"), "소개드리고 싶은 팀이 있어 연락드려요");
});

test("the why keeps only what fits: hedging sentences are dropped too", () => {
  assert.equal(mailWhy("결제 백엔드 경험과 잘 맞아요. 공고 내 연봉 범위가 서로 달라 확인이 필요합니다."), "결제 백엔드 경험과 잘 맞아요.");
  assert.equal(mailWhy("데이터 파이프라인 경험이 맞아요. 도메인은 차이가 있을 수 있어요."), "데이터 파이프라인 경험이 맞아요.");
  assert.equal(mailWhy("Strong backend match. Seniority may differ from the posting."), "Strong backend match.");
  assert.equal(mailWhy("경력과 잘 맞아요. 다만 지역이 달라요."), "경력과 잘 맞아요.");
  assert.equal(mailWhy("결제 경험이 잘 맞아요. 해당 경험이 없다면 확인해볼 만합니다."), "결제 경험이 잘 맞아요.");
});

test("a caveat word cuts only where it opens a sentence", () => {
  // At a sentence start: the caveat and what follows go.
  assert.equal(mailWhy("결제 경험이 맞아요. 하지만 지역이 달라요."), "결제 경험이 맞아요.");
  assert.equal(mailWhy("Strong payments match. But the team is fully remote."), "Strong payments match.");
  assert.equal(mailWhy("Strong payments match.\nHowever, the level is junior."), "Strong payments match.");
  // Inside a sentence: kept whole (it used to be cut right before the word).
  assert.equal(mailWhy("정산 원장을 설계해 온 경험이 맞아요, 하지만 그보다 대사 자동화를 이끈 점이 이 팀에 더 쓰여요."),
    "정산 원장을 설계해 온 경험이 맞아요, 하지만 그보다 대사 자동화를 이끈 점이 이 팀에 더 쓰여요.");
  assert.equal(mailWhy("Your ledger work fits, But more than that your reconciliation tooling is what they need."),
    "Your ledger work fits, But more than that your reconciliation tooling is what they need.");
  // "Node.js" or "3.5" is not a sentence end.
  assert.equal(mailWhy("Your Node.js payments API work fits their checkout rebuild. It is a stretch for the mobile part."),
    "Your Node.js payments API work fits their checkout rebuild.");
});

test("부족 is not a caveat: a short-handed team is a reason the person fits", () => {
  assert.equal(mailWhy("백엔드 인력이 부족한 팀이라, 결제 API를 혼자 맡아 온 경험이 바로 쓰여요."),
    "백엔드 인력이 부족한 팀이라, 결제 API를 혼자 맡아 온 경험이 바로 쓰여요.");
  assert.equal(mailWhy("정산 자동화 경험이 맞아요. 이 팀은 데이터 엔지니어가 부족해 그 일을 맡을 사람이 필요해요."),
    "정산 자동화 경험이 맞아요. 이 팀은 데이터 엔지니어가 부족해 그 일을 맡을 사람이 필요해요.");
});

test("English hedges stay off the mail, the log and the invite page", () => {
  const fit = "Building a ledger API draws on your PostgreSQL and backend platform work.";
  assert.equal(mailWhy(`${fit} Go is a stack change, and fintech experience is preferred rather than required.`), fit);
  assert.equal(mailWhy(`${fit} Its GPU focus makes it an adjacent stretch for you.`), fit);
  assert.equal(mailWhy(`${fit} The Kotlin side would be a stretch.`), fit);
  assert.equal(mailWhy(`${fit} It is a broader option, though the edtech domain is less directly aligned.`), fit);
  assert.equal(mailWhy(`${fit} Although the domain is new, the team is small.`), fit);
  assert.equal(mailWhy(`${fit} It is not a direct match for the mobile side.`), fit);
  assert.equal(mailWhy(`${fit} You have less experience with Go, which they use.`), fit);
  // "thought" is not "though".
  assert.equal(mailWhy(`${fit} The team thought through its ledger design early.`), `${fit} The team thought through its ledger design early.`);
});
