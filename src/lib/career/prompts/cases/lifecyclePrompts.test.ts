import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  buildCareerSessionStartTurnInstruction,
} from "./lifecyclePrompts";
import { CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER } from "../types";

test("session re-engagement uses readable Korean-local times and distinguishes access from prior chat", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /currentAccessAt: 8월 25일 18:24/);
  assert.match(prompt, /previousChatAt: 8월 24일 10:25/);
  assert.match(prompt, /한국 시간 기준 24시간제/);
  assert.doesNotMatch(prompt, /\bKST\b/);
  assert.match(prompt, /이전 대화가 오늘이 아니면/);
  assert.doesNotMatch(prompt, /2026-08-2[45]T/);
  assert.doesNotMatch(prompt, /31시간 전/);
  assert.doesNotMatch(prompt, /2주 만에/);
});

test("incomplete onboarding re-engagement allows an icebreaker but never sends only a welcome", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: false,
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /재접속 인사나 아이스브레이킹은 사용해도 된다/);
  assert.match(prompt, /그런 인사만 하고 발화를 끝내지 마라/);
  assert.doesNotMatch(prompt, /재접속 자체를 인사로 알리지 마라/);
  assert.match(prompt, /__NO_SESSION_GREETING__만 출력해라/);
  assert.match(prompt, /구체적인 필수 정보가 없다면/);
  assert.match(prompt, /가장 중요한 질문 하나/);
  assert.match(prompt, /다른 언어로 전환해 달라고 명시했고/);
  assert.match(prompt, /대화의 최신 언어를 우선/);
});

test("session re-engagement includes only one call action with card-link guidance", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        callId: "call-123",
        companyName: "Acme",
        kind: "talent_call",
        reason: "역할의 기대 범위를 함께 확인하면 좋아요.",
        resumePromptNeeded: false,
        roleTitle: "Backend Engineer",
      },
      {
        companyName: "Third Company",
        kind: "internal_opportunity",
        recommendationSummary: null,
        roleTitle: "Product Engineer",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /현재 사용자가 처리하면 좋은 작업:/);
  assert.match(prompt, /\[call\]\(callId:call-123\) Acme · Backend Engineer/);
  assert.match(prompt, /해당 작업 1개/);
  assert.match(
    prompt,
    /talent_call은 답변의 마지막 문장에서 언급하되 재촉하지 않는다/
  );
  assert.match(
    prompt,
    /항상 자연스러운 인사나 이전 대화를 잇는 다른 내용과 함께/
  );
  assert.match(prompt, /\[call\]\(callId:\.\.\.\)를 정확히 한 번/);
  assert.doesNotMatch(prompt, /Third Company/);
});

test("session re-engagement gives reevaluation context without role metadata", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        kind: "reevaluation_question",
        question: "비즈니스 영어로 협업한 경험이 있으신가요?",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(
    prompt,
    /\[reevaluation_criteria\] 비즈니스 영어로 협업한 경험이 있으신가요\?/
  );
  assert.match(prompt, /알려주시면 앞으로의 연결에 도움이 되는 질문이 있어요/);
});

test("feedback follow-up forbids unsupported saved-filter claims", () => {
  const prompt = buildCareerOpportunityFeedbackFollowUpTurnInstruction({
    preferredLocale: "ko",
    trigger:
      CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.DelayedExternalFeedback,
  });

  assert.match(prompt, /one signal when choosing future recommendations/);
  assert.match(prompt, /Do not volunteer technical explanations/);
  assert.match(prompt, /role fit summary is context/i);
  assert.match(prompt, /Never repeat them to the user/);
  assert.match(prompt, /ask exactly one focused question in the same reply/);
  assert.match(prompt, /do not say Harper will prioritize, deprioritize/);
  assert.match(prompt, /Exclude an entire company[\s\S]*only when/);
  assert.match(
    prompt,
    /role mismatch[\s\S]*does not authorize company-wide exclusion/
  );
  assert.match(prompt, /explicit feedback reason.*direct evidence/i);
});

test("internal acceptance explains timing without exposing human confirmation", () => {
  const prompt = buildCareerOpportunityFeedbackFollowUpTurnInstruction({
    preferredLocale: "ko",
    trigger:
      CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback,
  });

  assert.match(prompt, /appropriate context at a thoughtful time/);
  assert.match(prompt, /ask the user to wait/);
  assert.match(prompt, /Never mention an internal human review/);
  assert.match(prompt, /Do not imply.*instantly sends/);
});
