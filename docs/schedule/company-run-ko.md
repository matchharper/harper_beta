# Company Run 예약 실행 — 폐지 기록

- 폐지일: 2026-10-06
- 상태: Codex 예약 작업 삭제. DB 자동 enqueue·claim 제거 및 `is_auto` 컬럼 삭제는 로컬 마이그레이션으로 준비했으며 운영 배포 전이다.

과거 월·목 오전 8시 Harper Company Run은 더 이상 정기 실행하지 않는다. Role 생성·재활성화·주간 due 조건도 Company Context Run을 자동으로 만들지 않는다. 기존 실행 이력은 보존하고, 아직 시작하지 않은 자동 queue는 취소한다.

특정 Role의 Context Run이 필요하면 [수동 실행 런북](../company/company-context-run-codex-runbook-ko.md)에 따라 명시적으로 요청해 실행한다. 새 Role의 calibration 후 첫 검색과 Role별 정기 검색은 별도의 Company Matching Worker가 담당한다.
