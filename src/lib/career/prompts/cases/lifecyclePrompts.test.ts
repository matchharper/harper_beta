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
  assert.match(prompt, /이전 대화를 방금 일처럼 표현하지 마라/);
  assert.doesNotMatch(prompt, /2026-08-2[45]T/);
  assert.doesNotMatch(prompt, /31시간 전/);
  assert.doesNotMatch(prompt, /2주 만에/);
  assert.match(prompt, /\[\[CAREER_REENGAGEMENT_ACTIONS\]\]/);
  assert.match(prompt, /"type":"send_message"/);
  assert.match(prompt, /"type":"open_path"/);
  assert.match(prompt, /"type":"open_pending_action"/);
  assert.match(prompt, /"type":"start_call"/);
  assert.match(prompt, /일반 CAREER_CHOICE_BUTTONS는 쓰지 않는다/);
  assert.match(prompt, /Harper가 먼저 보낼 자연스러운 Korean 메시지/);
  assert.match(prompt, /필요하면 적당히 길게 작성해도 된다/);
  assert.doesNotMatch(prompt, /one brief/i);
  assert.doesNotMatch(prompt, /primary pending action/);
  assert.doesNotMatch(prompt, /다른 미응답 추천이 있더라도 함께 꺼내지 않는다/);
});

test("session re-engagement exposes a career check-in call as an available pending action", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        createdAt: "2026-08-24T01:25:03.102495+00:00",
        kind: "career_check_in_call",
        status: "pending",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /커리어 체크인 통화/);
  assert.match(prompt, /"type":"start_call"/);
  assert.match(prompt, /"type":"start_call","actionKey"/);
  assert.match(prompt, /actionKey:pending_1/);
  assert.doesNotMatch(prompt, /단일 start_call만 만든다/);
});

test("session re-engagement exposes an internal opportunity call as an available pending action", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        callRequestId: "call_123",
        companyName: "Acme",
        kind: "internal_opportunity_call",
        reason: "연결 전에 프로젝트 경험을 조금 더 듣고 싶어요.",
        roleTitle: "Backend Engineer",
        status: "pending",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /\[actionKey:pending_1\] \[역할 관련 통화\] Acme · Backend Engineer/);
  assert.match(prompt, /연결 전에 프로젝트 경험을 조금 더 듣고 싶어요/);
  assert.doesNotMatch(prompt, /call_123/);
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

test("session re-engagement supplies pending actions without primary-only instructions", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        companyName: "Third Company",
        kind: "internal_opportunity",
        recommendedAt: "2026-09-04T01:35:10.584998+00:00",
        recommendationSummary: null,
        roleTitle: "Product Engineer",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /현재 참고할 수 있는 pending action/);
  assert.match(prompt, /Third Company/);
  assert.match(prompt, /아직 응답 없음/);
  assert.match(prompt, /추천 시각: 9월 4일 10:35/);
  assert.doesNotMatch(prompt, /2026-09-04T01:35/);
  assert.doesNotMatch(prompt, /primary pending action/);
  assert.doesNotMatch(prompt, /하나만 다룬다/);
  assert.match(prompt, /종료 marker 뒤에 다른 문자나 문장부호를 붙이지 않는다/);
});

test("session re-engagement gives reevaluation context without role metadata", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        kind: "reevaluation_question",
        question: "비즈니스 영어로 협업한 경험이 있으신가요?",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(
    prompt,
    /\[actionKey:pending_1\] \[reevaluation_criteria\] 비즈니스 영어로 협업한 경험이 있으신가요\?/
  );
});

test("session re-engagement supplies a pending meeting schedule", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        companyName: "Acme",
        kind: "meeting_schedule",
        roleTitle: "Backend Engineer",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(
    prompt,
    /\[actionKey:pending_1\] \[미팅 일정 요청\] Acme · Backend Engineer/
  );
  assert.match(prompt, /"type":"open_pending_action","actionKey"/);
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

test("internal acceptance promises profile sharing and connection without exposing internals", () => {
  const prompt = buildCareerOpportunityFeedbackFollowUpTurnInstruction({
    preferredLocale: "ko",
    trigger:
      CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER.ImmediateInternalFeedback,
  });

  assert.match(prompt, /share or introduce the candidate's profile and relevant experience/);
  assert.match(prompt, /help make the connection/);
  assert.match(prompt, /do not volunteer a disclaimer/);
  assert.match(prompt, /Never expose Harper's internal confirmation/);
  assert.match(prompt, /If the internal opportunity was disliked/);
  assert.match(
    prompt,
    /Follow any rejection-specific context provided for this turn/
  );
  assert.match(
    prompt,
    /keep the reply proportional to the user's stated reason/
  );
  assert.doesNotMatch(
    prompt,
    /다음에 어떤 과정이 진행되는지 최대한 자세히 안내해라/
  );
  assert.doesNotMatch(prompt, /same company/i);
});
