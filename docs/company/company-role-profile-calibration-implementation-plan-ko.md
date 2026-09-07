# Company Role Profile Calibration 구현 계획

- 문서 기준: 2026-09-07
- 상태: 로컬 구현 완료, 현재 연결 DB의 migration 적용 확인, Scheduled 활성화·production app rollout 전
- 반복 실행 계약: [Company Role Profile Calibration Codex 실행 계약](./company-role-profile-calibration-codex-runbook-ko.md)

## 1. 구현 목표

새 internal Role이 등록되면 12시간 이내를 목표로 로컬 Codex가 `candid` 기반 예시 profile
5명 안팎을 준비한다. 회사 사용자는 Role의 `매칭 기준` 화면 맨 아래에서 profile과
`미평가 / Good / Bad` 상태를 볼 수 있다. 상세 profile은 기존 후보자 profile UI를 작게
재사용해 오른쪽 Role 정보 영역만 덮는다.

사용자는 웹의 Role 채팅 또는 Slack calibration thread에서 자연어로만 평가한다. Harper는
그 답변을 profile 상태와 `company_internal_roles.request`의 Hiring Brief에 함께 반영한다.

## 2. 이번 구현에서 고정할 제품 결정

- 한 Role에 최초 calibration set 하나를 자동 생성한다.
- 하나의 새 table과 JSONB payload만 추가한다.
- `candid`의 경력과 학력은 유지하고 이름과 사진만 교체한다.
- 원래 개인 연락처와 개인 profile URL은 회사에 보여주지 않는다.
- profile 상태는 `unreviewed`, `good`, `bad` 세 가지뿐이다.
- UI에는 상태 변경 버튼을 두지 않는다.
- Slack에도 Good/Bad 버튼이나 modal을 두지 않는다.
- Feedback은 기존 Role-scoped web chat과 company-side Slack thread만 받는다.
- Feedback은 기존 `calibrate_role_hiring_brief`와 의미를 섞지 않는다. 준비된 profile A~E에 대한
  반응만 기록하는 작은 `record_role_profile_example_feedback({ roleId })`를 둔다. 두 tool 모두에
  `calibration`이라는 단어를 넣지 않고, 새 참고 인물인지 이미 준비된 예시인지 evidence의 출처로
  선택하게 한다.
- Calibration profile은 실제 recommendation이나 talent pipeline item이 아니다.

## 3. 현재 코드에서 재사용할 경계

### Role 화면

- Role 페이지는 `OrgRoleCreationPage.tsx`에서 왼쪽 채팅과 오른쪽 상세 영역으로 나뉜다.
- `매칭 기준` 탭의 본문은 `OrgRoleMatchingContent.tsx`다.
- 현재 `TalentDetailSimpleView.tsx`는 실제 후보자 query, feed, Connect/Reject와 전체 viewport
  portal을 함께 소유한다. 그대로 calibration에 mount하면 채팅까지 덮고 실제 후보자 action도
  노출되므로 전체 컴포넌트를 재사용하지 않는다.
- 이미 분리되어 있는 `TalentProfileHeader`, `TalentExperienceSection`,
  `TalentEducationSection`, `TalentExtraSection`과 Markdown renderer를 두 상세 화면이 함께 사용한다.

### Company-side LLM

- 기존 `calibrate_role_hiring_brief`는 사용자가 가장 이상적인 실제 인물을 새 reference로
  제시했을 때만 사용하며 동작을 바꾸지 않는다.
- 준비된 profile에 대한 피드백은 `record_role_profile_example_feedback({ roleId })`가 처리한다.
  Server가 해당 Role의 최신 calibration과 profile 전체를 직접 읽으므로 profile ID, Good/Bad와
  이유를 tool input으로 다시 복사하지 않는다.
- 일반 `update_role`이나 profile별 Good/Bad tool을 추가하지 않는다.

### Slack

- `sendHarperWorkspaceSlackMessage`는 Role별 활성 channel에 root message를 보내고 성공한
  메시지를 `company_slack_threads`와 Role-scoped `company_messages`에 연결한다.
- 이 경로를 재사용한다. Calibration 전용 Slack app, button callback 또는 별도 reply consumer는
  만들지 않는다.

## 4. 데이터 모델: table 하나

새 table 이름은 `company_role_calibrations`로 한다. 한 row가 한 Role에 공개한 profile set
하나이자 그 set을 준비하는 queue/run record다.

새 table이 보존하는 irreducible durable fact는 다음 네 가지다.

- 회사에 실제로 보여준 profile set과 당시의 표시용 이름·사진·경력 snapshot
- 표시 profile A~E와 원본 `candid` source의 server-only 대응 관계
- 각 profile에 대해 회사가 명시적으로 남긴 최신 Good/Bad와 이유
- 같은 set을 웹과 Slack에 한 번만 공개하기 위한 lifecycle과 delivery identity

이 정보는 최신 Hiring Brief만으로 복원할 수 없다. 일반 대화 기록만으로도 어느 snapshot을
보여줬는지, A가 어느 source였는지와 아직 평가하지 않은 profile을 안정적으로 재구성할 수 없다.
구체적인 reader는 Calibration UI, Slack publisher와
`record_role_profile_example_feedback` executor다.
따라서 별도 profile·feedback·delivery table을 나누지 않고 이 한 table의 JSONB에 함께 둔다.

```sql
create table public.company_role_calibrations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  status text not null default 'queued',
  available_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in (
    'queued', 'running', 'ready', 'sent', 'completed', 'failed', 'canceled'
  )),
  check (jsonb_typeof(payload) = 'object')
);
```

Top-level column은 identity, scope, claim 가능한 시각과 lifecycle에 필요한 값만 둔다. Profile,
선택 이유, review와 delivery 세부 정보는 모두 `payload`에 둔다.

### Index와 lifecycle

- `(status, available_at, created_at)` claim index
- 같은 Role에 `queued`, `running`, `ready`, `sent`가 동시에 둘 이상 생기지 않게 하는 partial
  unique index
- workspace와 role 소속을 빠르게 확인하기 위한 `(company_workspace_id, role_id)` index
- `updated_at` trigger

상태 의미는 다음과 같다.

| 상태 | 의미 |
| --- | --- |
| `queued` | Role 등록 뒤 Codex 처리를 기다림 |
| `running` | 한 Codex run이 atomic claim함 |
| `ready` | profile set이 저장되어 웹에서 볼 수 있으나 Slack 전달이 아직 확인되지 않음 |
| `sent` | 활성 Slack channel 중 한 곳 이상에 calibration root가 전달됨 |
| `completed` | 모든 profile이 평가됐거나 사용자가 calibration을 끝내겠다고 명시함 |
| `failed` | profile set을 안전하게 만들지 못한 terminal 결과 |
| `canceled` | 공개 전에 Role이 더 이상 자동 대상이 아님 |

Slack이 없거나 일부 channel 전달이 실패해도 `ready` profile은 웹에 보인다. Delivery retry는
같은 calibration ID와 idempotency key를 사용한다.

## 5. JSONB contract

첫 version의 `payload`는 다음 형태로 둔다.

```json
{
  "schemaVersion": 1,
  "trigger": {
    "reason": "role_created",
    "queuedAt": "2026-09-04T00:00:00Z"
  },
  "run": {
    "runner": "codex-scheduled",
    "startedAt": null,
    "finishedAt": null,
    "attempt": 0,
    "summary": null,
    "error": null
  },
  "source": {
    "roleFingerprint": null,
    "roleUpdatedAt": null,
    "hiringBriefFingerprint": null,
    "companyFingerprint": null
  },
  "profiles": [
    {
      "profileId": "A",
      "source": {
        "candidId": "server-only-id",
        "sourceFingerprint": "sha256"
      },
      "display": {
        "name": "김민준",
        "profilePicture": "/images/profiles/avatar1.png",
        "headline": "Senior Backend Engineer",
        "location": "Seoul, South Korea",
        "bio": null,
        "experiences": [],
        "educations": [],
        "extras": []
      },
      "selection": {
        "reason": "회사와 후보자 양쪽 관점의 짧은 선택 이유",
        "hypothesis": null
      },
      "review": {
        "status": "unreviewed",
        "reason": null,
        "reviewedAt": null,
        "reviewedBy": null,
        "sourceMessageId": null
      }
    }
  ],
  "delivery": {
    "status": "pending",
    "attempts": 0,
    "lastAttemptAt": null,
    "sentAt": null,
    "error": null
  }
}
```

### Server-only 값

`source.candidId`, source fingerprint, run error와 원래 identity는 company API serializer에서
제거한다. Browser와 Slack에는 `display`, `selection`, `review`와 공개에 필요한 calibration
identity만 전달한다.

원본 이름, 사진 URL, 이메일, 전화번호, LinkedIn과 개인 links는 `display`에 저장하지 않는다.
Structured experience description 안에 원래 이름이 들어간 경우에만 이름을 치환한다. Profile
career facts 자체를 다시 쓰는 별도 합성 단계는 두지 않는다.

### JSON 검증

DB는 top-level status와 JSON object 여부만 강제한다. Application validator가 다음 machine
contract를 검사한다.

- `schemaVersion=1`
- profile 3~5개
- `profileId`가 `A`~`E` 안에서 유일함
- review status가 `unreviewed|good|bad`
- display field의 길이와 배열 item 상한
- URL field와 원래 identity field가 company-safe payload에 없음
- source candid ID가 claimed run의 retrieval 결과에 속함

## 6. Enqueue와 12시간 예약 실행

### Enqueue

Role이 draft에서 active로 확정되는 기존 activation 경계에서
`enqueue_company_role_calibration_v1(role_id)`를 호출한다. Helper는 다음을 서버에서 검사한다.

- 같은 workspace의 internal Role
- active, unexpired
- `information.testOnly`이 아님
- `failed`, `canceled`, `completed`를 포함한 어떤 상태의 calibration row도 없음

중복 호출은 기존 row의 상태와 관계없이 그 row를 반환하고 새 row를 만들지 않는다. Role 등록 transaction이 실패하면
calibration row만 남지 않아야 한다.

### Atomic claim

`claim_company_role_calibration_v1(runner)`는 `FOR UPDATE SKIP LOCKED`로 due `queued` row 하나를
claim하고 `running`으로 바꾼다. Claim 시점에도 Role 상태와 test-only 경계를 다시 확인한다.
오래된 `running` recovery는 `payload.run.startedAt`과 `updated_at`을 보고 같은 helper에서만
수행한다.

### Codex Scheduled

로컬 Codex Scheduled를 12시간마다 `gpt-5.6-sol`의 `xhigh` reasoning으로 실행한다. 한 번 실행할 때
queue가 빌 때까지 Role을 순차 처리한다. 이 기능은 12시간 안에 시작하면 충분하다는 제품 전제를 사용하므로 실시간
webhook이나 상시 worker를 추가하지 않는다.

로컬 컴퓨터나 Codex 앱이 꺼져 있으면 실행이 늦을 수 있다. 나중에 가용성 요구가 높아져도 같은
table과 claim contract를 server worker가 소비할 수 있게 scheduling과 판단 로직을 분리한다.

## 7. Canonical Codex helper

`scripts/company_role_calibration.py` 하나를 만들고, Codex가 table을 직접 임의 update하지 않게
한다. Helper는 DB 조회, 안전 검증, packet 생성, 표시 snapshot sanitization, JSON 검증과 상태
전이만 담당한다. 후보 검색 SQL 작성과 최종 5명 판단은 Codex가 실행 문서에 따라 직접 한다.

계획하는 command는 다음과 같다.

```bash
python3 scripts/company_role_calibration.py preflight
python3 scripts/company_role_calibration.py start --runner codex-scheduled
python3 scripts/company_role_calibration.py run-sql \
  --calibration-id <id> --sql-file <read-only-sql> --max-rows 100
python3 scripts/company_role_calibration.py candidate-packet \
  --calibration-id <id> --query-result <path> --limit 20
python3 scripts/company_role_calibration.py finish \
  --calibration-id <id> --selection <selection-json>
python3 scripts/company_role_calibration.py pending-deliveries --limit 10
python3 scripts/company_role_calibration.py deliver --calibration-id <id>
python3 scripts/company_role_calibration.py fail \
  --calibration-id <id> --stage <stage> --error <short-error>
```

`start`가 claim 가능한 row가 없다고 반환하면 write 없이 종료한다. `finish`는 source fingerprint를
다시 비교한 뒤 `ready`로 저장한다. `deliver`는 같은 calibration/channel idempotency key를
재사용하며, 성공한 `company_messages`의 calibration metadata를 다시 읽어 전달 여부를 검증한다.

Raw query result와 원본 candidate packet은 예를 들어 아래 ignored directory에 저장한다.

```text
output/company_role_calibration/runs/<calibration_id>/
```

Directory와 raw file은 owner-only permission으로 만들고 commit하지 않는다. 장기 보존 대상이
아니므로 운영 정리 대상에 포함한다.

## 8. Web API와 query

### Read API

`GET /api/org/role-calibration` 하나를 추가한다.

- `workspaceId`, `roleId`만 주면 최신 공개 가능한 set과 profile compact list를 반환
- `profileId`를 함께 주면 해당 display profile 전체와 선택 이유를 반환
- 기존 `assertOrgRoleAccess`로 workspace/Role 소속을 확인
- `source.candidId`, raw run 정보와 delivery 오류는 응답에서 제거
- `queued/running/failed`에서는 실제 상태에 맞는 단순한 section state만 반환

Feedback용 POST/PATCH API는 만들지 않는다. 웹의 평가 입력은 기존 company-side LLM message
API를 통해서만 들어간다.

### Client hook

`useOrgRoleCalibration(workspaceId, roleId)`을 추가하고 `매칭 기준` tab을 열었을 때만 조회한다.
Company-side LLM이 calibration feedback을 저장한 뒤에는 tool result에 calibration ID를 넣어
해당 query를 invalidate한다. Slack에서 바뀐 상태는 창 focus와 일반 query refetch 때 최신값을
가져온다.

## 9. `매칭 기준` UI

`OrgRoleMatchingContent`의 Evaluation Criteria 아래, 전체 section의 가장 아래에
`Calibration`을 추가한다.

### List

화면은 다음 정보만 보여준다.

- `Calibration` heading
- `Harper가 실제로 연결을 고려할 만한 예시 프로필을 골랐어요. 좋거나 아쉬운 점은 왼쪽
  채팅에 말씀해 주세요.`라는 짧은 설명
- profile A~E의 가상 사진, 가상 이름, headline 또는 최근 역할
- `미평가`, `Good`, `Bad` status badge
- 필요하면 한 줄짜리 `Harper가 고른 이유`

Profile row 전체가 상세 열기 action이다. Good/Bad button, dropdown, textarea와 inline memo는
두지 않는다. 사용자가 list만 보고도 왼쪽 채팅에 `A는 Good`, `B는 경력이 짧아서 Bad`라고
말할 수 있도록 A~E label을 항상 보인다.

준비 전에는 `Harper가 예시 프로필을 준비하고 있어요.`만 표시한다. 실패 상태는 기술 오류를
노출하지 않고 profile을 준비하지 못했다는 사실만 보여준다. Profile이 아직 없는 새 Role에
빈 카드 다섯 개를 만들지 않는다.

### 상세 panel

현재 `TalentDetailSimpleView`에서 다음 표시 요소를 별도 presentational component로 추출한다.

- `TalentProfileHeader`
- 소개
- `TalentExperienceSection`
- `TalentEducationSection`
- `TalentExtraSection`
- Markdown profile fallback

새 `OrgCalibrationProfilePanel`은 이 표시 component와 calibration의 `Harper가 고른 이유`만
사용한다. 실제 candidate feed, 내부 정보 tab, resume/LinkedIn link, Connect/Reject, stage 이동과
candidate request action은 렌더링하지 않는다.

Desktop에서는 `OrgRoleCreationDetails`의 `relative` container 안에 `absolute inset-0` panel로
연다. `createPortal`과 viewport `fixed inset-0`를 사용하지 않으므로 오른쪽 Role 상세 영역만
가리고 왼쪽 채팅은 계속 보인다. 이 panel은 modal이 아니라 오른쪽 pane의 drill-in view이며,
상단의 닫기 또는 뒤로 가기만 제공한다.

Mobile에서는 현재 상세 화면 안에서 profile view로 전환한다. 직접 평가 action은 만들지 않고,
뒤로 가면 Role 채팅으로 돌아가 답할 수 있게 한다.

Slack의 `프로필 보기` deep link는 다음 query 형태로 같은 panel을 연다.

```text
/org/role?orgId=<workspace>&roleId=<role>&calibration=<id>&profile=<A-E>
```

잘못되거나 다른 workspace의 calibration/profile ID는 무시하고 일반 `매칭 기준` 화면을 연다.

## 10. Slack message와 thread

### 발송

`buildOrgRoleCalibrationSlackMessage`와 `notifyOrgRoleCalibrationSlack`을 추가한다. 실제 post는
기존 `sendHarperWorkspaceSlackMessage`를 사용한다.

- `roleId`를 전달해 새 Slack root와 thread를 Role scope에 연결
- `idempotencyKey = org-role-calibration/<calibration-id>`
- `unfurlLinks=false`, `unfurlMedia=false`
- assistant `company_message.metadata`에 아래 reference 저장

```json
{
  "source": "company_role_calibration",
  "roleCalibration": {
    "calibrationId": "uuid",
    "profileIds": ["A", "B", "C", "D", "E"]
  }
}
```

한 root message에 모든 profile의 compact card를 넣고 알림을 여러 개로 쪼개지 않는다. Slack
Block Kit을 쓰더라도 accessory image와 profile link만 사용하고 interaction button은 넣지 않는다.

### 답변

사용자가 calibration root의 thread에서 답하면 기존 Slack event → reply job → company-side LLM
경로를 그대로 탄다. `company_slack_threads.role_id`와 최근 assistant message의
`roleCalibration` metadata로 정확한 Role과 set을 resolve한다.

답변이 `A는 Good`, `C는 backend 깊이가 부족해서 Bad`처럼 여러 사람을 한 번에 평가해도 한
turn에서 모두 처리한다. 답변이 다른 일반 Role thread에 들어와도 현재 Role과 profile 이름이
명확하면 같은 calibration을 사용할 수 있다. 대상이 모호하면 profile 상태를 추측하지 않고 한
가지 질문으로 확인한다.

## 11. Agent context와 tool 변경

### Compact context

Active Role calibration이 있으면 일반 agent context에 다음 작은 index만 넣는다.

- calibration ID와 Role ID
- profile A~E의 가상 이름과 headline
- 각 profile의 선택 이유
- 현재 `unreviewed|good|bad` 상태와 이미 받은 사용자 이유
- 현재 Slack thread가 calibration root에서 시작됐는지 여부

전체 경력과 학력을 every turn context에 넣지 않는다. `record_role_profile_example_feedback`가 호출될 때
server가 JSONB에서 full display profile을 읽는다. 가상 이름을 일반 candidate 검색 대상으로
오해해 `get_talents`를 호출하지 않도록 prompt에서 calibration index의 의미를 명확히 한다.

### 별도의 간소화된 feedback tool

`calibrate_role_hiring_brief({ roleId })`는 가장 이상적인 reference person을 새로 입력받는 기존
경로로 그대로 유지한다. 이번 기능은 `record_role_profile_example_feedback({ roleId })`를 별도로 둔다.
두 흐름은 모두 Hiring Brief를 개선할 수 있지만 evidence의 의미가 다르므로 하나의 tool에서 mode를
추론하지 않는다.

- `calibrate_role_hiring_brief`: 사용자가 직접 제시한 이상적인 실제 reference person
- `record_role_profile_example_feedback`: Harper가 미리 준비한 profile set에 대한 가벼운 Good/Bad
  feedback

Company-side LLM은 `Good`, `Bad`, `ideal` 같은 표현이 아니라 person의 출처로 경로를 고른다.
`prepared_role_profile_examples`에 이미 있는 A~E 또는 표시 이름이면 feedback tool, 사용자가 새로
가져온 인물·URL·첨부·mention이면 Hiring Brief calibration tool이다. 같은 person과 판단에는 두 tool을
함께 호출하지 않는다. 한 message에 두 종류의 서로 다른 evidence가 실제로 같이 들어온 경우에만 두
tool을 차례로 쓸 수 있다. 출처가 해소되지 않으면 어느 쪽도 쓰지 않고 한 가지 질문으로 확인한다.

새 feedback tool의 input도 `roleId` 하나다. Server가 현재 message와 active calibration row의 full
display profile을 읽어 profile 판단을 구조화하고, 실제 DB write에 필요한 결과만 검증한다.

Scheduled profile feedback용 내부 structured result에는 machine write에 필요한 최소값만 둔다.

```json
{
  "reviews": [
    {
      "profileId": "A",
      "status": "good",
      "reason": "0-to-1 환경에서 제품을 직접 출시한 경험"
    }
  ],
  "hiringBrief": "완전한 최신 Hiring Brief",
  "finishCalibration": false,
  "summary": "A의 0-to-1 실행 경험을 가산점으로 명확히 함",
  "userReply": "A를 Good으로 기록했고, 말씀하신 이유를 Hiring Brief의 가산점에 추가했어요."
}
```

Model이 대화의 의미를 판단한다. `good`, `bad`, 특정 접두사나 이름 문자열을 deterministic
keyword matcher로 분류하지 않는다. Code는 profile ID가 해당 calibration에 존재하는지, status가
허용값인지, user가 Role을 수정할 권한이 있는지와 source message가 같은 workspace인지 같은 구조·
권한 경계만 검증한다.

### Hiring Brief 적용 원칙

- 사용자가 말한 이유가 가장 강한 evidence다.
- 이유 없는 Good/Bad도 profile status는 갱신한다.
- 이유 없는 한 번의 평가에서 새 hard exclusion을 만들지 않는다.
- 기존 Hiring Brief와 같은 의미면 중복 문장을 추가하지 않는다.
- Profile 이름, A~E label, `이번 calibration에서` 같은 provenance는 Hiring Brief에 쓰지 않는다.
- Good/Bad가 실제 source `candid`의 추천·fit·pipeline 상태를 바꾸지 않는다.

### Atomic write

한 tool call의 profile review와 Hiring Brief 변경은 DB function 하나에서 transaction으로 적용한다.

- calibration row를 `FOR UPDATE`로 lock
- expected calibration `updated_at` 또는 payload fingerprint 확인
- `company_internal_roles.request`의 expected value 확인
- 허용된 profile ID review만 갱신
- Hiring Brief가 바뀌면 canonical request를 갱신
- 모든 profile이 평가됐거나 사용자가 종료를 명시하면 calibration status를 `completed`
- 실제 변경값과 summary를 반환

동시 변경이 감지되면 어느 쪽도 덮어쓰지 않고 최신 calibration과 Hiring Brief를 다시 읽은 뒤
agent가 재시도한다.

## 12. 권한과 안전 경계

- Workspace member의 Role view 권한으로 calibration list와 display profile을 읽을 수 있다.
- `canManageCandidates` 권한이 있는 사용자만 company-side LLM을 통해 review와 Hiring Brief를
  바꿀 수 있다.
- Browser는 `candid`를 직접 query하지 않는다.
- Service role과 canonical helper만 raw `candid_id`를 읽는다.
- `testOnly=true` Role은 enqueue, scheduled claim, profile 생성과 Slack 발송에서 모두 제외한다.
- Calibration 실행은 `talent_opportunity_fit`, recommendation, progress, contact queue와 실제
  candidate pipeline에 쓰지 않는다.
- 실제 production candidate packet과 SQL artifact는 ignored owner-only directory에만 둔다.

## 13. 구현 파일 계획

### Migration과 server

- `supabase/migrations/<timestamp>_company_role_calibrations.sql`
  - table, index, RLS/service policy
  - enqueue/claim/apply-feedback function
  - Role activation enqueue와 비활성화 전 cancellation trigger
- `src/lib/org/roleCalibrationServer.ts`
  - company-safe serializer
  - list/detail read
  - feedback transaction wrapper
- `src/app/api/org/role-calibration/route.ts`
  - list/detail GET
- `scripts/company_role_calibration.py`
  - scheduled Codex helper

### UI

- `src/hooks/org/useOrgRoleCalibration.ts`
- `src/components/org/role-overview/OrgRoleMatchingContent.tsx`
- `src/components/org/role-overview/OrgRoleCalibrationSection.tsx`
- `src/components/org/role-overview/OrgCalibrationProfilePanel.tsx`
- `src/components/profile/TalentProfileHeader.tsx`, `TalentExperienceSection.tsx`
  - 기존 profile-only 표시 요소 재사용
- `src/components/org/workspace/pages/OrgRoleCreationPage.tsx`
  - 오른쪽 pane의 calibration profile drill-in state와 deep link

### Agent와 Slack

- `src/lib/org/agent/context.ts`
  - compact calibration index
- `src/lib/org/agent/prompts.ts`
  - scheduled profile feedback 의미와 tool policy
- `src/lib/org/agent/roleCalibrationFeedbackPrompt.ts`
  - Good/Bad review output와 Hiring Brief 일반화 계약
- `src/lib/org/agent/roleCalibrationFeedback.ts`
  - 준비된 profile feedback 전용 LLM 호출
- `src/lib/org/roleCalibration.ts`, `src/lib/org/roleCalibrationServer.ts`
  - company-safe calibration JSONB read와 atomic feedback wrapper
- `src/lib/org/agent/tools.ts`
  - `record_role_profile_example_feedback({ roleId })`의 작은 contract
- `src/lib/org/agent/toolExecution.ts`
  - atomic review + Hiring Brief write
- `src/lib/org/slackMessages.ts`
  - calibration mrkdwn/blocks
- `src/lib/org/slack.ts`
  - calibration notification wrapper

실제 구현 중 현재 파일 책임이 이미 같은 기능을 소유하고 있다면 새 파일을 억지로 만들지 않고 기존
모듈을 확장한다.

## 14. 검증 계획

### Migration과 queue

- Role draft 생성에는 enqueue되지 않음
- internal Role의 최초 active 전환에 정확히 한 row 생성
- 재시도와 중복 activation에도 열린 row가 하나뿐임
- external, expired, inactive, deleted, test-only Role은 자동 대상이 아님
- atomic claim 두 개가 같은 row를 가져가지 않음
- source가 공개 전 바뀌면 오래된 결과를 저장하지 않음

### Helper와 profile snapshot

- read-only SQL만 허용하고 명시적 limit이 없는 query 거부
- retrieval result 밖의 `candid_id` 선택 거부
- 중복 source, profile 수, ID와 status 검증
- company-safe payload에 원래 이름·사진·email·LinkedIn이 남지 않음
- 경력·학력이 source와 일치함
- 실제 recommendation, fit, progress와 contact count가 실행 전후 동일함

### Web

- Matching 화면 맨 아래에 Calibration section 표시
- 상태는 미평가/Good/Bad만 profile row에 표시
- UI에서 상태를 직접 바꾸는 control이 없음
- Desktop profile detail이 오른쪽 pane만 가리고 왼쪽 채팅은 유지
- 실제 candidate action/feed/internal tab이 calibration detail에 없음
- 다른 workspace의 deep link가 profile을 노출하지 않음

### Slack과 agent

- 한 calibration/channel에 root message가 한 번만 전달됨
- root에 button이 없고 thread 답장을 안내함
- `A는 Good, C는 경력이 짧아서 Bad`가 두 profile을 한 번에 갱신함
- 일반 후보자 `Connect/Reject`로 오인하지 않음
- 이유 없는 Good은 status만 안전하게 반영하고 hard rule을 발명하지 않음
- 명시적 이유는 Hiring Brief의 future-candidate rule로 일반화됨
- 동시 Hiring Brief 변경 시 둘 다 덮어쓰지 않음
- Slack 답변 후 웹 query에서 같은 상태를 확인할 수 있음

Production company-side E2E에 test-only Role을 넣지 않는다. 자동 calibration은 test-only를 항상
제외하고, end-to-end 검증은 non-production Supabase와 Slack fixture에서 수행한다.

## 15. 구현 순서

1. Table, enqueue/claim helper와 company-safe JSON validator
2. Canonical Codex script와 local dry-run; 이 단계에서는 Slack을 보내지 않음
3. Role Matching 화면의 read-only Calibration list와 오른쪽 profile panel
4. Slack root message와 idempotent delivery
5. Agent compact context와 별도 `record_role_profile_example_feedback` 연결
6. Profile review + Hiring Brief atomic write
7. Non-production end-to-end 검증
8. 12시간 Codex Scheduled 연결 — rollout 시 별도 활성화

Trigger와 Scheduled를 켜기 전에는 기존 active Role을 자동 backfill하지 않는다. 첫 release는 새로
등록되는 Role만 대상으로 하고, 과거 Role calibration은 별도 명시적 작업으로 남긴다.

## 16. 완료 기준

- 새 Role 등록 뒤 다음 scheduled run에서 3~5명의 profile set이 준비됨
- 웹과 Slack에서 같은 가상 이름·사진·경력·선택 이유가 보임
- 웹의 profile 상태는 미평가/Good/Bad로만 표시됨
- Profile 상세가 desktop의 오른쪽 영역만 덮고 채팅은 계속 사용 가능함
- 웹과 Slack 모두 자연어 채팅으로만 평가할 수 있음
- 한 답변으로 여러 profile status와 Hiring Brief를 정확히 바꿀 수 있음
- Calibration 때문에 실제 후보자 상태나 연락이 생성되지 않음
- 실패·재시도·중복 실행 뒤에도 한 Role의 공개 set과 Slack message가 중복되지 않음
