import assert from "node:assert/strict";
import { test } from "node:test";
import { careerEmailChoiceHref, opensReplyCompose } from "./choiceLinks";
import { extractCareerChoiceBlocks, extractCareerChoiceButtons } from "@/lib/career/choiceButtons";
import { EMAIL_CHOICE_DRAFT_PARAM, EMAIL_CHOICE_SIGNATURE_PARAM } from "@/lib/career/emailChoiceDraft";
import { verifyEmailChoiceDraft } from "./security";

process.env.EMAIL_REPLY_TOKEN_SECRET ||= "choice-link-test-secret";
const TALENT = "11111111-1111-4111-8111-111111111111";
import { namesNoEarlierMessage } from "./runtime/transport";

test("mailboxes whose apps open a prefilled reply are told apart from others", () => {
  for (const address of ["a@gmail.com", "Kim <b@Outlook.com>", "c@hotmail.co.kr", "d@live.com", "e@icloud.com"])
    assert.equal(opensReplyCompose(address), true, address);
  for (const address of ["a@naver.com", "b@hanmail.net", "c@company.com", "d@yahoo.com", "", null])
    assert.equal(opensReplyCompose(address), false, String(address));
});

test("a Gmail recipient replies to this email's alias; a Naver recipient opens Career chat with the text", () => {
  const choice = { label: "네, 좋아요", value: "네, 소개받고 싶어요" };
  const gmail = careerEmailChoiceHref({
    talentId: TALENT,
    recipient: "a@gmail.com",
    replyTo: "reply+abc123def456@reply.matchharper.com",
    subject: "소개 제안",
  })(choice);
  assert.equal(
    gmail,
    `mailto:reply%2Babc123def456@reply.matchharper.com?subject=${encodeURIComponent("Re: 소개 제안")}&body=${encodeURIComponent("네, 소개받고 싶어요")}`
  );
  const naver = new URL(careerEmailChoiceHref({
    talentId: TALENT,
    recipient: "a@naver.com",
    replyTo: "reply+abc123def456@reply.matchharper.com",
    subject: "소개 제안",
  })(choice));
  assert.equal(naver.pathname, "/career/chat");
  assert.equal(naver.searchParams.get(EMAIL_CHOICE_DRAFT_PARAM), "네, 소개받고 싶어요");
  // The link fills only its recipient's composer, and only with the text Harper wrote.
  const signature = naver.searchParams.get(EMAIL_CHOICE_SIGNATURE_PARAM) ?? "";
  assert.equal(verifyEmailChoiceDraft(TALENT, "네, 소개받고 싶어요", signature), true);
  assert.equal(verifyEmailChoiceDraft(TALENT, "제 이력서를 보내 주세요", signature), false);
  assert.equal(verifyEmailChoiceDraft("22222222-2222-4222-8222-222222222222", "네, 소개받고 싶어요", signature), false);
  // Without a reply alias there is no email to answer, so even Gmail opens chat.
  assert.match(careerEmailChoiceHref({ talentId: TALENT, recipient: "a@gmail.com", subject: "x" })(choice), /\/career\/chat\?/);
});

test("answer options are read the same way for chat and email", () => {
  const block = (payload: string) => `질문\n\n[[CAREER_CHOICE_BUTTONS]]\n${payload}\n[[/CAREER_CHOICE_BUTTONS]]`;
  assert.deepEqual(extractCareerChoiceButtons(block('{"choices":["A",{"label":"B","value":"B 할게요"},"A","C","D"]}')).choices, [
    { label: "A", value: "A" },
    { label: "B", value: "B 할게요" },
    { label: "C", value: "C" },
  ]);
  // One option is not a choice; malformed metadata is hidden rather than shown.
  assert.deepEqual(extractCareerChoiceButtons(block('{"choices":["A"]}')), { content: "질문", choices: [] });
  assert.deepEqual(extractCareerChoiceButtons(block("{broken")), { content: "질문", choices: [] });
  assert.equal(extractCareerChoiceButtons('답변\n[[CAREER_CHOICE_BUTTONS]]\n{"choi').content, "답변");
  // Each block keeps its own choices for email; a code fence around a block is unwrapped.
  const twoBlocks = extractCareerChoiceBlocks(`${block('{"choices":["A","B"]}')}\n\nQ2\n\n${block('{"choices":["C","D"]}')}`, (index) => `<${index}>`);
  assert.deepEqual(twoBlocks.blocks.map((choices) => choices.map((choice) => choice.value)), [["A", "B"], ["C", "D"]]);
  assert.match(twoBlocks.content, /질문\n\n<0>\n\nQ2\n\n질문\n\n<1>/);
  assert.deepEqual(extractCareerChoiceButtons('질문\n\n```\n[[CAREER_CHOICE_BUTTONS]]\n{"choices":["A","B"]}\n[[/CAREER_CHOICE_BUTTONS]]\n```').content, "질문");
});

test("mail written from a button names no earlier message, unlike a reply", () => {
  assert.equal(namesNoEarlierMessage({ headers: { Subject: "Re: x" } } as never), true);
  assert.equal(namesNoEarlierMessage({ headers: [{ name: "In-Reply-To", value: "<a@b>" }] } as never), false);
  assert.equal(namesNoEarlierMessage({ headers: { References: "<a@b>" } } as never), false);
});
