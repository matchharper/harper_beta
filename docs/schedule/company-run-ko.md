# Company Run 예약 실행 — 폐지 계획과 운영 확인

- 폐지 계획 기록일: 2026-10-06
- 운영 확인일: 2026-10-09
- 상태: 자동 실행 제거는 계획과 실제 운영 상태를 구분해서 확인해야 한다. 이번 배포에서 운영 DB에는 `is_auto` 컬럼과 자동 enqueue·claim 함수 및 관련 트리거가 남아 있음을 확인했다. 이번 요청에서는 이를 제거하는 마이그레이션이나 예약 설정 변경을 실행하지 않았다.

과거 월·목 오전 8시 Harper Company Run 예약의 현재 활성 여부는 해당 예약 설정에서 별도로 확인해야 한다. 이 문서만으로 정기 실행이나 Role 생성·재활성화·주간 due에 따른 자동 생성이 모두 중단됐다고 판단하지 않는다. 기존 이력과 대기 queue도 이번 배포에서 변경하지 않았다.

특정 Role의 Context Run이 필요하면 [수동 실행 런북](../company/company-context-run-codex-runbook-ko.md)에 따라 명시적으로 요청해 실행한다. 새 Role의 calibration 후 첫 검색과 Role별 정기 검색은 별도의 Company Matching Worker가 담당한다.
