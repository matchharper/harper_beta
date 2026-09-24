# Company-side LLM 입력 구조·프롬프트·선택적 기능 로딩 구현 계획

- 문서 기준: 2026-09-24
- 상태: **구현 전 설계. 이 문서 작성으로 runtime·DB·배포가 변경되지 않는다.**
- 대상: `/org`와 회사 Slack의 company-side LLM, 같은 실행부를 사용하는 후속 이벤트
- 코드 검토 기준: `harper_beta` HEAD `c55ebf03`과 당시 로컬 변경사항. 운영 배포 상태의 증거가 아니다.
- 범위: 1차 변경 묶음인 프롬프트 책임 정리, 대화 메시지 구조 복원, tool 결과의 중복 답변 지시 제거와 **상세 tool policy·schema의 선택적 지연 로딩**을 함께 설계한다.
- 대체 관계: [이전 Skill·Tool 라우팅 설계](company-side-llm-skill-routing-implementation-ko.md)를 대체한다. 이전 문서의 별도 router LLM, generic ActionGate, 새로운 승인 도구·저장소는 채택하지 않는다.

## 1. 구현 결론

현재의 단일 company-side LLM tool loop와 업무 실행 코드를 유지한다. 모델에게 전달하는 입력과 기능 노출 방식을 바꾼다.

1. 공통 행동·대화 원칙은 한 원본에서 관리한다.
2. 최근 대화는 표로 합치지 않고 실제 `user`·`assistant` 메시지로 전달한다.
3. Tool 결과에는 검증된 사실과 실행에 필요한 참조를 제공한다. 반복적인 말투·최종 답변 지시는 제거한다.
4. 기본 조회 도구와 짧은 기능 목록은 항상 제공한다.
5. Company-side LLM이 `load_capabilities`로 필요한 기능을 선택하면 **그 기능의 상세 정책과 실제 function schema를 다음 completion부터 함께 제공**한다.
6. 기능을 로드한 것과 실행 권한은 별개다. 기존 동의·승인·대상 확인·중복 실행 방지는 그대로 유지한다.

이는 모든 tool schema를 보내고 `tool_choice`로 일부만 제한하는 방식이 아니다. **로드하지 않은 기능의 상세 policy와 schema는 실제 provider request에서 제외한다.** 기능 개요와 중요한 공통 경계는 남겨 Harper가 명시적인 실행 요청 전에도 유용한 도움을 떠올릴 수 있게 한다.

### 1.1 항상 있는 것과 선택적으로 들어가는 것

| 구성 | 첫 completion | 기능 로드 이후 |
| --- | --- | --- |
| Harper의 목적·대화 원칙·공통 안전 경계 | 제공 | 유지 |
| 지원 기능의 짧은 개요와 핵심 전제 | 제공 | 유지 |
| 기본 조회 tool schema·기본 조회 계약 | 제공 | 유지 |
| `load_capabilities` schema | 제공 | 유지 |
| 미로드 기능의 긴 업무 정책 | 제외 | 선택한 기능만 추가 |
| 미로드 기능의 function schema | 제외 | 선택한 기능만 추가 |
| 현재 업무 context·최근 대화 | 범위와 예산 안에서 제공 | 실제 결과를 이어 붙임 |
| 후보자 비공개 원문·다른 회사 데이터 | 제공 금지 | 로딩해도 제공 금지 |

### 1.2 이번 변경으로 기대하는 사용자 경험

- 기능 이름을 몰라도 자신의 우려나 목적을 이야기하면 Harper가 가능한 도움을 판단한다.
- 같은 대화에서 조회·연락·진행 관리 등 여러 기능을 함께 사용할 수 있다.
- 기능을 불러오는 내부 절차를 사용자에게 승인받거나 설명하지 않는다.
- 앞선 질문과 답을 대화로 이어받으며, 실행 상태를 낭독하는 답변을 줄인다.
- 기능이 추가돼도 모든 대화에 새 상세 설명을 붙이지 않는다.

이는 효과에 대한 가설이다. 입력 길이나 형식만으로 자연스러움 향상을 확정하지 않는다.

## 2. 현재 코드에서 확인한 기준선

| 현재 코드 | 확인한 동작 | 변경 지점 |
| --- | --- | --- |
| [`chat.ts`](../src/lib/org/agent/chat.ts) `runCompletion` | `getEnabledOrgAgentTools(surface)`의 활성 도구 전체를 각 tool-enabled completion에 전달 | completion별 resolved tool 목록을 인자로 받도록 변경 |
| 같은 파일 `runOrgAgentToolLoop` | 처음에 system 1개와 회사 데이터·대화 표를 합친 user 1개를 구성 | 구조화된 입력 builder로 교체 |
| 같은 파일의 loop | 한 턴 안의 assistant tool call과 tool result는 이미 native message로 추가 | 이 동작을 유지하고 loader 처리만 추가 |
| [`context.ts`](../src/lib/org/agent/context.ts) `formatConversation` | 최근 메시지를 `speaker / references / message` 표로 변환 | 원본 role·본문·참조를 가진 모델 입력용 메시지를 추가 반환 |
| [`prompts.ts`](../src/lib/org/agent/prompts.ts) | 공통 문체·서비스 지식·업무 정책·surface·전달 규칙을 조합 | 책임별 원본과 명시적인 조립 순서 도입 |
| [`uxWritingPrompt.ts`](../src/lib/org/agent/uxWritingPrompt.ts) | 공통 문체와 개별 연락·연결 정책, 특정 문구 지시가 함께 존재 | 문체 원칙·업무 정책·필수 표시 계약 분리 |
| [`tools.ts`](../src/lib/org/agent/tools.ts) | 25개 domain tool 이름, 웹은 `start_role_creation` 제외; 일정 도구는 기존 feature gate 적용 | 원본 schema 유지, registry가 선택해서 참조 |
| [`promptFormat.ts`](../src/lib/org/agent/promptFormat.ts) | tool 결과를 이미 축약하지만 곳곳에 `response_guidance`와 업무 지시 포함 | 사실 projection과 공통 writing 지시 분리 |
| [`toolState.ts`](../src/lib/org/agent/toolState.ts), [`proposals.ts`](../src/lib/org/agent/proposals.ts) | exact preview·연락 draft revision·필수 링크 등 기존 실행 계약 존재 | 보존. generic 승인 시스템으로 교체하지 않음 |
| [`contactEventPrompt.ts`](../src/lib/org/agent/contactEventPrompt.ts) | 후보자 연락 후 원래 회사 지시를 읽고 같은 agent가 이어서 처리; 무응답 종료 가능 | event 출처 보존 + 같은 loader 사용 |
| [`backgroundResultPrompt.ts`](../src/lib/org/agent/backgroundResultPrompt.ts) | 완료 결과를 원래 요청에 대한 tool 결과로 표현하는 별도 tool-free 호출 | 결과 알림 전용 입력 계약으로 유지 |
| [`roleCreationChat.ts`](../src/lib/org/agent/roleCreationChat.ts) | 전용 역할 작성 loop와 별도 tool set | 전용 loop 유지. 공유 문체와 대화 입력 변경의 호환 범위만 적용 |

현재도 compact 목록, 상세 조회, 대화 요약, context budget, draft revision, 이벤트 중복 방지가 있다. 이들을 새로 없는 기능처럼 다시 만들지 않는다. 일반 응답마다 writer LLM을 추가 호출하는 구조도 아니다.

## 3. 확정한 설계와 비목표

### 3.1 확정 사항

- **선택 주체:** 사용자와 대화하는 원본 company-side LLM.
- **선택 단위:** 상황별 intent가 아니라 재사용 가능한 업무 능력.
- **로더:** 정확한 capability ID를 받는 로컬 registry 조회. 별도 LLM·embedding 검색 없음.
- **원본:** trusted TypeScript registry와 지침 모듈. 첫 버전에 runtime filesystem 탐색이나 외부 skill 설치 기능은 만들지 않는다.
- **첫 턴:** 기본 조회 5개 + loader + 전체 지원 기능 개요.
- **한 turn 안:** 로드된 capability·tool을 추가만 하고 중간에 제거하지 않는다.
- **다음 turn:** 기본 집합에서 다시 시작한다. 이전 대화와 pending artifact는 보존하되 skill 본문을 영구 누적하지 않는다.
- **실행:** 그 completion에 실제로 노출된 tool만 호출 가능. 이후 기존 executor의 권한·동의 검증을 모두 통과해야 한다.
- **DB:** 이 변경을 위해 새 테이블이나 migration을 만들지 않는다.
- **모델:** 현재 모델·reasoning 기본값은 유지한다. 구조 변경과 모델 변경을 한 실험으로 섞지 않는다.

### 3.2 만들지 않는 것

- Router·planner·writer LLM의 새 다단계 pipeline.
- `intent`, `communication_plan`, `confidence`, `next_action` 등 중간 의미 판단용 상태 머신·저장소.
- 시나리오 이름을 가진 전용 skill·tool과 키워드 기반 라우팅.
- 공통 `approve_action`·`cancel_action`, generic ActionProposal 테이블.
- SDK·framework 전면 교체, MCP 서버화, 임의 코드 실행 sandbox.
- 대규모 trace 관리 UI 또는 prompt CMS. 기존 trace는 회귀 확인에 활용한다.
- 검색 worker의 추천 알고리즘, company-first/candidate-first 경로, Career Memory 계약 변경.
- 모든 tool의 입출력 schema 재설계나 전체 context offload 시스템. 기존 일반 도구의 projection과 참조를 우선 활용한다.

## 4. 프롬프트의 책임과 작성 원본

### 4.1 입력을 조립하는 곳은 하나로 만든다

새 `input.ts`를 일반 company-side LLM 입력의 공통 진입점으로 둔다. 명칭은 제안이며 구현 중 조정할 수 있지만 책임은 유지한다.

```text
input.ts
  공통 원칙 + surface + 실제 실행 entrypoint의 전달 계약
  + compact capability catalog
  + 로드된 capability의 지침·공유 정책
  + 참고 context
  + 실제 대화 messages
  + 이번 turn의 실제 tool call/result

capabilities/registry.ts
  capability ID → 짧은 설명 + policy 참조 + tool 이름

tools.ts
  실제 function 이름·입력 schema의 유일한 원본
```

파일을 하나로 합치는 것이 목적이 아니다. **같은 정책을 여러 문자열에서 따로 고치지 않도록 수동 작성 원본을 하나로 정하는 것**이 목적이다. 하나의 정책 원본을 여러 실행 경로에서 import하는 것은 허용한다.

### 4.2 기존 조각의 이동 계획

| 현재 조각·내용 | 목표 위치 | 처리 |
| --- | --- | --- |
| `surfaceFormattingInstructions`, 링크·Slack 버튼 문법 | surface 지침 | 기능·승인 정책을 빼고 실제 renderer 계약 유지 |
| `roleCreationInstructions` | `role_management` 상세 정책 + 짧은 surface 제한 | Slack 전용 신규 역할 진입과 웹 New role 안내를 혼동하지 않음 |
| `COMPANY_SIDE_UX_WRITING_PROMPT` | 공통 core + 일부 domain policy | 정성적 문체는 core 한 곳, 연락 승인 등은 기능 정책으로 이동 |
| `COMPANY_SIDE_TOOL_OUTCOME_RESPONSE_PROMPT` | 공통 core | 결과의 의미·부분 실패·불확실성을 다루는 원칙으로 통합 |
| `COMPANY_SERVICE_CORE_PROMPT` | 짧은 공통 서비스 사실 + 해당 기능의 상세 정책 | 비용·프라이버시 등 기본 질문에 필요한 정본은 유지. 상세 실행 절차만 이동 |
| `HIRING_BRIEF_AUTHORING_PROMPT` | 기존 정본을 참조하는 공유 policy | `company_role_edit`, `role_calibration`에서 로드. 일반 조회에는 불필요한 작성 지침 제외 |
| `turnDeliveryInstructions` | entrypoint 전달 계약 | 직접 요청의 응답과 이벤트의 조용한 종료를 구분 |
| system의 연락·연결·일정·Role 관리 상세 지시 | 해당 capability policy | 중복 제거하되 제품 의미·필수 전제를 누락하지 않음 |
| tool description의 여러 도구에 걸친 업무 절차 | capability policy | 개별 tool의 적합성·필수 입력·효과·중요 전제는 description에 유지 |
| tool result의 반복적인 `response_guidance` | 공통 core 또는 capability policy | 실행마다 필요한 사실·복구 조건만 result에 남김 |

`update_data`는 여러 종류의 정보를 변경하는 일반 도구다. 이 도구를 포함하는 `company_role_edit`에는 도구가 변경할 수 있는 모든 대상의 필수 작성·preview 정책이 들어가야 한다. schema 전체를 노출하면서 일부 write 대상의 정책만 빼지 않는다. 입력 필드별로 숨은 LLM 분류를 추가하지 않는다.

### 4.3 공통 core에 남길 내용

1. Harper의 목적과 company-side LLM의 책임.
2. 최신 사용자 발화를 관련 대화와 연결하고, 필요한 정보량만큼 설명하는 기준.
3. 현재 확인된 사실과 과거 논의·예시·추론의 차이.
4. 대상·권한·동의가 불명확한 consequential action의 처리 원칙.
5. 기능 개요를 보고 도움이 되는 행동을 제안하거나 상세를 로드할 수 있다는 안내.
6. 승인되지 않은 외부 행동, 비공개 정보 공개, 확인하지 않은 결과 주장을 하지 않는 공통 경계.
7. 업무를 완료하거나 필요한 질문을 남기는 기준. 성공 뒤에도 승인된 다른 일이 남으면 계속 처리한다.

공통 core에 모든 업무의 인자, draft revision 처리법, 연결 경로의 예외, Hiring Brief 전체 작성 규칙을 넣지 않는다.

### 4.4 자연스러움과 예시

- 특정 단어 금지·고정 시작 문장·문단 수 지시를 자연스러움의 주요 수단으로 쓰지 않는다.
- 짧은 사실 답변, 충분한 설명, 필요한 제안, 제안 없이 종료하는 대화를 포함한 소수의 서로 다른 예시를 core의 문체 참고로 제공한다.
- 예시는 합성·비식별 자료이며 정책이나 현재 회사 사실의 근거가 아니다. 실제 서비스 운영 규칙은 정본 지침이 소유한다.
- `serviceAnswerExamples.ts`의 현재 검색 예시는 이번 작업에서 무조건 삭제하지 않는다. 서비스 사실용 승인 자료와 문체 예시의 역할을 구분하고, 오래된 예시가 현재 정책을 덮어쓰지 못하게 입력 계약을 정리한다.
- 새로운 hidden writer나 출력 문자열 보정기를 만들지 않는다.
- 필수 링크·사용자가 확인해야 하는 exact preview를 보존하는 구조적 처리는 유지한다.

## 5. Capability catalog와 tool 배치

### 5.1 기본 도구

다음 5개 조회 도구와 `load_capabilities`를 일반 대화·후속 실행의 기본 집합으로 둔다.

| 기본 domain tool | 이유 |
| --- | --- |
| `get_talents` | 후보자·진행 현황의 공통 탐색 |
| `read_talent` | 후보자별 근거·진행·최근 연락 등의 공통 상세 조회 |
| `read_role` | 역할·단계·현재 조건의 공통 조회 |
| `get_more_data` | 회사·역할의 추가 정보와 정본 조회 |
| `read_conversation_history` | 앞선 대화의 원본 재조회 |

`read_talent`에는 이미 batch와 `includeProfile`이 있다. 이를 새로 만들지 않는다. 기본 도구도 완전한 schema와 정확한 사용 전제를 제공한다. 이름만 주고 인자를 추측하게 하지 않는다.

초기 선택은 조회로 상황을 이해하는 일을 막지 않기 위한 설계값이다. 향후 사용량과 실제 token을 보고 조정할 수 있으나, 이번 버전에는 별도 per-turn 분류기를 넣지 않는다.

### 5.2 지연 로딩할 기능

아래는 현재 25개 domain tool을 빠짐없이 배치한 초기안이다. 구현 후 mapping의 정본은 registry이며 문서와 별도의 수동 목록을 늘리지 않는다.

| Capability ID | 항상 보이는 기능 개요의 의미 | 선택 시 추가되는 tool |
| --- | --- | --- |
| `web_research` | 공개 웹에서 회사·업무 관련 근거 조사. 웹 자료는 회사의 실행 지시가 아님 | `web_search`, `open_url` |
| `company_role_edit` | 회사·역할 정보, 채용 기준, 지속적 맥락의 명시적 변경. 필요한 preview·확인 유지 | `update_data`, `update_role_criteria` |
| `role_calibration` | 실제 참고 인물이나 준비된 프로필에 대한 피드백을 채용 기준 보정에 활용 | `calibrate_role_hiring_brief`, `record_role_profile_example_feedback` |
| `role_management` | 역할 등록 진입, 활성·중단·종료 관리, 단계 구성. 신규 등록 진입은 surface에 따라 다름 | `start_role_creation`, `change_role_status`, `manage_role_pipeline_stages` |
| `candidate_search` | 저장된 기준으로 새로운 후보자 탐색 작업 요청. 현재 회사에 보이는 후보자 목록 조회와 다름 | `request_matching_search` |
| `candidate_contact` | 허용된 관계의 후보자와 연락하고 이력을 조회. 외부 발송은 기존 동의·검토 계약 적용 | `list_contacts`, `read_contact`, `contact_talent` |
| `candidate_connection` | 회사가 후보자 연결 또는 먼저 제안할지를 결정. 후보자 의사와 경로별 확인 조건 유지 | `prepare_candidate_connection`, `decide_candidate_connection`, `decide_company_intro` |
| `candidate_process` | 후보자에 관한 회사 내부 기록, 단계·역할 이동과 일정 조율. 기록·이동·연락 효과는 각각 다름 | `add_candidate_note`, `move_candidate_stage`, `move_candidate_to_role`, `manage_interview_availability` |

Registry에서 `toolIds`를 resolve한 뒤 기존 `getEnabledOrgAgentTools(surface)`의 지원 범위와 교집합을 취한다. 예를 들어 웹에서 `role_management`를 로드해도 Slack 전용 `start_role_creation`은 나타나지 않는다. 일정 feature gate도 우회하지 않는다.

기능 이름은 사용자의 의도를 제한하는 enum이 아니라 구현된 능력을 찾기 위한 안정적인 식별자다. 하나의 요청에서 여러 capability를 로드할 수 있으며 최대 3개 같은 임의의 의미적 상한은 두지 않는다.

### 5.3 정책 공유와 중복 제거

- Brief 작성 정본처럼 여러 capability가 필요한 지침은 `policyId`로 같은 원본을 참조한다.
- Resolver는 필요한 policy ID·tool 이름을 합집합으로 만들고 각각 한 번만 렌더링한다.
- 공유 정책을 로드했다고 다른 capability의 도구까지 자동 활성화하지 않는다.
- 항상 보이는 개요에는 기능의 효과와 중요한 전제를 넣되 full tool name 목록·JSON properties·enum 설명을 재복제하지 않는다.
- 보이지 않는 기능을 실제로 할 수 있다고 약속하지 않도록, surface에서 지원되지 않는 행동과 정보 공개 경계는 개요 단계에서도 표현한다.
- 공개되지 않은 내부 기능이나 다른 tenant의 integration을 catalog에 노출하지 않는다.

초기 policy dependency는 다음 책임 단위로 관리한다. 아래 이름은 구현용 참조 ID이며 사용자 의도 분류값이 아니다.

| Policy 책임 | 필요한 capability·실행 경로 |
| --- | --- |
| 기본 조회·정보 출처·bounded/completeness 해석 | 기본 지침. 기본 도구와 함께 항상 제공 |
| 저장 위치·변경 preview·정본 rewrite 계약 | `company_role_edit` |
| Hiring Brief 공통 작성 계약 | `company_role_edit`, `role_calibration`, 전용 Role 작성 |
| 실제 참고 인물과 준비된 프로필 피드백의 출처 구분 | `role_calibration` |
| Role 등록 진입·lifecycle·단계 설정 | `role_management` |
| 새 탐색 요청과 기존 후보자 조회의 차이·비동기 완료 | `candidate_search`; 결과 알림에는 결과 해석 부분만 사용 |
| 연락 대상·초안·수정·발송·원문 보존·중복 방지 | `candidate_contact` |
| 연결 경로별 의사·확인·외부 효과 | `candidate_connection` |
| 후보자 기록·단계/역할 이동·일정 효과·재진행 동의 | `candidate_process` |
| 현재 event의 출처·원래 지시·silent completion | 후속 event entrypoint. 승인 근거는 실제 원본에서 확인 |

Tool description이나 결과가 아직 미로드인 다른 도구를 다음 단계로 가리킬 수 있다. 이 경우 본 LLM은 catalog에서 관련 capability를 로드한 뒤 사용한다. 설명에 다른 tool 이름이 언급됐다는 이유로 그 schema까지 항상 넣지 않는다.

첫 구현에서 숫자로 token 상한을 먼저 고정해 필수 정책을 자르지 않는다. 공통·기능별 크기를 별도로 기록하고, registry의 최대 합집합이 지원 request 예산을 넘는 경우 릴리스 전에 package 크기를 정리한다. Runtime에서 긴 정책의 뒷부분을 조용히 잘라 성공 처리하지 않는다.

## 6. 로더의 입출력과 실행 규칙

### 6.1 제안 schema

아래는 문서용 계약 예시이며 아직 runtime에 존재하지 않는다.

```ts
type LoadCapabilitiesInput = {
  capabilityIds: CompanyCapabilityId[];
};

type CompanyCapabilityDefinition = {
  id: CompanyCapabilityId;
  summary: string;
  policyIds: readonly CompanyPolicyId[];
  toolIds: readonly OrgAgentToolName[];
};

type CompanyCapabilityState = {
  loadedCapabilityIds: Set<CompanyCapabilityId>;
};
```

입력은 현재 catalog에 있는 ID의 비어 있지 않은 배열이다. 중복 ID는 합친다. 이유·confidence·intent·계획 JSON은 요구하지 않는다. ID 수의 구조적 최대치는 catalog 크기다.

Function schema는 `additionalProperties: false`, 필수 `capabilityIds`, 배열 원소의 현재 지원 ID enum을 사용한다. 배열 크기·ID는 구조 검증 대상이다. 다른 인자에 든 자연어를 분석해 적당한 capability ID로 바꾸는 보정은 하지 않는다.

Loader는 registry를 읽고 현재 turn의 메모리 내 `loadedCapabilityIds`를 갱신한다. 외부 서비스·DB·별도 LLM을 호출하지 않는다. 응답에는 로드된 ID, 이미 로드된 ID, 다음 completion에서 사용할 수 있는 tool 이름을 짧게 반환한다.

### 6.2 상세 정책을 넣는 위치

첫 구현에서는 loader tool result에 긴 policy 본문을 넣지 않는다. **다음 model request를 만들 때 trusted registry에서 선택된 policy를 system 지침의 별도 구역으로 조립한다.** 따라서 일반 웹 자료·첨부파일·후보자 연락의 텍스트를 system 권한으로 올리지 않는다.

도구 목록도 같은 resolver의 결과를 사용한다. `load` 성공을 반환하면서 다음 호출에 schema나 정책 중 하나만 넣는 부분 적용을 허용하지 않는다. 필요한 공유 policy가 누락되면 해당 capability를 활성화하지 않는다.

Skill 표준 자체가 function을 자동 등록하는 것은 아니다. 이 설계에서는 이 loader와 request builder가 지침·schema 연결을 책임진다. 실행 시 전체 tools 배열을 보내고 description만 숨기는 구현은 목표를 만족하지 않는다.

### 6.3 한 turn의 실행 흐름

```text
현재 권한·surface·feature gate와 context 확인
→ core + catalog + 기본 도구로 completion
→ 바로 답변 / 기본 조회 / load_capabilities 중 모델이 선택
→ loader 성공이면 선택 policy와 tool schema를 합쳐 다음 completion
→ 기존 executor로 조회·실행
→ 실제 tool 결과를 메시지로 추가
→ 필요하면 다른 capability 추가 로드
→ 최종 답변 또는 허용된 이벤트의 조용한 종료
```

Loader가 성공했을 때 사용자에게 "기능을 활성화할까요?"를 묻지 않는다. 이미 명확한 업무 요청도 기능 로딩을 이유로 다시 확인하지 않는다. 실제 외부 행동에 필요한 승인은 기존 제품 계약대로 처리한다.

### 6.4 중요한 경계: completion 시작 시점의 허용 목록

각 completion 직전에 `availableToolNames` snapshot을 만든다. 그 completion이 반환한 모든 호출은 **이 snapshot**으로 먼저 검사한다.

- 모델이 같은 응답에서 `load_capabilities(candidate_contact)`와 아직 노출되지 않은 `contact_talent`를 함께 반환하면 loader만 정상 처리하고 해당 연락 호출은 실행하지 않는다.
- 연락 도구는 상세 지침을 읽은 다음 completion에서 다시 호출해야 한다.
- loader와 이미 노출된 기본 조회 도구를 함께 호출하는 것은 가능하다.
- 문자열이 전체 `OrgAgentToolName`에 있다는 이유만으로 미로드 도구를 실행하지 않는다.
- 존재하지만 미로드인 도구는 필요한 capability를 알려주는 구조적 오류를 반환한다. 임의의 숨은 도구 실행이나 새 사용자 승인을 만들지 않는다.

현재 executor가 순차 실행하더라도, 앞선 loader가 같은 응답 뒤쪽의 미노출 호출을 소급해서 허용하지 않게 이 snapshot을 사용한다.

### 6.5 오류·재시도·예산

| 상황 | 처리 |
| --- | --- |
| 이미 로드된 ID | 성공적인 no-op. 본문과 schema 중복 삽입 없음 |
| 알 수 없는 ID | 입력 오류. 해당 요청 전체를 활성화하지 않고 유효 ID 안내 |
| surface에서 지원 불가한 capability | 지원 범위를 설명하는 구조적 결과. 우회 실행 없음 |
| package의 일부 tool이 feature gate로 비활성 | 활성 tool만 resolve하고 제외 사실을 정확히 반환 |
| 지침·schema 조립 오류 | 활성화 전 실패. 불완전한 계약으로 실행하지 않음 |
| 모델/provider fallback | 같은 capability snapshot·대화·실제 결과를 다음 provider에 전달 |
| 불확실한 외부 실행 결과 | loader 재시도가 아니라 기존 도구의 상태 조회·idempotency 경로 사용 |

Loader 호출도 기존 최대 completion 수·전체 tool call 수·timeout 안에서 실행한다. 로딩할 때 예산을 초기화하지 않는다. 현행 `MAX_TOOL_LOOPS=30`, `MAX_TOTAL_TOOL_CALLS=30`은 첫 변경에서 유지하고, meta call 수를 기존 trace에 별도로 집계한다. 같은 capability를 계속 재요청해도 업무가 무한 연장되지 않아야 한다.

Loader 오류마다 자동으로 모든 기능을 노출하는 fail-open 정책은 첫 버전에 넣지 않는다. 구조 오류는 복구 가능한 tool 오류로 전달하고, 반복 장애의 운영 대응은 아래의 `full` 호환 모드를 사용한다.

### 6.6 Loop 변경의 최소 의사코드

아래는 책임 순서를 보여주는 문서용 의사코드다. 기존 전달·취소·예산·오류 처리를 대체하는 복사 가능한 runner가 아니다.

```ts
const capabilityState = createCapabilityState(); // 이번 turn에만 존재
const conversation = buildConversationInput(context, currentInput);

while (withinExistingTurnBudget()) {
  const resolved = resolveCapabilities({ mode, surface, capabilityState });
  const offeredTools = new Set(resolved.tools.map(toolName));
  const response = await runCompletion({
    messages: assembleMessages({ conversation, policies: resolved.policies }),
    tools: resolved.tools,
  });

  appendActualAssistantMessage(conversation, response);
  if (!response.toolCalls.length) return finishUsingExistingDeliveryContract(response);

  for (const call of response.toolCalls) {
    await assertCanContinue();
    if (!offeredTools.has(call.name)) {
      appendToolError(conversation, call.id, toolNotOffered(call.name));
      continue;
    }
    const result = call.name === "load_capabilities"
      ? loadFromTrustedRegistry(call.arguments, capabilityState)
      : await executeExistingDomainTool(call);
    appendActualToolResult(conversation, call, result);
  }
}

return finishUsingExistingBudgetExhaustionContract(conversation);
```

Registry의 policy·schema와 `offeredTools`는 같은 resolved snapshot에서 만든다. 예산 차감·timeout·exception 처리는 기존 loop 경계를 유지한다.

## 7. 로딩 수명과 앞뒤 대화의 연결

### 7.1 일반 다음 turn

다음 회사 발화에서는 기본 tool set으로 시작한다. 최근 대화, 실제 pending preview·연락 draft 참조는 유지되므로 "네, 그렇게 해주세요"를 빈 context에서 해석하지 않는다.

모델은 필요한 capability를 다시 로드할 수 있다. 이 추가 호출은 내부 작업이다. 사용자의 확인을 다시 받거나 이전 preview를 새로 작성할 이유가 아니다. Loader 호출·실패가 기존 draft revision·proposal·마지막 사용자 메시지를 바꾸지 않게 한다.

이 방식은 작은 재로딩 지연을 허용하는 대신 별도 skill 관련성 분류, 영구 active set, TTL·eviction 규칙을 피한다. 자동 sticky skill이나 예측 prefetch는 첫 버전 이후 별도 최적화다.

### 7.2 후보자 연락·웹 UI action 후속 실행

- 기존 event job과 `assertCanContinue` 등 최신 지시 우선·중복 방지 로직을 유지한다.
- 이벤트는 새 회사 명령이 아니다. 원래 회사 지시, verified UI action, 현재 사실과 함께 읽는다.
- 후속 작업에도 기본 도구·catalog·loader를 제공해 model이 필요한 capability를 선택할 수 있게 한다.
- 이미 완료된 연락 전달을 다시 실행하지 않는다. 필요하면 기존 도구로 상세를 읽고 허용된 후속 행동만 수행한다.
- 할 일이나 알릴 내용이 없으면 조용한 종료가 가능하다. capability를 반드시 하나 로드하거나 행동을 만들게 하지 않는다.
- 후보자→회사 정상 연락은 같은 도구 호출에서 즉시 전달되는 현재 계약을 유지한다. 후속 company-side LLM을 기다려야 후보자에게 전달 완료를 말할 수 있다는 계약으로 바꾸지 않는다.

### 7.3 Tool-free 결과 알림

`generateOrgAgentBackgroundResultReply`는 새 tool 실행 없이 결과를 전달하는 전용 경로다. 이 경로에는 loader나 실행 가능 tool을 광고하지 않는다.

- 공통 문체, 결과 해석에 필요한 domain 지침, 원래 요청, 검증된 결과를 제공한다.
- 상세 write schema와 실행 절차는 넣지 않는다.
- 기존 verified background 작업의 tool-result 표현은 유지할 수 있다. 복원된 call ID는 전달 형식상의 식별자이며, 새 업무 승인이나 실제로 없던 LLM 호출의 증거로 사용하지 않는다.
- 추가 실행이 필요한 후속 이벤트와 결과만 알리는 호출을 합치지 않는다.

### 7.4 전용 Role 작성 흐름

`roleCreationChat.ts`의 전용 tool set·완료 조건은 별도로 유지한다. 이미 명확한 업무 하나를 수행하는 entrypoint이므로 처음부터 필요한 작성 지침을 가진다. 여기에 범용 loader를 억지로 넣지 않는다.

공유 UX 지침을 정리할 때 이 경로도 같은 문체 원본을 사용한다. 최근 대화의 native message 구성은 호환 가능한 공통 builder로 옮기되, 역할 작성과 일반 agent의 실행 권한·도구 목록을 합치지 않는다. Web New role 및 Slack의 기존 handoff도 유지한다.

## 8. 대화 메시지 구조 변경

### 8.1 모델에 전달할 메시지와 DB 원본을 분리한다

`context.ts`가 최근 메시지를 가져온 뒤 표로만 반환하지 않도록 변경한다. 내부 타입에는 최소한 원본 메시지 ID, role, 본문, 작성자·surface·참조 metadata가 있어야 한다.

- 기존 DB 메시지를 변환하거나 다시 저장하는 migration은 없다.
- 자연어 발화를 다시 요약·재작성해서 native role에 넣지 않는다.
- `conversationText`는 기존 하위 호출의 호환용 projection으로 잠시 유지할 수 있다. 단, 주 agent 입력에 native history와 함께 이중 주입하지 않는다.
- 최종적으로 UI·debug·하위 도구가 필요로 하는 text projection도 같은 선택된 message 집합에서 만든다.

첫 버전의 턴 사이 history는 실제 사용자 발화와 사용자에게 전달된 Harper 답변을 native messages로 구성한다. 이전 turn의 전체 tool transcript까지 복원하는 작업은 포함하지 않는다. 기존 `recentToolContext`는 사실·참조만 담은 data projection으로 유지한다. 현재 turn의 실제 tool call/result는 native pair로 계속 보존한다. 이렇게 하면 다음 turn의 기본 도구 집합에 없는 과거 도구를 불완전한 native call 형태로 재생하는 문제를 피할 수 있다.

### 8.2 일반 대화의 논리적 배치

```text
system: core + surface + 전달 계약 + catalog + 활성 policy
reference context: 회사·역할의 필요한 사실, 오래된 대화 요약, completeness
user: 실제 과거 회사 발화
assistant: 실제 과거 Harper 답변
... 최근 대화의 시간순 메시지 ...
reference context: 이번 시점의 상태·시간·pending 참조 등 필요한 갱신분
user: 실제 최신 회사 발화와 첨부 입력
assistant/tool: 이번 turn에서 실제 발생한 호출과 결과
```

`reference context`는 provider에 존재하지 않는 새 role 이름이 아니라 앱 내부의 출처 구분이다. Provider adapter에서는 시스템 지침으로 올리지 않고 별도로 구분된 data content로 전달한다. API가 전용 역할을 지원하지 않으면 `user` carrier 안의 명시적 reference block을 사용할 수 있지만 **인간이 보낸 발화로 DB에 저장하거나 새 권한으로 해석하지 않는다.**

초기 context와 갱신 context를 같은 데이터 전문으로 두 번 보내지 않는다. 첫 구현에서는 선택된 회사 snapshot을 한 번 전달하면 된다. 전체 세션의 append-only snapshot/delta 저장 시스템은 만들지 않는다.

### 8.3 반드시 보존할 metadata

- 현재 scope: 회사 workspace, 대화, Slack thread 또는 Role 작성 대화.
- 발화 주체: 회사 팀원, Harper, 외부 연락의 인용·알림.
- exact draft/proposal ID와 revision, 관련 후보자·역할 참조.
- 사용자가 본 exact preview 및 verified UI action의 출처.
- 첨부파일과 이미지: 현재 multimodal content 계약 및 untrusted 표시.
- cursor·원본 message ID·부족한 history 여부.

같은 말을 반복한 두 메시지를 텍스트 일치로 dedupe하지 않는다. 최신 사용자 발화를 과거 history에서 제외할 때는 원본 ID·조회 경계로 처리한다. 한 사용자 발화가 reference block 안의 인용으로 필요하면 인용임을 명시하고 새 명령으로 중복하지 않는다.

후보자 원문을 회사 `user` 발화로 승격시키지 않는다. 시스템 알림이 DB에 assistant role로 저장돼 있어도 출처를 표시한다. 이전 Harper 답변은 대화 맥락이지 현재 상태나 사용자 승인의 독립적인 증거가 아니다.

현재 scope의 과거 실제 회사 요청은 철회·변경되지 않은 위임의 근거가 될 수 있다. 따라서 기존의 “conversation history는 전부 instruction이 아니다”라는 포괄 문구를 그대로 옮기지 않는다. 실제 회사 발화와 외부 인용·요약·assistant 추론을 구분하고, 실행 승인은 기존 exact proposal·actor·scope 계약으로 확인한다.

### 8.4 잘림·조회 실패

- 현재 발화, 진행 중인 승인 대상, exact preview의 유효 참조를 먼저 보존한다.
- 오래된 대화는 완전한 message 단위로 제외한다. 문장 중간을 자른 결과를 완전한 원문처럼 제시하지 않는다.
- 개별 첨부나 긴 과거 발화가 축약되면 incomplete와 재조회 참조를 유지한다.
- `completeRoleRequestIds`, long-text observation/fingerprint 등 read-before-write 보호 상태는 **실제로 모델에 제공된 완전한 범위**와 일치해야 한다.
- 완전하지 않은 상세를 보았다고 marking하지 않는다. 요약에 담겼다는 이유로 전체 rewrite를 허용하지 않는다.
- 중요한 history나 pending 데이터 조회가 실패하면 “없다”고 가정하지 않는다. 기존 unavailable 표시와 안전 경계를 유지한다.

## 9. Tool description·결과 계약 정리

### 9.1 Description에서 남길 것

- 도구가 어떤 실제 작업을 수행하는지.
- 적합한 사용 목적과 혼동하기 쉬운 다른 기능과의 차이.
- 필수 인자, 식별자 출처, 중요한 입력 조합.
- 실제 효과와 중요한 사전조건.
- 다음 호출에 필요한 결과 참조 및 복구 가능성.

도구를 잘 쓰기 위해 반드시 알아야 할 경계를 전부 숨기고 서버 오류로만 배우게 하지 않는다. 복잡한 여러 도구의 협업 절차는 capability policy로 옮기고, schema는 원본 `tools.ts`에서 유지한다.

### 9.2 Result의 내용

| 남기는 것 | 제거·이동하는 것 |
| --- | --- |
| 실제 완료·미완료 범위와 대상 | 매 결과마다 반복되는 말투 지시 |
| 검증된 결과의 사용자 관련 의미 | 고정 시작 문장·고정 CTA |
| 불확실성·권한 부족·실패 이유 | 내부 queue/RPC/provider 진단 전문 |
| 재조회·수정·승인에 필요한 정확한 ID·revision | 다음 행동에 필요 없는 내부 필드 |
| exact preview·필수 링크의 검증된 참조 | 승인 여부와 관계없는 형식적 질문 강제 |
| 현재 오류에 대한 구체적인 복구 정보 | 모든 성공에 붙는 동일한 작업 절차 설명 |

`response_guidance`를 이름만 보고 일괄 삭제하지 않는다. 각 항목을 다음 세 가지로 구분해 옮긴다.

1. 반복되는 표현 지시 → 공통 core.
2. 실행·동의·연속 작업의 규칙 → 해당 capability policy 또는 기존 executor.
3. 이번 결과에서만 발생한 사실·복구 조건 → 결과에 유지.

결과별로 새 LLM을 호출해 “사람다운 문장”으로 재작성하지 않는다. 기존 projection 함수가 사실을 정리하고 company-side LLM이 최종 표현을 선택한다. 새로운 `intent`, `next_step`, `confidence` 필드를 결과마다 의무화하지 않는다.

### 9.3 기존 exact presentation과 실패 처리

- `requiredContactPresentations`, `requiredPresentationTexts`, 연락 draft 참조와 revision은 유지한다.
- 사용자가 승인하는 실제 발송 본문을 모델이 임의로 재작성해 대신 표시하지 않는다.
- 정확한 사용자 원문·필수 링크를 append하는 처리와 권한·불확실성 보호를 단순 말투 후처리로 오인해 제거하지 않는다.
- 반대로 성공 답변 전문을 deterministic 문구로 덮어쓰는 새 로직을 만들지 않는다.
- tool budget 등으로 완전한 결과가 전달되지 않았다면 실제 성공 여부와 전달된 근거 범위를 구분한다. 임의로 실패나 전체 완료를 주장하게 하지 않는다.

### 9.4 기존 조회 기능의 활용

기존 `read_talent`의 `talentIds`·`includeProfile`, `get_talents`의 필터·pagination, `get_more_data`의 선택적 읽기를 우선 활용한다. 이번 구현을 위해 모든 도구에 공통 `detail` enum을 억지로 추가하지 않는다. 부족한 projection이 실제로 확인된 일반 도구만 확장한다.

## 10. 캐싱·길이·provider 호환성

### 10.1 캐시를 위해 할 일

- 공통 core, surface별 지침, catalog는 같은 버전이면 같은 순서·문자열로 직렬화한다.
- timestamp, request ID, 사용자별 값은 고정 system prefix에 넣지 않는다.
- 현재 동적 입력 맨 앞의 시간값은 이번 turn의 runtime reference 구역으로 이동한다.
- capability와 policy는 registry 순서, tool은 canonical 이름 순서로 resolve한다. 같은 집합은 같은 결과를 만든다.
- 한 turn 안의 과거 실제 call/result를 의미 없이 다시 작성하지 않는다.
- provider의 실제 input/cache-read/cache-write usage로 비교한다. pretty JSON 문자 수를 비용이나 model attention 비율로 취급하지 않는다.

### 10.2 캐시에서 보장하지 않는 것

Custom loader는 정책과 top-level tools 배열을 변경하므로 로딩 시 cache miss가 발생할 수 있다. 집합을 추가만 하거나 정렬한다고 기존 전체 prefix cache가 유지되는 것은 아니다. 첫 버전은 기능 범위·관리 가능성과 불필요한 입력 감소를 우선하며, native deferred tools와 같은 캐시 특성을 주장하지 않는다.

Native tool search는 이후 provider별 최적화 옵션이다. 첫 구현에 특정 provider 전용 search나 logit masking을 필수로 넣지 않는다.

### 10.3 기존 context/result budget

현재 context 제한과 tool 결과 총량 제한을 유지하고, 메시지 구성 변경으로 안전 경계가 사라지지 않게 한다. Loader 상세 지침도 request 총량 계산에 포함한다.

큰 결과를 생략할 때는 기존 원본을 읽을 참조를 남긴다. 단, 이번 범위에서 임의의 모든 tool 결과를 새 저장소에 offload하는 기능까지 만들지는 않는다. 현재 tool result budget이 소진됐다면 같은 큰 조회를 반복하도록 유도해 무한 복구시키지 않는다. 더 좁은 기존 조회가 가능한지 또는 현재 근거로 제한을 설명해야 하는지 판단할 수 있는 사실을 제공한다.

### 10.4 Adapter 검증

[`llm.ts`](../src/lib/llm/llm.ts), [`responsesChatAdapter.ts`](../src/lib/llm/responsesChatAdapter.ts)의 실제 경로별로 확인한다.

- native user/assistant history와 연속된 동일 role 처리.
- system 지침과 data content의 분리.
- assistant tool call ↔ tool result의 ID·순서.
- tool-free 최종 호출에서 이전 tool history 보존.
- loader 이후 새 schema·policy가 실제 provider body에 반영되는지.
- image content, reasoning 관련 provider 전용 필드, 기존 `_responses_output` 보존.
- fallback 시 도구가 무단 확장되거나 원래 요청이 반복 실행되지 않는지.

지원되지 않는 provider를 모든 도구 노출이나 대화 평탄화로 조용히 우회하지 않는다. 제한을 명시하고 검증된 호환 모드로 운영한다.

## 11. 구현 파일과 호출부 변경 지도

| 파일/그룹 | 구현 작업 |
| --- | --- |
| 새 `src/lib/org/agent/input.ts` | 일반 대화의 공통 message/system builder; 필요 시 기존 `prompts.ts`를 얇은 facade로 유지 |
| 새 `src/lib/org/agent/capabilities/registry.ts` | ID, 개요, policy 참조, tool 이름의 단일 mapping |
| 새 `capabilities/resolver.ts` | 지원 범위 교집합, union·dedupe·순서, 활성 tool snapshot 생성 |
| 새 `capabilities/loader.ts` | loader schema, ID 검증, 메모리 내 activation; DB 부작용 없음 |
| `prompts.ts`, `uxWritingPrompt.ts`, `serviceKnowledgePrompt.ts`, `hiringBriefAuthoringPrompt.ts` | 책임별 지침 정리. 기존 정본을 참조하고 의미 변경과 relocation을 구분 |
| `context.ts`, `contextBudget.ts` | native history 반환·선택, current message 중복 제거, completeness와 참조 보존 |
| `chat.ts` | resolved tools 인자화, completion별 허용 snapshot, loader 처리, 기존 loop/종료/예산 유지 |
| `tools.ts` | 전체 schema registry 유지; 설명의 중복 절차·문체 정리 |
| `promptFormat.ts` | 결과의 반복 writing 지시 제거와 실행 사실 projection 보존 |
| `toolState.ts`, `contextVisibility.ts`, `toolExecution.ts` | 기존 보호 상태와 하위 `companySideContext`/`recentConversationContext` 소비자 호환. 사업 로직 재설계 금지 |
| `contactEventPrompt.ts`, `contactEvent.server.ts` | 이벤트 지시와 전달 데이터를 분리, 원래 승인 출처 보존 |
| `backgroundResultPrompt.ts` 및 생성 호출부 | tool-free 결과 알림 입력을 공통 core와 필요한 결과 계약으로 구성 |
| `roleCreationChat.ts`와 그 prompt | 공유 지침 import와 대화 구성 호환. 전용 tool/runtime 유지 |
| `scripts/exportOrgAgentPromptSnapshot.ts` | 실제 entrypoint/surface/mode/loaded IDs의 공통 builder 사용. 별도 all-tools 재구성 금지 |
| `scripts/benchmarkOrgAgentPrompt.ts`, `scripts/evalOrgAgentLive.ts`, 관련 eval runner | production builder/resolver 재사용; 서로 다른 입력을 같은 실험으로 보고하지 않음 |
| `src/lib/ops/orgAgentToolDebugger.ts` | 전체 tool 카탈로그 확인 기능과 실제 agent 노출 집합 구분. 직접 실행 권한 유지 |
| `prompts.test.ts`, `tools.test.ts`, `context.test.ts`, `promptFormat.test.ts`, event/adapter/계약 테스트 | 옮겨진 policy의 책임과 실제 input shape 기준으로 갱신 |

현재 `companySideContext`와 `recentConversationContext` 문자열을 하위 업무가 읽는 경로가 있다. 주 모델에 native history를 도입하면서 이 값을 없애 하위 기능을 망가뜨리지 않는다. 같은 선택된 사실·메시지에서 호환용 projection을 만들고, 주 모델에게 이 문자열을 다시 중복 제공하지 않는다.

기존 테스트가 문구의 옛 위치나 `getEnabledOrgAgentTools(args.surface)` 호출 자체를 확인할 수 있다. 테스트를 무작정 삭제하지 않고 원래 보호하던 동작을 새 builder/resolver의 의미상 계약으로 옮긴다.

## 12. 단계별 구현과 완료 조건

### A. 공통 지침과 결과 계약 정리

- 공통 지침·surface·업무 정책 원본을 분리한다.
- 기존 모든 활성 도구를 제공하는 상태에서 중복 writing 지시를 정리한다.
- 결과의 사실·실행 참조·exact preview·실패 정보가 유지되는지 확인한다.
- 기존의 공통 안내와 실제 업무 정책이 이동하면서 누락되지 않았는지 ownership 표로 확인한다.

**완료:** 정책 책임을 추적할 수 있고, all-tools 상태에서도 더 이상 동일한 최종 답변 지시가 여러 계층에서 따로 관리되지 않는다.

### B. 최근 대화의 native message 구성

- 일반 대화·이벤트·전용 역할 작성의 입력 경계를 구분한다.
- 원본 메시지 role, 작성자, scope, 첨부, preview revision을 보존한다.
- 동일 최신 발화의 중복 삽입과 tool-result orphan을 방지한다.
- provider adapter·fallback과 기존 하위 문자열 소비자를 확인한다.

**완료:** 주 모델은 실제 최근 대화를 native messages로 받고, 같은 대화 표를 중복으로 받지 않는다. 사용자 원문과 승인 경계가 유지된다.

### C. Registry와 선택적 로딩

- 현재 25개 domain tool의 coverage test부터 추가한다.
- 기본 5개 + loader, 8개 capability의 resolver를 구현한다.
- 상세 policy와 schema를 함께 다음 completion에 반영한다.
- 미노출 호출, 같은 completion 내 loader+미노출 action, 잘못된 ID, 중복 load, feature gate를 검증한다.
- 이벤트 후속 실행도 같은 구조를 사용한다.

**완료:** 첫 provider request에 모든 상세 policy·schema가 들어가지 않고, 필요한 기능을 모델이 발견·로드·실행할 수 있다. 단순히 description을 줄이거나 `tool_choice`만 변경한 상태는 완료가 아니다.

### D. 호환 경로·회귀와 입력 크기 확인

- snapshot/eval/debugger가 runtime과 다른 도구 집합을 가정하지 않게 정리한다.
- no-tool, 일반 조회, 단일 업무, 여러 업무, 승인 후속, 비동기 사건을 비교한다.
- 같은 모델·동결된 입력에서 A/B/C별 결과를 남긴다. 이 과정에서 새 모델을 동시에 선택하지 않는다.
- 별도 승인 없이 production 쓰기·메시지 전송·배포는 하지 않는다.

**완료:** 아래 검증 gate를 통과하고, 미확인 provider·surface와 실외부 전송 여부를 명확히 기록한다.

## 13. 테스트·평가 계약

### 13.1 정적·단위 테스트

| 범주 | 반드시 확인할 항목 |
| --- | --- |
| Registry | ID 유일성, 존재하는 tool 참조, 활성 domain tool 전체 coverage, 공유 policy dedupe |
| 선택적 입력 | 미로드 schema뿐 아니라 중첩 property 설명·상세 policy도 request에서 제외 |
| 공통 awareness | catalog가 남고 지원하지 않는 surface의 기능을 가능하다고 광고하지 않음 |
| Loader | 중복 호출 no-op, unknown ID 원자적 실패, 다음 completion에 policy+schema 함께 추가 |
| 실행 권한 | `availableToolNames` snapshot 검증, skill 로드가 승인·동의를 대신하지 않음 |
| 메시지 | latest ID 중복 없음, 대화 순서·role·첨부·팀원 식별 보존, reference가 system으로 승격되지 않음 |
| 승인 연속성 | loader가 직전 사용자 승인·preview adjacency·revision을 바꾸지 않음 |
| 결과 | exact body/link·실패/부분 결과·후속 실행 참조 보존, 반복 writing 지시 제거 |
| 이벤트 | 전달 재실행 없음, 최신 지시 우선, silent completion 유지 |
| Provider | tool call/result pair, fallback snapshot, native history, multimodal·reasoning field 보존 |
| 예산 | loader 포함 기존 call/timeout 한도, incomplete가 완전한 read 권한을 만들지 않음 |

정성적인 자연스러움을 특정 단어·문장 길이·정규식 통과로 판정하지 않는다. 위 정적 테스트는 구조와 safety 계약을 검사한다.

### 13.2 기존 평가를 재사용할 범위

- [company-side-conversational-qa](evaluation/company-side-conversational-qa/README.md): 앞뒤 대화·수정·승인·실행의 연속성.
- [company-talent-contacts](evaluation/company-talent-contacts/README.md): 현재 v2 계약의 즉시 회사 전달, 조건부 의사, 최신 연락, 후속 실행.
- [company-side-background-result-writing](evaluation/company-side-background-result-writing/README.md): 원래 요청과 완료 결과의 관계·자연스러움·정확성.

이 문서는 새 eval을 실행하거나 frozen gold를 바꾸지 않는다. 기존 registry의 요약이나 오래된 v1 보고서보다 해당 task의 최신 계약을 확인한다. 특히 후보자→회사 “전달했습니다”를 outbox 상태만으로 실패 처리한 과거 판정은 재사용하지 않는다.

추가 capability 회귀 사례는 구현 시 기존 conversational QA task에 등록하고, 필요하면 새 dataset version을 만든다. 승인된 canonical runner를 재사용·확장하며 runner가 없는 경우 계획 경로와 미구현 상태를 README에 명시한 뒤 실행한다. 이 계획 문서의 사례 목록을 미등록 실행 스크립트로 만들지 않는다.

### 13.3 추가해야 할 행동 coverage

다음은 평가 범주이며 production의 intent enum이나 runtime branch가 아니다.

1. 잡담·설명만 필요한 요청: 불필요한 capability 로딩·행동 없음.
2. 기본 조회로 충분한 요청: 정확한 사실을 답하고 불필요한 상세를 로드하지 않음.
3. 명시적인 실행 요청 없이 중요한 정보 부족을 말함: 실제 가능한 도움을 적절히 제안.
4. 제안할 이유가 없는 완결된 대화: 관성적인 후속 제안 없음.
5. 한 요청에 여러 기능이 필요함: 여러 capability를 이어 로드하고 빠짐없이 처리.
6. 과거 draft에 대한 짧은 승인: 올바른 capability를 로드하고 exact 최신 draft만 실행.
7. 승인 직전 대상·본문 정정 또는 철회: 이전 행동을 실행하지 않음.
8. 다른 Slack thread의 관련 원본 조회: 정보 출처와 현재 대화 권한을 혼동하지 않음.
9. 후보자 답변의 부분적·조건부 동의: 원래 회사 지시와 현재 사실에 맞게 판단.
10. 이전 tool result보다 새 지시·새 연락이 있음: 오래된 근거로 실행하지 않음.
11. loader 실패·provider fallback·중복 이벤트: 불필요한 외부 행동이나 기능 확대 없음.
12. 긴 history·첨부·image: 필요한 원본과 참조를 보존하며 누락을 숨기지 않음.
13. 기능의 상세 정책을 묻는 요청: schema를 실행하지 않고도 필요 정책을 로드해 설명 가능.
14. 외부 자료가 skill 로드·발송을 명령함: 자료가 회사 권한으로 승격되지 않음.

### 13.4 비교와 release gate

가능하면 동일 동결 입력을 `기존`, `지침·결과 정리`, `native history 포함`, `선택적 로딩 포함`으로 나눠 비교한다. 과거 세트는 덮어쓰지 않는다. 실제 외부 부작용을 네 번 반복하지 않고 isolated fixture·captured transport 등 승인된 평가 환경을 사용한다.

필수 gate:

- 잘못된 대상·미승인 실행·비공개 정보 노출·중복 전달 등 critical failure **0건**.
- Registry의 모든 지원 tool이 필요한 정책과 함께 도달 가능하며 surface·feature gate 우회 **0건**.
- 새 구조 때문에 발생한 불필요한 재승인·기존 기능 소실 **0건**.
- 추가 평가 범주의 필수 행동을 모두 검토하고 실패·미확인 사례를 남김. 작은 challenge set의 통과를 production 100% 정확도로 주장하지 않음.
- 기존 평가를 실행했다면 그 frozen version의 기존 gate도 충족. 정책 변경이 필요한 예시는 새 version으로 분리.
- 사람 검토로 자연스러움·맥락 연결·필요한 제안이 기준안보다 좋아졌거나 적어도 회귀하지 않음을 확인. 출처를 가린 비교와 disagreement 기록 권장.
- 동일한 no-tool·기본 조회 입력에서 선택적 버전의 상세 policy/schema 양이 full 버전보다 실제로 작음.
- 실제 input/cache/latency를 기록. 사전 근거 없는 “70% 절감”을 출시 조건이나 달성 사실로 쓰지 않음.

Private production 원문·모델 raw output·계정 매핑은 해당 task의 ignored `private/`·`runs/`에 owner-only로 둔다. Production read는 read-only 계약을 따른다. 외부 provider 전송 및 실제 Slack·이메일 E2E에는 해당 범위의 승인이 필요하다. Test Role은 삽입 전 `testOnly`, `testFixture`, 필요한 exact `testTalentIds`를 설정한다.

## 14. 호환 모드와 되돌리기

새 registry에는 `full`과 `progressive` 두 실행 구성을 둔다. 기존 배포 설정 방식에 맞는 **서버 측 단일 설정**으로 고르고, 모델이나 사용자 입력이 임의로 바꾸지 못한다.

- `full`: 정리된 새 core·native history·결과 projection을 사용하되, 현재 surface에서 지원하는 모든 capability policy·domain schema를 처음부터 제공한다. loader는 필요 없으므로 제외한다.
- `progressive`: 기본 5개와 loader부터 시작하고 선택된 기능만 추가한다.

이 모드는 loader 문제가 생겼을 때 기능 접근성을 복구하는 용도다. 권한·동의 보호를 완화하거나 오래된 문구 지시를 되살리는 용도가 아니다. 실행 중 mode를 바꾸지 않고 새 turn부터 적용한다. 이미 발생한 side effect를 자동으로 취소하거나 다시 실행하지 않는다.

Native history나 projection 자체에 문제가 있으면 해당 코드 변경을 별도 되돌려야 한다. `full` 전환이 모든 입력 변경의 rollback은 아님을 구분한다. DB migration이 없으므로 schema rollback도 필요하지 않다.

일반 배포는 별도의 명시적 승인 후 기존 Git-triggered 경로를 따른다. 이 문서 작성·로컬 구현·평가만으로 push, worker 재시작, migration, Notion의 운영 설명 수정을 하지 않는다.

## 15. 설계상 위험과 대응

| 위험 | 설계 대응 |
| --- | --- |
| capability를 몰라 선제 제안이 줄어듦 | 항상 개요·중요 전제를 제공하고 명시적 요청 없는 제안 사례도 평가 |
| 기능을 너무 크게 묶어 여전히 입력이 큼 | 초기 8개 업무 능력 단위로 분리. tool 한 개씩 또는 시나리오별 과분할은 피함 |
| 기능을 로드했지만 필수 정책이 빠짐 | tool coverage와 policy dependency의 build-time 검증, request atomic 구성 |
| 연속 승인에서 재로딩 때문에 같은 질문을 반복 | pending artifact·원문 history 보존, loader가 승인을 소비하거나 새로 생성하지 않음 |
| tool 변경으로 cache miss·지연 증가 | 자주 쓰는 조회는 기본 제공, 한 loop 내 제거 금지, 실제 provider 사용량으로 판단 |
| 과거 assistant의 잘못된 답변을 더 잘 모방 | 과거 답변은 문체 예시·권한 증거가 아님을 구분, 고정된 좋은 대화 예시를 별도 제공 |
| reference context가 사용자 명령처럼 취급됨 | 발화·이벤트·조회 데이터 출처 분리, untrusted 데이터는 system에 넣지 않음 |
| 결과의 writing 지시를 지우면서 승인 규칙도 삭제 | 규칙의 이동 위치를 항목별 확인, 기존 executor·preview 계약 유지 |
| 오래된 구현 계획이 새 구현을 다시 복잡하게 만듦 | 이전 router·ActionGate 설계에 superseded 표시, 새 문서를 진입 링크로 사용 |

## 16. 참고한 외부 기법과 Harper 적용 범위

외부 사례가 Harper의 개선을 보장한다는 뜻은 아니다. 공개 자료에서 확인한 기법과 이 문서의 설계 결정을 분리한다.

- [Anthropic: Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills): 이름·설명과 상세 지침의 progressive disclosure. Harper는 이를 trusted registry로 적용하고 임의 파일 실행은 도입하지 않는다.
- [LangChain: Skills](https://docs.langchain.com/oss/python/langchain/multi-agent/skills): 같은 agent가 skill을 로드하고 관련 tool을 동적으로 등록하는 확장 패턴. Harper는 별도 router나 전체 framework migration 없이 구현한다.
- [Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use): 자주 쓰는 도구와 deferred 도구의 구분. Native 구현의 캐시 특성을 Harper의 custom loader에 그대로 가정하지 않는다.
- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents): 간결하고 명확한 지침, 다양한 대표 예시, 필요한 context의 점진적 조회. 정성적 판단을 사례별 코드로 바꾸지 않는다.
- [Anthropic: Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents): 의미 있는 결과, 선택적 상세, 필터·pagination. Harper의 기존 일반 read tool과 결과 projection을 개선하는 데 적용한다.
- [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create): 과거 user/assistant turn을 구조화한 대화 입력. Harper에서는 현재 provider adapter 전체에 대한 호환 검증이 추가로 필요하다.
- [Manus: Context engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus): 안정적인 prefix, tool 집합 변경의 비용, 다시 읽을 수 있는 참조. Manus의 상태 머신·logit masking을 그대로 복제하지 않는다.

## 17. 구현 시작·완료 체크리스트

### 시작 전

- [ ] 최신 로컬 변경과 배포 상태를 구분하고, 같은 파일의 다른 작업을 보존한다.
- [ ] UX writing·Hiring Brief·연락 계약을 다시 확인한다. Company-first 기능의 의미를 바꿔야 하면 해당 제품·worker 정본부터 별도 검토한다.
- [ ] 전체 tool mapping과 기본 도구 집합을 현재 코드에 대조한다.
- [ ] 기존 승인·후속 이벤트·exact presentation 경계의 회귀 항목을 확보한다.
- [ ] 새 평가를 실행하기 전 task README·동결 입력·gold·runner 계약을 등록한다.

### 완료 전

- [ ] 공통 지침의 수동 원본과 기능별 policy 원본이 명확하다.
- [ ] 실제 최근 대화가 native messages로 전달되고 같은 표가 중복되지 않는다.
- [ ] tool 결과의 반복 문체 지시를 없애면서 실행 사실·참조·preview는 보존했다.
- [ ] 미로드 상세 policy와 schema가 실제 provider request에 없다.
- [ ] company-side LLM이 여러 기능을 직접 로드하고 연속 업무를 처리한다.
- [ ] 로딩은 권한·동의·기능 제한·부작용 경계를 우회하지 않는다.
- [ ] 직접 대화, 후보자 연락 후속, 웹 action 후속, tool-free 결과 알림의 동작 차이를 유지한다.
- [ ] native message/provider fallback/예산 및 full 호환 모드를 검증했다.
- [ ] 테스트와 사람의 전체 대화 검토를 구분해 결과를 기록했다.
- [ ] runtime README·호출 지도·snapshot·관련 평가의 입력 계약을 실제 구현에 맞췄다.
- [ ] 운영 반영 여부, 실외부 전달 검증 여부, 남은 제한을 별도로 보고했다.

완료 판단은 “skill 파일을 만들었다”가 아니다. **Harper가 전체 기능의 존재를 알고 있으면서도, 필요한 상세 정책·도구만 선택적으로 읽고, 같은 대화와 기존 권한 계약 안에서 일을 이어갈 수 있는 상태**가 이 계획의 결과다.
