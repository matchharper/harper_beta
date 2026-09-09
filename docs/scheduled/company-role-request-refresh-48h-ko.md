# 최근 활동 기반 Hiring Brief 48시간 갱신 런북

- 문서 기준: 2026-09-09
- 적용 자동화: `Harper company role request refresh`
- 주기: 2일마다 오전 09:30 KST
- 대상: 최근 evidence 활동이 있는 active, unexpired, non-test internal Role
- 상위 작업 지도: [Company-side Codex 작업 지도](./codex-work.md)
- 판단 정본: [Company-side 데이터 기반 Role Request 갱신 기준](./company-side-data-request-calibration-ko.md)

## 1. 이 런북의 역할

이 문서는 scheduled task가 어떤 Role을 선택하고, 어떤 순서로 Hiring Brief 갱신 판단을 실행하며,
무엇을 자동으로 쓸 수 있는지 정의한다. 실제 기준 도출 방법은 판단 정본을 그대로 사용한다.

예약 시각이 왔다는 사실은 `request` 변경 이유가 아니다. 최근 활동이 없거나 새 evidence가 현재
Hiring Brief의 의미를 바꾸지 않으면 아무것도 쓰지 않는 것이 정상 결과다.

## 2. 시작 순서

1. repository root와 `harper_beta/AGENTS.md`를 읽는다.
2. [Company-side Codex 작업 지도](./codex-work.md)를 읽는다.
3. 이 런북과 [Role Request 갱신 기준](./company-side-data-request-calibration-ko.md)을 처음부터 끝까지
   읽는다.
4. 실제 production evaluator prompt, input builder와 Role card projection을 확인한다.
5. Canonical helper `preflight`를 실행한다. 필수 table/function, current checkout, DB 연결, private
   artifact directory와 single-run claim이 준비되지 않았으면 write를 시작하지 않는다.
6. 실행 시작 시각을 고정하고 이전 성공 cursor를 읽는다.

Routine run 중 source code, migration, 문서와 테스트를 수정하지 않는다.

## 3. 시간 창과 cursor

기본 검사 창은 `[run_started_at - 48 hours, run_started_at)`이다. 실행 지연이나 이전 partial failure로
coverage gap이 생기지 않게 실제 시작점은 다음 중 더 이른 시각으로 한다.

```text
window_end = 이번 실행 시작 시각
default_start = window_end - 48 hours
window_start = min(default_start, 마지막 완전 성공 실행의 window_end)
```

마지막 완전 성공 실행이 없으면 기본 48시간을 검사하고 bootstrap coverage 한계를 receipt에 적는다.
Partial/failed 실행의 cursor는 성공 cursor로 승격하지 않는다. 겹치는 evidence는 source ID와
updated timestamp로 중복 제거한다.

여러 host 실행을 허용할 때에는 DB-backed claim과 cursor가 필요하다. 한 host만 쓴다는 가정을 local
file lock으로 영구 고정하지 않는다.

## 4. “활동이 있는 Role”의 의미

활동은 Role을 검토 대상으로 올리는 신호일 뿐, 그 자체로 Hiring Brief에 쓸 기준은 아니다.

다음 source에 검사 창 안의 새 row 또는 의미 있는 수정이 있고, exact Role 또는 같은 workspace와의
연결이 검증되면 대상 후보가 된다.

- 회사 사용자의 `/org` 또는 Slack 발화
- profile calibration Good/Bad와 reason, Hiring Brief feedback
- 회사 사용자가 남긴 후보자 수락·거절·archive와 이유
- 회사 사용자가 남긴 후보 메모, progress note 또는 명시적 stage 변경 이유
- 회사가 Role/JD/Hiring Brief를 직접 수정한 event
- 이전 실행 뒤 뒤늦게 보강된 company-side reason

다음은 단독으로 활동 대상이나 새 기준을 만들지 않는다.

- 회사 화면 단순 조회와 typing/read receipt
- system/Harper operator가 만든 상태 변경만 있는 event
- 후보자의 추천 수락·거절과 후보자 메시지
- 이유 없는 자동 stage 변화
- `talent_opportunity_fit.reason` 또는 model output만 바뀐 경우
- test, QA, demo, E2E fixture 활동
- Role과 연결할 수 없는 `company_events` 한 줄

Workspace-level 발화가 여러 Role에 관련될 수 있으면 Codex가 의미를 읽고 exact 적용 범위를
판단한다. 키워드로 모든 active Role에 복제하지 않는다. 범위를 확정할 수 없으면 proposal 또는
확인 질문으로 남기고 write하지 않는다.

## 5. Role eligibility와 처리 순서

Activity 후보 중 다음을 모두 만족하는 Role만 claim한다.

- internal
- active
- not expired
- `company_internal_roles.is_auto = true`
- `information.testOnly != true`

Role별로 하나씩 claim하고 terminal 상태로 끝낸 뒤 다음 Role을 처리한다. 최신 activity가 오래된
것부터 처리하고 tie는 stable Role ID로 정한다. 한 Role의 retryable 오류가 다른 Role을 막지 않되,
DB 연결·schema mismatch처럼 모든 Role에 공통인 실패면 실행을 중단하고 사람에게 알린다.

## 6. Role별 source packet

Packet은 owner-only ignored directory에 만들고 최소한 다음을 포함한다.

- exact workspace ID와 Role ID, 현재 eligibility
- 현재 Role/JD/구조화 field와 전체 canonical request
- current request hash, length, `updated_at`
- window 안의 회사 user messages와 calibration feedback
- 해당 Role의 company-attributed feedback, notes, decisions와 최고 stage timeline
- 이전 positive가 나중에 archive된 경우에도 historical positive label을 보존할 수 있는 전체 timeline
- 판단 시점 profile/request/JD version coverage
- 현재 evaluator/prompt/input projection revision
- 이전 성공 cursor와 이번 source cursor

후보자 이름, 연락처, 이력서 전문과 private message 전문은 task 최종 응답이나 Git에 남기지 않는다.

## 7. 두 lane으로 판단

### 7.1 직접 요청 lane

회사가 발화에서 현재 Role의 기준을 추가·수정·삭제해 달라고 명시적으로 요청했고 아직 canonical
request에 반영되지 않았다면, 그 정확한 범위의 변경은 이미 authorized된 요청이다.

Codex는 다음을 확인한다.

- 요청자가 해당 workspace의 회사 사용자다.
- exact Role 또는 적용 범위가 의미상 분명하다.
- 발화가 질문·가정·미래 가능성이 아니라 실제 변경 요청이다.
- 최신 메시지가 이전 요청을 취소하거나 수정하지 않았다.
- 바꾸려는 내용은 Hiring Brief 소유 정보이며 Role field, runtime policy 또는 운영 메모가 아니다.

이 판정은 LLM이 전체 문맥으로 한다. 키워드/정규식/요청 동사 목록으로 authorization을 만들지 않는다.

### 7.2 추론 lane

후보 결과, 반복된 feedback과 calibration을 종합해 새 기준을 도출한 경우에는 판단 정본의 evidence
gate, existing/proposed clause audit와 shadow check를 수행한다. 충분히 타당해도 이 lane의 결론은
confirmation-required proposal이다.

Scheduled task를 켰다는 사실, `is_auto=true`, 회사가 일반적으로 Harper를 사용한다는 사실은 새로
추론한 Hiring Brief 변경의 confirmation이 아니다.

## 8. Draft와 적용

### 8.1 최소 변경

현재 request를 clause 단위로 감사한 뒤 필요한 부분만 바꾼다. 전체 rewrite가 필요하면 반드시
다음 heading을 유지한다.

```markdown
## Hard constraints

## Preferred criteria
```

운영 지시, 연락 문구, 후보 사건 목록, JD 중복, evaluator 공통 정책을 request에 넣지 않는다.
Production Worker projection이 현재 2,000자에서 잘릴 수 있으므로 핵심 기준을 앞에 두되, 필요한
의미를 버려 길이에 맞추지 않는다. 손실이 있으면 projection issue로 분리하고 write를 보류한다.

### 8.2 직접 요청 적용

직접 요청 lane만 canonical company data update path를 사용할 수 있다.

1. 쓰기 직전에 current request와 Role eligibility를 다시 읽는다.
2. Expected current request, exact `role_id`, canonical final value와 짧은 source event를 전달한다.
3. Raw SQL로 request column을 직접 update하지 않는다.
4. Conflict 응답이면 merge하거나 덮어쓰지 않고 최신 source packet으로 다시 판단한다.
5. 저장 후 request 원문, hash, length와 `updated_at`을 read back한다.
6. 회사가 이미 보는 대화에 반영 완료 답변이 필요하면 원래 source conversation의 canonical reply
   path를 사용한다. Scheduled task가 별도 중복 메시지를 만들지 않는다.

### 8.3 추론 proposal

Proposal에는 회사가 이해할 수 있는 old/new diff와 확인할 한 가지 결정만 남긴다. 후보자 이름,
내부 score, 정확한 탈락 수와 private 원문을 넣지 않는다. 같은 Role에 확인 대기 proposal이 있으면
중복 생성하지 않고 새 evidence로 기존 proposal을 revision하거나 no-op한다.

## 9. 결과 상태

Role별 terminal result는 다음 중 하나다.

| 결과 | 의미 |
| --- | --- |
| `no_relevant_activity` | Activity 후보였지만 Role 기준과 관련된 새 evidence가 없음 |
| `no_request_change` | Evidence는 읽었지만 현재 Hiring Brief 의미를 바꿀 근거가 없음 |
| `direct_request_applied` | 회사의 명시적 미반영 수정 요청을 canonical path로 반영하고 readback함 |
| `proposal_created` | 추론 변경을 confirmation-required proposal로 남김 |
| `proposal_revised` | 기존 확인 대기 proposal을 새 evidence로 갱신함 |
| `blocked_projection` | 필요한 Hiring Brief가 현재 production input에서 손실돼 적용을 보류함 |
| `conflict` | Snapshot 이후 변경이 있어 덮어쓰지 않음 |
| `canceled` | Role이 더 이상 eligible하지 않음 |
| `failed` | Schema, source 또는 helper 오류로 검토가 완결되지 않음 |

Run-level 성공은 모든 대상 Role이 `direct_request_applied`, `proposal_*`, 정상 no-op 또는 canceled 중
하나로 terminal 상태가 되고 window coverage가 닫힌 경우다.

## 10. 알림 정책

정상 no-op와 자동 반영 완료를 별도 운영 알림으로 보내지 않는다. 다음 경우만 task owner에게 알린다.

- 사람이 확인해야 하는 proposal이 새로 생기거나 의미 있게 바뀜
- 반복 conflict로 같은 direct request를 반영하지 못함
- preflight/schema/credential 실패
- privacy/actor/source attribution을 확인할 수 없어 중요한 변경을 보류함
- 한 번의 실행에서 처리하지 못한 backlog가 남음

회사에는 추론을 사실처럼 통보하지 않는다. Proposal을 보낼 때도 writing guide의 쉬운 한국어와 정확한
다음 행동을 사용한다.

## 11. Scheduled prompt

Automation에는 긴 판단 규칙을 복사하지 않고 아래 의미만 둔다.

```text
현재 checkout에서 root AGENTS.md, harper_beta/AGENTS.md,
harper_beta/docs/scheduled/codex-work.md,
harper_beta/docs/scheduled/company-role-request-refresh-48h-ko.md,
harper_beta/docs/scheduled/company-side-data-request-calibration-ko.md를 처음부터 끝까지 읽는다.
Canonical helper preflight가 ready일 때만 최근 활동 Role queue를 하나씩 처리한다. 정상 no-op은 조용히
끝내고, 사람 확인이 필요한 proposal이나 실행을 막는 오류만 보고한다. 배포·push·migration·source
수정을 하지 않는다.
```

절대 사용자 홈의 특정 checkout absolute path, secret 값, SQL 또는 현재 세부 판단 규칙을 automation
prompt에 고정하지 않는다. 다른 clone에서는 project target과 working directory만 host 설정으로
지정한다.

## 12. 구현·운영 체크리스트

- [ ] DB-backed claim과 마지막 성공 cursor가 있다.
- [ ] 48시간 gap과 partial failure recovery가 검증된다.
- [ ] Company user, Harper operator, candidate와 system actor가 구분된다.
- [ ] Workspace message를 exact Role에 잘못 복제하지 않는다.
- [ ] Test-only/inactive/external/expired/auto-disabled Role이 선별과 claim 양쪽에서 제외된다.
- [ ] 현재 request와 source의 hash/timestamp를 write 전후 비교한다.
- [ ] 직접 요청과 추론 proposal lane을 분리한다.
- [ ] 추론 변경을 confirmation 없이 적용하지 않는다.
- [ ] Canonical heading과 20,000자 storage limit을 지킨다.
- [ ] Worker 2,000자 projection 손실을 검사한다.
- [ ] Raw SQL update를 사용하지 않고 canonical RPC/path의 conflict 보호를 통과한다.
- [ ] 저장 후 exact Role request를 다시 읽어 검증한다.
- [ ] Existing fit이 자동 재평가됐다고 가정하지 않는다.
- [ ] Normal no-op은 회사나 운영자에게 불필요한 메시지를 만들지 않는다.
- [ ] Owner-only artifact permission과 Git exclusion을 확인한다.
- [ ] Scheduled task가 local host 의존임을 운영 문서에 남기고 host 상태를 모니터링한다.

