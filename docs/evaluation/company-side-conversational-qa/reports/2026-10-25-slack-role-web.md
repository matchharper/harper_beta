# Slack Role 초안과 첫 매칭 — 로컬 검증

2026-10-25. 웹·Worker·DB migration 미배포. 실제 Slack 발송, 운영 Role 생성, 운영 DB 쓰기는 하지 않았다.

## 모델 검증

입력은 [v38](../cases-v38.json), [gold](../gold-v38.md), [동결 manifest](../manifest-v38.json)다. 원본 회사 loop/prompt/tool schema를 Sol/high, OpenAI Responses, progressive loading, non-streaming으로 실행했다. 저장·조회 효과는 합성 adapter이며 provider 외 통신을 차단했다. 원문은 ignored `runs/20261025-slack-role-web-v38-r1` 및 `r2`에 owner-only로 보존한다.

첫 r1은 4대화 모두 실행됐으나 이전 발화를 이어받는 사례에서 새 초안 생성 뒤 `read_role`·`update_role_criteria`를 추가 시도했다. 이 두 동작은 생성 Role을 조회·수정하지 않는 합성 adapter 범위 밖이어서 오류를 반환했고 답변에 불필요한 저장 불확실성이 포함됐다. 실제 production 저장 실패라고 해석하지 않는다. 새 초안의 후속 등록은 웹에서 이어가야 하므로 기존 draft 활성화 지침과 새 초안 handoff 지침을 분리했다. 원래 결과와 동결 입력은 보존했다.

같은 입력의 최종 r2에서 전체 답변, 도구 입력·결과와 효과를 직접 검토했다. source fingerprint는 `c2cf5cbb5a8b38454a51e859ed576f2ff70adb51f0b2bb4c4ca2ce31a2d6a5b7`이다.

| 사례 | 관찰 | 판정 |
| --- | --- | --- |
| 상세 한국어 JD | 한 번 초안 생성. 공개 업무·필수/우대·근무·보상을 보존하고 작은 팀 경험 선호는 private request에만 저장. 웹 링크 안내 | 통과 |
| 간단한 의사 → 상세 답변 | 첫 발화는 역할·업무 질문, 다음 발화는 한 번 초안 생성. 미정 보상·근무 방식 미추정 | 통과 |
| 영어 JD | 영어 응답, 영국 원격·연봉·필수 영어/B2B 경험·선택 SQL 보존, 미정 seniority/reporting line 미추정 | 통과 |
| 이전 대화 이어받기 | 최근 3개 메시지 이전, SQL 업무·필수 경험·6개월 계약·원격 보존, 보상 미추정. 추가 Slack 등록 도구 없이 웹으로 handoff | 통과 |

4/4대화, 5/5발화의 필수 의미를 충족했다. 각 대화의 초안 생성은 한 번이며 활성화·검색·연락 도구 호출 0, 도구 오류 0, 허위 활성화·비공개 선호의 공개 JD 포함 0이다. 답변 문구는 고정하지 않았다. 작은 작성자 challenge이고 독립 팀원 검토·운영 분포·실제 DB/Slack/브라우저 E2E는 포함하지 않는다.

## 실행 경계 검증

- `node scripts/testRoleActivationMatching.mjs`: 실제 신규 migration SQL을 격리 PGlite에서 실행. 즉시 접수·한 번만 실행·재개/재시도·test-only/요금제/활성 상태·원본 영수증 검증·일반 정기 명령 호환·후보 전달의 요일 예외와 동의 검사·RPC 접근 제어 통과. 운영 DB나 동시성 부하 테스트는 아니다.
- Worker `test_role_matching_eligibility.py`, `test_scheduled_runner.py`, `test_role_activation_dispatch.py`: 182개 통과. 모든 요일/일정 설정, 기존 검색 경로 재사용, 잘못된 원본 거부와 응답 유실 재접수를 확인했다.
- 웹 Slack source 저장/첨부 보존/초안 재시도, 링크 보장, 기존 confirmation 상태와 tool execution 검사: 21개 통과. 새 링크 test가 잘못된 조직 ID를 사용한 초기 실패를 실제 workspace ID로 정정한 뒤 통과했다.
- 변경 production 파일의 ESLint 통과. 전체 TypeScript 검사에는 변경 범위 밖 오류 3개가 남는다: `OpportunitySwipeRow.test.tsx`의 MediaQueryList mock, `jobTitleSimilarityServer.test.ts`의 좁은 숫자 타입, `slackCandidateWorkObject.server.ts`의 grade union. 이번 변경 파일의 타입 오류는 없다.

기존 미배포 migration `20261023102919_scheduled_agentic_matching.sql`의 후보 전달 검사에서 `select exists` 닫는 괄호가 누락돼 있어 해당 구문만 보완했다. 신규 migration의 실행 검증과 일반 검색 요청 형상 유지도 확인했다. 이미 활성화된 Role의 backfill·실제 추천 완료·실제 전달·배포 성공을 이 결과로 주장하지 않는다.
