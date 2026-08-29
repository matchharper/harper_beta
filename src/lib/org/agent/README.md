# Company-side LLM

`/org` 웹 채팅과 `/org-Slack`에서 회사 사용자에게 응답하는 LLM을
**company-side LLM**이라고 부른다. 대화는 workspace 단위이며 하나의 role에
고정되지 않는다.

## 먼저 볼 파일

1. `prompts.ts`: 말투, read/write 정책, 실제 system/user prompt
2. `context.ts`: 매 turn의 compact context와 전체 문자 budget
3. `promptFormat.ts`: Markdown/TSV와 tool result 직렬화
4. `tools.ts`: LLM에 노출하는 활성 function schema
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
  `append`, `replace`, `rewrite`로 처리한다. Role의 진행·중단·종료·삭제는 별도 terminal
  tool `change_role_status`가 담당하고, structured criteria의 전체 교체와 이름 기반
  선택 추가·수정·삭제는 `update_role_criteria`가 담당한다.
- request/memory 계열 변경은 즉시 쓰지 않고 저장된 preview를 보여준 뒤 다음
  명시적 확인에서 적용한다. 나머지 명시적 변경은 직접 적용할 수 있다.
- `company_events`는 웹·Slack·채팅 변경을 짧게 기록하지만 아직 prompt에서 읽지
  않는다.

## 문서

- [구현·Tool 레퍼런스](../../../../docs/org-agent-tools-reference-ko.md)
- [Prompt·Context 설계](../../../../docs/org-agent-context-engineering-ko.md)
- [Skill·Tool 라우팅 구현 설계](../../../../docs/company-side-llm-skill-routing-implementation-ko.md)
- [LLM 호출 지도](./LLM_CALL_TRACE_KO.md)
- [상세 구현 계획](../../../../docs/company-side-llm-context-memory-tools-plan-ko.md)

실제 workspace를 대상으로 write 없이 model/tool 선택을 확인하려면:

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

- 기본값은 웹과 Slack 모두 `deepseek-v4-flash`의 high thinking mode다.
- 내부 웹 사용자는 composer의 model selector에서 턴별 model을 바꿀 수 있고,
  마지막 선택은 브라우저에 저장된다.
- 서버 공통 기본값은 `ORG_AGENT_MODEL`, Slack 전용 override는
  `SLACK_ORG_AGENT_MODEL`로 바꾼다.
- 허용값은 `modelConfig.ts`의 `ORG_AGENT_MODEL_IDS`가 단일 기준이다.
