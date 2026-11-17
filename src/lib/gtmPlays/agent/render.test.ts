import assert from "node:assert/strict";
import test from "node:test";
import { agentMailSubject, agentPostingList, mailWhy, renderAgentMail } from "./render";
import type { AgentPosting } from "./types";

const postings: AgentPosting[] = [
  { kind: "external", roleId: null, url: null, companyName: "Alpha", title: "Backend Engineer", location: "Seoul", why: "결제 경험이 맞아요" },
  { kind: "gtm", roleId: null, url: null, companyName: "Harper 고객사(핀테크 스타트업)", title: "Server Engineer", location: null, why: "Kotlin 경험이 맞아요" },
];

test("the mail: greeting, body with the list once, the ask, one plain link, closing and opt-out", () => {
  const body = `하퍼의 담당자예요. 경력에 맞는 회사를 골랐어요.\n\n${agentPostingList(postings)}`;
  const mail = renderAgentMail({
    language: "ko", subject: " 경력에 맞는 공고 ", body, name: "지수", harperUrl: "https://matchharper.com/jobs/invite/abc",
    postings, senderName: "담당자", senderEmail: "sender@example.com", unsubscribeUrl: "https://matchharper.com/u/abc",
  });
  assert.equal(mail.subject, "경력에 맞는 공고");
  assert.match(mail.text, /지수님, 안녕하세요\./);
  assert.equal(mail.text.split("Backend Engineer").length - 1, 1);
  assert.match(mail.html, /href="https:\/\/matchharper\.com\/jobs\/invite\/abc"/);
  assert.match(mail.text, /2곳 자세히 보기 \(https:\/\/matchharper\.com\/jobs\/invite\/abc\)/);
  assert.match(mail.text, /짧게 답장만 주셔도 충분해요/);
  assert.match(mail.text, /담당자 드림\nHarper 커리어 매니저/);
  // A normal mail: no buttons.
  assert.doesNotMatch(mail.html, /<table/);
  assert.match(mail.html, /Harper 고객사\(핀테크 스타트업\)/);
  assert.match(mail.html, /https:\/\/matchharper\.com\/u\/abc/);
  assert.match(mail.text, /담당자 드림/);
  // A body that lost the list gets it back once.
  const edited = renderAgentMail({
    language: "en", subject: "Roles", body: "A short note.", name: "Jisoo Kim", harperUrl: "https://matchharper.com/x",
    postings, senderName: "Sender", senderEmail: "sender@example.com",
  });
  assert.match(edited.text, /Hi Jisoo,/);
  assert.equal(edited.text.split("Server Engineer").length - 1, 1);
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
    { ...postings[0], why: "결제 경험이 맞아요 [지원](https://evil.example/apply) www.evil.example" },
    postings[1],
  ];
  const body = "Harper의 **담당자**예요. [이력서 보기](https://evil.example/a) https://evil.example/b <a href=\"https://evil.example/c\">c</a> evil-site.com 에서도요."
    + `\n\n${agentPostingList(sneaky)}`;
  const mail = renderAgentMail({
    language: "ko", subject: "**[공고](https://evil.example)** 골라 봤어요 https://evil.example", body,
    name: "[홍길동](https://evil.example)", harperUrl: "https://matchharper.com/jobs/invite/abc", postings: sneaky,
    senderName: "담당자", senderEmail: "sender@example.com", unsubscribeUrl: "https://matchharper.com/u/abc",
  });
  assert.equal(mail.subject, "공고 골라 봤어요");
  assert.equal(/evil/.test(mail.html) || /evil/.test(mail.text), false);
  const hrefs = [...mail.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(hrefs.map((href) => href.replace(/\?.*$/, "")))].sort(),
    ["https://matchharper.com/jobs/invite/abc", "https://matchharper.com/u/abc"]);
  assert.match(mail.text, /홍길동님, 안녕하세요\./);
  // The writer's own self-intro gives way to the fixed intro; the rest stays as plain words.
  assert.match(mail.text, /Harper에서 좋은 사람과 좋은 팀을 잇는 일을 하는 담당자예요\.[^\n]*\n\n이력서 보기 c 에서도요\./);
  assert.match(mail.html, /<strong>Alpha<\/strong>/);
  assert.match(mail.text, /결제 경험이 맞아요 지원/);
});

test("a name longer than 60 characters is left out of the greeting; an empty subject gets the default", () => {
  const mail = renderAgentMail({
    language: "en", subject: "https://evil.example", body: "A short note.", name: `${"Jane ".repeat(13)}Doe`,
    harperUrl: "https://matchharper.com/x", postings, senderName: "Sender", senderEmail: "sender@example.com",
  });
  assert.match(mail.text, /^Hi,/m);
  assert.equal(mail.subject, "A few roles that fit your background");
  assert.equal(agentMailSubject("  ", "ko"), "경력에 맞을 만한 기회 몇 곳");
});

test("the subject: applicants hear about their application, others get the fitting roles; no name when unknown", async () => {
  const { agentSubject } = await import("./render");
  assert.equal(agentSubject({ language: "ko", name: "김하늘", roleWord: "백엔드 개발", count: 3, applicant: true }), "김하늘님, 백엔드 개발 지원 건으로 연락드려요");
  assert.equal(agentSubject({ language: "ko", name: "김하늘", roleWord: "백엔드 개발", count: 3, applicant: false }), "김하늘님께 맞을 만한 백엔드 개발 기회 3곳");
  assert.equal(agentSubject({ language: "ko", name: null, roleWord: "데이터 엔지니어", count: 2, applicant: false }), "맞을 만한 데이터 엔지니어 기회 2곳");
  assert.equal(agentSubject({ language: "ko", name: "김하늘", roleWord: "", count: 2, applicant: true }), "경력에 맞을 만한 기회 몇 곳");
  assert.equal(agentSubject({ language: "en", name: "Jane Doe", roleWord: "backend", count: 3, applicant: true }), "Jane, about your backend application");
  assert.equal(agentSubject({ language: "en", name: null, roleWord: "product design", count: 2, applicant: false }), "2 product design roles that fit your background");
});

test("the why keeps only what fits: hedging sentences are dropped too", () => {
  assert.equal(mailWhy("결제 백엔드 경험과 잘 맞아요. 공고 내 연봉 범위가 서로 달라 확인이 필요합니다."), "결제 백엔드 경험과 잘 맞아요.");
  assert.equal(mailWhy("데이터 파이프라인 경험이 맞아요. 도메인은 차이가 있을 수 있어요."), "데이터 파이프라인 경험이 맞아요.");
  assert.equal(mailWhy("Strong backend match. Seniority may differ from the posting."), "Strong backend match.");
  assert.equal(mailWhy("경력과 잘 맞아요. 다만 지역이 달라요."), "경력과 잘 맞아요.");
  assert.equal(mailWhy("결제 경험이 잘 맞아요. 해당 경험이 없다면 확인해볼 만합니다."), "결제 경험이 잘 맞아요.");
});

test("the intro is code's: who writes and what Harper is, after the greeting; a writer's own self-intro goes; none on a follow-up", async () => {
  const { withoutSelfIntro } = await import("./render");
  assert.equal(withoutSelfIntro("Harper에서 채용 연결을 돕고 있는 Ashly예요. 링크드인 공고에 지원하신 걸 보고 연락드려요."), "링크드인 공고에 지원하신 걸 보고 연락드려요.");
  assert.equal(withoutSelfIntro("링크드인 공고에 지원하신 걸 보고 연락드려요."), "링크드인 공고에 지원하신 걸 보고 연락드려요.");
  const base = { language: "ko" as const, subject: "제목", name: "지수", harperUrl: "https://matchharper.com/x", postings, senderEmail: "s@example.com" };
  const mail = renderAgentMail({ ...base, body: "Harper의 Ashly예요. 지원하신 걸 보고 연락드려요.", senderName: "Ashly" });
  assert.match(mail.text, /지수님, 안녕하세요\.\n\nHarper에서 좋은 사람과 좋은 팀을 잇는 일을 하는 Ashly예요\. Harper는 이직을 준비하는 분과 회사를 직접 이어 드리는 채용 서비스예요\.\n\n지원하신 걸 보고 연락드려요\./);
  assert.equal(mail.text.split("Ashly예요").length - 1, 1);
  assert.match(renderAgentMail({ ...base, body: "본문", senderName: "김민준" }).text, /김민준이에요\./);
  assert.doesNotMatch(renderAgentMail({ ...base, body: "아직 열려 있어요.", senderName: "Ashly", followup: true }).text, /좋은 팀을 잇는 일을 하는/);
});

