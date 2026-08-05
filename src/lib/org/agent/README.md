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

- role 매칭 기준의 원본은 `company_internal_roles.request`다.
  `company_roles.request`는 legacy 호환용 mirror일 뿐 company-side LLM이 읽고 쓰는
  원본이 아니다.
- `company_memories`는 workspace memory(`role_id is null`)와 role memory를 저장한다.
  request는 “누구를 매칭할지”, memory는 그 밖의 지속적으로 기억할 맥락이다.
- company-side LLM의 write 진입점은 `update_data` 하나다. 한 번에 최대 12개를
  `append`, `replace`, `rewrite`로 처리한다.
- request/memory 계열 변경은 즉시 쓰지 않고 저장된 preview를 보여준 뒤 다음
  명시적 확인에서 적용한다. 나머지 명시적 변경은 직접 적용할 수 있다.
- `company_events`는 웹·Slack·채팅 변경을 짧게 기록하지만 아직 prompt에서 읽지
  않는다.

## 문서

- [구현·Tool 레퍼런스](../../../../docs/org-agent-tools-reference-ko.md)
- [Prompt·Context 설계](../../../../docs/org-agent-context-engineering-ko.md)
- [LLM 호출 지도](./LLM_CALL_TRACE_KO.md)
- [상세 구현 계획](../../../../docs/company-side-llm-context-memory-tools-plan-ko.md)

실제 workspace를 대상으로 write 없이 model/tool 선택을 확인하려면:

```bash
pnpm org-agent:live-eval -- <company-workspace-id>
```
