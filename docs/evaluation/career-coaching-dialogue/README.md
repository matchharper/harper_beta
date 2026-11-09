# Career coaching dialogue evaluation

`/career`의 코칭 요청이 일반 채팅을 해치지 않으면서 적절한 topic으로 제안·시작·종료되고, active 대화가 실제로 유용한지를 확인하는 challenge 평가다. v1은 음성 입출력을 제외한 active 통화 내용 품질을, v2~v4는 텍스트 채팅의 lifecycle 판단과 일반 대화 오탐을, v5는 active 텍스트 채팅의 다중 턴 품질을 다룬다.

## 평가가 답하는 것과 답하지 못하는 것

이 평가는 production Career prompt builder, 대화 모드 지시, tool schema를 그대로 불러와 `gpt-5.6-terra`에 여러 턴을 입력한다. 다음을 사람이 원문 대화로 검토한다.

- 사용자의 고민을 반복 질문 없이 점점 더 정확히 구조화하는가
- 해석을 가설로 다루고 사용자의 교정을 반영하는가
- 일반론, 과장된 응원, 훈계 대신 현재 판단에 필요한 차이를 다루는가
- 확인된 기준을 Harper가 실제로 할 수 있는 지원과 연결하는가
- 사용자 행동을 제안할 때 대상·행동·해소할 불확실성이 구체적인가
- 실행되지 않은 저장이나 설정 변경을 완료했다고 말하지 않는가

음성 인식, 합성 음성의 자연스러움, 끼어들기, 지연, `gpt-live-1` 프런트엔드의 위임 판단, 실제 DB write, 추천 결과의 품질은 평가하지 않는다. 따라서 이 결과만으로 전체 통화 UX가 production-ready라고 결론 내릴 수 없다.

## v1 active 통화 대화 품질

### 평가 단위와 데이터

- 평가 단위: 하나의 synthetic 다중 턴 Career coaching 통화
- dataset: `cases-v1.json`
- gold/rubric: `gold-v1.json`
- 사례 수: 4개
- 성격: 실제 분포를 추정하는 representative sample이 아니라 희귀하지만 중요한 실패를 찾는 challenge set
- 입력: 완전히 합성한 한국어 프로필, Search Brief/Memory 요약, 사용자 발화
- 제외: production 사용자·회사·추천 원문, 실제 식별자, DB 조회

고정 사용자 발화는 어떤 자연스러운 후속 질문에도 대체로 이어지도록 작성했다. 이 방식은 자유로운 실제 사용자 반응을 완전히 재현하지 못하지만, 같은 입력으로 prompt/model 회귀를 비교하기 위한 선택이다.

### canonical runner

실행기는 [`scripts/evalCareerCoachingDialogue.ts`](../../../scripts/evalCareerCoachingDialogue.ts)다. runner는 다음 production 코드를 직접 import한다.

- `buildCareerConversationPromptPlan`
- `renderCareerPromptBlocks`
- `getCareerConversationStarter`
- `appendRealtimeInitialResponseInstruction`
- Career realtime voice tool selection과 실제 tool schema
- `createChatCompletionWithFallback`의 OpenAI Responses adapter

예시 실행:

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/evalCareerCoachingDialogue.ts \
  --output-dir docs/evaluation/career-coaching-dialogue/runs/20260917-terra-high-v1
```

runner는 DB나 실제 tool executor를 호출하지 않는다. tool은 메모리 안의 deterministic stub으로만 실행하며, 구조적 계약과 모델의 tool 사용을 관찰한다. raw prompt, 대화, tool call, provider response metadata는 지정한 `runs/` 아래에 쓰고 파일 권한을 `0600`으로 설정한다.

### 실행 조건

- provider: OpenAI Responses API
- model: `gpt-5.6-terra`
- reasoning: `high`
- sampling: 별도 temperature 없음
- tool choice: `auto`, parallel tool calls 비활성화
- max output tokens: assistant completion당 2,000
- tool loop: assistant 턴당 최대 4회
- locale/channel/mode: `ko` / `voice` / `career_coaching`
- timeout: provider client 기본값
- 데이터 저장: provider `store=false`; production DB 접근 없음

### human-review rubric와 gate

정성적 품질은 정규식, 키워드, 길이 점수로 판정하지 않는다. raw transcript를 사람이 `gold-v1.json`의 사례별 기대와 공통 실패 기준에 따라 읽고 판정한다. runner의 자동 집계는 응답 존재, tool loop 완료, tool 오류 같은 구조적 사실만 포함한다.

배포 전 gate:

1. 네 사례 모두 전체적으로 pass
2. critical failure 0건
3. 모든 assistant 턴이 음성으로 듣기 자연스럽고, 한 턴에 질문은 원칙적으로 하나
4. 첫 응답이 프로필 전체를 낭독하지 않음
5. 정상 마무리에서 사용자가 승인한 Harper 지원 계획 또는 실제 결정을 진전시키는 사용자 행동이 남음
6. 성공한 stub tool call 없이 저장·설정 변경이 완료됐다고 주장하지 않음

한 사례라도 gate를 통과하지 못하면 prompt/model 조합은 이 challenge set 기준 NO-GO다. 작은 challenge set의 pass를 실제 사용자 전체의 품질이나 성공률로 해석하지 않는다.

### 최신 결과

2026-09-17 `gpt-5.6-terra`, reasoning `high`의 최종 v4 run은 네 사례 모두 content-only gate를 통과했고 critical failure는 없었다. 구조적으로 27개 assistant 턴이 모두 비어 있지 않았고, tool 오류는 0건이며, 네 통화 모두 `end_call`로 끝났다. 사례별 human review와 첫 실행 이후의 개선 내용은 [`reports/2026-09-17-terra-high-v4.md`](reports/2026-09-17-terra-high-v4.md)에 기록했다.

이 통과는 대화 판단부에 한정된다. `gpt-live-1`의 위임, 음성 합성·인식, 끼어들기, 실제 tool/DB 실행을 포함한 통화 E2E는 별도로 확인해야 한다.

## v4 텍스트 lifecycle과 일반 대화 경계

### 평가 단위와 frozen input

- 평가 단위: 초기 activity 상태와 직전 대화를 포함한 synthetic 텍스트 채팅 1~2턴
- dataset: `cases-v4.json`
- gold/rubric: `gold-v4.json`
- 사례 수: 14개
- 포함: 막연한 명시적 코칭 요청, 해외 이동·직무 전환·보상·일의 재미 저하 선택, direct start, suggested 자연어 start, active 중 우회 질문과 종료
- negative set: 같은 네 주제를 코칭 요청 없이 말한 경우와 일반 공고 평가
- 입력: 완전히 합성한 프로필·Brief/Memory·대화·activity snapshot
- 제외: production 사용자·회사·추천 원문, 실제 식별자, DB 조회

예시 발화는 예상 경험과 회귀 범위를 정의할 뿐 runtime의 키워드, 주제 enum, 전용 분기 또는 고정 답안으로 사용하지 않는다.

### prompt/input contract

runner는 매 사용자 턴마다 production `resolveCareerChatTools`, `buildCareerConversationPromptPlan`, `renderCareerPromptBlocks`를 사용한다. post-onboarding 일반 채팅과 같은 tool schema를 노출하고, 한 turn의 continuation에서도 그 전체 schema를 유지하며, 현재 synthetic activity만 prompt에 전달한다. lifecycle tool은 메모리 안의 구조적 stub으로 `suggested/active/ended`, ID, revision을 검증하며 다른 read tool은 합성 데이터나 빈 결과만 반환한다.

### canonical runner

실행기는 [`scripts/evalCareerCoachingLifecycle.ts`](../../../scripts/evalCareerCoachingLifecycle.ts)다.

데이터와 runner 계약만 검증:

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/evalCareerCoachingLifecycle.ts --validate-only
```

모델 실행:

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/evalCareerCoachingLifecycle.ts \
  --output-dir docs/evaluation/career-coaching-dialogue/runs/20260922-terra-high-v4
```

다른 production 후보 모델은 frozen input을 바꾸지 않고 명시적으로 지정한다.

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/evalCareerCoachingLifecycle.ts \
  --model z-ai/glm-5.3-flash \
  --reasoning-effort high \
  --output-dir docs/evaluation/career-coaching-dialogue/runs/20260922-glm-53-flash-high-v4
```

raw prompt, 전체 transcript, tool call과 provider response는 gitignored `runs/` 아래에만 `0600`으로 저장한다.

### 모델 설정과 metrics

- provider/model/reasoning: OpenAI Responses API / `gpt-5.6-terra` / `high`
- tool choice: `auto`, parallel tool calls 비활성화
- max output tokens: assistant completion당 2,000
- tool loop: 사용자 턴당 최대 5회
- locale/channel: `ko` / `chat`
- 자동 집계: 실제 lifecycle action, 허용 action 밖의 호출, tool error, 마지막 activity 상태
- 정성 평가: 제안과 agenda의 구체성, 근거 사용, 대화 진행과 종료 품질

### release gate

1. 14개 사례 모두 human qualitative pass
2. critical failure 0건
3. structural lifecycle violation 0건, tool error 0건
4. 명시적 코칭 맥락의 네 주제는 특정 시나리오 분기 없이 유용한 topic과 범위를 만든다.
5. 같은 네 발화를 일반 대화에서 했을 때 lifecycle tool 호출은 0건이다.
6. 공고 평가와 active 중 단발성 질문에 코칭 카드나 자동 re-engagement를 붙이지 않는다.
7. 명시적 direct start, suggested 자연어 start, 명시적 end가 각각 올바른 transition을 만든다.
8. 한 번의 stochastic pass만으로 출시하지 않고 같은 frozen set의 반복 run과 브라우저·DB E2E를 함께 확인한다.

v2 첫 세 번의 run은 경계 prompt를 다듬고 평가 기준의 모호성을 발견하는 데 사용했다. v3에서는 감정 발화 한 건의 label을 교정했지만, 같은 명시적 탐색 맥락의 다른 주제도 사용자가 분석을 요청하면 direct start가 유효하다는 점이 드러났다. frozen v2/v3를 고치지 않고 같은 input의 v4에서 네 주제 모두 `suggest | start`를 허용했다.

### 최신 결과

2026-09-22 최종 v4를 `gpt-5.6-terra`, reasoning `high`로 세 번 반복했다. 세 run 모두 14개 사례에서 structural lifecycle violation 0건, tool error 0건이었다. 첫 최종 run과 상태 무결성 보완 뒤 마지막 run의 전체 원문 human review도 14/14 통과했고 critical failure는 없었다. 일반 대화 5종은 lifecycle tool을 호출하지 않았고, 명시적 코칭 맥락의 네 주제는 모두 유용한 topic과 범위를 만들었다. active 종료 뒤 일반 대화 복귀, 확인하지 않은 보상·비자·시장 사실의 비단정, session control의 Memory 비저장도 확인했다. 자세한 결과는 [`reports/2026-09-22-terra-high-v4.md`](reports/2026-09-22-terra-high-v4.md)에 기록했다.

보정 migration 적용 뒤 전용 임시 QA 계정으로 실제 `/api/talent/chat` SSE와 DB를 연결해 direct start와 suggested 카드 start, active 후속 대화, 종료, 종료 뒤 일반 대화 복귀도 확인했다. 만료 RPC가 반환한 null composite를 서버가 오류로 오해하던 문제를 고친 뒤 두 흐름의 상태 전이와 응답 품질이 통과했고 tool failure와 SSE error는 0건이었다. 9턴 중 8턴의 전체 완료는 5.7~18.2초였지만 종료 턴 한 건이 349.9초까지 지연됐고 분리 재실행 두 번에서는 8.4초와 8.9초로 재현되지 않았다. 따라서 실제 chat lifecycle 통합은 통과했으나 Terra의 latency reliability, 브라우저 카드·다중 클릭, Realtime/Live 통화 E2E는 별도 release gate로 남아 있다.

2026-09-22에 `/career` 기본 후보인 `z-ai/glm-5.3-flash`도 같은 v4로 검증했다. `high`는 당시 SSE 후속 tool 제한과 현재 activity reference 보완을 반영한 run에서 구조 14/14를 통과했지만, 근거 없는 외부 사실과 실행되지 않은 약속 때문에 human quality gate는 실패했다. `medium`은 12/14로 lifecycle action 두 건을 누락했다. 전용 QA 계정으로 실행한 실제 SSE·DB 13턴에서는 일반 대화 5건 모두 activity 0건이었으나, 현재 DB의 옛 RPC 계약 때문에 명시적 코칭 activity 생성이 전부 실패했다. 후속 tool 제한 제거 뒤 runner는 최초 노출 schema 전체를 유지하도록 갱신했으며, 이전 run은 그 변경 전 결과다. 자세한 결과는 [GLM 5.3 Flash v4 검증 보고서](reports/2026-09-22-glm-53-flash-v4.md)에 기록했다.

## v5 active 텍스트 채팅 품질

v5는 active 코칭 채팅 세 개를 7~8개 사용자 턴으로 진행한다. 카드에서 채팅을 선택한 직후의 첫 응답, 사용자가 모델의 초기 가설을 교정하는 직무 전환 대화, 짧은 감정에서 시작해 원인이 바뀌는 대화, 외부 근거 없이 숫자를 만들면 안 되는 보상 대화를 포함한다. 총 22개 assistant 응답 기회에서 다음을 원문으로 검토한다.

- 질문 전에 해석·차이·트레이드오프·근거·선택지 비교 중 실제 가치가 있는 내용을 제공하는가
- 공감이나 요약 뒤 질문만 하는 패턴을 반복하지 않는가
- 질문의 답이 다음 판단을 바꾸며, 이미 답한 질문을 다시 묻지 않는가
- 사용자 교정에 따라 가설을 수정하고 앞선 답을 누적하는가
- 직접 질문에 먼저 답하고 근거 없는 수치나 시장 사실을 만들지 않는가
- 종료 전에 무엇이 선명해졌는지와 판단 가능한 다음 행동을 남기는가

fixture는 `cases-v5.json`, frozen human rubric은 `gold-v5.json`이다. v4와 같은 production chat prompt builder와 tool schema를 사용하는 `scripts/evalCareerCoachingLifecycle.ts`로 실행한다. 구조 오류가 없다는 사실은 품질 통과로 계산하지 않으며, 세 transcript를 `gold-v5.json`과 대조해 사람이 직접 판정한다.

2026-09-22 GLM 5.3 Flash high를 같은 v5로 두 번 실행했다. 두 run 모두 human quality 0/3으로 **NO-GO**였다. 질문 전에 분석을 제공하고 사용자 교정을 반영하는 능력은 개선됐지만, 근거 없는 시장·직무 일반화, 제한된 성과에서 senior 수준 단정, 앞선 구분과 최종 결론의 모순, session 가설과 일회성 계획의 Memory 저장이 반복됐다. 두 번째 run은 PM 전환 사례의 lifecycle tool 오류도 1건 있었다. 원문 판정은 [`reports/2026-09-22-glm-53-flash-v5-active-chat-quality.md`](reports/2026-09-22-glm-53-flash-v5-active-chat-quality.md)에 기록했다.

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/evalCareerCoachingLifecycle.ts \
  --cases docs/evaluation/career-coaching-dialogue/cases-v5.json \
  --gold docs/evaluation/career-coaching-dialogue/gold-v5.json \
  --model z-ai/glm-5.3-flash \
  --reasoning-effort high \
  --output-dir docs/evaluation/career-coaching-dialogue/runs/<run-id>
```

## provenance와 버전 규칙

`cases-v1.json`과 `gold-v1.json`은 2026-09-17에 active 통화 품질 검증을 위해 합성했다. `cases-v2.json`과 `gold-v2.json`은 2026-09-22에 새 lifecycle과 일반 대화 경계를 검증하기 위해 별도로 합성했다. v3는 짧은 감정 발화의 label을, v4는 명시적 탐색 뒤 사용자가 선택한 주제의 분석을 요청한 네 사례의 label을 `suggest | start`로 교정했다. v2~v4의 synthetic input은 같다. v5는 active 채팅의 대화 품질 기준과 3개 다중 턴 입력을 첫 실행 전에 별도로 동결했다. frozen 입력이나 human-review 기대를 바꾸면 새 dataset version을 만든다. prompt, 모델, reasoning만 바꿀 때는 같은 version으로 새 run을 만든다.

각 version의 manifest는 frozen 파일의 hash, 분포, runner와 review 상태를 기록한다. 각 run manifest는 source revision, dirty diff fingerprint, runner hash, 실제 prompt fingerprint와 실행 조건을 별도로 남긴다.

## 개인정보와 외부 전송

fixture는 모두 합성이며 production PII를 포함하지 않는다. synthetic prompt와 대화는 OpenAI에 전송된다. API key와 환경 변수는 artifact에 쓰지 않는다. raw model output은 gitignored `runs/`에만 저장한다.

## 알려진 한계

- 사례 수가 작고 한국어 중·고경력 지식 노동자 상황에 치우쳐 있다.
- 고정 사용자 발화는 모델 질문에 동적으로 답하는 실제 대화보다 관대하거나 어색할 수 있다.
- tool stub은 authorization, DB validation, post-call processing을 재현하지 않는다.
- 세 번의 동일 frozen set 통과는 작은 synthetic challenge set 안의 회귀 신호다. 실제 사용자 분포의 성공률을 증명하지 않는다.
- 내용 모델만 직접 호출하므로 `gpt-live-1`이 발화를 언제 위임하는지와 최종 음성 전달 품질은 별도 E2E가 필요하다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-22 | v5 GLM 5.3 Flash high 2회 human quality 0/3 반복으로 active chat NO-GO 판정 |
| 2026-09-22 | v5 active 텍스트 채팅 3개·22응답 기회와 질문 전 기여·가설 교정·근거·마무리 human rubric 등록 |
| 2026-09-22 | migration 적용 뒤 Terra 실제 SSE·DB 두 흐름 통과, null composite 처리 수정, 349.9초 latency 이상치 기록 |
| 2026-09-22 | production의 tool chain allowlist 제거에 맞춰 lifecycle runner가 continuation마다 최초 노출 tool 전체를 유지하도록 변경 |
| 2026-09-22 | GLM 5.3 Flash high/medium v4 및 실제 SSE·DB 검증, release blocker와 지연 기록 |
| 2026-09-22 | v4 Terra high 반복 3회 14/14 구조 통과, 최종 코드 전체 human review 통과 |
| 2026-09-22 | v4에서 명시적 탐색 뒤 주제 분석 요청의 suggest/direct-start label을 네 사례에 일관되게 적용 |
| 2026-09-22 | v3에서 직전 명시적 탐색에 이은 실제 감정 발화의 suggest/direct-start label 교정 |
| 2026-09-22 | v2 텍스트 lifecycle·일반 대화 negative set 14개와 별도 runner 등록 |
| 2026-09-17 | v1 synthetic challenge 4개, human-review rubric, Terra content-only runner 등록 |
