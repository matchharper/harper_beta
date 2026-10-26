# 과거 실행 조회와 재검색 없는 목록 교체 — journey-v4

- 목적·단위: 하나의 실제 Role에서 과거 실행 조회 → 기존 8명 유지·2명 교체 제안 → 승인 후 반영 → 같은 과거 실행 재조회까지 3개 사용자 발화를 검증한다.
- 동결 입력·gold: `cases-journey-v4.json`, `gold-journey-v4.json`, `manifest-journey-v4.json`. 모델 호출 전에 파일 hash를 동결한다. 후보 ID는 gold나 대화에 지정하지 않는다. v1–v3와 실패 실행은 덮어쓰지 않는다.
- 원본·개인정보: 앞서 승인된 `private/legacy-source-v1`과 실제 모델 평가·추천 10명이 보존된 `runs/journey-step3-source-v2/baseline.json`을 재사용한다. 정본 `harper_worker/llm_evals/company_agentic_role_search/prepare_baseline.py`가 사본에서 scope=evaluated, recommendCount=0으로 기존 평가 참조·당시 추천 풀을 새 실행에 기록하고 동결한다. 이는 새 검색·평가가 아니며 과거 실행의 누락 기록을 소급 생성하지 않는다. raw 데이터·원문·출력은 ignored `runs/`에 0700/0600으로 보관한다. 모든 쓰기와 전달은 로컬 사본에 한정한다.
- 구조 검증 정본: `python3 scripts/verifyCompanyRoleHistoryRun.py docs/evaluation/company-agentic-role-search/runs/<run>`. 저장된 도구 호출·상태 snapshot·source hash를 비교하며 모델 호출이나 DB 쓰기를 하지 않는다. 답변 의미 검토를 대신하지 않는다.
- 정본 runner: `scripts/evalCompanyAgenticRoleSearch.ts --baseline=history-evidence-source-v4 --dataset-manifest=manifest-journey-v4.json --only=H01 --preserve-cases=H01 --acknowledge-source-condition=legacy-approved-by-user`. 실제 회사 모델/tool executor, 실제 PostgreSQL/PostgREST, 실제 Worker를 사용한다. 후보 선택은 원본 회사 LLM이 수행한다. 실행 barrier는 평가 harness이며 제품의 비동기 전달을 대체 검증하지 않는다.
- prompt·모델 계약: 회사 기본 모델과 실제 3차 소개문 writer를 사용한다. 과거 run의 기준·평가·순위·당시 풀은 고정 사실, 현재 풀·권한·프로필은 조회 시 사실로 구분한다. 같은 Brief의 sourceRunId는 저장된 평가를 재사용하며 다른 Brief는 암묵적으로 현재 평가로 바꾸지 않는다. 모델 버전·prompt/source hash·usage는 run manifest/raw provider payload에 보존한다.
- 지표·gate: 첫 발화 변경 0; 승인 후 유지 8·제외 2·추가 2·최종 10; 선택 ID 일치; 새 검색 및 1·2차 평가 0; 과거 기록 불변; 보호되는 결정·연락 변화 0; runtime source drift 0. 실제 도구 호출과 DB 집합을 비교하고 답변 의미는 직접 검토한다. 예상 문구·키워드로 출력을 교정하지 않는다.
- 한계: 단일 로컬 사본과 하나의 대화 흐름이며 운영 인증/RLS·실제 Slack/이메일 전달은 검증하지 않는다. 과거에 evidence가 없던 실행은 자체 평가만 조회 가능하며 당시 전체 추천 가능 목록을 복원했다고 주장하지 않는다. 과거 프로필은 복제하지 않고 점수와 기준만 보존한다. 현재 비공개 후보는 조회 시 숨긴다. 다른 Brief·누락 참조·변경된 풀은 별도 구조 테스트로 확인한다.

## 2026-10-24 실제 로컬 검증 결과

`runs/journey-v4-history-reuse-r2`에서 실제 회사 LLM·도구·Worker로 3개 발화를 완료했다. 대화 중 웹/Worker runtime 및 보조 source 변경은 모두 0건이다. 상태 비교 정본은 ignored `structural-review.json`, 원문 의미 검토는 `semantic-review.json`이다.

| 확인 항목 | 관찰 결과 |
| --- | --- |
| 승인 전 비교·제안 | 기존 10명 유지, 제외 0명·추가 0명 |
| 승인 후 회사 추천 풀 | 기존 10명 → 유지 8명·제외 2명·추가 2명 → 최종 10명 |
| 실제 선택 | 원본 회사 LLM이 선택한 10개 ID 및 과거 실행 ID와 발행 결과 일치 |
| 보존된 당시 신규 추천 가능 목록 | 전체 698명, 첫 조회는 Top 50. 이후 페이지 조회 가능 |
| 고정 평가 참조 | 당시 1·2차 평가 행 4,157개. 원본 실행의 기준·result와 기존 평가 행 전체 변경 0건 |
| 새 검색·평가 | 검색 요청 0건·새 1차 평가 0건·새 2차 평가 0건. 발행 실행 1건에서 선택한 10명의 3차 소개문 작성 |
| 재조회 | 동일 과거 실행의 기준·후보 순위·점수·당시 추천 풀 불변, 현재 풀은 교체 결과와 일치 |
| 기존 결정·진행·후보자 연락 | 변경 0건 |
| 구조 테스트 | 웹 33개·Worker 58개·실제 PostgreSQL 4개, 총 95개 통과 |

최초 실행 `journey-v4-history-reuse-r1`도 기능상 같은 유지·교체·재조회 결과를 얻었으나 다른 작업에서 `roleStart/rubricUpdate.ts`가 실행 중 변경되어 source 고정 gate를 통과하지 못했다. 이 기록을 보존하고 같은 동결 데이터로 r2를 다시 실행했다. r2는 해당 gate도 통과했다.

전체 TypeScript 검사에는 변경 범위 밖의 기존 진단 3개(`OpportunitySwipeRow.test.tsx`, `jobTitleSimilarityServer.test.ts`, `slackCandidateWorkObject.server.ts`)가 남아 있다. 이번 변경 파일의 타입 진단은 없었다. 운영 배포·운영 데이터 변경·외부 메시지 전달은 수행하지 않았다.

기존에 전체 후보 참조가 저장되지 않은 옛 실행은 그 실행에 직접 저장된 평가만 조회한다. 새로 완료한 실행부터 전체 당시 목록을 보존하며, 과거에 없던 이력을 소급해서 완전하게 복원하지 않는다. 현재 공유 권한은 과거 조회에서도 적용하고, 다른 Brief의 점수를 현재 기준의 평가로 바꾸지 않는다.
