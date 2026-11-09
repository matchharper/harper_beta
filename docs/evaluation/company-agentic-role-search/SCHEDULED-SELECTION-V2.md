# 정기 후보 선택 — compact-selection-v2

2026-10-24. 전체 원문을 묶음별 별도 LLM으로 검토하던 v1을 대체한다. 운영 반영을 뜻하지 않는다.

실행 결과와 확인 한계: [회사 3곳 선정 보고](REPORT-SCHEDULED-SELECTION-V2.md).

- 목적 / 평가 단위: 기존 회사 LLM의 한 번의 후보 선택. 일반 Top 50과 수락 후보 전원을 받은 뒤 추가 상세 조회 없이 선택 도구를 사용할 수 있는지 확인한다.
- 입력 / gold: 기존 `scheduled-readonly-v1-20261023-authorized`의 회사 3곳 capture와 단계 평가를 그대로 읽는다. 신규 입력은 compact-selection-v2로 분리하며 원문과 기존 평가·정답은 덮어쓰지 않는다. `scheduled-selection-gold-v2.json`의 구조·의미 기준을 호출 전에 고정한다. 정답 후보 명단이나 전체 추천 정확도 gold는 없다.
- Canonical runner: Worker `llm_evals/company_agentic_role_search/prepare_scheduled_selection.py`가 실제 compact builder로 입력을 준비하고 beta `scripts/evalScheduledMatching.ts --selection-input=<파일>`가 기존 회사 loop와 실제 provider를 호출한다. 모델의 명령은 파일에만 저장한다.
- 모델 / 설정: production company-side 모델 `gpt-6.1-sol`, 기존 reasoning high, runtime의 출력 예산을 사용한다. 각 회사별 원본과 prompt/model 설정 hash·호출·usage·경과 시간·도구·결과를 새 ignored runs 아래 보존한다.
- 데이터 출처 / 개인정보: 기존 운영 read-only capture의 재사용이며 신규 후보/회사 DB 쓰기는 없다. provider 외 요청은 기존 후보 이메일 노출 방지용 read-only GET만 허용한다. Slack/메일/queue/추천/평가 DB 쓰기는 차단한다. private 입력·출력은 0700/0600이고 gitignored다.
- 지표 / gate: 일반 후보 50명 이하, 수락 후보가 ordinary limit 밖에 전원 남음, 알려진 짧은 ref/허용 action만 선택, 미선택은 무변경, 현재 capacity 준수, 새 1·2차 요청 0, 별도 선정 LLM 0. 정상적인 선택은 회사 LLM completion 1회·상세 read 0이어야 한다. 실제 호출 수를 보고하며 초과를 숨기지 않는다.
- 의미 검토: role/criterion와 프로필 근거에 비춰 talent-first가 단순 quota 채우기인지, 불명확한 사실을 확정했는지, accepted 연결이 회사 수락으로 잘못 해석됐는지 출력과 선택 근거를 직접 읽는다. 언어 키워드 validator는 없다.
- 한계: snapshot 이후의 운영 변화·DB 트랜잭션·실제 Slack/메일 전달·추천 응답률은 검증하지 않는다. 회사별 기존 평가 범위가 서로 다르며 누락 capture 인원은 새 입력에서 알 수 없음으로 남긴다. 최종 3차와 전달 writer는 이번 선정 평가에서 재실행하지 않는다.
