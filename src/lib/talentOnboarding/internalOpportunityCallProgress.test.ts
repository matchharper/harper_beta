import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceInternalOpportunityCallQuestionProgress,
  getInternalOpportunityCallCompletionDisposition,
  hasAnsweredAtLeastOneInternalOpportunityCallQuestion,
  isInternalOpportunityCallQuestionPlanComplete,
  normalizeInternalOpportunityCallQuestionProgress,
  shouldAdvanceInternalOpportunityCallQuestion,
} from "./internalOpportunityCallProgress";

const questions = [
  "고객의 모호한 요구를 정리해 PoC와 운영 서비스로 발전시킨 경험을 소개해 주세요.",
  "LLM 기능을 통합하며 가장 어려웠던 기술적 문제는 무엇이었나요?",
  "고객에게 트레이드오프를 설명하고 합의를 이끌어낸 경험이 있나요?",
];

test("legacy call state starts from the first stored question", () => {
  assert.deepEqual(normalizeInternalOpportunityCallQuestionProgress(null, 4), {
    candidateQuestionsAsked: false,
    nextQuestionIndex: 0,
  });
});

test("question progress advances one question per answered turn", () => {
  const afterFirst = advanceInternalOpportunityCallQuestionProgress(
    { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
    3
  );
  const afterSecond = advanceInternalOpportunityCallQuestionProgress(
    afterFirst,
    3
  );
  const afterLast = advanceInternalOpportunityCallQuestionProgress(
    afterSecond,
    3
  );

  assert.deepEqual(afterFirst, {
    candidateQuestionsAsked: false,
    nextQuestionIndex: 1,
  });
  assert.deepEqual(afterSecond, {
    candidateQuestionsAsked: false,
    nextQuestionIndex: 2,
  });
  assert.deepEqual(afterLast, {
    candidateQuestionsAsked: true,
    nextQuestionIndex: 3,
  });
});

test("question progress is clamped and never advances past the plan", () => {
  assert.deepEqual(
    advanceInternalOpportunityCallQuestionProgress(
      { candidateQuestionsAsked: true, nextQuestionIndex: 99 },
      4
    ),
    { candidateQuestionsAsked: true, nextQuestionIndex: 4 }
  );
});

test("a call completes only after every stored question and the candidate-question check", () => {
  assert.equal(
    isInternalOpportunityCallQuestionPlanComplete(
      { candidateQuestionsAsked: false, nextQuestionIndex: 3 },
      3
    ),
    false
  );
  assert.equal(
    isInternalOpportunityCallQuestionPlanComplete(
      { candidateQuestionsAsked: true, nextQuestionIndex: 3 },
      3
    ),
    true
  );
});

test("advances only when the assistant actually asks the following stored question", () => {
  assert.equal(
    shouldAdvanceInternalOpportunityCallQuestion({
      assistantText:
        "좋습니다. LLM 기능을 통합하며 가장 어려웠던 기술적 문제는 무엇이었나요?",
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
      questions,
      userText: "고객 인터뷰부터 운영 배포까지 직접 진행했습니다.",
    }),
    true
  );
});

test("does not advance when the assistant repeats or rephrases the current question", () => {
  assert.equal(
    shouldAdvanceInternalOpportunityCallQuestion({
      assistantText:
        "네, 다시 여쭤볼게요. 모호한 고객 요구를 정리해서 PoC로 만든 사례를 편하게 말씀해 주시겠어요?",
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
      questions,
      userText: "질문을 잘 못 들었어요. 다시 말해 주세요.",
    }),
    false
  );
});

test("advances the last stored question only after asking for candidate questions", () => {
  assert.equal(
    shouldAdvanceInternalOpportunityCallQuestion({
      assistantText:
        "Wonderful이나 다음 진행 과정에 대해 궁금하신 점이 있으신가요?",
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 2 },
      questions,
      userText: "비용과 지연시간을 수치로 설명해 합의를 이끌었습니다.",
    }),
    true
  );
  assert.equal(
    shouldAdvanceInternalOpportunityCallQuestion({
      assistantText: "좋은 답변 감사합니다. 내용은 잘 반영할게요.",
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 2 },
      questions,
      userText: "비용과 지연시간을 수치로 설명해 합의를 이끌었습니다.",
    }),
    false
  );
});

test("recognizes at least one answered question from persisted progress or a substantive final turn", () => {
  assert.equal(
    hasAnsweredAtLeastOneInternalOpportunityCallQuestion({
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 1 },
      questions,
      transcript: [],
    }),
    true
  );
  assert.equal(
    hasAnsweredAtLeastOneInternalOpportunityCallQuestion({
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
      questions,
      transcript: [
        { role: "assistant", text: questions[0] },
        {
          role: "user",
          text: "고객 인터뷰부터 운영 배포까지 직접 진행했습니다.",
        },
      ],
    }),
    true
  );
});

test("does not count repeat, greeting, or hang-up controls as a question answer", () => {
  for (const userText of [
    "여보세요?",
    "질문을 못 들었어요. 다시 말해 주세요.",
    "통화는 여기서 종료할게요.",
    "Could you repeat that?",
  ]) {
    assert.equal(
      hasAnsweredAtLeastOneInternalOpportunityCallQuestion({
        progress: { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
        questions,
        transcript: [
          { role: "assistant", text: questions[0] },
          { role: "user", text: userText },
        ],
      }),
      false,
      userText
    );
  }
});

test("does not count a company question as an answer to the stored question", () => {
  assert.equal(
    hasAnsweredAtLeastOneInternalOpportunityCallQuestion({
      progress: { candidateQuestionsAsked: false, nextQuestionIndex: 0 },
      questions,
      transcript: [
        { role: "assistant", text: questions[0] },
        { role: "user", text: "Wonderful은 어떤 회사인가요?" },
      ],
    }),
    false
  );
});

test("completion disposition closes partial calls after one answer", () => {
  assert.equal(
    getInternalOpportunityCallCompletionDisposition({
      answeredAtLeastOneQuestion: true,
      questionPlanComplete: false,
    }),
    "partial_answered"
  );
  assert.equal(
    getInternalOpportunityCallCompletionDisposition({
      answeredAtLeastOneQuestion: false,
      questionPlanComplete: false,
    }),
    "unanswered"
  );
  assert.equal(
    getInternalOpportunityCallCompletionDisposition({
      answeredAtLeastOneQuestion: true,
      questionPlanComplete: true,
    }),
    "full"
  );
});
