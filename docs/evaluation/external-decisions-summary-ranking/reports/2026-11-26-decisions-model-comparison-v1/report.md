# Decisions 모델 비교: gpt-6-luna · liquid/d1.2 · pplx-decider-v1.3

2026-11-26. 사용자가 같은 harper_eval 데이터로 세 모델을 비교해 달라고 요청했다. 실제 API로 실행했으며 운영 DB를 읽거나 쓰지 않았고 배포도 하지 않았다.

## 설정

- 데이터: 이 태스크의 frozen-v1(359 run, 268명, 2,023공고, 2,338 like/dislike 쌍)이다. 고정 커밋에서 다시 만들었고 `gold-v1.json`과 같음을 확인했다. cases `df6b055f…`, pairs `63d1f2b0…`.
- 입력·채점은 harper_beta `e355fb7f`의 운영 경로를 그대로 쓴다. `v2PromptCandidate`(요약이 있으면 요약), `buildScoringInputParts`, `buildDecisionRequest`, `parseDecisionBatch`, `rankScore`(fitQuestions.v4)를 거친다. 배치는 최대 10공고, 모두 428배치다. 모델만 바꿨다.
- luna는 OpenAI `/v1/decisions`로 직접 호출했다. 나머지 둘은 OpenRouter `/api/alpha/decisions`에 기존 jev 요청 형식(`allow_fallbacks:false`, `data_collection:"deny"`)으로 보냈다.
- 각 모델을 1회씩 실행했다. 동시 호출은 luna·d1.2가 6개, pplx 무료판이 3개였다. 타임아웃은 30초, 일시 오류 재시도는 1회로 두었다.
- Runner: `scripts/evalExternalDecisionsModels.ts`. 원본 응답은 ignored `runs/20261126-decisions-model-comparison-v1/`에 있다.

## 결과

| | gpt-6-luna (현재) | liquid/d1.2 | pplx-decider-v1.3:free |
|---|---:|---:|---:|
| 👍 우선 정확도 | 61.04% | 56.24% | 61.38% |
| luna 대비 (talent bootstrap 95%) | — | −4.79%p [−9.03, −0.52] | +0.34%p [−3.44, +4.21] |
| 호출 지연 p50 / p95 | 0.34s / 0.80s | 0.70s / 0.89s | 0.73s / 1.57s |
| 비용 (428배치) | $0.313 (운영 공식 추정) | $0.065 (OpenRouter 보고) | $0 (무료판) |
| 공고 1,000개당 | $0.155 | $0.032 | $0 |
| 실패·누락·동점 | 0 | 0 | 0 |

## 해석

- liquid/d1.2는 비용이 약 1/5이지만 정확도가 유의하게 낮다.
- pplx v1.3은 luna와 같은 수준이다(구간에 0 포함). 비열등 기준인 하한 −2%p는 통과하지 못해 판정이 충분하지 않다. 유료 엔드포인트는 아직 없다(무료판만 있음). 유료가 생기면 단가와 데이터 정책을 다시 확인해야 한다.
- 지연은 luna가 가장 짧다. pplx의 p95는 무료판 대기열 영향일 수 있다.
- 각 모델은 1회만 실행했다. 과거에 보여 준 공고만 다루므로 전체 검색 pool의 상위 회수율은 검증하지 않는다. 이 결과만으로 배포를 승인하지 않는다.
