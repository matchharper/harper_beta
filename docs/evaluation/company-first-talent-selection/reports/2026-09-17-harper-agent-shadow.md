# Company-first positive shadow 결과 — 2026-09-17

## 결론

한 paused internal Role을 명시적인 read-only override로 전체 production selection pipeline에 통과시켰다.
최종 run은 회사가 실제로 검토할 근거가 있는 두 명만 선택했고 최대 세 자리를 채우지 않았다. 응답 가능성은
fit을 대체하지 않았으며 회사 설명에서 private Brief·Behavior·reply score·확인되지 않은 후보 관심을
노출하지 않았다.

이 결과는 한 회사·한 엔지니어 Role의 positive pilot이다. Production rollout이나 전체 품질 향상의 근거는
아니며 frozen v2 gold도 아니다.

## 실행 경계

- Production read-only connection 사용
- paused Role은 이 shadow에서만 실행 여부를 override
- DB write, recommendation, ready row, Slack·이메일 발송: 모두 0
- Raw Profile, Brief, Behavior Context, UUID, 이름, model output은 ignored owner-only `runs/`에만 보존

## 최종 full run

| 항목 | 결과 |
| --- | ---: |
| Retrieved | 30 |
| Reply LOW 제외 | 1 |
| Scored | 29 |
| Scoring failure | 0 |
| Rerank pool | 6 |
| Selected | 2 |
| Live guard 제외 | 0 |
| 소요시간 | 368.2초 |
| 추정 LLM 비용 | $0.0468 |

Stage latency는 packet 179.6초, scoring 80.4초, rerank 31.3초, planner 27.8초였다. Packet 단계에서 범용
Profile loader가 company-first가 쓰지 않는 대화·활동·추천 이력까지 후보자별로 반복 조회하는 병목이
확인됐다.

## 선택 품질 검토

- 선택된 두 후보는 명시적 학력·경력 hard requirement와 실제 production AI agent 또는 LLM 제품 경험,
  초기 제품 ownership 근거를 갖췄다.
- 한 명은 reply HIGH, 한 명은 UNKNOWN이었다. Reply HIGH인 다른 후보도 근무 방식·보상·seniority 충돌이 더
  커 제외돼 reply confidence가 품질 판단을 덮지 않았다.
- 기술 신호는 강하지만 연구 중심이라 production 운영 근거가 약한 후보, role보다 지나치게 senior하고
  조건 충돌이 큰 후보, 스타트업 실행 근거가 약한 후보는 선택하지 않았다.
- 선정 reason은 Role과 candidate-owned evidence를 연결하고, 회사가 ownership·근무 조건·역할 방향을 먼저
  열어 판단할 이유와 caveat 하나를 설명했다.
- Scorer prompt에 A/B/C 정의와 운영 상태 비사용 원칙을 추가한 뒤 paused 메모는 fit label·reason에 섞이지
  않았다.

## 실행 중 발견하고 수정한 문제

1. `SUM`, `EXISTS`, `COUNT(*)`, derived table alias를 안전 SQL validator가 과도하게 막던 부분을 AST 범위
   안에서 허용했다. Row `SELECT *`와 relation이 project하지 않은 column은 계속 차단한다.
2. `ILIKE '%engineer%'`의 percent를 psycopg가 parameter로 오해하던 binding 오류를 수정했다. 같은 planner
   SQL 30건 retrieval을 repair 없이 재실행해 확인했다.
3. Fallback 모델 한도보다 큰 Planner `maxTokens`를 16,384로, scorer를 8,192로 낮췄다.
4. Planner temperature를 0.9에서 0.4로 낮췄다. 최종 planner-only 검증은 한 호출 23.6초, repair와
   fallback 0회, 23명 retrieval이었다.
5. 두 번째 SQL도 실패할 때 broad fallback이 150명 중 142명을 packet으로 넘기는 현상을 확인해 해당
   shadow를 쓰기 전에 중단했다. Fallback budget을 100으로 제한하고 legacy unfit/dissatisfied를 단순히
   축 값이 비었다는 이유로 우선 회수하지 않게 했다.
6. Company-first 전용 batch Profile loader를 추가했다. 29명 조회가 3.3초였고 기존 full packet의 이름,
   headline, 공개 요약, profile text와 29/29 exact 일치했다.
7. Production raw artifact serializer와 read-only dry-run Behavior Context 경로를 고쳐 shadow가 advisory lock이나
   write connection 없이 끝까지 artifact를 남기게 했다.

## 남은 gate

- 최종 개선 상태의 full-run latency 재측정
- 서로 다른 회사·직군 최소 세 곳 shadow와 selected/non-selected 수동 review
- Positive·negative·route conflict가 함께 있는 frozen v2 fixture와 human gold
- DB integration, queue/lease/outbox, candidate-first race test
- `/org` Request Intro·Pass와 후보자 lifecycle 구현 전 production enable 금지
