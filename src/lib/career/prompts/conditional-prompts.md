# Career Conditional Prompt Map

이 문서는 Career chat/call에서 조건에 따라 추가되는 주요 prompt block을 정리한다.

## 항상 포함

- `chat_core`: Harper의 기본 역할, 응답 언어, 링크/도구 사용 기본 규칙.
- `profile_context`: 현재 talent profile, structured profile, 최근 추천 기회 요약.
- `dynamic_state`: 현재 채널, 현재 시각, 저장된 선호/insight, opportunity 상태.

## 온보딩 중

조건: `talent_setting.is_onboarding_done`이 false.

- `onboarding_rules`: 온보딩 목적, 질문 방식, 종료 조건, completion marker 규칙.
- `onboarding runtime state`: checklist coverage, missing question, additional question, final confirmation 상태.
- 온보딩 중 tool policy는 노출된 tool이 있을 때만 제한적으로 포함된다.

## 온보딩 완료 후

조건: `talent_setting.is_onboarding_done`이 true.

- `default_conversation_guidance`: 일반 Career chat 가이드.
- `known future-matching insights/preferences`: 저장된 matching memory와 추천 수신 설정.
- `optional follow-up opportunities`: internal fit hold question 등 후속 확인이 필요한 hidden opportunity context.

## Official Jobs Signup Source Follow-Up

조건:

- 온보딩이 완료되어 있다.
- 현재 `/api/talent/chat` 요청 channel이 text chat이다.
- 같은 conversation에서 onboarding completion 이후 user chat/call transcript/open-position request가 5개 이하이다.
- 해당 user가 onboarding completion 이전에 `/jobs/[slug]`에서 `Talk to Harper`를 누른 기록이 있다.
  - source: `official_job_events.event_type = "job_apply_click"`
  - user identity는 `official_job_events.user_id`로 확인한다.

주입 위치:

- `/api/talent/chat`에서 `buildCareerTextChatPromptBlocks`의 `sessionStartInstruction`으로 전달된다.
- conversation starter proactive instruction이 있는 turn에서는 proactive instruction이 우선한다.

LLM 지시 요약:

- `{roleTitle} @ {companyName}` 또는 `/jobs/{slug}`가 Harper-connected opportunity라는 점을 자연스럽게 언급한다.
- Harper가 강한 fit이 있을 때 연결을 도울 수 있다고 짧게 안내한 뒤, 해당 포지션에 관심이 있는지 한 번만 묻는다.
- 사용자가 관심을 보이면 `get_internal_roles`로 role/company를 resolve하고, concrete role이 잡히면 `request_internal_role_priority_review`로 등록한다.
- 최신 user intent와 맞지 않으면 언급하지 않는다.

## Conversation Starter

조건: user가 conversation starter CTA로 chat/call을 시작했다.

- `proactiveTurnInstruction`으로 starter-specific instruction이 들어간다.
- 이 instruction은 일반 session instruction보다 우선한다.

## Session Start Re-Engagement

조건: 사용자가 일정 시간 이후 Career 화면에 다시 접속했고, 새 user message 없이 Harper가 먼저 말할 수 있는 turn.

- `buildCareerSessionStartTurnInstruction`이 들어간다.
- 이전 활동, 추천 피드백, profile gap, 오래된 idle 상태에 따라 짧은 re-engagement를 유도한다.

## Call Wrap-Up

조건: voice call이 종료되어 `/api/talent/chat/call-wrapup`이 호출된다.

- `buildCareerCallWrapupTurnInstruction`: 일반 call 종료 후 짧은 follow-up.
- `buildInternalOpportunityCallWrapupInstruction`: accepted internal opportunity 관련 call 종료 후 follow-up.
- wrap-up turn에서는 `update_setting`, `update_talent_profile`만 허용된다.

## Opportunity Feedback Follow-Up

조건: 추천 opportunity에 like/dislike/clear feedback이 발생했고 Harper가 proactive response를 생성한다.

- `buildCareerOpportunityFeedbackFollowUpTurnInstruction`이 들어간다.
- feedback pattern을 과하게 해석하지 않고, 필요하면 한 가지 calibration question만 묻는다.
- internal opportunity accept는 연결 진행 의사로 처리한다.
