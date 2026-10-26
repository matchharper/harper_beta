# 대화 조건 변경으로 전체 목록 재검토 — journey-v2

사용자는 이전 3번의 국적 표현이 목록을 바꿀 지시의 예시였다고 정정했다. 이번 입력은 직무 관련 조건인 현재 토론토 거주·주 5일 출근으로 정한다. 이전 실행·입력·gold는 보존한다.

- 목적·단위: 성공한 2번의 추천 10명 상태에서, 조건 변경 발화와 결과 확인 발화의 2턴을 관찰한다. 전체 목록의 유지·제외·추가와 답변의 사실 일치를 검증한다.
- 동결 입력·gold: `cases-journey-v2.json`, `gold-journey-v2.json`, `manifest-journey-v2.json`. 모델 호출 전에 hash를 기록한다. 특정 후보나 인원수를 정답으로 주입하지 않는다.
- 원본: `legacy-source-v1`의 실제 자료 및 `journey-v1-search-r4/J02`의 성공 결과. `runs/journey-step3-source-v2/database.dump`와 baseline manifest로 원본을 동결한다. 이전 단계의 여섯 기준을 유지하며, 4·6번의 후속 변경은 섞지 않는다.
- 정본 runner: `scripts/evalCompanyAgenticRoleSearch.ts` → `harper_worker/llm_evals/company_agentic_role_search/run_scoring.py`. `--baseline=journey-step3-source-v2 --dataset-manifest=manifest-journey-v2.json --only=J03 --preserve-cases=J03`를 사용한다.
- 모델·입력 계약: 제품 기본 company-side 모델과 Decisions·설명 writer를 그대로 사용한다. 원래 회사 대화, 공통 도구·prompt·시간 formatter를 유지하고, 실제 모델/설정·dirty source fingerprint·provider 요청/응답·시간은 runner manifest에 기록한다.
- 지표·gate: 저장된 조건, 전체 검색 범위, 실제 검색 완료, 추천 집합의 before/retained/removed/added/after, 메시지의 집계 일치. 무단 외부 연락과 기존 결정 훼손은 0건이어야 한다. 단일 대화의 관찰을 전반적 정확도로 확대하지 않는다.
- 개인정보·운영 경계: raw 자료는 ignored `private/`·`runs/`의 0700/0600 파일만 사용한다. DB는 localhost 사본에만 쓴다. 외부 전달은 차단하고 기존 모델 provider 경로만 허용한다. 운영 DB·배포·일반 production 인증·큐 transport는 검증 범위 밖이다.
- 한계: Worker 완료는 로컬 동기 barrier이며 최초 도구 반환은 실제 queued 응답을 보존한다. 두 번째 회사 발화로 완료 사실을 조회하므로 운영의 자동 완료 알림을 검증했다고 표시하지 않는다. 이전 4~6번 결과는 별도 경로의 관찰로 보존한다.

## 2026-10-23 관찰 결과

- 실행: `runs/journey-v2-condition-change/J03`. 실제 회사 대화 2턴과 Worker 실행을 완료했다. 실행 도중 runtime source 변경은 없었으며 동결 입력·gold hash도 일치한다.
- 조건 저장과 검색: Brief에 필수조건을 추가하고 기존 근무조건 기준 1개를 수정했다. 기준 총수는 6개를 유지했다. 전체 범위로 1차부터 재검색하여 2,643명을 검토하고 243명을 상세 평가했다. Worker 소요 시간은 180,640ms다.
- 목록: 기존 10명 중 5명 유지, 5명 제외, 5명 추가로 최종 10명이다. 두 번째 답변의 유지·제외·추가 숫자는 실제 전후 집합과 일치한다.
- 조건 충족 실패: 최종 10명의 새 근무조건 평가 라벨은 `good` 2명, `uncertain` 8명이다. 추천 설명을 직접 검토하면 9명이 주 5일 출근을 미확인으로 남긴다. `good` 2명 중 1명도 이 9명에 포함되므로, 라벨을 조건 충족이 확인된 인원으로 환산하면 안 된다. 최초 답변은 두 조건이 확인된 후보만 추천하도록 반영했다고 설명했으나 최종 목록은 이를 충족하지 않았고, 결과 답변은 이 한계를 알리지 않았다.
- 보존: 기존 후보 진행·외부 추천·fit·연락 요청·relay·미팅 데이터는 변경되지 않았다. 외부 연락은 0건이다. 로컬 대화 메시지만 4건 추가됐다.
- 판정: 조건 저장·전체 재계산·인원 안내는 확인됐다. 조건이 확인된 후보만 남기라는 지시의 이행은 실패했다. 원본 출력·후보별 설명·전후 상태·근거 hash는 ignored `review.json`과 `evidence-manifest.json`에 보관한다. 운영 자동 알림이나 인증·큐 transport를 통과했다고 주장하지 않는다.
