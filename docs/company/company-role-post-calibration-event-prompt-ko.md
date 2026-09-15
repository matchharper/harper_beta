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

먼저 `pending-post-calibration-notices --limit 10`을 한 번 실행한다. 반환된 terminal run은
`deliver-post-calibration-notice --run-id <id>`로 실패 channel만 재시도한다. 첫 전달에서 `/org`에
저장된 정확한 문장을 endpoint가 다시 읽으므로 retry용 문구를 새로 만들지 않는다.

그 뒤 한 Codex 실행에서 due `post_calibration_12h` run을 최대 10개 처리한다. 동시에 여러 Role을
claim하지 않는다.

1. `start --post-calibration --runner {{MATCHING_RUNNER}}`로 due row 하나를 claim한다.
2. Claim 결과가 없으면 정상 종료한다.
3. Claim된 row의 trigger reason이 `post_calibration_12h`인지 확인한다. 다른 run kind를 이 prompt로
   처리하지 않는다.
4. 상세 실행 계약에 따라 최신 source/context를 저장한다. 이 최초 검토에서는 아직 같은 Role fit이
   없는 후보를 찾는 `new` lane 하나만 사용하고, 최대 150명 scan·최대 100명 packet 상한 안에서
   만들어진 모든 packet의 직접 평가를 완료한다. `relocation`이나 `reevaluation` lane은 실행하지
   않는다.
5. Fit write와 coverage readback이 끝난 뒤 실행 계약과 writing guide에 맞는 정확한 회사 안내를
   `{"message":"..."}` JSON 하나로 run directory에 작성한다. Role 이름을 포함하고, 실제로 답이
   판단을 바꾸는 경우에만 0~3개 질문을 같은 message 안에 넣는다. 내부 수치·부정적 결론·구현
   용어는 넣지 않는다.
6. `deliver-post-calibration-notice --run-id <id> --input <json>`으로 그 exact message를 Slack과
   `/org`에 전달하고 durable channel receipt를 확인한다.
7. Fit run과 Slack/`/org` 채널별 delivery receipt를 result에 저장하고 terminal 상태를 확인한다.
8. 한 채널만 실패하면 성공 channel은 재전송하지 않고 실패 delivery만 retry 대상으로 남긴다.
9. 현재 Role을 `finish`로 terminal 상태로 끝낸 뒤 다음 due row를 claim한다.

후보가 없거나 추천 가능한 fit이 0개여도 정상 결과다. 회사 메시지에는 검토 수, 통과/탈락 수,
후보가 없다는 결론, 보상 비판 또는 내부 구현 용어를 넣지 않는다. Fit을 저장했다는 이유로 후보에게
연락했거나 회사에 공유했다고 말하지 않는다.

Preflight 누락, 반복 helper 실패, 처리 불가능한 backlog 또는 사람의 조치가 필요한 delivery 실패만
짧게 보고한다. 정상 no-op와 정상 완료는 조용히 끝낸다. 배포, push와 migration 적용을 하지 않는다.
