# Decisions scoring: 요약 + 4축 단일 비교

문서 기준: 2026-10-20. 아래 계약은 실행 전에 확정했다. [실행 결과](reports/2026-10-20-summary-four-axis-v1/report.md), [harper_eval 실험 #7](https://github.com/matchharper/harper_eval/issues/7). 제품 코드나 운영 배포는 변경하지 않았다.

## 목적과 평가 단위

현재 로컬 V2 Decisions scoring과, (1) 저장된 언어별 요약 우선 사용, (2) evidence/mutualFit 제거 및 새로운 정렬을 합친 변경안 하나를 비교한다. 각 버전 2회는 같은 버전의 변동을 측정하는 반복이며 별도 변경안 탐색이 아니다. 검색, 새 요약 생성, LLM reranking, 메일·추천 저장은 실행하지 않는다.

단위는 같은 과거 추천 run의 후보자 × 당시 보여 준 외부 공고다. 359 run, 268명, 2,023공고, 2,338 like/dislike 쌍이다. 한 run은 최대 15공고이므로 전체 검색 결과에서 상위20개 회수율이나 최종 추천 성과를 검증하지 못한다.

## 고정 입력과 정답

- harper_eval: `8b4eadeffa2f63149bce408f6fef611316b74fe5`.
- 원본 `talent/cases/20260909-20261008/20261017T090550Z/`.
- 정답 `experiments/issue-1/prep/pairs-v1/20260909-20261008/20261017T090550Z/`: 7일 반응·기존 제외 규칙 변경 없음. 364건 중 기존 scoring prep가 제외한 5건을 뺀다.
- 입력 `experiments/issue-1/prep/scoring-inputs-v1/20260909-20261008/20261017T090550Z/`: Profile, 전체 Brief, 당시 보존/재구성한 Behavior Context를 그대로 재사용한다. 재생성하지 않는다.
- 언어별 요약은 당시 `shown[].card.roleSummary[locale].content`의 비어 있지 않은 문자열을 사용한다. 현재 DB/pool이나 요약 모델을 추가로 읽지 않는다. 1,932공고에 적용, 91개는 원문 유지. 요약 version/sourceHash로 새 제외 조건을 추가하지 않는다.
- 카드와 prep의 기존 snapshot 차이·복원 한계를 유지하고 명시한다. 원본 순위, 사용자 반응, 과거 점수는 API 입력에 넣지 않는다. 역할은 `sha256(run_id:posting_id)` 순으로 고정하고 10개씩 나눈다. 이 batching은 원래 전체 검색 batching의 완전한 재현이 아니다.
- `gold-v1.json`은 동일 정답 쌍의 비식별 alias다. 실제 ID 매핑과 frozen 입력은 ignored `private/frozen-v1/`에만 있다. 원본 파일과 결과 hash는 manifest에 기록한다.

## 기준안과 단일 변경안

기준안은 로컬 `buildScoringInput`, `v2PromptCandidate`, `buildDecisionRequest`, `parseDecisionBatch`, `rankScore`를 재사용한다. 초기 작업 트리의 formatter 변경을 양쪽에 동일하게 포함하고 source hash·dirty diff hash·실제 소스 파일을 동결했다. 실행 시점에 이 파일들은 모두 로컬 커밋 `1122120ab8b13d27ed9dd53d6c623d7bf91a01f6`과 일치함을 사후 확인했다. 이 로컬 커밋의 배포 여부는 검증하지 않았다. 기존 HTML/빈 값 정리는 양쪽에 동일하게 적용한다.

변경안은 roleDescription만 저장된 요약으로 대체하고 회사·후보자·나머지 공고 필드는 유지한다. 질문과 developer rubric에서 evidence와 mutualFit을 제거하며 constraintPass 지침에 남은 두 축 참조도 제거한다. 사실 근거를 뜻하는 일반 영어 evidence는 별도 출력 축이 아니므로 유지한다. 남은 네 축의 판단 기준은 그대로다.

정렬은 다음 한 가지로 실행 전에 고정한다.

```
base = 0.60*candidateInterest + 0.35*roleFit + 0.05*companyInterest
score = constraintPass <= 50
  ? base * 0.2 * (constraintPass/50)^2
  : base
```

사용자의 실제 관심을 중심에 두고 직무 수행 가능성을 충분히 반영한다. employer screen 추정은 roleFit과 중복되고 실제 employer 선호는 불명확하므로5%만 반영한다. constraint는 일반적 fit의 추가 가중치로 섞지 않고 기존 강한 충돌 감점을 유지한다. 결과를 보고 가중치·prompt·gold를 바꾸지 않는다.

## 실행

Canonical runners: `scripts/prepareExternalDecisionsSummary.py`, `scripts/evalExternalDecisionsSummary.ts`, `scripts/reportExternalDecisionsSummary.py` (harper_beta runtime 소유). 원본은 GitHub의 고정 커밋에서 `private/source/`에 내려받는다. 별도 checkout이나 운영 DB 연결을 만들지 않는다.

```
python3 scripts/prepareExternalDecisionsSummary.py
node --env-file=.env.local --import tsx scripts/evalExternalDecisionsSummary.ts prepare
node --env-file=.env.local --import tsx scripts/evalExternalDecisionsSummary.ts run
python3 scripts/reportExternalDecisionsSummary.py
```

모델 `gpt-6-luna`, direct OpenAI `/v1/decisions`, temperature/reasoning 미지정. 최대10공고/요청, 동시6개, timeout30초, 일시 오류 최대1재시도. 기존 성공 응답은 요청 hash 확인 후 재사용하고, 응답 없는 중단 호출은 자동 재발송하지 않는다. 각 batch의 A/B 순서를 talent run hash와 반복 번호로 교차 배치한다. 완전한 API 요청·응답·attempt·request ID·usage·소요 시간을 보존한다. fit cache, 결과 기반 조기 중단, semantic-output 재시도는 없다.

## 지표와 판정

1차는 like 공고를 dislike보다 높게 둔 pair accuracy다. 같은 점수/미출력은 원본 harper_eval처럼0.5로 계산하되 누락·실패는 별도 공개한다. 각 arm의 두 반복 평균 차이에 talent 단위 paired bootstrap10,000회(seed20261015)로95% 구간을 구한다. 같은 버전 반복 차이, 정확히 복원된 Brief subset, 두 공고 모두 요약이 있는 subset도 사전 지정한다.

보조 지표는 쌍별 승/패/동점, 정규화 순위 차이, 공고별 constraint 경계 변화(정답 아님), API 입력/캐시 토큰, provider 비용 보고 또는 공식 단가 기반 추정, 건당·공고당 비용, batch latency p50/p95다. 두 번 반복된 같은 사례를 독립 표본으로 늘리지 않는다.

비용 절감률을 보고하되 품질 비열등은 paired 차이95% 하한이 -2%p보다 크고 구조 오류가0일 때만 검토한다. 이 -2%p는 이번 실험의 사전 허용폭이며 기존 공식 출시 기준이 아니다. 그 외는 악화/판정 불충분으로 보고한다. 이 평가만으로 배포나 실제 추천 품질을 승인하지 않는다.

## 비용·개인정보·저장

2026-10-20 사용자가 이 데이터 기반 실제 API 비교를 명시적으로 요청했다. 직접 OpenAI에 고정된 후보자 맥락과 공개 회사/공고 근거를 전송한다. 계정의 retention 설정은 변경하지 않았고 별도 확인하지 않았다. 운영 DB, cache, usage DB, 추천, 연락에는 쓰지 않는다.

공식 Decisions 단가는 입력100만 토큰당$0.10이며 캐시 읽기/쓰기·출력 과금은 없다. 사용량은 API 영수증으로 보고하고 금액은 provider cost가 없으면 추정값으로 구분한다. invoice 또는 계정별 청구 조정은 확인하지 않는다. timeout 등 영수증 없는 시도는 비용 미확인으로 남긴다. https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability

원문·모델 raw output·원본 ID는 `private/`, `runs/`의0700/0600 파일로만 보존한다. workspace의 raw-data 비커밋 지침이 harper_eval의 기존 raw Git 보존 관행보다 우선한다. harper_eval에는 비식별 결과, manifest, 실행 설명과 raw 위치/해시를 저장하고 결과 이슈에 링크한다. 공개 beta 등록부에는 비식별 gold, 재현 manifest, aggregate report만 둔다.

## 한계

과거 노출·반응이 있는 후보자의 선택 편향, 불완전한 과거 프로필/Brief 복원, 재생성 Behavior Context, 여러 run이 있는 동일 talent, 당시 저장된 요약의 정보 손실을 포함한다. 실제 선호 반응은 회사 채용 의사나 hard constraint의 독립 정답이 아니다. summary와 축 제거·정렬식의 효과를 분리해서 주장하지 않는다. 실제 reranker나 전체 검색 pool은 평가하지 않는다.
