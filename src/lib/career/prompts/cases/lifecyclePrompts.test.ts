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
  assert.match(prompt, /label과 실제 action의 대상·범위·전달 채널을 정확히/);
  assert.match(prompt, /일반 CAREER_CHOICE_BUTTONS는 쓰지 않는다/);
  assert.match(prompt, /보이는 일반 메시지가 답변의 핵심이다/);
  assert.match(prompt, /짧고 자연스러운 인사말/);
  assert.match(prompt, /같은 사실을 반복하지 않는다/);
  assert.match(prompt, /Harper가 지금 바로 대신할 수 있는 선택지를 중심/);
  assert.match(prompt, /추천 설정이 어긋나면 설정을 맞추는 선택을 먼저/);
  assert.match(prompt, /현재 설정 유지나 공고 더 찾기/);
  assert.match(prompt, /새로운 세부 모드를 만들지 않는다/);
  assert.match(prompt, /내부 설정명·전달 방식/);
  assert.match(prompt, /명확히 말한 변화는 다시 확인하지 않고/);
  assert.match(prompt, /이미 안내한 사용자 직접 작업은/);
  assert.match(prompt, /프로필 수정은 주제로 삼지 말고/);
  assert.match(prompt, /최신 상황과 현재 추천·연결 설정의 불일치/);
  assert.match(prompt, /새로 생긴 추천이나 결과/);
  assert.match(prompt, /최근 추천 피드백/);
  assert.match(prompt, /더 많은 공고 탐색/);
  assert.match(prompt, /다시 되돌리는 방법/);
  assert.match(prompt, /각각에 대응하는 액션을.*반드시/);
  assert.match(prompt, /실행 선택이 없을 때만 블록을 생략/);
  assert.match(prompt, /서로 다른 설정 변경을 한 액션에 묶지 않는다/);
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

test("session re-engagement prioritizes the first actionable pending item", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    pendingActions: [
      {
        actionKey: "pending_1",
        companyName: "Third Company",
        kind: "internal_opportunity",
        recommendationSummary: null,
        roleTitle: "Product Engineer",
      },
    ],
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /사용자가 지금 처리하면 결과가 달라지는 작업이 있다/);
  assert.match(prompt, /Third Company/);
  assert.match(prompt, /사용자의 관심과 피드백만 요청한다/);
  assert.match(prompt, /프로필 공유·회사 소개·연결이 진행됐거나 확정됐다고/);
  assert.match(prompt, /Harper가 다음 단계를 확인/);
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
  assert.match(prompt, /답이 앞으로의 연결에 왜 도움이 되는지/);
});

test("session re-engagement prioritizes a pending meeting schedule", () => {
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
  assert.match(prompt, /일정 선택 액션을 가장 먼저 제안/);
  assert.match(prompt, /질문·이력서·미팅 일정 요청/);
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
