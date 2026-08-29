import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalOpportunityCallWrapupInstruction,
  buildInternalOpportunityRealtimeInstruction,
} from "./lifecyclePrompts";

const callRequest = {
  companyLogoUrl: null,
  companyName: "Wonderful",
  createdAt: "2026-08-25T00:00:00.000Z",
  id: "call-1",
  opportunityId: "opportunity-1",
  preferredLocale: "ko",
  questions: [
    "고객 현장에서 AI 제품을 배포한 경험을 알려주세요.",
    "기술팀과 비기술팀 사이에서 요구사항을 조율한 사례가 있나요?",
    "업무에서 영어로 협업한 구체적인 상황을 알려주세요.",
  ],
  questionProgress: {
    candidateQuestionsAsked: false,
    nextQuestionIndex: 1,
  },
  reason: null,
  resumePromptNeeded: false,
  roleId: "role-1",
  roleTitle: "Forward Deployed Engineer",
  status: "active",
  updatedAt: "2026-08-25T00:01:00.000Z",
};

test("internal opportunity call prompt pins the active and following stored questions", () => {
  const prompt = buildInternalOpportunityRealtimeInstruction(callRequest);

  assert.match(prompt, /Wonderful/);
  assert.match(prompt, /Forward Deployed Engineer/);
  assert.match(prompt, /nextQuestionIndex: 1/);
  assert.match(
    prompt,
    /currentRequiredQuestion: 기술팀과 비기술팀 사이에서 요구사항을 조율한 사례가 있나요\?/
  );
  assert.match(
    prompt,
    /followingRequiredQuestion: 업무에서 영어로 협업한 구체적인 상황을 알려주세요\./
  );
  assert.match(prompt, /Never skip ahead, reorder the plan/);
  assert.match(prompt, /recent chat, recommendations, onboarding/);
});

test("internal opportunity call prompt closes only after the candidate-question phase", () => {
  const prompt = buildInternalOpportunityRealtimeInstruction({
    ...callRequest,
    questionProgress: {
      candidateQuestionsAsked: true,
      nextQuestionIndex: callRequest.questions.length,
    },
  });

  assert.match(prompt, /all planned questions complete/);
  assert.match(prompt, /already been invited to ask questions/);
  assert.match(prompt, /close naturally and call end_call/);
});

test("partial-answer wrap-up closes the request without inviting a resumed call", () => {
  const prompt = buildInternalOpportunityCallWrapupInstruction({
    callRequest,
    completionDisposition: "partial_answered",
    durationLabel: "1분 10초",
    preferredLocale: "ko",
    transcript: [
      { role: "assistant", text: callRequest.questions[0] },
      {
        role: "user",
        text: "고객 현장에서 요구사항을 정리해 AI 기능을 배포했습니다.",
      },
    ],
  });

  assert.match(prompt, /completionDisposition: partial_answered/);
  assert.match(prompt, /close this call request/);
  assert.match(prompt, /Thank them for participating/);
  assert.match(prompt, /Do not invite them to resume later/);
  assert.doesNotMatch(prompt, /selecting Call from the \+ button in the chat/);
});
