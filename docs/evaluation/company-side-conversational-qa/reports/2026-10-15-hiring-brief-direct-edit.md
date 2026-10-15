# Hiring Brief 직접 편집 — 로컬 검증

2026-10-15. 미배포이며 운영 데이터 변경 없음.

`role_request`의 강제 proposal 생성과 역할 편집 policy의 직전 제안 동의 제한을 제거했다.
원본 company-side LLM이 전체 대화에서 수정 요청을 판단해 일반 변경 입력으로 저장한다.
기존 대기 Brief는 현재 저장본을 읽어 일반 변경으로 처리하도록 안내한다.
권한·타입·원문 부분 수정·동시 수정 충돌 경계는 유지하며 다른 작업의 승인 계약은 변경하지 않는다.

- `node --import tsx --test src/lib/org/agent/companyDataMutation.test.ts src/lib/org/agent/toolExecution.test.ts`: 42/42.
- 기존 frozen `role-criteria-v1`: `20261015-brief-direct-r1`, 구조 4/4 및 답변 원문 검토.
  Criteria 작성/보존과 등록 확인 횟수는 기대와 일치했다. RC01의 `동료` 표현과 RC04의
  일반 후속 안내는 기존 문체 한계로 기록하며 이 작업에서 별도 수정하지 않았다.
- 이 frozen 평가는 역할 작성 경로의 인접 회귀 확인이다. 변경한 일반 `update_data`에서
  중간 대화를 건너뛴 동의를 해석하는 품질이나 실제 DB 저장·Slack 전달을 검증하지 않는다.
- run manifest·출력·검토는 ignored owner-only `runs/20261015-brief-direct-r1/`에 보존한다.
