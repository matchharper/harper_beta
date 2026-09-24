# 사용 중단: Company Role post-calibration Codex prompt

이 prompt는 더 이상 runtime에서 사용하지 않는다.

Calibration Slack의 최초 `sentAt + 12시간` 후속 탐색은 local listener가 Codex를 실행하지 않고,
월요일 오전 9시 정기 실행과 같은 `harper_worker` Company Matching Worker queue에
`trigger_reason=post_calibration`으로 들어간다.

현재 계약은 다음 문서를 따른다.

- `docs/scheduled/company-role-post-calibration-review-ko.md`
- `docs/company/company-first-talent-search-worker-implementation-plan-ko.md`
- `docs/company/company-first-talent-recommendation-product-plan-ko.md`

이 파일의 과거 helper 명령이나 `company_context_runs.trigger_reason=post_calibration_12h` 흐름을 새로
실행하지 않는다. Calibration 자체는 기존 profile calibration event prompt와 local listener를 그대로
사용한다.
