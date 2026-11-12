# 회사 검색 연속 검증 v1

2026-10-23 사용자가 지정한 기존 역할의 로컬 검증. 첫 단위 J02는 현재 기준 전체 검색과 회사 선추천 10명 요청이다. 후속 UI criteria 변경·정기 실행·강한 조건 승인 전후는 동일 로컬 데이터의 연속 관찰로 기록한다. 국적 기반 배제 단계는 실행하지 않는다.

- 입력/기대: cases-journey-v1.json, gold-journey-v1.json, manifest-journey-v1.json. 호출 전 hash 동결. 특정 출력 문구/후보를 정답으로 주입하지 않는다.
- 자료: 기존 legacy-source-v1 실제 역할·후보 capture와 bootstrap-v3. 사용자 지정 기존 역할이며 paid Slot 검증으로 표시하지 않는다. 원본과 과거 실행을 덮어쓰지 않는다.
- 정본 실행: scripts/evalCompanyAgenticRoleSearch.ts → Worker llm_evals/company_agentic_role_search/run_scoring.py. 제품 기본 모델·실제 Decisions 및 writer를 사용한다. 각 run의 source/config/request/response/usage를 보존한다.
- 지표: 전후 추천 집합의 유지/제외/추가, 평가 단계별 실제 인원, criteria version/content, 승인 전후 변경 여부, 실제 메시지와 전달 receipt. 성공률을 모집단 정확도로 표현하지 않는다.
- Gate: 권한·공개 범위 위반, 무단 연락, 기존 결정 훼손, 미완료의 완료 주장 0. 정성 답변은 전체 원문을 직접 읽는다.
- 경계: 원문과 출력은 ignored runs에 0700/0600. 운영 쓰기·외부 Slack/메일·배포 없음. API provider는 기존 승인 경로 api.openai.com/api.anthropic.com/openrouter.ai. 운영 인증·비동기 알림은 별도 미검증이며 로컬 transport 대체는 기록한다.

브라우저 연속 관찰의 queue 소비·원문/상태 보존 정본은 `scripts/companySearchJourneyCompanion.ts`다. `--sandbox=<새 브라우저 run> --run=<새 결과 run> --action=consume --history=<실제 저장 ID> --job=<실제 생성 ID>`로 실제 summary/web-action processor를 호출한다. DB는 localhost 평가 사본만 허용하고 외부 전달은 차단한다. UI와 실제 HTTP 저장은 브라우저로 확인한다. 정기 SQL의 실제 적용 실패는 우회하지 않고 별도 실패로 보고한다.

## 연속 관찰의 실행 경계

- `journey-v1-search-r4/J02`의 성공한 검색 DB를 별도 로컬 브라우저 사본으로 이어간다. 초기 실패와 준비 기록은 `journey-v1-search*`, `journey-schema-v1`에 보존한다. 역사적 auth stub에는 SQL 해석에 필요한 nullable 열만 보완했으며 실제 인증·RLS를 통과했다고 표시하지 않는다.
- UI는 실제 Next.js 화면과 저장 API를 사용한다. 큐의 전송 부분은 로컬 직접 소비로 대체하고, 동일 실제 summary/web-action processor와 검색 Worker를 호출한다. 따라서 자동 요청 생성과 처리 결과는 검증하지만 운영 큐의 지연·복구·전달은 검증하지 않는다.
- 검색 완료 알림은 로컬 `/api/internal/company-first/result-notice`를 명시 호출해 실제 회사 LLM·웹 메시지 저장까지 관찰한다. 이 수동 호출을 운영 dispatcher의 자동 호출 증거로 사용하지 않는다. Slack의 `not_configured` 상태를 발송 성공으로 계산하지 않는다.
- 일반 기준 변경은 평가 항목 1개 삭제·1개 추가다. Hiring Brief 원문은 UI가 별도로 보존하므로 삭제한 항목과 유사한 문장이 Brief에 남는지도 별도 기록한다.
- 근속 조건 변경과 후속 원문 `그래도 해`는 순서대로 관찰하고, 각 경계의 추천 집합을 보존한다. 기대 답변이나 후보 집합을 모델에 주입하지 않는다. 사용자 기대인 승인 전 목록 보존·대안 제시 여부는 출력 전체와 실제 DB 변화로 판정한다.
- 정기 검색은 새 `scheduled_agentic_role_search_v1` 경로를 대상으로 한다. SQL 준비 실패와 실제 enqueue 경계 실패는 함께 남긴다. 기존 정기 경로의 성공으로 새 경로의 실패를 대체하지 않는다.

## 이번 관찰 결과

2026-10-23의 단일 연속 관찰이다. 세부 원문과 집합 비교는 `runs/journey-final-v1/summary.json` 및 `evidence-manifest.json`에 있다. 일반 성공률이나 운영 배포 상태로 확대하지 않는다.

- 전체 검색: 추천 14명에서 7명 제외·3명 추가, 최종 10명. 새 1차 평가 2,922명, 2차 평가 326명, 설명 작성 10명.
- 일반 Criteria 변경: 6개에서 1개 삭제·1개 추가. 737명 재평가, 기존 추천 10명에서 3명 제외·3명 추가. 최종 10명 모두 새 기준 설명을 저장했으며 웹 표시를 확인했다. 삭제한 구조화 기준과 유사한 문장은 변경하지 않은 Hiring Brief에 남았다.
- 완료 알림: 로컬 내부 API를 호출한 뒤 웹 채팅에 실제 회사 LLM의 완료 메시지 1건을 확인했다. Slack은 `not_configured`이며 실제 외부 발송은 0건이다.
- 새 정기 경로: 정의되지 않은 `company_internal_roles.slack_notifications_enabled` 참조로 준비 SQL과 실제 enqueue 호출이 실패했다. 이 시도에서 추천·메시지는 생성되지 않았다.
- 현재 회사 10년 이상 조건: 후속 승인 전에 10명 중 6명이 교체됐다. 2차 평가 380명의 해당 기준 라벨은 conflict 372명·uncertain 8명이었고, 최종 추천 10명 모두 conflict였다. 대안 제시와 승인 대기는 없었다.
- 후속 원문 `그래도 해`: 새 검색 0건, 추천 집합 변경 0명, 기준 변경 없음. 응답은 특정 후보의 Intro 요청 발송 확인으로 이어졌다. 전송 승인까지 진행하지 않았으며 실제 연락은 없다.

제품 코드·운영 DB·배포는 변경하지 않았다. 평가 등록·로컬 관찰 도구와 비공개 실행 증거만 추가했다.
