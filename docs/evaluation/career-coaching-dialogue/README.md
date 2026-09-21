# Career coaching dialogue evaluation

`/career`에서 사용자가 “커리어 고민과 다음 커리어에 대해서 이야기하기”를 선택했을 때, 음성 입출력을 제외한 대화 판단부가 실제로 유용한 코칭 대화를 만드는지 확인하는 challenge 평가다.

## 평가가 답하는 것과 답하지 못하는 것

이 평가는 production Career prompt builder, 대화 모드 지시, tool schema를 그대로 불러와 `gpt-5.6-terra`에 여러 턴을 입력한다. 다음을 사람이 원문 대화로 검토한다.

- 사용자의 고민을 반복 질문 없이 점점 더 정확히 구조화하는가
- 해석을 가설로 다루고 사용자의 교정을 반영하는가
- 일반론, 과장된 응원, 훈계 대신 현재 판단에 필요한 차이를 다루는가
- 확인된 기준을 Harper가 실제로 할 수 있는 지원과 연결하는가
- 사용자 행동을 제안할 때 대상·행동·해소할 불확실성이 구체적인가
- 실행되지 않은 저장이나 설정 변경을 완료했다고 말하지 않는가

음성 인식, 합성 음성의 자연스러움, 끼어들기, 지연, `gpt-live-1` 프런트엔드의 위임 판단, 실제 DB write, 추천 결과의 품질은 평가하지 않는다. 따라서 이 결과만으로 전체 통화 UX가 production-ready라고 결론 내릴 수 없다.

## 평가 단위와 데이터

- 평가 단위: 하나의 synthetic 다중 턴 Career coaching 통화
- dataset: `cases-v1.json`
- gold/rubric: `gold-v1.json`
- 사례 수: 4개
- 성격: 실제 분포를 추정하는 representative sample이 아니라 희귀하지만 중요한 실패를 찾는 challenge set
- 입력: 완전히 합성한 한국어 프로필, Search Brief/Memory 요약, 사용자 발화
- 제외: production 사용자·회사·추천 원문, 실제 식별자, DB 조회

고정 사용자 발화는 어떤 자연스러운 후속 질문에도 대체로 이어지도록 작성했다. 이 방식은 자유로운 실제 사용자 반응을 완전히 재현하지 못하지만, 같은 입력으로 prompt/model 회귀를 비교하기 위한 선택이다.

## canonical runner

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

## 실행 조건

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

## human-review rubric와 gate

정성적 품질은 정규식, 키워드, 길이 점수로 판정하지 않는다. raw transcript를 사람이 `gold-v1.json`의 사례별 기대와 공통 실패 기준에 따라 읽고 판정한다. runner의 자동 집계는 응답 존재, tool loop 완료, tool 오류 같은 구조적 사실만 포함한다.

배포 전 gate:

1. 네 사례 모두 전체적으로 pass
2. critical failure 0건
3. 모든 assistant 턴이 음성으로 듣기 자연스럽고, 한 턴에 질문은 원칙적으로 하나
4. 첫 응답이 프로필 전체를 낭독하지 않음
5. 정상 마무리에서 사용자가 승인한 Harper 지원 계획 또는 실제 결정을 진전시키는 사용자 행동이 남음
6. 성공한 stub tool call 없이 저장·설정 변경이 완료됐다고 주장하지 않음

한 사례라도 gate를 통과하지 못하면 prompt/model 조합은 이 challenge set 기준 NO-GO다. 작은 challenge set의 pass를 실제 사용자 전체의 품질이나 성공률로 해석하지 않는다.

## 최신 결과

2026-09-17 `gpt-5.6-terra`, reasoning `high`의 최종 v4 run은 네 사례 모두 content-only gate를 통과했고 critical failure는 없었다. 구조적으로 27개 assistant 턴이 모두 비어 있지 않았고, tool 오류는 0건이며, 네 통화 모두 `end_call`로 끝났다. 사례별 human review와 첫 실행 이후의 개선 내용은 [`reports/2026-09-17-terra-high-v4.md`](reports/2026-09-17-terra-high-v4.md)에 기록했다.

이 통과는 대화 판단부에 한정된다. `gpt-live-1`의 위임, 음성 합성·인식, 끼어들기, 실제 tool/DB 실행을 포함한 통화 E2E는 별도로 확인해야 한다.

## provenance와 버전 규칙

`cases-v1.json`과 `gold-v1.json`은 2026-09-17에 이 기능의 첫 대화 품질 검증을 위해 합성했다. 입력이나 human-review 기대를 바꾸면 새 dataset version을 만든다. prompt, 모델, reasoning만 바꿀 때는 v1을 유지하고 새 run을 만든다.

`manifest-v1.json`은 frozen 파일의 hash, 분포, runner와 review 상태를 기록한다. 각 run manifest는 source revision, dirty diff fingerprint, runner hash, 실제 prompt fingerprint와 실행 조건을 별도로 남긴다.

## 개인정보와 외부 전송

fixture는 모두 합성이며 production PII를 포함하지 않는다. synthetic prompt와 대화는 OpenAI에 전송된다. API key와 환경 변수는 artifact에 쓰지 않는다. raw model output은 gitignored `runs/`에만 저장한다.

## 알려진 한계

- 사례 수가 작고 한국어 중·고경력 지식 노동자 상황에 치우쳐 있다.
- 고정 사용자 발화는 모델 질문에 동적으로 답하는 실제 대화보다 관대하거나 어색할 수 있다.
- tool stub은 authorization, DB validation, post-call processing을 재현하지 않는다.
- 한 번의 stochastic run은 안정성을 증명하지 않는다. release 판단 전에는 같은 frozen set을 반복 실행해야 한다.
- 내용 모델만 직접 호출하므로 `gpt-live-1`이 발화를 언제 위임하는지와 최종 음성 전달 품질은 별도 E2E가 필요하다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-17 | v1 synthetic challenge 4개, human-review rubric, Terra content-only runner 등록 |
