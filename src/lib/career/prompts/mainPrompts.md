# 일반 Career 채팅 프롬프트와 추가 입력

2026-10-31 로컬 구현 기준이다. 배포 여부를 뜻하지 않는다. 온보딩, 음성 통화와 그 종료/완료 메시지는 이 문서의 범위에서 제외한다.

## 기본 프롬프트 정본

일반 `/career` 텍스트 대화의 기본 지침은 [mainPrompts.ts](./mainPrompts.ts)의 `buildCareerMainPrompt`에서 읽는다. [conversationPlan.ts](./conversationPlan.ts)는 이를 `career_main` 블록 하나로 넣고 사용자와 실행 상태를 별도 context로 조립한다. 기본 역할·대화·언어·출력 형식·공통 실행 계약은 같은 파일에 있다. `CAREER_MAIN_PROMPT`는 호칭·채널·응답·실행 안내까지 다른 문구 상수 참조 없이 연속된 문자열이다. 치환값은 대화 언어와 Jobs 탭 이름뿐이다. 온보딩/통화/백그라운드의 기본 지침은 `rawPrompts.ts`에서 별도로 관리한다. 언어 설정 도구의 저장 범위는 `talentOnboarding/languageSettingTool.ts`의 도구 설명이 소유하며, 도구 유무에 따른 시스템 프롬프트 분기는 없다.

실제 입력은 `career_main`만으로 끝나지 않는다. 아래의 호출 목적, 원본 사실, 도구 정의, 필요한 handbook, 실행 결과와 이력이 함께 들어간다. **조건부 지침을 모두 없앤 것은 아니다.** 특히 선택한 카드, 업로드, 회사 연락 context와 도구 결과에 남은 지침은 아래에 별도로 표시한다.

이번 정리에서 일반 채팅의 다음 추가 지침을 없앴다.

- opportunities capability 활성 여부에 따라 일반/기회 대화 지침을 교체하는 분기.
- 도구 목록별 `tool_policy` 조립과 도구 실행 뒤 같은 정책을 재삽입하는 경로.
- 이력서 유무, 초기 검색 대기 여부, fit-hold 질문에 따른 optional 질문·우선순위 지침.
- coaching capability/활동 상태에 따른 응답 프롬프트. 현재 활동 snapshot은 사실로 제공한다.
- Gmail 연결 상태, `/jobs` 유입 기회, 검색 진행 상태, 추천 중지·외부 추천 설정·프로필 공개 상태에 섞여 있던 일반 대화 지침. 해당 상태/식별자는 context로 제공한다.
- 비동기 작업 재개 때 추가하던 일반 후속 실행 지침. 공통 실행 원칙은 기본 프롬프트에 있고 `resumed_work`에는 재개 대상 사실을 제공한다.

## 특정 사건으로 LLM을 호출할 때

이 경로들은 `runtimeInstruction`/`proactiveContext`에 실제 호출 목적과 사건을 넣는다. 사건별 지침은 기본 프롬프트에 합치지 않았다.

| 조건 | 추가 입력과 정본 |
| --- | --- |
| 외부/내부 추천 피드백, Intro 수락·거절, 피드백 목록 소진 | [historyActionReply.ts](../historyActionReply.ts)의 `createTalentOpportunityFeedbackFollowUpReply` → [cases/lifecyclePrompts.ts](./cases/lifecyclePrompts.ts)의 `buildCareerOpportunityFeedbackFollowUpTurnInstruction` + [opportunityFeedbackEvent.ts](../opportunityFeedbackEvent.ts)의 저장된 결정·이유·추천/Role·전달 사실. internal/external은 사건 출처이며 다른 기본 프롬프트를 선택하지 않는다. |
| 세션 시작 / re-engagement | [session/route.ts](../../../app/api/talent/session/route.ts), [session/reengagement/route.ts](../../../app/api/talent/session/reengagement/route.ts) → `buildCareerSessionStartTurnInstruction`. 최근 접속·대화·re-engagement 이력, pending action과 전용 액션 마커/무응답 계약을 넣는다. 재방문 인사와 지금 도움이 되는 행동을 이어가는 목적을 전달한다. 온보딩 이후에는 `reengagementOpportunities.ts`의 상위 미추천 후보 10개·검색 실행 시점/상태·매칭 기준/목록 revision을 추가하고, `opportunities`와 `opportunity_search`를 첫 호출부터 제공한다. 기존 결과의 재사용·추가 검색·추천 개수는 원본 LLM이 판단한다. |
| `conversationMode=match_quality` 또는 `career_check_in`으로 명시적으로 시작 | [conversationPlan.ts](./conversationPlan.ts)의 `call_mode_instruction` → [conversationStarters.ts](./conversationStarters.ts)의 starter `turnInstruction`. 블록 이름과 달리 텍스트 요청에서도 이 mode가 지정되면 해당 시작 목적을 추가한다. |
| 회사 팔로우 직후 | [companyFollowUpReply.ts](../companyFollowUpReply.ts)의 `buildCompanyFollowUpInstruction`. 팔로우한 회사 사실과 후속 메시지 지침을 넣는다. 1–2문장, 질문 억제 등의 기존 작성 지침도 유지되어 있다. |
| Gmail 지원/인터뷰 이력 가져오기 완료 | [gmailCareerHistoryReplyCore.ts](../../integrations/gmailCareerHistoryReplyCore.ts)의 `buildGmailCareerHistoryFollowUpInstruction`. 저장된 회사별 이력과 완료 알림 목적을 넣는다. 회사명 전부 언급·후속 질문 금지 등의 기존 작성 지침도 남아 있다. |
| 예약 작업, source 변화, 평가 완료, 회사 후속 연락 의무 등 background invocation | [background/prompt.ts](../background/prompt.ts)의 `renderCareerBackgroundInvocation`. 위임 목적·source/ref/revision·평가/오류·후속 연락 사실을 넣고, 별도 background 실행·이메일 전달 계약을 적용한다. [background/server.ts](../background/server.ts)는 최근 실제 발송 이력도 제공한다. 일반 foreground 채팅과 별도 호출이다. |

[chatTurn.ts](../chatTurn.ts)는 사용자 텍스트 없이 proactive context만 있는 호출에서도 실제 대화 이력을 유지한다. 호출 목적과 준비된 사실은 runtime context에 제공하며 합성 user 메시지나 새로운 동의를 만들지 않는다. 큐/비동기 재개는 원래 호출의 context와 reply 식별자를 보존한다.

`includePostOnboardingConversationGuide=true`를 명시한 온보딩 완료 handoff에는 [postOnboardingGuide.ts](./postOnboardingGuide.ts)의 guide가 별도로 추가될 수 있다. 이는 완료 handoff 전용 예외이며, 일반 대화에서 자동으로 이어 붙이는 기본 지침이 아니다. 온보딩 산출물이라 상세는 이 문서 범위에서 제외한다.

## 일반 채팅에도 남아 있는 선택·업로드 지침

아래는 별도 proactive 호출만의 지침이 아니다. 보통의 채팅 요청에도 해당 입력이 있을 때 추가된다.

| 조건 | 남아 있는 지침 / 위치 |
| --- | --- |
| composer에서 회사 요청을 선택 | [chat/route.ts](../../../app/api/talent/chat/route.ts)의 `selectedPendingActionRuntimeInstruction`: 최신 발화를 그 request에 연결하고, 명확한 응답/거절은 담당 도구로 처리하도록 지시한다. |
| composer에서 internal-fit 질문을 선택 | 같은 분기에서 exact fitId의 답으로 해석하고 새 정보 저장/모호함 확인을 지시한다. |
| 미응답 내부 연결 제안을 선택 | 같은 분기에서 exact company/role 맥락으로 답하고, 질문을 수락·거절로 추정하지 않도록 지시한다. |
| coaching 카드의 시작/변경/종료 action 또는 오래된 카드 참조 | 같은 route의 `coachingActivityActionRuntimeInstruction`: exact activity/revision/action을 처리하거나 stale 상태를 안내하도록 지시한다. 기본 대화의 coaching 상태별 프롬프트와는 별개다. |
| 이번 메시지에 문서 첨부 | [documentPromptContext.ts](../../talentOnboarding/documentPromptContext.ts)의 `buildFirstTurnUploadedDocumentContext`: 저장 사실·발췌·다음 offset과 함께 외부 내용의 비신뢰성, 추가 읽기, 잘못된 종류 수정, 제3자 일회성 문서 삭제/확인 지침이 들어간다. |
| 회사 연락 맥락/선택된 회사 요청이 존재 | [companyTalentRequests/server.ts](../../companyTalentRequests/server.ts)의 connection index, [presentation.ts](../../companyTalentRequests/presentation.ts)의 `serializeTalentPendingRequest`, ops 연락일 때 [opsContactContract.ts](../../companyTalentRequests/opsContactContract.ts). 정확한 연결·공유 동의·연락 도구·상태 해석/응답 관련 지침이 남아 있다. |

## 사용자·실행 사실에 따라 달라지는 context

다음은 기본 지침을 바꾸기 위한 분기가 아니라 필요한 원본 사실을 전달하는 경로다. 일부 projection에는 읽기 도구를 찾는 안내나 출처 해석 문구가 있다.

- [conversationPlan.ts](./conversationPlan.ts), [conversationSections.ts](./conversationSections.ts): 언어 설정, 현재 시간/시간대, 프로필·이력서 존재, 최근 추천, Brief/Memory, 최근 활동, 추천 진행 상태, 피드백 context, coaching snapshot, active fit-hold 질문, Gmail 상태, `/jobs` 유입 기회.
- [agentTurnRuntime.server.ts](../agentTurnRuntime.server.ts): matching·예약/팔로우·프로필·열린 브라우저·저장된 form의 현재 index. 전체 자료를 읽는 도구 안내도 포함한다. 미완료 작업 이후 사용자 메시지가 있으면 최신 변경/취소를 읽으라는 안내와 그 원문을 추가한다.
- [opportunityFeedbackNote.ts](../opportunityFeedbackNote.ts): 버튼 피드백, 업로드, browser/form action을 실제 사용자 자유 발화와 구분해 이력에 투영한다. browser/form 상태를 읽는 도구 안내도 있다. [turnCancellation.ts](../turnCancellation.ts)는 사용자가 중지했다는 실행 사실을 제공한다.
- [capabilities/runtime.ts](../capabilities/runtime.ts): 비동기 dependency 이후 재개하면 `resumed_work`에 대상 종류/ID를 제공한다. 저장 transcript의 과거 실행 결과와 현재 context를 함께 읽는다.
- [chatTurn.ts](../chatTurn.ts), [chat/route.ts](../../../app/api/talent/chat/route.ts): 최근 메시지, 이전 요약, 선택된 기회/자료와 현재 업로드가 입력에 포함된다. 원본 대화 이력은 기본 프롬프트가 아니다. 사용자 발화 없는 호출에도 합성 사용자 메시지를 추가하지 않는다. 호출 목적은 `proactiveContext`에, 실제 비동기 재개 사실은 `resumed_work`와 저장된 실행 이력에 남는다.

## 도구와 handbook의 동적 로딩

이 부분은 유지되어 있다. 따라서 **상황에 따라 추가되는 설명이 트리거 프롬프트뿐인 구조는 아직 아니다.**

| 조건 | 실제로 추가/변경되는 입력 |
| --- | --- |
| 현재 권한·연결·모드에서 사용 가능한 도구가 달라짐 | [capabilities/resolver.ts](../capabilities/resolver.ts), [registry.ts](../capabilities/registry.ts), [catalog.ts](../capabilities/catalog.ts)가 capability catalog와 현재 API 도구 schema/description을 결정한다. `full`/`progressive` 설정과 연결 철회도 영향을 준다. 기본 대화 지침은 교체하지 않는다. |
| preload selector가 필요한 기능/guide를 선택 | [capabilities/server.ts](../capabilities/server.ts) → [decisions.ts](../capabilities/decisions.ts). 최근 대화·현재 참조·이전 실행을 보는 별도 selector가 capability와 handbook을 미리 로드할 수 있다. 원본 agent도 loader로 추가할 수 있다. |
| 원본 agent가 `load_career_capabilities` 호출 | 다음 completion부터 해당 도구 schema/description이 제공된다. 로딩은 외부 실행이나 사용자 동의가 아니다. |
| selector 또는 원본 agent가 `load_handbook`으로 guide 로드 / 이전 guide 유효기간이 남음 | [handbooks/registry.ts](../handbooks/registry.ts), [runtime.ts](../handbooks/runtime.ts): `resume`, `application`, `opportunity_search`, `proactive_career` 본문이 추가된다. 제공된 guide는 첫 답변을 포함해 전달된 답변 3회 동안 유지된다. loader가 제공될 때 handbook catalog도 추가된다. |

도구의 효과·입력·권한·revision·동의·이어가기 계약은 해당 도구 정의와 handbook에 남는다. 개별 도구 이름에 따라 일반 대화용 정책을 다시 만드는 `tool_policy`는 `career_main` 경로에 추가하지 않는다.

## 도구 결과와 provider 후속 호출에 남은 지침

- [talentOnboarding/tools.ts](../../talentOnboarding/tools.ts) 등의 executor는 일부 결과에 `assistantInstruction`을 반환한다. 일반 경로에서 확인되는 것은 Gmail 접근 실패, 추천 조회의 상태/내부 연결 안내, 회사 연결 조회, 회사 연락의 전달/미전달/내용 불일치, 내부 Role 조회, 추천 피드백의 보관/수락 가능 여부·보관 완료·실패/불완전 상태, 설정 변경, Brief/Memory 읽기·쓰기, coaching 상태/충돌 결과 등이다. 결과가 달라지면 이 지침도 달라진다.
- 원본 위치: `tools.ts`의 피드백 처리·`read_recommended_opportunities`·`read_company_connections`·`contact_company`·`update_setting`·`read_talent_context`·`write_talent_context`·`manage_career_coaching_activity`, [internalRoleSearch.ts](../internalRoleSearch.ts), [integrations/gmail.ts](../../integrations/gmail.ts). 공통 `TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION`은 현재 executor에서 자동 추가하지 않는다. 폐기된 priority-review/reconsideration/simulation 도구의 문구가 파일에 남아 있다는 이유만으로 일반 allowlist의 활성 경로에 포함하지 않는다.
- [relayContract.ts](../../companyTalentRequests/relayContract.ts)의 회사 연락 성공 결과는 전달 사실과 회사의 열람·답변·동의·향후 행동이 확인되지 않았다는 경계만 제공한다. 미전달·내용 불일치 결과와 [cases/coachingPrompts.ts](./cases/coachingPrompts.ts)의 `buildCareerCoachingResultInstruction`에는 상태 설명, 짧게 확인하기, 질문하지 않기, 카드 선택 기다리기 등의 **응답 지침이 남아 있다**. 결과가 순수 사실만 제공하는 구조로 전부 정리된 것은 아니다.
- [llm.ts](../llm.ts)의 `buildAssistantInstructionsFromToolResults` / `withToolResultFollowupInstruction`는 반환된 지침을 후속 completion에 전달한다. Anthropic 경로에서는 `Additional tool-result instruction`으로 다시 붙이는 경우도 있다. 기본 공통 도구 결과 후속 문구는 비어 있지만, 제공된 `application_handoff_contract`가 있으면 해당 계약을 추가하는 지원 경로는 남아 있다.
- 같은 파일의 `buildStreamingToolContinuationInstruction`는 후속 호출에 현재 callable 도구 목록 또는 도구가 없으므로 답하라는 지침을 넣는다. 빈 visible text 복구에는 `buildEmptyVisibleTextRecoveryInstruction`를 붙여 다시 호출한다.
- 도구 호출 예산을 쓰는 실행 경로에는 예산 소진 후 추가 도구 없이 답하라는 문구가 있다. [talentOnboarding/llm.ts](../../talentOnboarding/llm.ts)에도 대응 경로가 있다. 일반 `CareerCapabilityRuntime`의 호출/루프 상한은 무한대로 설정되어 있어, 코드에 문구가 존재한다는 사실과 정상 일반 runtime에서 그 분기에 도달한다는 주장은 구분해야 한다.
- 도구 실패는 [toolFailure.ts](../toolFailure.ts)의 실행 결과 projection으로 입력된다. 별도 성공 사실로 바꾸지 않는다.

## 개발용 프롬프트 교체

[promptExperiment.server.ts](./promptExperiment.server.ts), [promptExperiment.ts](./promptExperiment.ts)는 production이 아닌 환경에서 허용된 요청의 `v1/v2/v3` 파일을 읽는다. `.local/healingpaper-input-audit/06-prompts-only*.txt`의 section으로 기본 지침·capability 설명·handbook 본문을 교체/제거할 수 있다. 기본 프롬프트 override는 `career_main` 한 section을 사용한다. 기존 실험 파일/저장 snapshot의 세 section(`chat_core`, `default_conversation_guidance`, `autonomous_career_work`)은 호환을 위해 읽을 때만 연결한다. 이 override가 선택된 개발 요청에서는 `mainPrompts.ts` 원문과 실제 입력이 다를 수 있다. production에서는 이 파일 override를 적용하지 않는다.

기존 전체 경로/이전 구조 설명은 [conditional-prompts.md](./conditional-prompts.md)에 보존되어 있다. 일반 텍스트 채팅의 현재 기본 프롬프트와 남은 추가 입력 범위는 이 문서를 우선한다.
