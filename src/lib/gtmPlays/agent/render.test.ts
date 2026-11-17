import assert from "node:assert/strict";
import test from "node:test";
import { agentPostingList, mailWhy, renderAgentMail } from "./render";
import type { AgentPosting } from "./types";

const postings: AgentPosting[] = [
  { kind: "external", roleId: null, url: null, companyName: "Alpha", title: "Backend Engineer", location: "Seoul", why: "결제 경험이 맞아요" },
  { kind: "gtm", roleId: null, url: null, companyName: "Harper 고객사(핀테크 스타트업)", title: "Server Engineer", location: null, why: "Kotlin 경험이 맞아요" },
];

test("the mail: greeting, body with the list once, the button, closing and opt-out", () => {
  const body = `하퍼의 담당자예요. 경력에 맞는 회사를 골랐어요.\n\n${agentPostingList(postings)}`;
  const mail = renderAgentMail({
    language: "ko", subject: " 경력에 맞는 공고 ", body, name: "지수", harperUrl: "https://matchharper.com/jobs/invite/abc",
    postings, senderName: "담당자", senderEmail: "sender@example.com", unsubscribeUrl: "https://matchharper.com/u/abc",
  });
  assert.equal(mail.subject, "경력에 맞는 공고");
  assert.match(mail.text, /지수님, 안녕하세요\./);
  assert.equal(mail.text.split("Backend Engineer").length - 1, 1);
  assert.match(mail.html, /href="https:\/\/matchharper\.com\/jobs\/invite\/abc"/);
  assert.match(mail.text, /공고 보기: https:\/\/matchharper\.com\/jobs\/invite\/abc/);
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

