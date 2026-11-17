import assert from "node:assert/strict";
import test from "node:test";
import { DM_LINK_PLACEHOLDER, DM_MAX_LENGTH, agentPostingList, finishDm, renderAgentMail } from "./render";
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

test("a DM keeps one link line and fits 600 characters", () => {
  assert.equal(finishDm(`안녕하세요. ${DM_LINK_PLACEHOLDER} 공고 보세요. ${DM_LINK_PLACEHOLDER}`), `안녕하세요.  공고 보세요.\n${DM_LINK_PLACEHOLDER}`);
  const long = finishDm(`${"가나다라 마바사. ".repeat(80)}`);
  assert.ok(long.length <= DM_MAX_LENGTH);
  assert.ok(long.endsWith(`\n${DM_LINK_PLACEHOLDER}`));
  assert.equal(long.split(DM_LINK_PLACEHOLDER).length - 1, 1);
  assert.match(long.split("\n")[0], /\.$/);
});
