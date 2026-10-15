# 강한 필수조건 충돌 경계 검증 — 2026-10-14

로컬 V2의 constraintPass 범위를 명확히 했다. 감점식·검색·호출 수·DB 구조는 바꾸지 않았고 배포나 실제 추천 저장/발송도 하지 않았다. Worker와 recommend_job_postings는 동일한 질문/평가 adapter를 사용한다.

## 변경

기존 `fitQuestions.v2.json`을 보존하고 v3로 복사했다. constraintPass≤50은 명시적 비협상 조건 위반, 충족 불가능한 필수 자격 또는 책임 범위와 배경의 예외적으로 큰 격차처럼 강하고 입증된 진입 불가 충돌에만 사용한다. 인접 직무, 일반적인 기술·seniority·요구 연차 차이, 정보 미확인은 그것만으로 gate를 실패시키지 않는다. 낮은 roleFit을 hard conflict로 다시 해석하지 않는다. 실제 역할 책임과 전이 가능한 경험으로 판단하며, 특정 연차 차이의 숫자 cutoff나 키워드 분기를 추가하지 않았다.

roleFit 질문과 rerank metric 설명에도 같은 구분을 반영했다. 강한 충돌로 평가된 경우의 기존 비선형 감점은 유지한다. cache version을 `external-fit-questions-v6-strong-constraints`로 올려 예전 기준 점수를 재사용하지 않는다. 기존 평가를 삭제하지 않으며 다음 평가가 새 버전으로 저장된다. 이 때문에 기존 캐시만 있던 pair는 다음 실행 때 재평가 비용이 발생할 수 있다.

## 실제 모델 결과

새 frozen v4는 후보자1명×역할10개다. v1/v2/v3와 기존 gold는 수정하지 않았다. 각 제공자는 실제 production 입력 formatter와 Decisions adapter로 평가했다. 비교 점수는 다음과 같다(0–100).

| 사례 | OpenAI constraintPass | Jev constraintPass | 강한 감점 |
|---|---:|---:|---|
| 경력·조건이 맞는 백엔드 역할 | 100 | 95 | 없음 |
| 백엔드 → 인접 데이터 플랫폼 업무 | 99 | 94 | 없음 |
| 경력6년, 공고 요구8년의 IC 역할 | 97 | 84 | 없음 |
| 익숙하지 않은 Java/Kafka 스택 | 82 | 87 | 없음 |
| 보상 미공개, 후보자가 확인 후 판단 가능 | 84 | 90 | 없음 |
| 원격만 가능한 후보자에게 출근 필수 | 3 | 6 | 적용 |
| 불가능하다고 한 야간·주말 당직 필수 | 1 | 6 | 적용 |
| 명시적 최저보상보다 확정 상한이 낮음 | 1 | 7 | 적용 |
| IC6년, 대규모 임원 조직·25년 경험 요구 | 9 | 20 | 적용 |
| 면허가 없는 후보자에게 면허 필수 진료 업무 | 0 | 6 | 적용 |

양쪽 모두10/10 경계와2/2 capability ordinal 비교를 통과했다. 일반 연차 차이 사례의 roleFit은 OpenAI45.2/Jev54.5로 평가되어 일반 fit 차이는 남지만 constraintPass 기반의 별도 강한 감점은 받지 않는다. 이는 추천 확정이나 해당 fit 점수의 정확성 인증이 아니다.

기존 frozen v2 조건부 해외 근무 회귀도 각 제공자3/3 경계·2/2 ordinal 비교를 통과했다. 한국 출근 허용100/94, 미국 출근 필수0/16, 한국에서 원격 허용100/94였다(OpenAI/Jev 순서). 허용한 국내 출근까지 hard conflict로 오해하지 않았다.

## 실행 근거와 한계

- V4 run: `runs/2026-10-14T04-44-39-924Z`; OpenAI10/10 유효, Jev10/10 유효.
- V2 회귀 run: `runs/2026-10-14T04-44-51-014Z`; 각3/3 유효.
- 공통 V2 자동 테스트30/30 통과. 새 prompt의 단어 유무를 검사하는 테스트 대신 frozen 실제 모델 경계 평가를 사용했다.
- Canonical runner, 모델/입력/개인정보 경계, frozen provenance와 hash는 [registry](README.md)의 v4 계약을 따른다. 실제 모델 출력과 request/usage는 ignored owner-only run에만 저장했다.

제공자별13개씩의 합성 경계 사례이며 일반적인 운영 정확도나 추천 성능을 보장하지 않는다. 다른 metric의 제공자 간 차이와 calibration은 별도 문제다. 이번에는 scorer와 기존 계약 테스트를 검증했으며 새 prompt로 운영 후보 전체 재평가나 실제 사용자 추천 E2E를 실행하지 않았다. Rerank prompt 설명은 맞췄지만 v4 실제 rerank 선택을 새로 측정한 결과는 아니다.
