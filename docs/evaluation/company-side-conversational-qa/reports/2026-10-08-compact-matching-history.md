# 검색 이력 간소화 검증

2026-10-08. 로컬 구현 검증이며 배포·운영 DB 변경·실제 추천 발송을 하지 않았다.

## 변경과 재현

- 우선 검토 요청도 일반 후보자와 동일한 2차 완료 및 세 fit의 bad/unfit 제외 조건을 적용한다. 후보 pool, 가용 경로, 최종 출력 계약에서 우회를 제거했다. 기존 약한 rerank 우대와 역할당 3명 한도는 유지한다.
- 회사 이력의 집계를 실행 일시·계기, 전체 검토 인원, 양 방향 선정 인원으로 줄였다. 기존 인원 집계를 읽어 다중 역할의 평가 쌍을 사람 수로 중복 집계하지 않는다.
- 당시 연결 대기 상한 사실·기록 누락·이전 페이지 조회는 유지한다. 전체 history 마지막에 사용자가 지정한 개인정보 보호 문장을 한 번 제공한다.
- 코드 검증: Worker 관련 121건, 회사 history/result context 21건 통과. 운영 자격증명 없는 mock 검증이다.

동결된 v17 입력·gold·manifest를 수정하지 않고 기존 canonical runner로 새 run을 실행했다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v17 --run=2026-10-08-compact-history-r2
```

두 run 모두 현재 production 대화 loop, history reader/formatter, read-only 합성 table adapter를 사용했다.
모델은 Gemini 3.8 Flash/OpenRouter, medium reasoning, temperature 0.5다.
raw 입력·출력·source fingerprint·설정은 ignored owner-only `runs/2026-10-08-compact-history-r1/` 및 `runs/2026-10-08-compact-history-r2/`에 보존한다.

## 실제 답변 검토와 한계

| Run | 실행 | 전체 사전 정답 검토 | 관찰 |
| --- | --- | --- | --- |
| r1 | 3/3 | 1/3 | 최신 이력 답변에서 선정 2명을 실제 전달한 것으로 확대했다. 미기록 답변은 후보자 측 선정 0명이라는 확인된 집계를 생략했다. |
| r2 | 3/3 | 2/3 | 입력의 공통 안내에서 선정과 실제 발송 사실의 경계를 더 명확히 했다. 최신·이전 페이지 답변은 14명/10명 및 후보자 경로만 제한됨을 정확히 설명했다. 미기록 답변은 과거 수치와 원인을 만들거나 개인정보 제한과 혼동하지 않았지만 선정 0명 집계는 여전히 생략했다. |

최신 답변의 핵심 상한 사실·미기록 경계는 3/3 정확했으나, v17의 전체 3/3 gold gate 통과로 보고하지 않는다.
미기록 사례의 선정 집계 생략 및 과도한 부가 안내는 남은 대화 품질 한계다. 구현자 검토이며 독립 팀원 검토가 아니다.
실제 DB/SQL·메일·Slack 전달, 동시성, 운영 모집단 성능을 증명하지 않는다.
