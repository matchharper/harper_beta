# 운영 원본 정기 선정·메시지 저장 검증

2026-10-24 사용자가 vooy·가우디오랩의 실행과 운영 DB 저장을 요청했고, 저장 범위를 **평가·선정 명단·메시지 원문만**으로 확정했다. 실제 추천 목록·연결 대기 상태 변경과 Slack·메일·후보자 연락은 포함하지 않는다.

실제 저장·시간·비용과 품질 한계는 [검증 결과](REPORT-LIVE-SCHEDULED-PREVIEW-V1.md)에 기록했다. 비공개 원문 보고의 정본 생성기는 Worker `llm_evals/company_agentic_role_search/report_live_scheduled_preview.py`다.

- 단위: 회사별 실제 Role 하나의 현재 입력 → 기존 1·2차 재사용 또는 필요한 단계 평가 → 회사 LLM 선정 → 선택된 회사 소개 3차·Slack writer → 결과 저장.
- 출처: 기존 승인된 발견 후보 IDs와 현재 미소개 수락 후보 전원을 운영 DB에서 읽기 전용으로 다시 조회한다. 새 전체 DB 검색은 아니다. 현재 소스 fingerprint가 같은 기존 평가만 재사용한다.
- 날짜/일정: 실제 관찰 시각을 보존한다. 토요일 수동 검증에서 정기 실행 권한을 재현하기 위해 **요일·정기 시각만 최근 월·수·금 09시로 가정**한다. 현재 Role 설정·후보 자격·동의·기존 추천 사실은 현재 DB 값이다. 이 가정은 운영 설정에 저장하지 않는다.
- 동결/gold: 회사별 `capture.json`/`worker-input.json`을 호출 전에 저장한다. `scheduled-selection-gold-v2.json`의 구조 기준을 사용하며 후보 명단 정답은 없다. 과거 입력·평가를 덮어쓰지 않는다.
- 정본 runner: Worker `llm_evals/company_agentic_role_search/live_scheduled_preview.py`; 회사 선정은 beta `scripts/evalScheduledMatching.ts --selection-input`의 실제 원본 loop. 모델/설정은 현재 runtime을 사용하고 원문 요청·응답·usage·시간을 private run에 보존한다.
- 저장: 검증 완료 후 기존 검색 실행 원장의 종료된 preview 결과와 기존 평가 원장에만 저장한다. 실제 추천·상태·outbox·작업 큐는 만들지 않는다. 저장 전/후 대상 역할의 실제 상태와 실행 ID별 저장 건수를 확인한다.
- 지표: 일반 Top 50 / 수락 전원, 회사 completion과 추가 read 수, 기존 단계 재사용/새 평가 수, 선택 ID·행동·인원, 3차·Slack 원문·usage·시간·저장 영수증. 실제 채용 정확도·응답률은 측정하지 않는다.
- 개인정보: 입력·선정·메시지 원문과 식별자는 ignored runs의 0600 파일/0700 폴더 및 기존 서버 전용 DB 원장에만 둔다. 새 테이블/공개 권한은 추가하지 않는다. 외부 전송은 기존 승인된 LLM provider 호출만 한다.
- 한계: 정기 스케줄러 자동 실행, 실제 추천 상태 변경, 운영 전달 consumer와 실제 수신은 검증하지 않는다. 전체 운영 모집단과 과거 원문 capture 누락의 복구를 보장하지 않는다.
