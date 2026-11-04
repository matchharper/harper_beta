import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCareerCallNoteOpenAction,
  buildCareerCallWrapupFallbackFollowUp,
  buildCareerCallWrapupTurnInstruction,
  buildCareerOpportunityFeedbackFollowUpTurnInstruction,
  buildCareerSessionStartTurnInstruction,
} from "./lifecyclePrompts";
import { extractCareerReengagementActions } from "../../reengagementActions";
import { CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER } from "../types";

test("call wrap-up mentions only a verified saved call note", () => {
  const baseArgs = {
    durationLabel: "1분 5초",
    isOnboardingDone: true,
    preferredLocale: "ko",
    transcript: [{ role: "user" as const, text: "기본급이 중요해요." }],
  };

  const withoutCallNote = buildCareerCallWrapupTurnInstruction(baseArgs);
  const withCallNote = buildCareerCallWrapupTurnInstruction({
    ...baseArgs,
    callNoteCreated: true,
  });
  const withUpdatedCallNote = buildCareerCallWrapupTurnInstruction({
    ...baseArgs,
    callNoteUpdated: true,
  });

  assert.doesNotMatch(withoutCallNote, /successfully saved/);
  assert.match(withCallNote, /successfully saved/);
  assert.match(withCallNote, /under Documents in their profile/);
  assert.match(
    withUpdatedCallNote,
    /existing call note was successfully updated/
  );
  assert.doesNotMatch(
    withUpdatedCallNote,
    /organized this conversation into a call note/
  );
});

test("career coaching wrap-up preserves only an agreed useful ending", () => {
  const prompt = buildCareerCallWrapupTurnInstruction({
    conversationStarterId: "career_coaching",
    durationLabel: "8분 12초",
    isOnboardingDone: true,
    preferredLocale: "ko",
    transcript: [
      {
        role: "user",
        text: "다음에는 배울 수 있는 동료가 있는 팀을 우선해서 보고 싶어요.",
      },
    ],
  });

  assert.match(prompt, /concrete Harper support plan/);
  assert.match(prompt, /user approved/);
  assert.match(prompt, /Do not invent a new task/);
  assert.match(prompt, /journaling/i);
  assert.match(prompt, /durable user facts or decision criteria the user explicitly confirmed/);
  assert.match(prompt, /Do not store Harper's support plan itself as Memory/);
  assert.doesNotMatch(prompt, /reflect what they shared in future matching/);
});

test("call wrap-up fallback appends a localized saved call-note notice", () => {
  const korean = buildCareerCallWrapupFallbackFollowUp({
    callNoteCreated: true,
    isOnboardingDone: true,
    preferredLocale: "ko",
  });
  const english = buildCareerCallWrapupFallbackFollowUp({
    callNoteCreated: true,
    isOnboardingDone: true,
    preferredLocale: "en",
  });
  const withoutCallNote = buildCareerCallWrapupFallbackFollowUp({
    isOnboardingDone: true,
    preferredLocale: "ko",
  });
  const updatedEnglish = buildCareerCallWrapupFallbackFollowUp({
    callNoteUpdated: true,
    isOnboardingDone: true,
    preferredLocale: "en",
  });

  assert.match(korean, /콜노트로 정리해뒀어요/);
  assert.match(korean, /프로필의 문서에서 확인/);
  assert.match(english, /organized this conversation into a call note/);
  assert.match(english, /under Documents in your profile/);
  assert.match(
    updatedEnglish,
    /added this conversation to your existing call note/
  );
  assert.doesNotMatch(withoutCallNote, /콜노트/);
});

test("call wrap-up adds a localized deep link for a verified call note", () => {
  const korean = appendCareerCallNoteOpenAction({
    content: "대화를 정리했어요.",
    documentId: "9de379c1-b735-42a6-8e92-3939b12e87f0",
    preferredLocale: "ko",
    title: "보상 기준",
  });
  const english = appendCareerCallNoteOpenAction({
    content: "I organized the conversation.",
    documentId: "9de379c1-b735-42a6-8e92-3939b12e87f0",
    preferredLocale: "en",
    title: "Compensation criteria",
  });

  assert.deepEqual(extractCareerReengagementActions(korean), {
    actions: [
      {
        label: "콜노트 보기 · 보상 기준",
        action: {
          path: "/career/profile?profileSection=links&callNoteId=9de379c1-b735-42a6-8e92-3939b12e87f0",
          type: "open_path",
        },
      },
    ],
    content: "대화를 정리했어요.",
  });
  assert.equal(
    extractCareerReengagementActions(english).actions[0]?.label,
    "View call note · Compensation criteria"
  );
  assert.equal(
    appendCareerCallNoteOpenAction({
      content: "저장하지 않았어요.",
      documentId: null,
      preferredLocale: "ko",
      title: null,
    }),
    "저장하지 않았어요."
  );
});

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
  assert.match(prompt, /시각은 24시간제이며 내부 판단용/);
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
  assert.match(prompt, /사용자가 새 메시지를 보내지 않은 상태/);
  assert.match(prompt, /다시 방문한 사용자를 자연스러운 인사로 맞이하며 새로 대화를 여는 차례/);
  assert.match(prompt, /먼저 Korean로 반갑게 인사를 건네고/);
  assert.doesNotMatch(prompt, /one brief/i);
  assert.doesNotMatch(prompt, /primary pending action/);
  assert.doesNotMatch(prompt, /다른 미응답 추천이 있더라도 함께 꺼내지 않는다/);
});

test("session re-engagement localizes times to the current access timezone and preferred locale", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-09-01T02:57:00.000Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    preferredLocale: "en",
    previousChatAt: "2026-08-31T02:57:00.000Z",
    timeZone: "America/New_York",
  });

  assert.match(prompt, /currentAccessAt: Aug 31, 22:57/);
  assert.match(prompt, /previousChatAt: Aug 30, 22:57/);
});

test("session re-engagement preserves recent history as context without prescribing topics", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-09-01T02:57:00.000Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: true,
    preferredLocale: "ko",
    previousChatAt: "2026-08-31T02:57:00.000Z",
    recentReengagementHistory: [
      "첫 번째 과거 메시지",
      "두 번째 과거 메시지",
      "세 번째 과거 메시지",
      "네 번째 과거 메시지",
    ],
  });

  assert.doesNotMatch(prompt, /첫 번째 과거 메시지/);
  assert.match(prompt, /두 번째 과거 메시지/);
  assert.match(prompt, /세 번째 과거 메시지/);
  assert.match(prompt, /네 번째 과거 메시지/);

});

test("session re-engagement describes the update call as a natural invitation", () => {
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

  assert.match(prompt, /최근 일·커리어 상황에서 달라진 점/);
  assert.match(prompt, /통화로 편하게 듣고 싶/);
  assert.doesNotMatch(prompt, /커리어 체크인/);
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

  assert.match(
    prompt,
    /\[actionKey:pending_1\] \[역할 관련 통화\] Acme · Backend Engineer/
  );
  assert.match(prompt, /연결 전에 프로젝트 경험을 조금 더 듣고 싶어요/);
  assert.doesNotMatch(prompt, /call_123/);
});

test("incomplete onboarding return opens with a greeting when a question remains", () => {
  const prompt = buildCareerSessionStartTurnInstruction({
    currentAccessAt: "2026-08-25T09:24:05.960Z",
    idleMs: 31 * 60 * 60 * 1000,
    isOnboardingDone: false,
    preferredLocale: "ko",
    previousChatAt: "2026-08-24T01:25:03.102495+00:00",
  });

  assert.match(prompt, /자연스러운 인사로 맞이하며 새로 대화를 여는 차례/);
  assert.match(prompt, /이어갈 실제 질문이 있으면 인사 뒤에 자연스럽게 연결/);
  assert.doesNotMatch(prompt, /재접속 자체를 인사로 알리지 마라/);
  assert.match(prompt, /__NO_SESSION_GREETING__만 출력해라/);
  assert.match(prompt, /구체적인 필수 정보가 없다면/);
  assert.match(prompt, /가장 중요한 질문 하나/);
  assert.match(prompt, /응답 언어는 사용자가 저장한 언어인 Korean이다/);
  assert.match(prompt, /그 답 하나만 다른 언어로 부탁한 것은 이번 발화에 이어가지 않는다/);
  assert.doesNotMatch(prompt, /대화의 최신 언어를 우선/);
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

test("feedback events preserve the saved decision, event identity and optional silence", () => {
  for (const trigger of Object.values(CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER)) {
    const prompt = buildCareerOpportunityFeedbackFollowUpTurnInstruction({ preferredLocale: "ko", trigger });
    assert.ok(prompt.includes(`Event source: ${trigger}`));
    assert.ok(prompt.includes("The saved decision is already executed."));
    assert.ok(prompt.includes("[[CAREER_FEEDBACK_SILENT]]"));
    assert.ok(!prompt.includes("recommend_job_postings"));
    assert.ok(!prompt.includes("ask exactly one"));
  }
});
