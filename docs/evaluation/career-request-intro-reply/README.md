# Career Request Intro reply prompt comparison

회사에서 먼저 보낸 Request Intro를 Talent가 수락한 뒤 회사의 후속 연락이 없는 상황에서, Career Harper의 최종 답변이 지나친 단답이나 상태 보고서가 되지 않는지를 같은 입력으로 비교한다.

## 평가 범위

- 평가 단위: production Career system prompt와 동일한 Request Intro 조회 결과를 받은 뒤 생성하는 최종 한국어 답변 1개
- 포함: 같은 모델·system prompt·사용자 발화·tool input·tool result에서 post-tool instruction만 바꾼 비교
- 제외: 실제 DB 조회, tool 선택 정확도, relay 전송, 회사 답장, 이메일·Slack worker, 프런트엔드 렌더링
- 성격: 실제 분포의 평균 품질을 추정하는 평가가 아니라 한 가지 중요한 UX 실패를 반복 확인하는 synthetic E2E challenge

## Frozen input과 gold

- dataset: `cases-v1.json`
- human-review rubric: `gold-v1.json`
- 비교 prompt: `prompt-variants-v1.json`
- 고정 사용자 발화: `Harper · [E2E] Request Intro 테스트 이거 지금 어떻게 진행되고 있는거야 수락했는데?`
- 고정 상태: 회사 요청, Talent 수락과 연결 완료, 수락 후 14일, 이후 회사 직접 연락·Talent relay 없음
- capture 기준일: 2026-09-22

입력은 `testOnly=true`인 E2E Role에서 재현한 상태를 비식별 synthetic fixture로 동결했다. 이메일, 실제 회사나 Talent 식별자, production 대화 원문은 포함하지 않는다. fixture나 rubric 의미가 바뀌면 새 dataset version을 만든다. 모델이나 prompt variant만 바꿀 때는 v1을 유지한다.

## Prompt와 실행 계약

Canonical runner는 [`scripts/evalCareerRequestIntroPromptComparison.ts`](../../../scripts/evalCareerRequestIntroPromptComparison.ts)다. runner는 production의 다음 코드를 직접 사용한다.

- `buildCareerConversationPromptPlan`
- `renderCareerPromptBlocks`
- `resolveCareerChatTools`
- `formatTalentMessageContentForLlmPrompt`
- `buildToolResultFollowupInstruction`
- `TALENT_TOOL_COMMON_ASSISTANT_INSTRUCTION`
- `createChatCompletionWithFallback`

모든 variant는 같은 production system prompt와 동일한 `read_recommended_opportunities` tool call/result transcript를 사용한다. `production-current`만 현재 공통 assistant instruction을 runtime에서 직접 읽는다. 다른 variant는 비교 파일에 동결된 instruction을 사용한다. 최종 생성 단계에서는 추가 tool을 노출하지 않는다.

## 실행

파일과 계약만 확인:

```bash
pnpm eval:career-request-intro-prompts -- --validate-only
```

현재 `/career` 기본 모델로 네 variant를 실행:

```bash
pnpm eval:career-request-intro-prompts -- \
  --output-dir docs/evaluation/career-request-intro-reply/runs/<run-id>
```

모델을 명시해 비교하려면:

```bash
pnpm eval:career-request-intro-prompts -- \
  --model z-ai/glm-5.3-flash \
  --reasoning-effort high \
  --output-dir docs/evaluation/career-request-intro-reply/runs/<run-id>
```

runner는 `comparison.md`에 variant별 답변을 한 표로 만들고, 각 variant의 전체 system prompt·tool result·provider response는 `runs/`의 개별 JSON에 `0600` 권한으로 저장한다.

## 모델과 실행 조건

- 기본 provider/model: OpenRouter / `z-ai/glm-5.3-flash`
- reasoning: `high`
- temperature: 별도 지정 없음
- max output tokens: 1,500
- 최종 tool choice: tool 미노출
- provider 저장 정책: production adapter 설정 사용
- raw artifact: gitignored `runs/`에만 저장

## Human review와 release gate

정성적 품질을 문장 길이, 키워드, Markdown 유무, 특정 문구 일치로 자동 판정하지 않는다. `comparison.md` 원문을 `gold-v1.json`과 함께 사람이 검토한다.

이 단일 challenge의 prompt 선택 기준은 다음과 같다.

1. 세 가지 필수 사실을 왜곡 없이 사용한다.
2. critical failure가 없다.
3. 단순히 “연락 가능합니다. 할까요?”처럼 가능 여부만 말하지 않는다.
4. 상태 필드나 제품 기능을 나열하는 보고서가 아니라 현재 사용자의 답답함을 이해한 대화로 읽힌다.
5. 회사 확인을 제안하는 경우 내부 전송·권한·draft 절차를 사용자가 관리해야 하는 것처럼 설명하지 않는다.

이 사례의 통과만으로 전체 Career 대화 prompt를 출시하지 않는다. 다른 tool 결과와 일반 대화에 대한 회귀 평가가 별도로 필요하다.

## 최신 실행

2026-09-22에 `z-ai/glm-5.3-flash`, reasoning `high`로 네 variant를 같은 입력에 실행했다. `comparison.md`는 네 답변을 가로 열로 보여주며, raw provider response와 전체 prompt는 gitignored run artifact에만 있다. 자동 승자를 정하지 않았고 human review는 대기 중이다.

## 개인정보와 외부 전송

fixture는 test-only Role에서 만든 synthetic 상태다. 테스트 계정 이메일, 실제 사용자 ID, 실제 이력·Brief·Memory, 원본 production 대화는 외부 provider나 artifact에 포함하지 않는다. synthetic system prompt·사용자 발화·tool result와 모델 출력만 선택한 provider에 전송된다. API key와 환경 변수는 저장하지 않는다.

## 알려진 한계

- 한 가지 한국어 발화만 비교하므로 일반적인 자연스러움을 증명하지 못한다.
- tool 선택 이전 과정은 고정했으므로 모델이 실제로 올바른 read tool을 고르는지는 평가하지 않는다.
- prompt variant별 한 번의 출력은 stochastic 차이와 prompt 효과를 분리하지 못한다. 중요한 결정 전에는 같은 frozen input으로 반복 실행해야 한다.
- 실제 `/api/talent/chat`의 SSE, DB write, 브라우저 캐시와 지연은 포함하지 않는다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-22 | Request Intro 수락 후 14일 무응답 1건과 네 post-tool prompt variant 비교 환경 등록 |
