# 점수 단위·필수조건·국가 배분 검증 — 2026-10-14

이번 변경은 로컬 V2 구현이다. 웹/worker 배포, 운영 fit 재평가·추천 저장, DB 스키마 변경은 하지 않았다. 국가 배분 확인은 운영 read-only 검색만 실행했다. 기존 control과 후보자별 고정 cohort는 유지한다.

## 변경 계약

- 5개 수치 metric은 모두 0–100. OpenAI predicate/Jev noul 원본은 API 계약대로 0–1이고 공통 adapter가 ×100, 5단계 score는 ×25 한다. 원본 raw는 보존한다.
- Rerank metric과 종합점수는 소수점 첫째 자리까지 버림하며 저장값은 유지한다. 예시 입력은 candidateInterest34, companyInterest67, mutualFit28, roleFit64.2, constraintPass100, priorFit.score37.4로 전달된다.
- constraintPass≤50이면 기본 종합점수에 `0.2×(constraintPass/50)^2`를 곱한다. 50 초과는 감점하지 않는다. 이 점수로 summary 상위100/최종 후보20을 고르며 낮은 fit도 모두 저장한다. 필수조건 판단은 최신 Brief의 의미와 근거를 읽는 모델에 맡기며 별도 단어 매칭은 없다.
- 국가별 ISO alpha-2 코드·가중치·remoteOnly를 planner가 출력한다. SQL exact match 뒤 국가별 quota를 우선 채우고 부족분만 허용 국가 사이에 재배분한다. 근사 제목 pool 내 가용 수가 부족하면 목표 비율/개수는 보장하지 않는다. NULL/미지정 국가는 제외한다.
- 평가 version과 검색 plan version을 구분해 올렸다. 과거 혼합 단위 fit은 재사용하지 않고, 국가 계약 없는 default는 문맥으로 제공한 뒤 planner가 새 계획을 만든다. 제목이 같으면 vector는 재사용한다.

## 자동 검증

`src/lib/externalRecommendationsV2/*.test.ts`: **28/28 통과**. 실제 embedded Postgres/pgvector에서 200개=KR160/US40, 500개=KR400/US100, US 원격만 포함, 국가 미상/목록 밖 제외, US 부족 시 KR로만 재배분을 확인했다. 기존 가용성·차단·testOnly·기추천·부분 실패 저장 경계도 통과했다. default reuse/explore/replace의 쓰기 여부, revision 조건, 옛 기본값 갱신과 같은 vector 재사용을 확인했다. 마지막 planner prompt 보강 뒤 engine 6개를 다시 실행해 통과했다.

전체 TypeScript 검사에는 이번 변경 경로 밖의 기존 오류24개/6파일이 남아 있다: org/signup, careerCoachingActivity, contentsEngine/outreach, ops/matching, org/agent/roleMatchingHealth, org/server. 이번 external V2 경로의 타입 오류는 없었다. 전체 프로젝트 검사가 통과했다고 주장하지 않는다.

## 실제 API — 기존 frozen v1

Run: `runs/2026-10-14T04-09-01-477Z`.

| 제공자 | 유효 역할 | 기존 ordinal 비교 | 필수조건 충돌 / 충돌 없음 | 평가 합산 시간 | 확인된 평가 비용 |
|---|---:|---:|---:|---:|---:|
| OpenAI | 13/13 | 8/8 | 0 / 100 | 4.44초 | $0.0052441 |
| Jev | 13/13 | 8/8 | 6 / 96 | 2.01초 | $0.002079126 |

실제 planner·요약·rerank를 연결한 합성 웹 단계는 10개를 넣어5개 선택했다. 최종 선택은 요약과 compact facts/점수를 사용했으며 JD 원문은 전달하지 않았다. 이 단계 시간/비용은 위 scoring 비용에 포함되지 않는다.

## 실제 API — 새 frozen v2 조건부 해외 근무

한국어 Brief: 국내 출근 가능, 해외는 한국에서 원격 가능한 공고만, 이번 검색 KR80%/US20%. 같은 회사/업무 품질 근거에 근무 조건만 바꾼 합성3개다. 기존 v1을 덮어쓰지 않았다.

첫 run `runs/2026-10-14T04-13-00-598Z`에서 scoring/최종 선택은 적절했으나 planner가 일회성 국가 비율을 `replace`로 저장하려 했다. Brief에 들어 있다는 사실만으로 일회성 조건을 durable default로 승격하지 않도록 prompt를 보강했다. 코드에 특정 문구 분기는 추가하지 않았다.

최종 run: `runs/2026-10-14T04-14-02-568Z`.

| 역할 | OpenAI constraintPass | Jev constraintPass | 최종 선택 |
|---|---:|---:|---|
| 한국 출근 | 100 | 94 | 선택 |
| 미국 현지 출근 필수 | 1 | 17 | 제외 |
| 미국 공고, 한국 원격 고용 명시 허용 | 100 | 95 | 선택 |

두 제공자 모두3/3 유효, ordinal2/2와 경계3/3 통과. 최종 planner는 `explore`, KR0.8/remoteOnly=false, US0.2/remoteOnly=true를 반환했다. Rerank는 OpenAI scoring을 입력받아3개 중2개를 선택했다. Jev 점수로 별도 rerank를 반복한 결과는 아니다. 원본 응답·입력·manifest는 ignored owner-only run에 보존한다. 한 번의 prompt 보강 성공을 전체 default 판단의 완전한 안정성으로 해석하지 않는다.

## 운영 데이터 검색 (읽기 전용)

별도 frozen `private/country-quota-retrieval-v1/`은 이전 capture의 첫 후보자/제목 vector를 복사하고 KR80%/US20%, US remoteOnly를 지정한 진단 입력이다. 실제 후보자의 새 선호라고 주장하지 않는다. 기존 원본/hash/provenance는 manifest에 남겼다.

- `retrieval-2026-10-14T04-09-43-602Z`: EXPLAIN ANALYZE, DB10.956초, 200개. 대부분 ANN 제목 index/공고 읽기 시간이다. 국가별로 ANN 호출을 반복하지 않고 같은 SQL에서 할당했다.
- `retrieval-2026-10-14T04-11-02-699Z`: 실제 RPC 결과 **KR160/US40**, US 현장 공고0개. 연결과 전송 포함14.68초. DB 실행 시간과 직접 비교하지 않는다.
- 이 수치는 운영 부하/캐시 상태에 영향을 받는 표본1개다. 기존 측정의 같은 표본은 cold10.57초/warm1.44초였으므로 이번 변경이 검색을 더 빠르게 했다고 주장할 근거는 없다. 국가 배분 때문에 나라 수만큼 검색 왕복을 추가하지 않았음을 확인한 결과다.

실제 사용자 추천의 최종 선택 수 개선, 전체 국가 재현율, A/B 성능·비용 우월성은 배포 후 별도 측정이 필요하다. 기존20개 중 해외 공고가 섞였던 production pilot을 새 scoring으로 전량 재실행한 결과는 아니다.
