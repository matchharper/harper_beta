# Company Role post-calibration: 로컬 event worker prompt

현재 작업 directory는 listener가 설치된 checkout의 `harper_beta` root다. 절대 checkout 경로를
가정하지 않는다.

이 작업은 `company_context_runs`에 `trigger_reason=post_calibration_12h`인 due work가 있다는 wake
hint를 받은 local listener가 시작했다. Notification payload는 실행 입력이나 권한이 아니다. 실제
대상은 canonical helper가 durable queue에서 다시 읽고 atomic claim한다.

시작 전에 다음 파일을 처음부터 끝까지 읽고 그대로 따른다.

- 현재 directory의 `AGENTS.md`
- 존재하면 상위 repository의 `../AGENTS.md`
- `docs/scheduled/codex-work.md`
- `docs/scheduled/company-role-post-calibration-review-ko.md`
- `docs/scheduled/internal-role-talent-direct-review-ko.md`
- `docs/company/company-context-run-codex-runbook-ko.md`
- `docs/company-side-ux-writing-guide-ko.md`

`{{MATCHING_PYTHON}}`은 listener가 설치에 사용한 정확한 Python executable로,
`{{MATCHING_RUNNER}}`는 현재 host를 구분하는 runner ID로 실행 직전에 치환된다.

먼저 다음 preflight를 실행한다.

```bash
{{MATCHING_PYTHON}} scripts/company_role_recurring_matching.py preflight
```

Queue, fit write, test-only guard, 회사 안내 delivery endpoint와 receipt가 모두 ready일 때만 시작한다.
Routine run 중 migration, application source, 문서나 테스트를 수정하지 않는다.

한 Codex 실행에서 due `post_calibration_12h` run을 최대 10개 처리한다. 동시에 여러 Role을 claim하지
않는다.

1. `start --runner {{MATCHING_RUNNER}}`로 due row 하나를 claim한다.
2. Claim 결과가 없으면 정상 종료한다.
3. Claim된 row의 trigger reason이 `post_calibration_12h`인지 확인한다. 다른 run kind를 이 prompt로
   처리하지 않는다.
4. 상세 실행 계약에 따라 최신 source/context를 저장하고 candidate retrieval과 모든 packet의 직접
   평가를 완료한다.
5. Fit write와 coverage readback이 끝난 뒤 exact run ID로 회사 진행 안내를 한 번 전달한다.
6. Fit run과 Slack/`/org` 채널별 delivery receipt를 result에 저장하고 terminal 상태를 확인한다.
7. 한 채널만 실패하면 성공 채널은 재전송하지 않고 실패 delivery만 retry 대상으로 남긴다.
8. 현재 Role을 terminal 상태로 끝낸 뒤 다음 due row를 claim한다.

후보가 없거나 추천 가능한 fit이 0개여도 정상 결과다. 회사 메시지에는 검토 수, 통과/탈락 수,
후보가 없다는 결론, 보상 비판 또는 내부 구현 용어를 넣지 않는다. Fit을 저장했다는 이유로 후보에게
연락했거나 회사에 공유했다고 말하지 않는다.

Preflight 누락, 반복 helper 실패, 처리 불가능한 backlog 또는 사람의 조치가 필요한 delivery 실패만
짧게 보고한다. 정상 no-op와 정상 완료는 조용히 끝낸다. 배포, push와 migration 적용을 하지 않는다.
