# 회사 LLM 선정과 강한 조건 논의 — journey-v3

- 목적·단위: 기존 실제 Role의 추천 10명 상태에서 현재 회사 연속 20년 조건 변경, 실제 평가 완료 사건, 명시적 조건 유지 후 목록 반영까지 2개 사용자 발화와 비동기 후속 대화를 관찰한다. 일반 추천 정확도나 운영 배포 검증은 아니다.
- 동결 입력·gold: `cases-journey-v3.json`, `gold-journey-v3.json`, `manifest-journey-v3.json`. 호출 전에 hash를 동결한다. 실제 후보 ID나 기대 추천 인원은 모델에 제공하지 않는다. 이전 journey-v1/v2 결과는 보존한다.
- 원본·개인정보: 앞서 승인된 `legacy-source-v1` 및 2번 검색 완료 상태인 `runs/journey-step3-source-v2/database.dump`를 재사용한다. 실제 활성 paid Slot과 legacy 유료 권한을 구별한다. 모든 DB 쓰기와 전달은 로컬 사본에 한정하고 raw 프로필·대화·출력은 ignored `runs/`에 0700/0600으로 보관한다. 기존 실제 모델 provider 호출만 허용한다.
- 정본 runner: `scripts/evalCompanyAgenticRoleSearch.ts --baseline=journey-step3-source-v2 --dataset-manifest=manifest-journey-v3.json --only=J06 --preserve-cases=J06 --acknowledge-source-condition=legacy-approved-by-user`. 실제 회사 tool loop와 Worker `llm_evals/company_agentic_role_search/run_scoring.py`를 재사용한다. `deliverCompletionNotices`는 실제 result-notice route와 company-update 처리기를 실행하며 외부 큐 transport만 로컬 직접 호출로 대체한다. 자동 dispatch 반복은 평가 harness에만 있으며 제품의 대화 판단을 대신하지 않는다.
- 모델·입력 계약: 회사 제품의 기본 모델, 1·2차 Decisions와 3차 writer를 사용한다. 초기 Top 50은 상호 적합성 순이며 현재 미결정 카드는 별도로 전원 포함한다. 상세 조회는 원본 LLM의 선택이다. prompt·source fingerprint·실제 모델/provider 요청·시간·사용량은 run manifest와 원문에 기록한다.
- 지표·gate: 조건 원문 보존, 검색 직후 추천 변화 0, 완료 입력의 통계/Top/현재 풀 포함, 실제 분포에 근거한 조건 논의, 명시적 선택 ID와 최종 목록의 일치, 기존 결정·진행 및 외부 연락 변화 0. 선택 도구 호출 전후의 추가·제외·유지·최종 인원을 실제 집합으로 비교한다. 응답 의미는 직접 검토하며 정규식이나 고정 답변으로 합격시키지 않는다.
- 알려진 한계: 단일 실제 Role의 challenge case다. 과거 snapshot 이후 신규 가입·프로필 변경은 반영하지 않으며 운영 인증/RLS·실제 Slack/이메일 전달은 검증하지 않는다. 선택과 명령의 무결성은 별도 구조 테스트로 확인한다. 20년 조건을 scenario branch나 전용 도구로 구현하지 않는다.

## 2026-10-24 로컬 관찰 결과

`runs/journey-v3-company-selection-r3`에서 실제 회사 LLM·Worker·완료 처리기의 두 발화 흐름을 완료했다. 실행 중 웹/Worker runtime source 변경은 없었다. 원문과 상태별 hash, 의미 검토는 해당 run의 ignored `review.json`에 보관한다.

| 관찰 항목 | 실제 결과 |
| --- | --- |
| 1차 평가 → 2차 평가 | 2,106명 → 358명 |
| 현재 회사 연속 20년 기준의 2차 라벨 | 불충족 338명·부분 충족 19명·정보 부족 1명 |
| 완료 대화에 제공된 목록 | 점수순 신규 후보 50명 + 기존 미결정 추천 10명 |
| 승인 전 목록 | 기존 10명·제외 0명·추가 0명·유지 10명·최종 10명 |
| 실제 완화 제안 | 현재 회사 연속 10년 이상 / 현재 회사 20년 이상을 필수 대신 우대조건으로 변경 |
| 회사의 원래 조건 유지 지시 후 | LLM이 빈 ID 배열을 선택. 기존 10명·제외 10명·추가 0명·최종 0명 |
| 기존 결정·진행·연락 기록 | 변경 0건 |

Harper는 일부 후보의 일반 평가 이력과 경력 원문을 추가 조회한 뒤, 이번에 확인한 후보 중 근속조건 충족을 확인할 수 없다고 설명했다. 완화안을 실제로 적용하지 않았고, 회사가 원래 조건을 재확인한 후에만 미결정 목록을 갱신했다. 이 수치는 이 검색·평가 집단의 관찰이며 전체 시장에 적합한 사람이 없다는 뜻이 아니다. 완료 알림은 해당 workspace의 영어 locale, 사용자 발화 답변은 한국어로 생성됐다.

이전 실행도 보존한다. 첫 실행은 로컬 완료 처리기에 사용자 정보를 넘기지 않은 harness 오류로 중단됐다. `journey-v3-company-selection-r2`는 승인 전 보존과 승인 후 정확한 목록 갱신은 수행했지만, 완화안 대신 경력 확인만 제안해 이 요구를 충족하지 못했다. 그 결과에 따라 일반 검색 policy에서 **대안 제안과 기준 변경은 별개**라는 계약을 명확히 했고 같은 동결 입력으로 재검증했다. 별도 키워드 분기나 고정 응답은 추가하지 않았다.

관련 구조 검증은 웹 28개·Worker 54개·실제 로컬 PostgreSQL 발행 3개가 통과했다. 전체 타입 검사는 기존 다른 파일의 진단이 남아 있어 전체 통과로 기록하지 않는다. 운영 배포·운영 DB 변경·실제 외부 발송 검증은 포함하지 않는다.
