# Company-side LLM

`/org` 웹 채팅과 `/org-Slack`에서 회사 사용자에게 응답하는 LLM을
**company-side LLM**이라고 부른다. 대화는 workspace 단위이며 하나의 role에
고정되지 않는다.

## 먼저 볼 파일

변경 전 [Company-side engineering 정본](../../../../docs/company-side-agent-engineering-contract-ko.md)을 읽는다.
공통 말투는 `uxWritingPrompt.ts`, 업무 정책은 `capabilities/policies.ts`, 인자는 `tools.ts`,
기능 연결은 `capabilities/registry.ts`, 실제 입력 조립은 `input.ts`가 소유한다.
새 상황마다 별도 프롬프트나 의도 분류기를 추가하지 않는다.

1. `prompts.ts`: 공통 지침과 surface 조립; 업무 정책은 capabilities로 위임
2. `context.ts`: 매 turn의 compact context와 전체 문자 budget
3. `promptFormat.ts`: Markdown/TSV와 tool result 직렬화
4. `tools.ts`: schema 원본; `capabilities/resolver.ts`가 completion별 정책과 schema를 함께 선택
5. `data.ts`: bounded read, pipeline completeness, 추가 데이터 조회
6. `companyDataCatalog.ts`: LLM용 flat key와 타입·길이·confirmation 규칙
7. `companyDataMutation.ts`: append/replace/rewrite와 deterministic preview
8. `toolState.ts`, `toolExecution.ts`: read-before-write, batch update, proposal 처리
9. `chat.ts`: model 호출, tool loop, token/result 한도, proposal presentation
10. `store.ts`, `retention.ts`, `proposals.ts`: 대화, N-turn retention, pending proposal

## 현재 데이터 원칙

- role의 broad matching instruction·hard constraint·preference는
  `company_internal_roles.request`, 선택적인 0~6개의 reviewer-facing 평가 차원은
  `company_internal_roles.criteria`에 저장한다. 충분한 내용이 있으면 3~6개를
  권장하지만 저장이나 역할 완료의 필수 조건은 아니다. company-side LLM과 다른
  runtime 경로는 매칭에서 두 값을 함께 사용한다.
- `company_memories`는 workspace memory(`role_id is null`)와 role memory를 저장한다.
  request는 “누구를 매칭할지”, memory는 그 밖의 지속적으로 기억할 맥락이다.
- `company_workspace.pitch` 전문은 모든 호출에 들어가는 canonical 회사 정보
  문서다. 모든 서술형 회사 정보와 후보자에게 전달할 회사 설명은 이 Markdown
  문서에 저장한다. 홈페이지·LinkedIn 외의 회사 URL은 `related_links`에 저장한다.
- company-side LLM의 일반 정보 write 진입점은 `update_data`다. 한 번에 최대 12개를
  `append`, `replace`, `rewrite`로 처리한다. Role의 진행·중단·종료·삭제는 별도
  `change_role_status`가 담당하고, structured criteria의 전체 교체와 이름 기반
  선택 추가·수정·삭제는 `update_role_criteria`가 담당한다.
- request/memory 계열 변경은 즉시 쓰지 않고 저장된 preview를 보여준 뒤 다음
  명시적 확인에서 적용한다. 나머지 명시적 변경은 직접 적용할 수 있다.
- `company_events`는 웹·Slack·채팅 변경을 짧게 기록하지만 아직 prompt에서 읽지
  않는다.

## 문서

- [구현·Tool 레퍼런스](../../../../docs/org-agent-tools-reference-ko.md)
- [Prompt·Context 설계](../../../../docs/org-agent-context-engineering-ko.md)
- [입력 구조·프롬프트·선택적 기능 로딩 구현 계획](../../../../docs/company-side-agent-input-and-capability-refactor-plan-ko.md) — 구현 전 목표 설계
- [과거 Skill·Tool 라우팅 설계](../../../../docs/company-side-llm-skill-routing-implementation-ko.md) — 새 계획으로 대체됨
- [LLM 호출 지도](./LLM_CALL_TRACE_KO.md)
- [상세 구현 계획](../../../../docs/company-side-llm-context-memory-tools-plan-ko.md)

반복 품질 평가의 canonical runner(합성 도구, 실제 모델·production loop):

```bash
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --run=<new-run-id>
```

정답은 [gold-v6.md](../../../../docs/evaluation/company-side-conversational-qa/gold-v6.md), 실행 계약은 해당 폴더 README다.
기존 실제 workspace 탐색 runner는 별도 legacy full-tool harness이며 production loop 품질 gate로 쓰지 않는다:

```bash
pnpm org-agent:live-eval -- <company-workspace-id>
```

실제 company-side LLM 첫 호출에 들어가는 system prompt, 동적 user prompt,
tool schema를 최신 실제 turn 기준으로 로컬 Markdown에 저장하려면:

```bash
pnpm org-agent:prompt-snapshot
pnpm org-agent:prompt-snapshot -- --workspace=<company-workspace-id>
pnpm org-agent:prompt-snapshot -- --message-id=<company-message-id>
```

기본 출력 위치는 `.local/org-agent-prompt-snapshots/`다. snapshot에는 회사와
후보자의 private data가 포함될 수 있어 `.local/` 전체를 Git에서 제외한다. 이 명령은
DB를 읽기만 하며 LLM을 호출하거나 tool을 실행하지 않는다. 저장되는 내용은 선택한
실제 user turn의 대화 경계와 현재 authoritative DB 값을 조합해 첫 completion payload를
재구성한 것이다. tool 호출 이후 completion은 모델이 선택한 tool input/result에 따라
동적으로 생기므로 이 snapshot에 포함되지 않는다.

## Model 선택

- 일반 회사 대화와 기존 Role의 웹 SSE 요청은 provider의 텍스트 delta를 즉시 전달한다. 도구 인자·추론은 노출하지 않고, 완료된 도구 호출만 실행한다. 중간 안내는 한 번 저장하며 최종 exact preview·링크 보정은 `text_replace`로 동기화한 뒤 기존 `assistant_message`로 저장본을 확정한다.
- 첫 텍스트까지의 시간·전체 호출 시간·provider generation ID·출력/추론 토큰은 `[org/agent:completion]`에 기록한다. 원문 prompt·답변·추론은 이 로그에 기록하지 않는다. 스트리밍은 첫 텍스트 이전의 추론 시간을 줄인다는 보장이 아니며, 전용 신규 Role 작성과 Slack 전달 방식은 그대로다.

- 기본값은 웹과 Slack 모두 OpenRouter `google/gemini-3.8-flash`, temperature `0.5`, reasoning `medium`이다. Gemini 출력 예산은 추론을 포함해 최소 8192이며 다른 모델로 조용히 fallback하지 않는다.
- DeepSeek 선택지는 OpenRouter의 `deepseek/deepseek-v4.1-flash` 한 종류다.
- 내부 웹 사용자는 composer의 model selector에서 턴별 model을 바꿀 수 있고,
  마지막 선택은 브라우저에 저장된다.
- 서버 공통 기본값은 `ORG_AGENT_MODEL`, Slack 전용 override는
  `SLACK_ORG_AGENT_MODEL`로 바꾼다.
- 허용값은 `modelConfig.ts`의 `ORG_AGENT_MODEL_IDS`가 단일 기준이다.


### 선택적인 프로세스 단계 (2026-09-28 로컬 구현)

- 일반 연결 수락과 새 회사 Intro의 후보자 수락은 기본 `connected`(연결됨)으로 이동한다. custom 단계 생성/선택은 필수가 아니다. 이미 저장된 명시적 custom 목적지는 유지한다.
- 인터뷰는 연결 대기에서 연결됨으로, 이후에는 현재 활성 단계에서 요청할 수 있다. 목적은 회사 대화나 선택한 단계의 저장값에서 가져오고 없을 때만 묻는다. 시간은 별도 입력이 없으면 60분(선택한 단계의 기본값이 있으면 그 값)이다.
- 새 일정의 idempotency는 workspace·recommendation·원본 회사 메시지 ID에 묶인다. 같은 메시지 재시도는 기존 일정을 재사용하고, 이후 별도 요청은 같은 후보·단계에서도 새 일정을 만든다. 한 회사 메시지 안에서 같은 후보에게 서로 다른 일정을 여러 개 생성하는 계약은 추가하지 않는다.
- 기존 안내의 재시도/후보자 추가 안내 수정/즉시화는 `read_talent` 또는 `read_contact`에서 읽은 `meetingScheduleId`로 지정한다. 목적·시간을 다시 묻지 않는다. 후보자/Role 소속과 Calendar·가능 시간 선행 검사를 유지한다. 이 도구는 기존 안내의 목적·시간·제목·참석자 변경을 지원하지 않으며, 다른 값을 전달하면 적용한 것처럼 진행하지 않고 거부한다.
- `20260928095255_optional_connection_process_stage.sql`은 운영 DB 적용 후 함수 본문·권한을 확인했다. 웹·Worker 코드는 아직 미배포다. 후속 코드 검토 보완은 사용자 요청에 따라 실행 검증 없이 진행했으며, 앞선 로컬 검증 결과를 보완 이후의 통과로 주장하지 않는다.
