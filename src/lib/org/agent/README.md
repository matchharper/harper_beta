# Organization Agent

이 폴더의 Agent는 workspace 전체를 대상으로 한다. 대화에 고정된 `roleId`는 없다.

수정 순서:

1. `prompts.ts`: LLM 행동 규칙과 실제 prompt 형식
2. `context.ts`: 매 turn 항상 넣는 데이터
3. `promptFormat.ts`: header-once table과 LLM용 tool result 직렬화
4. `tools.ts`: LLM에 노출하는 function schema
5. `data.ts`: read tool의 bounded DB query
6. `toolState.ts`: 한 turn의 tool 결과와 read-before-write visibility
7. `toolExecution.ts`: argument 검증과 write 실행
8. `chat.ts`: model 호출, tool loop, token usage, 최종 메시지 저장
9. `store.ts`: workspace conversation과 message 저장

전체 argument, 반환값, 권한, 웹·Slack 호출 흐름은
[`docs/org-agent-tools-reference-ko.md`](../../../docs/org-agent-tools-reference-ko.md)에
정리되어 있다.

prompt/context/tool 설계 근거와 benchmark는
[`docs/org-agent-context-engineering-ko.md`](../../../docs/org-agent-context-engineering-ko.md)에
정리되어 있다.

실제 workspace 데이터를 읽고 Grok의 답변/tool 선택을 검증하되 write tool은
DB에 반영하지 않는 live eval:

```bash
pnpm org-agent:live-eval -- <company-workspace-id>
```

질문 5개와 변경 요청 3개를 실행하며, 내부 ID 노출·사용자 언어·대상 ID·profile
필요 여부·전체 pipeline stage 집계까지 검사한다.
