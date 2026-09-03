# Wonderful internal-role ranking benchmark

## 목적

Wonderful Korea의 FDE와 Field CTO를 대상으로 retrieval, reranking, 최종 role placement가 실제 후속 진행 후보를 blind 상태에서 다시 찾는지 평가한다. 단순 LLM 응답 비교가 아니라 matching pipeline 전체의 holdout benchmark다.

## Canonical assets

- 전체 실행 계약, blind/unblind 절차, metric과 안전 경계: [Wonderful Korea benchmark 매뉴얼](../../wonderful-korea-fde-field-cto-benchmark-manual-ko.md)
- 연결된 일반 matching 계약: `harper_beta/scripts/internal-company-role-talent-matching-manual-ko.md`

## 실행 조건

이 README나 매뉴얼을 읽는 것은 실행 권한이 아니다. Canonical 매뉴얼에 정의된 형식으로 사용자가 benchmark 실제 실행을 명시한 경우에만 시작한다. Prediction과 hash를 먼저 고정한 뒤 outcome을 unblind하며, unblind 뒤 prediction을 수정하지 않는다.

## 버전과 metric

- Dataset은 source role snapshot, candidate pool, redaction pattern, prediction hash와 ground-truth eligibility 계약으로 식별한다.
- Retrieval recall, reranking recall, exact role-pair hit, person-level overlap, cross-role placement와 funnel outcome을 분리한다.
- 모델이나 ranking prompt만 바꾸면 같은 frozen benchmark에 새 run을 추가한다. Source role, pool, gold eligibility 또는 redaction이 바뀌면 새 version이다.

## 안전과 한계

Benchmark는 항상 dry-run이며 fit/recommendation/discovery run/메시지/메일을 쓰지 않는다. Protected trait와 source outcome leakage를 사용하지 않는다. Production에 clone role을 만들게 되는 실행은 `testOnly`, stable `testFixture`, worker guard를 모두 충족해야 한다. Current-data retrospective에는 outcome 이후 profile 변화가 섞일 수 있으므로 causal backtest로 표현하지 않는다.

