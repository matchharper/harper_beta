# Talent Behavior Context evaluation

## 목적

Memory는 확인된 사실, Search Brief는 사용자가 확인하는 현재 기준으로 유지하면서, Worker 전용 Behavior Context가 여러 원천에서 반복되는 선호·trade-off만 보수적으로 도출하는지 검증한다. 이 평가는 추천 정확도 전체를 측정하지 않는다. Behavior builder의 사실성, 과도한 일반화 방지, 정정 반영, 증분 편집 계약만 다룬다.

## 평가 단위와 데이터

- 평가 단위: production initial 또는 incremental Behavior Context 호출 1회
- dataset/gold: `cases-v1.json`, `gold-v1.json`
- 구성: 비식별 synthetic challenge 7개. 단일 좋아요, 반복 근거, 상대 날짜와 최종 면접, 상충 행동, 동일 이벤트 중복, 명시적 정정, 무의미한 증분 변경을 포함한다.
- representative traffic 표본이 아니므로 production 평균 품질이나 선호 추론 정확도를 추정하지 않는다.

사례는 사용자 경험 계약을 검증하는 회귀 입력이다. runtime에 사례별 분기·키워드 규칙·판단 상태를 추가하기 위한 자료가 아니다.

## Prompt·입력·출력 계약

Canonical runner는 `harper_worker/opp/agentic/behavior_context.py`의 현재 `INITIAL_SYSTEM_PROMPT`, `UPDATE_SYSTEM_PROMPT`, normalization, line-operation parser, structural validator를 직접 import한다. 사례의 evidence text는 같은 모듈의 실제 evidence section 형식을 사용한다. 모델이 반환한 원문과 적용 후 context를 모두 local-only run artifact에 기록한다.

```bash
cd /Users/gimhojin/Desktop/harper/harper_worker
../myenv/bin/python llm_evals/talent_behavior_context/eval.py --repetitions 2
```

모델 override는 `--model`로 주며, model/provider/reasoning 또는 prompt만 바꾸면 같은 v1 dataset에 새 run을 만든다. 사례나 review gold를 바꾸면 새 dataset version을 만든다.

## Metrics와 release gate

자동 검사는 machine contract만 담당한다.

- 호출/구조 검증 성공 100%
- initial 출력은 정확한 네 heading, 6,000자 이하, 한 줄 한 bullet
- update 출력은 `UNCHANGED` 또는 유효한 line operation이며 적용 후 구조가 유효함
- case에 명시된 unsupported concrete claim의 직접 출현 0건

정성 gate는 `gold-v1.json`에 따라 사람이 raw output을 읽고 판정한다.

- 말하지 않은 날짜·이유·역할 속성·면접 형식·위치·근무 방식을 만든 critical fabrication 0건
- 단일 반응이나 같은 이벤트의 중복 저장을 반복 선호로 일반화한 사례 0건
- 상충 근거와 불확실성을 지운 사례 0건
- 정정된 내용을 낡은 추론으로 유지한 사례 0건
- Memory/Brief의 사실을 Behavior에 단순 복사한 사례 0건

작은 challenge set에서 문장 품질이 좋았다는 이유만으로 production release를 결정하지 않는다. production에서는 builder error율, 재생성 latency·비용, context 길이, downstream 추천 회귀를 별도로 관찰해야 한다.

## 최근 실행 결과

2026-09-09에 `gpt-5.6-luna`와 최종 prompt fingerprint `44f6979c1505…`로 v1 전체를 독립적으로 두 번 실행했다. 총 14회 호출 모두 구조 검증을 통과했고 unsupported concrete claim 직접 출현은 0건이었다. 수동으로 raw output을 대조한 결과 critical fabrication, 단일 반응·중복 이벤트의 반복 선호 일반화, 상충 근거 삭제, 정정된 stale 추론 유지, Memory/Brief의 단순 복사는 각각 0건이었다. 무의미한 증분 변경은 2/2 `UNCHANGED`였고, 명시적 기준 정정은 2/2 기존 추론을 삭제했다.

두 최종 run의 합산 추정 API 비용은 $0.0066954였다. 이 값은 7개 짧은 synthetic case의 비용이며 실제 전체 이력 재생성 비용이나 production 평균을 뜻하지 않는다. Raw output과 usage는 각각 local-only `run-g.json`, `run-h.json`에 보존했다.

## 재현성과 provenance

`manifest-v1.json`은 dataset/gold hash, 사례 분포, canonical runner와 privacy 경계를 기록한다. 각 run artifact는 실행 시각, worker HEAD와 dirty diff fingerprint, prompt fingerprint, model/provider 설정, raw output, 적용 결과, usage·비용을 기록한다. 동결된 v1 파일은 모델 결과에 맞춰 덮어쓰지 않는다.

## Privacy와 안전

모든 v1 입력은 synthetic이며 실명, 이메일, 실제 회사 제안 원문, UUID가 없다. 외부 provider에는 이 synthetic evidence와 production prompt만 전송한다. Runner는 DB를 열지 않고 DB write, 추천 저장, 메시지·메일 발송을 하지 않는다. Raw model output은 `harper_worker/llm_evals/talent_behavior_context/results/`에 owner-only로 저장하고 Git에 포함하지 않는다.

## 알려진 제한

- synthetic challenge는 실제 데이터의 잡음, 장문 분포, 한국어·영어 혼합을 대표하지 않는다.
- case별 unsupported phrase 검사는 명백한 concrete fabrication을 빠르게 찾는 보조 검사일 뿐 의미 품질 judge가 아니다.
- downstream internal/external fit과 최종 추천이 Behavior를 알맞게 해석하는지는 해당 stage 평가와 통합 테스트가 따로 필요하다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-09 | 최종 prompt를 v1 전체에 두 번 실행해 자동 gate와 수동 critical review를 통과했다. |
| 2026-09-09 | Memory/Brief와 분리된 Worker용 soft inference cache의 initial·incremental v1 challenge set과 canonical runner 계약을 등록했다. |
