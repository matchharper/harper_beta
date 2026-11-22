import assert from "node:assert/strict";
import test from "node:test";
import { memberAnswerContent } from "./ashleyMail";
import { MEMBER_ANSWER_PAYLOAD_KEY, memberAnswerPayload, memberAnswerRunInstruction, memberIntroStep } from "./ashleyMember";

test("member card → which way the company's request goes: already asked, ask now, or none (why)", () => {
  for (const status of ["awaiting_talent", "connecting", "connected"]) assert.deepEqual(memberIntroStep(status), { step: "requested" }, status);
  assert.deepEqual(memberIntroStep("ready"), { step: "request" });
  assert.deepEqual(memberIntroStep("passed"), { step: "none", reason: "회원 카드가 passed 상태예요" });
  assert.deepEqual(memberIntroStep(null), { step: "none", reason: "회사 역할에 회원 카드가 없어요" });
});

test("a company's answer in a member's chat: a fixed lead line, then its words in quotes, as they are", () => {
  assert.equal(memberAnswerContent({ language: "ko", companyName: "회사 B", postingTitle: "Backend Engineer", words: " 네, 원격 근무 가능해요. " }),
    '회사 B에서 Backend Engineer 공고에 대해 물어보신 질문에 답했어요:\n\n"네, 원격 근무 가능해요."');
  assert.equal(memberAnswerContent({ language: "en", companyName: null, postingTitle: null, words: "Yes, remote is fine." }),
    'The company answered the question you asked:\n\n"Yes, remote is fine."');
});

test("the run that tells the member names the message only (no company text); the message keeps its relay row", () => {
  const instruction = memberAnswerRunInstruction(123);
  assert.match(instruction, /message 123/);
  assert.doesNotMatch(instruction, /"/);
  assert.deepEqual(memberAnswerPayload({ key: "jobs@company-b.example|p1", relay: { companyEmail: "Jobs@Company-B.example", personId: "p1", inboundMessageId: "m1" } }), {
    [MEMBER_ANSWER_PAYLOAD_KEY]: { key: "jobs@company-b.example|p1", relayCompanyEmail: "jobs@company-b.example", relayPersonId: "p1", inboundMessageId: "m1", via: "ashley" },
  });
});
