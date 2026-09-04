# 회사 후보자 Role 이동 구현 계획

상태: 로컬 구현 및 실제 Slack E2E 완료, 배포 전
문서 기준: 2026-08-31
대상 프로젝트: `harper_beta/`, `harper_worker/`, Supabase

실제 검증 결과와 정리 내역은
[`company-candidate-role-move-live-e2e-20260831-ko.md`](./company-candidate-role-move-live-e2e-20260831-ko.md)를
참고한다.

## 1. 목적

회사가 현재 한 Role의 Pipeline에 있는 후보자를 같은 Workspace의 다른 Role과 특정
Pipeline 단계로 옮겨 달라고 요청하면 company-side LLM이 그 요청을 실행할 수 있게 한다.

이 기능은 다음 제품 경험을 만든다.

- company-side LLM에는 Role 간 이동 tool을 하나만 추가한다.
- 후보자에게 먼저 의사를 물어봐 달라는 요청은 기존 `contact_talent` 흐름을 그대로 쓴다.
- 후보자의 답변이 도착해도 자동으로 이동하지 않는다.
- 회사가 답변을 확인한 뒤 `이제 옮겨 주세요`라고 말하면, company-side LLM은 같은
  확인을 반복하지 않고 Role 이동 tool을 실행한다.
- 질문, 이력서 요청, 발송된 미팅 초대와 확정된 미팅은 이동을 막지 않는다.
- 이동이 성공하면 회사 Pipeline, 후보자 Positions, 회사 후보자 상세 피드, 후보자
  안내가 함께 일관된 상태가 된다.
- 이동할 수 없는 실제 데이터 조건은 tool result로 반환해서 company-side LLM이
  회사에 자연스럽게 설명할 수 있게 한다.

이 문서에서 사용자에게 보이는 객체 label은 `Role`, 한국어 대화에서는 `역할`을 쓴다.

## 2. 이번 구현에서 하지 않는 것

범위를 불필요하게 키우지 않기 위해 다음은 만들지 않는다.

- Role 전환 요청 전용 질문 tool
- 후보자 동의 대기 상태나 전환 신청 상태 머신
- 후보자 답변을 해석해 자동으로 Role을 옮기는 worker
- `prepare`, `request`, `apply`, `cancel`로 나뉜 네 개의 전환 tool
- 질문, 이력서 요청, 미팅을 새 Role로 다시 연결하는 자동 migration
- 이미 발송된 이메일, 후보자 메시지, Calendar event의 Role 이름 변경
- Role 이동 전용 관리 화면이나 승인 modal
- `candidate_role_transfers` 같은 별도 업무 원장 테이블

Role 이동의 durable audit은 기존 `talent_progress`와 `contact_queue`를 사용한다. 한 번의
이동을 두 Role의 진행 이력과 후보자 안내 outbox로 남기면 현재 요구에 충분하다.

## 3. 확정된 제품 결정

### 3.1 tool은 하나만 추가한다

새 tool 이름은 `move_candidate_to_role`로 한다.

- 동일 Role 안에서 단계를 바꾸는 기존 `move_candidate_stage`와 구분된다.
- 다른 Role로 옮기면서 대상 Role의 정확한 Pipeline 단계를 지정한다.
- terminal mutation tool이며 같은 assistant message에서 다른 mutation tool과 함께
  호출하지 않는다.
- tool 자체에는 후보자에게 물어보는 기능이 없다.
- 이동 성공 뒤의 표준 변경 안내만 자동으로 준비한다.

### 3.2 대신 질문은 기존 흐름을 쓴다

회사가 후보자에게 먼저 물어봐 달라고 하면 기존 `contact_talent`를 쓴다.

1. company-side LLM이 Role 변경 의사를 묻는 질문 초안을 만든다.
2. 회사가 기존 질문 흐름대로 실제 본문을 확인한다.
3. 승인되면 후보자에게 질문이 전달된다.
4. 답변이 오면 기존 회사 답변 중계 흐름이 원래 회사 대화 또는 Slack thread로 알려준다.
5. 여기까지 어떤 Pipeline 상태도 자동으로 바뀌지 않는다.
6. 회사가 답변을 본 뒤 `그럼 옮겨 주세요`, `이제 AI Role로 전환해 주세요`라고 하면
   `move_candidate_to_role`을 바로 실행한다.

후보자 답변 내용과 이동 실행 사이에는 자동 연결이 없다. 회사가 최종 실행 주체다.

### 3.3 질문·이력서 요청·미팅은 blocker가 아니다

다음 데이터가 있어도 이동을 허용한다.

- 후보자에게 전달된 질문과 답변 대기
- 후보자에게 전달된 이력서 요청과 자료 대기
- 전달 예약 또는 전달 완료된 미팅 시간 선택 요청
- 후보자가 시간을 선택한 미팅
- 확정된 미팅과 생성된 Calendar event
- 기존 소개 이메일 thread

이 데이터는 이동시키거나 이름을 바꾸지 않는다. 원래 어떤 Role에서 무엇을 약속하고
전달했는지를 보존해야 하기 때문이다. 회사가 나중에 후보자 상세의 `다른 역할에서 기록된
내용 보기`를 펼치면 확인할 수 있게 한다.

단, 아직 발송되지 않은 자동 상태 안내 중 이동 뒤 사실과 어긋나는 것은 취소할 수 있다.
예를 들어 출발 Role의 `internal_connection_confirmed` 예약 안내는 취소한다. 이는 회사가
명시적으로 요청한 질문이나 미팅이 아니라 Pipeline 상태에서 파생된 자동 안내이기 때문이다.

### 3.4 대상 Role의 과거 수락·거절은 blocker가 아니다

후보자가 대상 Role을 과거에 제안받았던 사실만으로 이동을 막지 않는다.

- 후보자가 대상 Role을 수락했지만 회사 Pipeline에는 아직 보이지 않는 상태: 허용
- 후보자가 대상 Role을 거절한 상태: 허용
- 회사가 대상 Role에서 프로세스를 종료한 상태: 허용
- 대상 Role 추천이 archive 또는 hidden 상태인 경우: 허용
- 대상 Role 추천 행은 있으나 회사가 실제 Pipeline 진행을 시작하지 않은 경우: 허용

이 경우 기존 recommendation을 물리적으로 삭제하지 않는다. 질문, 미팅, 이메일 등의 FK가
연결되어 있을 수 있기 때문이다. 대신 기존 recommendation ID를 재사용하면서 과거의 현재
상태를 정리하고 새 이동 상태로 덮어쓴다. 덮어쓰기 전 상태는 Role 이동 progress metadata에
audit snapshot으로 남긴다.

과거 후보자 수락·거절처럼 회사가 원래 볼 수 없던 사실은 tool result에 노출하지 않는다.

### 3.5 이미 대상 Role Pipeline에서 진행 중이면 이동하지 않는다

후보자가 대상 Role에서 회사에 보이는 활성 Pipeline 상태에 이미 있으면 이동을 막는다.

활성 Pipeline 상태는 다음을 포함한다.

- 연결 대기
- 연결됨 legacy 상태
- 회사가 만든 custom stage
- 최종 오퍼

이때는 상태를 덮어쓰지 않고 다음과 같은 user-safe result를 반환한다.

> 김하퍼님은 이미 `AI Engineer` 역할의 `1차 인터뷰` 단계에 있어요. 기존 위치는
> 바꾸지 않았어요.

`프로세스 중단`, `archive`, 후보자 수락만 있는 내부 상태, 후보자 거절은 활성 Pipeline으로
보지 않으므로 이동할 수 있다.

### 3.6 대상 Role의 lifecycle 조건

대상 Role은 아래 기준으로 판단한다.

| 저장 상태 | 사용자 표시 | 이동 |
|---|---|---|
| `top_priority` | 최우선 진행 중 | 허용 |
| `active` | 진행 중 | 허용 |
| `paused` | 중단 | 허용 |
| `draft` | 작성 중 | 차단 |
| `ended` 또는 alias `stopped` | 종료 | 차단 |
| `deleted` | 삭제됨 | 차단 |

`paused`는 새 후보자 추천만 멈춘 상태이고 기존 후보자 관리는 가능하므로 이동을 허용한다.
성공 결과에서는 필요한 경우 `이 역할은 현재 중단 상태라 새 추천은 멈춰 있지만, 요청한
후보자는 옮겼어요`라고 설명할 수 있다.

출발 Role의 lifecycle은 이동을 막지 않는다. 출발 Role이 중단 또는 종료됐더라도 현재
후보자 기록이 존재하면 다른 활성 Role로 정리해 옮길 수 있어야 한다.

## 4. 현재 구현에서 확인한 사실

### 4.1 기존 stage 이동

현재 `move_candidate_stage`는 하나의 `roleId` 안에서 후보자의 현재 recommendation과 stage를
읽고 같은 Role의 stage tag만 변경한다.

주요 위치:

- `src/lib/org/agent/tools.ts`
- `src/lib/org/agent/toolExecution.ts`
- `src/lib/org/server.ts`의 `setOrgCandidateStage`

Role 간 이동은 기존 함수를 출발 Role과 대상 Role에 두 번 호출하는 방식으로 만들지 않는다.
한쪽만 성공하는 부분 이동과 중복 알림이 생길 수 있기 때문이다.

### 4.2 회사 후보자 상세의 현재 피드 범위

`TalentDetailSimpleView`가 사용하는 `fetchOrgTalentDetail`은 현재 다음과 같이 섞여 있다.

| 데이터 | 현재 조회 범위 |
|---|---|
| `org_stage_change`, `org_note` | 현재 Role |
| 질문 발송·후보자 답변 activity | 현재 Role |
| 미팅 | 현재 recommendation + 현재 Role |
| 연결 확인 안내 | 현재 Role |
| 소개 이메일 | 현재 recommendation |
| `company_talent_requests` | 같은 Workspace의 해당 후보자 전체 Role |

따라서 현재 기본 피드도 완전히 Role-scoped인 것은 아니다. 구현할 때 회사 질문·이력서 요청에
현재 Role filter를 추가해 기본 피드의 의미를 맞추고, 다른 Role 데이터는 펼침 영역에서
보여준다.

주요 위치:

- `src/components/org/TalentDetailSimpleView.tsx`
- `src/lib/org/server.ts`의 `fetchOrgTalentDetail`
- `src/app/api/org/detail/route.ts`

### 4.3 회사에 보이는 추천 이유

후보자 상세의 `Harper의 추천 이유`는 아래 우선순위로 결정된다.

1. 현재 Role의 최신 `intro_to_company` progress에 저장된 실제 소개 본문
2. 현재 Role의 `talent_opportunity_fit.reason`

Role 이동에서는 대상 Role에 새 `intro_to_company`를 만들지 않는다. 대신 출발 Role의
회사 표시용 추천 이유를 대상 Role의 `talent_opportunity_fit.reason`으로 복사하고 이동
문장을 덧붙인다.

### 4.4 후보자 Positions의 현재 분류

후보자 `/career`의 Positions는 `talent_opportunity_recommendation`의 feedback과
`saved_stage`를 기준으로 분류한다.

- `feedback=dislike`: 후보자가 거절한 archived 기회
- `feedback=like`, `saved_stage=connected`: 연결된 포지션
- `feedback=like`, `saved_stage=closed`: 종료된 포지션
- internal stage tag와 `talent_progress`: 포지션 진행 안내

Role1을 `feedback=dislike`로 바꾸면 후보자가 거절한 것처럼 기록되므로 사용하지 않는다.
사용자가 말한 `archived로 들어간다`는 제품 의미를 `지난 포지션/종료된 포지션`으로 구현하고,
저장 상태는 `saved_stage=closed`를 쓴다.

## 5. 회사 대화 정책

### 5.1 단순한 이동 요청

회사가 별다른 맥락 없이 다음처럼 말할 수 있다.

> 민수님을 Backend Engineer에서 AI Engineer 1차 인터뷰로 옮겨 줘.

이때 company-side LLM은 사용자를 훈계하거나 `후보자에게 물어본 것이 맞나요?`라고 검증하지
않는다. Harper가 대신 할 수 있는 일을 가볍게 알려주고 선택만 받는다.

권장 의미:

> 제가 민수님께 새 역할로 진행해도 괜찮은지 대신 물어봐드릴 수도 있어요. 먼저
> 확인해볼까요, 아니면 바로 `AI Engineer`의 `1차 인터뷰` 단계로 옮길까요?

문장을 고정 template로 만들지는 않는다. company-side LLM은 최신 대화 언어와 말투에 맞게
자연스럽게 쓴다.

### 5.2 바로 이동해야 하는 표현

다음 의미가 분명하면 같은 선택을 다시 묻지 않고 tool을 실행한다.

- `바로 옮겨 주세요`
- `그냥 지금 바꿔 주세요`
- `후보자와 이미 이야기했어요. 옮겨 주세요`
- 후보자의 답변이 중계된 뒤 회사가 `좋아요, 이제 전환해 주세요`라고 말함
- 앞선 assistant message가 `먼저 물어볼까요, 바로 옮길까요?`라고 물었고 회사가
  `바로 옮겨 주세요`라고 답함

`옮길 수 있어?`, `옮기면 어떻게 돼?` 같은 가능성 질문은 실행 권한이 아니다.

### 5.3 대신 물어봐 달라는 표현

다음 의미면 `move_candidate_to_role`을 호출하지 않고 기존 `contact_talent` 흐름으로 간다.

- `먼저 물어봐 줘`
- `후보자가 괜찮은지 확인해 줘`
- `Role을 바꿔도 되는지 대신 질문해 줘`

질문의 핵심 내용은 다음과 같다.

> 현재 진행 중인 `{sourceRoleName}` 역할 대신 `{targetRoleName}` 역할로 프로세스를
> 이어가도 괜찮은지 확인

기존 질문 tool이 전체 후보자용 본문을 만들고 회사의 확인을 받으므로 Role 이동을 위해
별도의 질문 copy나 전환 상태를 추가하지 않는다.

### 5.4 답변 도착 뒤

후보자 답변 중계는 현재 제품 계약을 유지한다.

- 어느 후보자와 Role에 관한 답변인지 알려준다.
- 후보자가 공유를 허락한 의미를 회사에 전달한다.
- 자동으로 이동하지 않는다.
- 회사가 이동을 요청할 수 있다는 다음 행동을 자연스럽게 제안할 수 있다.

회사가 이어서 이동을 명령하면 company-side LLM은 `후보자에게 다시 물어볼까요?` 또는
`동의를 받으셨나요?`를 반복하지 않는다.

### 5.5 대상 stage가 불명확할 때

대상 Role만 말하고 어느 단계로 옮길지 대화에 없으면 임의의 단계를 만들지 않는다.
`read_role(include=pipeline)`로 실제 단계를 읽은 뒤 한 번에 선택할 수 있게 묻는다.

> `AI Engineer` 역할의 어느 단계에서 이어갈까요? 현재 `1차 인터뷰`, `과제`,
> `최종 인터뷰` 단계가 있어요.

회사가 `같은 단계로`라고 말했고 출발 stage label과 정확히 같은 normalized label이 대상 Role에
하나만 있으면 그 stage를 사용할 수 있다. 동일 label이 없거나 둘 이상이면 묻는다. `다음 단계`를
출발 Role과 대상 Role 사이에서 임의로 대응시키지 않는다.

`pending_connection`과 legacy `connected`는 회사가 정확히 그 상태를 요청했을 때만 목적지로
사용한다. custom process stage가 없는 상황에서 이를 일반적인 다음 단계로 추측하지 않는다.

## 6. 새 tool 계약

### 6.1 이름과 성격

```text
move_candidate_to_role
```

- chat과 Slack 모두 노출
- terminal mutation
- 한 assistant message에서 단 한 번 호출
- 성공 또는 예상 가능한 business failure 뒤에 다른 mutation tool을 연쇄 호출하지 않음

### 6.2 입력 schema

모델이 채울 값은 네 개만 둔다.

```json
{
  "talentId": "uuid",
  "sourceRoleId": "uuid",
  "targetRoleId": "uuid",
  "targetStageId": "pending_connection | connected | custom:uuid | final_offer"
}
```

| 필드 | 설명 |
|---|---|
| `talentId` | 이동할 정확한 후보자 ID |
| `sourceRoleId` | 현재 후보자가 있는 출발 Role ID |
| `targetRoleId` | 같은 Workspace의 대상 Role ID |
| `targetStageId` | 대상 Role의 정확한 company-visible 진행 stage |

`sourceRecommendationId`, 예상 source stage, confirmation boolean, 후보자 메시지, 이동 이유는
모델 입력으로 받지 않는다. executor와 DB가 실행 시점의 최신 상태를 다시 읽는다. 현재 source
stage가 대화 중 바뀌었더라도 회사의 `다른 Role로 옮긴다`는 의도는 그대로이므로 불필요한
compare-and-set blocker를 만들지 않는다.

허용하는 목적지는 `pending_connection`, `connected`, `custom:<id>`, `final_offer`다. 대상
stage는 실행 전에 `read_role(include=pipeline)`에서 확인한 exact ID를 사용한다. 모델이 label만
추측해서 custom stage ID를 만들 수는 없다. `accepted`, `archived`, `process_stopped`는 새
프로세스를 시작하는 목적지가 아니므로 받지 않는다.

### 6.3 tool description에 들어갈 판단 계약

description은 최종 답변 문구를 지시하는 곳이 아니라 호출 조건과 효과만 정의한다.

- 다른 Role로 옮기라는 명확한 회사 요청에서 사용한다.
- 동일 Role stage 변경에는 기존 `move_candidate_stage`를 사용한다.
- 중립적인 첫 이동 요청이고 바로 이동할지 후보자에게 물어볼지 대화상 정해지지 않았다면,
  Harper가 대신 확인할 수 있다는 선택을 먼저 제공한다.
- 회사가 즉시 이동을 명시했거나, 이미 합의했다고 했거나, 중계된 후보자 답변 뒤에 이동을
  명시하면 다시 확인하지 않고 호출한다.
- tool은 후보자에게 전환 의사를 묻지 않는다.
- 질문, 이력서 요청, 미팅이 존재해도 호출할 수 있다.

### 6.4 tool result

예상 가능한 조건은 raw exception 대신 구조화된 user-safe result로 반환한다.

```ts
type MoveCandidateToRoleResult = {
  status:
    | "moved"
    | "already_in_target_pipeline"
    | "same_role"
    | "source_candidate_not_found"
    | "target_role_unavailable"
    | "target_stage_not_found"
    | "target_stage_not_supported"
    | "permission_denied"
    | "test_only_target_blocked";
  candidateName: string | null;
  sourceRoleName: string | null;
  sourceStageLabel: string | null;
  targetRoleName: string | null;
  targetRoleStatusLabel: string | null;
  targetStageLabel: string | null;
  targetExistingStageLabel: string | null;
  preservedActivity: {
    openQuestionCount: number;
    activeMeetingCount: number;
  };
  transferId: string | null;
};
```

`transferId`는 executor의 audit과 log에는 쓰지만 final-writing context에는 넣지 않는다.
`targetExistingStageLabel`도 `already_in_target_pipeline`일 때만 전달한다.
후보자 변경 안내의 생성·전달 상태도 회사의 이동 결과 판단에 필요하지 않으므로 tool
result와 final-writing context에 넣지 않는다.

대상 Role의 과거 후보자 수락·거절 상태는 result에 넣지 않는다.

## 7. 이동 허용·차단 판정 순서

tool executor와 DB RPC는 같은 순서로 검증한다.

1. 현재 사용자에게 `manage_candidates` 권한이 있는지 확인한다.
2. 후보자 계정이 삭제되지 않았는지 확인한다.
3. 출발 Role과 대상 Role이 모두 요청 Workspace 소속인지 확인한다.
4. 두 Role이 같은지 확인한다. 같으면 `same_role`을 반환한다.
5. 두 Role이 내부 Role인지 확인한다.
6. 출발 Role에서 회사가 볼 수 있는 현재 후보자 Pipeline 상태가 있는지 확인한다.
7. 대상 Role lifecycle을 확인한다.
8. 대상 Role이 test-only인지 확인한다.
9. 대상 custom stage가 실제 대상 Role 소속인지 확인한다.
10. 대상 Role에 회사-visible 활성 Pipeline 상태가 이미 있는지 확인한다.
11. 질문과 미팅 수는 blocker가 아니라 success warning용 count로만 계산한다.
12. 모든 검증을 통과하면 한 transaction에서 이동한다.

### 7.1 business result 기준표

| 조건 | 결과 | 변경 |
|---|---|---|
| 출발과 대상 Role이 같음 | `same_role` | 없음 |
| 출발 Role에 후보자 없음 | `source_candidate_not_found` | 없음 |
| 대상 Role이 `active`/`top_priority` | 이동 | 전체 적용 |
| 대상 Role이 `paused` | 이동 | 전체 적용, 중단 상태 안내 가능 |
| 대상 Role이 `draft` | `target_role_unavailable` | 없음 |
| 대상 Role이 `ended`/`stopped` | `target_role_unavailable` | 없음 |
| 대상 Role이 `deleted` | `target_role_unavailable` | 없음 |
| 대상 stage가 다른 Role 소속 | `target_stage_not_found` | 없음 |
| 대상이 `accepted`, `archived`, `process_stopped`, 거절 상태 | 이동 | 기존 대상 recommendation 재활성화 |
| 대상이 pending/custom/final offer에서 진행 중 | `already_in_target_pipeline` | 없음 |
| 질문 답변 대기 | 이동 | 질문은 원래 Role에 보존 |
| 미팅 요청·확정 존재 | 이동 | 미팅은 원래 Role에 보존 |

### 7.2 test-only Role

대상 Role의 `company_roles.information.testOnly=true`이면 DB에서도 다음을 강제한다.

- stable `testFixture`가 있어야 한다.
- 후보자 ID가 `information.testTalentIds`에 명시적으로 포함되어야 한다.
- 포함되지 않으면 `test_only_target_blocked`이고 어떤 데이터도 바꾸지 않는다.

애플리케이션 검증만 두지 않고 migration의 RPC 내부에도 동일한 guard를 둔다.

## 8. transaction 안에서 바꿀 데이터

Role 이동은 `move_company_candidate_to_role_v1` Supabase RPC 하나로 처리한다. RPC 이름은
내부 구현 명칭이며 사용자에게 노출하지 않는다.

### 8.1 transaction lock

다음 범위를 잠근다.

- 출발 Role의 후보자 recommendation
- 대상 Role의 후보자 recommendation 후보 행들
- 출발·대상 Role의 후보자 stage tag
- 동일 후보자·출발 Role·대상 Role 조합의 이동 advisory lock

두 회사 사용자가 같은 후보자를 동시에 옮겨도 하나만 현재 상태를 결정하게 한다.

### 8.2 출발 recommendation

출발 recommendation은 삭제하거나 `role_id`를 바꾸지 않는다.

변경:

```text
saved_stage = closed
processed_stage = archived
updated_at = now
```

유지:

- recommendation ID
- 원래 Role ID
- feedback과 feedback_at
- recommended_at
- fit summary와 기존 추천 근거
- 기존 question, meeting, intro email FK

`feedback=dislike`로 바꾸지 않는다. 후보자가 Role1을 거절한 것으로 왜곡되기 때문이다.

### 8.3 출발 Role stage tag

출발 Role의 현재 internal stage tag를 제거하고 `내부:아카이브`를 넣는다.

제거 범위:

- `내부:수락`
- `내부:연결대기`
- `내부:연결됨`
- `내부:최종오퍼`
- `내부:프로세스중단`
- `내부:거절`
- `내부:보류`
- `내부:추천`
- `내부단계:*`

후보자 자체의 일반 tag나 다른 Role의 tag는 건드리지 않는다.

### 8.4 대상 recommendation 선택

대상 Role의 recommendation은 다음 우선순위로 고른다.

1. 기존 recommendation 중 현재 회사-visible 활성 Pipeline이 있으면 이동을 차단한다.
2. 활성 상태가 없고 기존 recommendation이 있으면 가장 최근 행 하나를 재사용한다.
3. 여러 legacy 행이 있으면 FK가 연결된 최신 행을 우선하고, 나머지는 현재 상태를 만들지
   않도록 internal stage tag를 정리한다.
4. 기존 행이 없으면 새 recommendation을 만든다.

기존 행을 물리적으로 삭제하지 않는 이유:

- `company_talent_requests.recommendation_id`
- `meeting_schedules.recommendation_id`
- `org_intro_email_threads.recommendation_id`
- `contact_queue.recommendation_id`
- `talent_progress.recommendation_id`

등이 과거 사실을 가리킬 수 있기 때문이다.

### 8.5 대상 recommendation 상태

대상 recommendation은 현재 이동 결과를 나타내도록 설정한다.

```text
feedback = like
feedback_at = 이동 시각
feedback_reason = null
saved_stage = connected
processed_stage = targetStageId
recommended_at = 이동 시각
dismissed_at = null
updated_at = 이동 시각
```

`feedback=like`는 이 기능에서 후보자의 과거 Role2 버튼 클릭을 주장하는 값이 아니라, 후보자
Positions에서 현재 진행 중인 내부 기회로 표시하기 위한 현재 schema 계약이다. 오해를 막기
위해 recommendation의 `email_acceptance_confirmation` 또는 `evidence`에 다음 provenance를
추가한다.

```json
{
  "roleMove": {
    "transferId": "uuid",
    "source": "company_requested",
    "sourceRoleId": "uuid",
    "targetRoleId": "uuid",
    "targetStageId": "custom:uuid",
    "movedAt": "ISO timestamp"
  }
}
```

기존 JSON sibling 값은 보존한다.

대상 recommendation을 새로 만들 때 출발 recommendation에서 복사할 수 있는 값은 회사가
현재 후보자를 이해하는 데 필요한 최소 정보로 제한한다.

- `fit_summary`
- `fit_reasons`
- `talent_memo`
- `tradeoffs`

`discovery_run_id`, rank, model version, 대상 Role 적합도 평가 evidence는 출발 Role의 자동
매칭 결과인 것처럼 복사하지 않는다.

### 8.6 대상 stage tag

대상 Role의 모든 기존 internal stage tag를 정리하고 정확히 하나의 target tag를 넣는다.

- `pending_connection` → `내부:연결대기`
- `connected` → `내부:연결됨`
- `custom:<stageId>` → `내부단계:<stageId>`
- `final_offer` → `내부:최종오퍼`

Role 이동 대상으로 `accepted`, `archived`, `process_stopped`는 받지 않는다. 이들은 새
프로세스를 시작하는 목적지가 아니다.

### 8.7 추천 이유 복사

출발 Role의 회사 표시용 추천 이유를 다음 우선순위로 읽는다.

1. 최신 `intro_to_company` progress에서 실제 회사에 소개된 추천 본문
2. 출발 Role의 `talent_opportunity_fit.reason`
3. 출발 recommendation의 `fit_summary`와 `fit_reasons`를 조합한 fallback

대상 Role의 `talent_opportunity_fit.reason`은 다음처럼 저장한다.

```text
{출발 Role 추천 이유 원문}

요청에 따라 {sourceRoleName}에서 {targetRoleName}로 이동했습니다.
```

복사할 추천 이유가 없으면 이동 문장만 저장한다.

기존 대상 fit 행이 있으면 `reason`만 위 내용으로 교체하고 대상 Role에서 계산된 label,
score, criteria evaluation은 보존한다. 대상 fit 행이 없으면 출발 fit의 label과 score를
fallback으로 사용해 최소 행을 만들되 다음을 적용한다.

- `kind=role_transfer`
- `human_*` review 값은 복사하지 않음
- 회사 기준 evaluation JSON은 복사하지 않음
- `last_evaluated_at=이동 시각`

이는 새 Role 적합도를 새로 계산했다는 의미가 아니다. 회사 상세에서 기존 후보자 설명이
사라지지 않게 하는 표시용 snapshot이다. 이후 대상 Role의 실제 재평가가 수행되면 label과
score를 갱신할 수 있으며, Role 이동 사실은 progress feed에 계속 남는다.

### 8.8 Role 이동 progress

같은 `transferId`로 두 행을 추가한다.

출발 Role:

```text
kind = org_candidate_role_move
text = {sourceRoleName} 역할에서 {targetRoleName} 역할로 이동되었습니다.
metadata.direction = out
```

대상 Role:

```text
kind = org_candidate_role_move
text = {sourceRoleName} 역할에서 {targetRoleName} 역할로 이동되었습니다.
metadata.direction = in
```

공통 metadata:

```json
{
  "eventType": "candidate_role_moved",
  "eventKey": "org-role-move:<workspace>:<source-message>:<talent>:<direction>",
  "transferId": "uuid",
  "sourceRoleId": "uuid",
  "sourceRoleName": "Backend Engineer",
  "sourceRecommendationId": "uuid",
  "sourceStageId": "custom:uuid",
  "sourceStageLabel": "1차 인터뷰",
  "targetRoleId": "uuid",
  "targetRoleName": "AI Engineer",
  "targetRecommendationId": "uuid",
  "targetStageId": "custom:uuid",
  "targetStageLabel": "2차 인터뷰",
  "previousTargetState": {
    "feedback": "private audit value",
    "savedStage": "private audit value",
    "stageId": "private audit value"
  },
  "movedAt": "ISO timestamp"
}
```

`previousTargetState`는 DB audit 전용이다. company-side LLM의 result projection과 회사 UI
copy에는 전달하지 않는다.

현재 eventKey unique index는 `kind=org_candidate_activity`에만 적용되므로 migration에서
`kind=org_candidate_role_move` 전용 expression unique index를 추가한다. 같은 회사 message가
재시도돼도 중복 이동 event를 만들지 않으며, 두 방향 행에는 `:out`, `:in` suffix를 붙인다.

### 8.9 자동 상태 안내 정리

출발 Role에서 아직 보내지 않은 다음 queue만 취소한다.

- `type=internal_connection_confirmed`
- status가 `queued` 또는 `failed`

취소 metadata:

```json
{
  "source": "candidate_role_moved",
  "transferId": "uuid",
  "cancelledAt": "ISO timestamp"
}
```

다음은 취소하지 않는다.

- `company_request_candidate_delivery`
- `company_request_company_delivery`
- `meeting_schedule_candidate_invitation`
- 이미 `processing` 또는 `sent`인 모든 queue
- 실제 `career_email_messages`

### 8.10 후보자 Role 변경 안내 outbox

transaction 마지막에 새 `contact_queue`를 만든다.

```text
type = internal_candidate_role_changed
user_id = talentId
role_id = targetRoleId
recommendation_id = targetRecommendationId
status = queued
scheduled_at = now
```

payload snapshot:

```json
{
  "transferId": "uuid",
  "locale": "ko",
  "talentName": "김하퍼",
  "companyName": "Example",
  "sourceRoleId": "uuid",
  "sourceRoleName": "Backend Engineer",
  "targetRoleId": "uuid",
  "targetRoleName": "AI Engineer",
  "targetStageId": "custom:uuid",
  "targetStageLabel": "1차 인터뷰",
  "roleUrl": "https://matchharper.com/career/history?..."
}
```

같은 `transferId`에 queue가 하나만 생기도록 partial unique index 또는 payload event key unique
정책을 추가한다.

outbox insert가 실패하면 Role 이동 transaction도 rollback한다. provider 발송 실패는 이동을
되돌리지 않으며 worker가 같은 snapshot과 idempotency key로 재시도한다.

## 9. 질문·미팅·이메일 보존 규칙

### 9.1 출발 Role 데이터

출발 Role에서 만들어진 다음 행의 `role_id`와 `recommendation_id`는 바꾸지 않는다.

- `company_talent_requests`
- 요청과 연결된 `contact_queue`
- `meeting_schedules`
- `meeting_schedule_rounds`
- Calendar event metadata
- `org_intro_email_threads`
- `career_email_messages`
- `talent_opportunity_chat_preview`
- 기존 `talent_progress`

예를 들어 Backend Role에서 보낸 질문의 답변이 Role 이동 뒤 도착해도 Backend Role의 질문
답변으로 기록되고 회사에 전달된다. 회사는 다른 Role 기록 펼침에서 이를 확인할 수 있다.

### 9.2 대상 Role의 과거 데이터

대상 recommendation을 재사용하면 과거 Role2 질문과 미팅도 그대로 남는다. 이는 같은 Role에서
실제로 일어난 기록이므로 새 current detail의 피드에서 다시 보일 수 있다.

대상 Role에 여러 legacy recommendation이 있어 재사용하지 않은 recommendation의 미팅이나
질문이 있다면 다른 Role 펼침이 아니라 같은 Role의 과거 기록으로 표시해야 한다. 피드 조회는
현재 recommendation ID 하나에만 의존하지 말고 `Workspace + talentId + roleId`를 기준으로
Role 내 과거 recommendation을 함께 읽는다.

### 9.3 success warning

열린 질문이나 활성 미팅은 blocker가 아니지만 company-side LLM이 오해를 막을 수 있도록 count를
result에 넣는다.

예:

> 민수님을 `AI Engineer`의 `1차 인터뷰` 단계로 옮겼어요. 기존 `Backend Engineer`
> 역할에서 보낸 질문 1건과 예정된 미팅은 원래 기록대로 남아 있어요.

관련 기록이 없으면 이 문장을 억지로 붙이지 않는다.

## 10. 회사 후보자 상세 피드

### 10.1 기본 피드

오른쪽 `피드`는 현재 열어 본 Role의 기록만 보여준다.

현재 Role filter를 적용할 대상:

- `talent_progress`
- `company_talent_requests`
- meeting events
- connection confirmation emails
- intro emails

Role 이동 event는 제목을 `역할 변경`으로 표시하고 text는 다음처럼 보여준다.

```text
Backend Engineer 역할에서 AI Engineer 역할로 이동되었습니다.
```

출발 Role과 대상 Role 양쪽에서 같은 문장을 볼 수 있다.

### 10.2 다른 Role 기록 펼치기

피드의 가장 아래에 항상 다음 action을 둔다.

```text
다른 역할에서 기록된 내용 보기
```

구현:

- 기존 shared `MuteButton`의 `transparent` variant 사용
- 펼침 상태에는 chevron 방향만 바꿈
- 닫을 때 현재 Role 피드 scroll 상태를 유지
- 다른 Role 기록이 0건이어도 action은 유지
- 0건이면 펼친 영역에 `이 Workspace의 다른 역할에는 기록이 없어요.` 표시

버튼을 누르면 lazy query를 실행한다. 후보자 상세를 열 때부터 모든 Role의 이메일·미팅을
한꺼번에 가져오지 않는다.

권장 endpoint:

```text
GET /api/org/detail/other-role-feed
  ?workspaceId=...
  &talentId=...
  &excludeRoleId=...
  &cursor=...
  &limit=50
```

반환 item:

```ts
type OrgOtherRoleFeedItem = {
  id: string;
  roleId: string;
  roleName: string;
  recommendationId: string | null;
  category:
    | "progress"
    | "company_request"
    | "meeting"
    | "connection_notice"
    | "intro_email";
  title: string;
  text: string;
  createdAt: string;
  actor: OrgFeedActor | null;
  delivery: OrgFeedDelivery | null;
};
```

표시 규칙:

- 최신순으로 정렬해 현재 `ProgressFeed` convention을 유지한다.
- 각 item 상단에 Role 이름을 작은 보조 label로 표시한다.
- 같은 Workspace의 Role만 포함한다.
- 현재 Role은 제외한다.
- 회사 권한으로 원래 볼 수 없는 내부 데이터는 추가로 노출하지 않는다.
- intro email 본문은 현재와 마찬가지로 internal Ops access가 있을 때만 표시한다.
- 첫 50건 뒤에는 `이전 기록 더 보기`를 제공한다.

### 10.3 API authorization

다른 Role 피드는 다음을 모두 검증한다.

1. 요청자가 Workspace view 권한을 가진다.
2. 현재 후보자가 이 Workspace에서 회사-visible 후보자다.
3. 반환할 모든 Role ID가 같은 Workspace에 속한다.
4. 다른 회사의 동일 후보자 기록은 조회하지 않는다.
5. company-private actor와 delivery 원문은 현재 피드 권한 규칙을 그대로 따른다.

## 11. 후보자 Positions UI

### 11.1 출발 Role1

이동 후 Role1은 후보자 화면에서 현재 진행 중인 포지션이 아니다.

저장 상태:

```text
feedback = 기존 값 유지
saved_stage = closed
internal tag = 내부:아카이브
```

후보자 UI:

- `지난 포지션` 또는 현재 `종료` bucket에 표시
- 카드 제목과 회사 정보는 그대로 유지
- 상태 설명은 generic `회사가 종료했어요`가 아니라 Role 이동 사실을 보여줌
- 가능하면 대상 Role2 카드로 이동하는 link 제공

새 internal progress code:

```text
moved_to_another_role
```

한국어 표시:

> 진행 포지션이 `AI Engineer` 역할로 변경됐어요.

영어 표시:

> Your process has moved to the `AI Engineer` role.

이 code는 최신 `org_candidate_role_move` event의 `direction=out`과 `targetRoleId`에서 파생한다.
별도 recommendation 컬럼을 추가하지 않는다.

권장 `/career` 번역 키:

```text
career.history.internal_progress.moved_to_another_role
career.history.internal_progress.view_moved_role
career.history.internal_progress.moved_role_unavailable
```

문장 안의 `{targetRoleName}` placeholder를 한국어와 영어에서 동일하게 유지한다. 대상 Role이
나중에 삭제되어 link를 열 수 없으면 이동 사실은 그대로 보여주고 CTA만 숨기거나
`현재는 역할 내용을 열 수 없어요`라고 표시한다.

### 11.2 대상 Role2

저장 상태:

```text
feedback = like
saved_stage = connected
internal tag = 요청한 exact stage
```

후보자 UI:

- 새 추천 목록이 아니라 Positions의 연결된 포지션에 표시
- Role2 역할 설명과 링크 사용
- 회사 Pipeline의 exact stage에 대응하는 현재 진행 안내 표시
- Role1의 카드 내용을 Role2 제목으로 바꿔치기하지 않음
- 과거 Role2 거절 카드가 있었다면 별도 duplicate를 만들지 않고 같은 recommendation을
  현재 연결된 포지션으로 되살림

### 11.3 `/career` history query 영향

다음을 함께 점검한다.

- `fetchTalentOpportunityHistory`
- `buildInternalRecommendationProgress`
- `CareerHistoryPanel`
- `CareerWorkspaceScreen`
- mobile history tab count
- saved stage별 count
- deep link의 `roleId` 선택

Role1을 `closed`, Role2를 `connected`로 바꾼 뒤 count가 각각 한 번만 증가·감소해야 한다.
Role2의 과거 `feedback=dislike`가 `like`로 바뀌면 archived count에서 빠지고 connected count에
들어가야 한다.

## 12. 후보자 안내

### 12.1 전달 정책

이동 성공 시 후보자에게 표준 안내를 보낸다.

- company-side LLM이 본문을 생성하지 않는다.
- 회사가 별도 본문을 승인하지 않는다.
- `talent_setting.setting_locale`, 없으면 `preferred_locale`, 없으면 `ko`를 사용한다.
- 현재 worker가 지원하는 locale 범위에 맞춰 `ko`, `en`을 제공한다.
- Role 이름은 저장된 원문을 유지하고 번역하지 않는다.
- 이메일과 Harper candidate conversation에 같은 의미를 기록한다.
- 회사에서 안내받은 내용과 다르거나 확인이 필요하면 reply할 수 있다고 안내한다.
- 후보자 답장은 자동 Role rollback이나 자동 재이동을 일으키지 않는다.

### 12.2 한국어 제목

```text
[Harper] {companyName} 진행 포지션이 변경되었습니다
```

### 12.3 한국어 본문

```text
{talentName}님, 안녕하세요.

{companyName}에서 진행 중인 포지션이 변경됐어요.

기존: {sourceRoleName}
변경: {targetRoleName}

안내받은 내용과 다르거나 확인이 필요하다면 이 메일에 답장하거나 Harper에 알려 주세요.
좋은 기회가 되시길 바라겠습니다.

{targetRoleName} 내용 확인하기

Harper 드림
```

HTML에서는 `{targetRoleName} 내용 확인하기`를 Role2 Position으로 가는 link 또는 button으로
렌더링한다. plain text에는 다음 줄에 URL을 넣는다.

### 12.4 영어 제목

```text
[Harper] Your role with {companyName} has changed
```

### 12.5 영어 본문

```text
Hi {talentName},

The role you're moving forward with at {companyName} has changed.

Previous: {sourceRoleName}
New: {targetRoleName}

If this differs from what you were told or if anything needs clarification, please reply to this email or let Harper know.
We hope this becomes a great opportunity for you.

View {targetRoleName}

Harper
```

### 12.6 Role link

Role2는 이동 직후 `saved_stage=connected`이므로 `historyTab=new`로 연결하면 안 된다.

권장 URL:

```text
/career/history
  ?historyTab=saved
  &savedStage=connected
  &id={targetRoleId}
  &source=role_move_notice
```

실제 화면이 recommendation ID를 정본으로 쓰는지 role ID를 정본으로 쓰는지 route 계약을
확인한 뒤 현재 Career deep-link helper를 재사용한다. URL을 worker에서 문자열로 중복 조립하지
않도록 shared contract나 payload snapshot으로 전달한다.

### 12.7 worker 처리

`harper_worker/email_reply/contact_queue.py`에
`internal_candidate_role_changed` handler를 추가한다.

처리 순서:

1. queue payload와 recommendation/Role 참조가 존재하는지 확인한다.
2. 같은 transferId의 이동 progress가 존재하는지 확인한다.
3. 더 최신 Role 이동으로 이 queue가 superseded되지 않았는지 확인한다.
4. payload의 locale과 역할명 snapshot으로 deterministic copy를 만든다.
5. `contact-queue/{jobId}` idempotency key로 이메일을 보낸다.
6. candidate conversation에 같은 안내를 기록한다.
7. `career_email_messages.mail_type=internal_candidate_role_changed`로 기록한다.
8. queue를 `sent`로 바꾼다.

`localized_copy.py`에 한국어와 영어를 Codex가 직접 작성한다. 자동 번역 API나 다른 LLM을
사용하지 않는다.

권장 worker copy key:

```text
contact_queue.candidate_role_changed_subject
contact_queue.candidate_role_changed_body
contact_queue.candidate_role_changed_cta
```

본문은 하나의 localized template로 줄바꿈을 고정하고, HTML renderer가 CTA에만 link를
적용한다. retry할 때 현재 Role 이름을 다시 조회해 copy를 바꾸지 않고 queue payload snapshot을
재사용한다.

## 13. company-side LLM 결과 문구에 필요한 사실

코드는 최종 답변을 고정하지 않는다. tool result에서 다음 사실만 user-safe projection으로
제공하고 company-side LLM이 대화에 맞게 설명한다.

### 13.1 성공

필수 사실:

- 후보자 이름
- 출발 Role과 이전 stage
- 대상 Role과 새 stage
- 후보자 Position도 Role2로 변경됨
- 보존된 열린 질문 또는 미팅 count
- 대상 Role이 paused인지

예시 의미:

> 민수님을 `Backend Engineer`의 `1차 인터뷰`에서 `AI Engineer`의 `2차 인터뷰`
> 단계로 옮겼어요. 후보자 Positions에도 `AI Engineer`가 연결된 포지션으로 표시돼요.
> 기존 `Backend Engineer`에서 주고받은 질문과
> 잡혀 있던 미팅은 원래 기록대로 남아 있어요.

후보자 변경 안내의 생성 여부, 시점과 전달 상태는 회사 완료 답변에 포함하지 않는다.

### 13.2 대상 Role에 이미 있음

> 민수님은 이미 `AI Engineer` 역할의 `1차 인터뷰` 단계에 있어요. 기존 위치는
> 바꾸지 않았어요.

후보자의 과거 수락·거절 같은 내부 원인은 말하지 않는다.

### 13.3 대상 Role 작성 중

> `AI Engineer` 역할은 아직 작성 중이라 후보자를 옮길 수 없어요. 역할 등록을 마친
> 뒤 다시 요청해 주세요.

### 13.4 대상 Role 종료

> `AI Engineer` 역할은 종료되어 있어요. 역할을 다시 진행 상태로 바꾼 뒤 후보자를
> 옮길 수 있어요.

### 13.5 대상 Role 삭제

> `AI Engineer` 역할은 삭제된 상태라 후보자를 옮길 수 없어요. 진행할 역할을 다시
> 등록하거나 다른 Role을 선택해 주세요.

### 13.6 대상 stage 없음

> `AI Engineer` 역할에서 요청하신 단계를 찾지 못해 옮기지 않았어요. 현재 Pipeline
> 단계를 다시 확인해 주세요.

tool 이름, raw status, 내부 ID, RPC, queue는 사용자 문구에 넣지 않는다.

## 14. 서버 구현 구조

### 14.1 `harper_beta`

추가 또는 변경할 주요 위치:

| 파일 | 변경 |
|---|---|
| `src/lib/org/agent/tools.ts` | `move_candidate_to_role` schema와 terminal 등록 |
| `src/lib/org/agent/toolExecution.ts` | 입력 검증, read, RPC 호출, user-safe result |
| `src/lib/org/agent/toolState.ts` | terminal result와 retry 분류 |
| `src/lib/org/agent/promptFormat.ts` | compact result serialization |
| `src/lib/org/agent/prompts.ts` | 단순 요청 선택 안내, 바로 실행, 기존 질문 흐름 규칙 |
| `src/lib/org/agent/thinkingLogs.ts` | 사용자에게 보이는 자연스러운 진행 상태 |
| `src/lib/org/server.ts` | Role move server wrapper와 피드 조회 확장 |
| `src/lib/contactQueue.ts` | 새 queue type union |
| `src/lib/talentOpportunity.ts` | `moved_to_another_role` candidate progress |
| `src/components/org/TalentDetailSimpleView.tsx` | Role 이동 feed item, 다른 Role 기록 펼침 |
| `src/components/progress-feed/ProgressFeed.tsx` | 필요할 때만 Role label slot 재사용/확장 |
| `src/app/api/org/detail/other-role-feed/route.ts` | lazy cross-role feed API |
| `src/lang/ko.ts`, `src/lang/en.ts` | `/career` 이동 상태 UI 번역 |
| `src/types/database.types.ts` | migration 이후 generated type 동기화 |

기존에 적합한 component가 있으면 재사용한다. 새 button은 만들지 않고 `MuteButton`을 쓴다.

### 14.2 Supabase migration

한 migration에 다음 additive 변경을 둔다.

- `move_company_candidate_to_role_v1` RPC
- `internal_candidate_role_changed` queue idempotency index
- `kind=org_candidate_role_move`의 eventKey expression unique index
- RPC execute 권한은 service role 또는 현재 server 호출 계약에 필요한 최소 범위만 부여
- test-only destination guard

DB CHECK enum을 불필요하게 넓히지 않는다. 현재 `contact_queue.type`이 text이면 새 type 때문에
별도 enum migration을 만들지 않는다.

### 14.3 `harper_worker`

| 파일 | 변경 |
|---|---|
| `email_reply/contact_queue.py` | 새 queue claim 분기와 발송 handler |
| `localized_copy.py` | 한국어/영어 제목·본문·CTA |
| `tests/test_contact_queue.py` | 발송, locale, idempotency, stale cancellation |
| `email_reply/prompt.py` | 필요할 때만 reply source 설명 추가 |
| `email_reply/db.py` | 새 mail type을 reply context에 포함할 경우 조회 확장 |

Role 변경 안내에 답장이 와도 자동으로 Pipeline을 바꾸지 않는다. 일반 Career Harper reply로
받아 현재 대화에서 처리한다. 별도 tool alias를 추가하지 않는다.

## 15. RPC 반환 계약

RPC는 company-side LLM용 문장을 만들지 않고 사실을 반환한다.

예시:

```json
{
  "status": "moved",
  "transferId": "uuid",
  "sourceRecommendationId": "uuid",
  "targetRecommendationId": "uuid",
  "sourceStageId": "custom:uuid",
  "sourceStageLabel": "1차 인터뷰",
  "targetStageId": "custom:uuid",
  "targetStageLabel": "2차 인터뷰",
  "targetRoleStatus": "paused",
  "openQuestionCount": 1,
  "activeMeetingCount": 1
}
```

예상 가능한 불가 조건은 status로 반환한다. authorization 위반이나 FK corruption처럼
정상 제품 분기가 아닌 오류는 transaction을 rollback하고 server가 일반 오류로 처리한다.

## 16. 원자성·재시도·중복 방지

### 16.1 원자성

다음은 한 DB transaction이다.

- 출발 recommendation 정리
- 출발 tag archive
- 대상 recommendation 생성 또는 재활성화
- 대상 tag 설정
- fit reason 복사
- 양쪽 progress 생성
- stale 자동 안내 취소
- 새 후보자 변경 안내 queue 생성

질문, 미팅, provider email은 transaction 안에서 수정하지 않는다.

### 16.2 idempotency

같은 회사 message에서 tool 실행이 재시도되는 경우:

- 동일 eventKey의 `org_candidate_role_move`를 찾는다.
- 이미 전체 이동이 적용되어 있으면 기존 success snapshot을 반환한다.
- candidate notification queue를 중복 생성하지 않는다.
- fit reason 끝에 이동 문장을 반복해서 붙이지 않는다.

회사가 나중에 새 message로 같은 이동을 다시 요청하면 대상 Role의 활성 Pipeline 검사가
`already_in_target_pipeline`을 반환한다.

### 16.3 부분 실패

- RPC 내부 실패: 모든 변경 rollback
- queue는 만들어졌지만 provider 발송 실패: 이동 유지, queue retry
- 이메일 provider는 성공했지만 history 기록 실패: 기존 contact worker의 sent-but-recording-failed
  복구 계약을 사용
- cross-role feed 조회 실패: 이동 상태에는 영향 없음, UI에서 재시도 제공

## 17. analytics와 자동화 영향

Role 이동은 organic recommendation이나 후보자의 새 자발적 수락과 구분해야 한다.

- `roleMove` provenance가 있는 대상 recommendation을 신규 자연 수락 KPI에서 제외하거나
  별도 `company_requested_role_move`로 집계한다.
- source Role의 `closed` 전환을 후보자 거절이나 회사 연결 거절로 집계하지 않는다.
- target Role의 Pipeline count에는 새 exact stage로 한 번만 포함한다.
- source Role은 archive/closed count로 이동한다.
- pending connection reminder가 source Role에서 계속 나오지 않게 tag와 예약 자동 안내를 정리한다.
- 대상 Role이 paused이면 새 자동 추천은 계속 멈춰 있지만 이동한 후보자는 Pipeline에 보인다.
- 대상 Role fit refresh가 이동 candidate를 지우거나 source Role로 되돌리지 않게 한다.
- candidate Role 이동 event는 matching preference feedback으로 자동 해석하지 않는다.

## 18. 보안과 개인정보

- company-side LLM은 현재 Workspace에서 회사-visible인 출발 후보자만 옮길 수 있다.
- 대상 Role은 반드시 같은 Workspace다.
- 다른 Workspace에서 같은 후보자를 본 기록은 cross-role feed에 포함하지 않는다.
- 회사에 보이지 않았던 대상 Role 후보자 수락·거절 상태는 success/failure copy에 노출하지 않는다.
- transfer audit metadata는 최소 운영자 권한 외에는 raw JSON으로 노출하지 않는다.
- 회사 사용자가 남긴 private note는 후보자 알림에 포함하지 않는다.
- 후보자 알림에는 회사명, Role1, Role2와 mismatch 신고 방법만 포함한다.
- test-only Role은 `testOnly`, `testFixture`, `testTalentIds`와 DB guard를 모두 적용한다.

## 19. 테스트 계획

### 19.1 tool contract

- tool 목록에 `move_candidate_to_role`이 정확히 한 번 포함된다.
- terminal tool로 분류된다.
- chat과 Slack 모두 같은 schema를 사용한다.
- required input은 네 개뿐이다.
- 동일 Role 이동은 기존 `move_candidate_stage`로 routing한다.
- raw tool result에 candidate-private target history가 포함되지 않는다.

### 19.2 company-side LLM 대화 E2E

1. 단순 이동 요청
   - 바로 실행하지 않음
   - 후보자에게 대신 물어볼 수 있다는 선택을 동료답게 안내
   - `동의 받았나요?`처럼 사용자를 검사하지 않음
2. `바로 옮겨`
   - 추가 확인 없이 Role 이동 tool 실행
3. `먼저 물어봐 줘`
   - 기존 `contact_talent` draft 흐름 실행
   - Role 이동 tool 미호출
4. 후보자 답변 중계 뒤 `이제 옮겨`
   - 질문을 반복하지 않고 바로 이동
5. 가능성 질문
   - data mutation 없음
6. 대상 Role paused
   - 이동 성공
   - 새 추천 중단 상태를 필요한 만큼만 설명
7. 대상 Role draft/ended/deleted
   - 정확한 이유와 다음 행동 안내
8. 대상 Role 이미 Pipeline 진행 중
   - 현재 단계 안내, mutation 없음

모든 E2E는 최종 user-visible 응답 전체를 읽고 판단한다. tool 호출 성공만으로 통과시키지 않는다.

### 19.3 RPC 데이터 테스트

- 새 대상 recommendation 생성
- 대상 accepted-only recommendation 재사용
- 대상 candidate dislike recommendation 재활성화
- 대상 company process_stopped recommendation 재활성화
- 대상 archived recommendation 재활성화
- 대상 active custom stage이면 차단
- 대상 pending connection이면 차단
- 대상 final offer이면 차단
- source recommendation ID와 Role ID 보존
- source feedback을 dislike로 바꾸지 않음
- source saved_stage closed
- target feedback like, saved_stage connected
- source tag archive 하나
- target tag exact stage 하나
- 양쪽 progress가 같은 transferId를 가짐
- fit reason 원문과 이동 문장이 정확히 한 번 저장됨
- 기존 target fit의 평가 JSON 보존
- 질문·이력서 요청 FK 불변
- 미팅·round·Calendar reference 불변
- intro email reference 불변
- source stale 자동 connection notice만 취소
- candidate Role changed queue 하나 생성
- transaction 중간 오류 전체 rollback
- 같은 message 재시도 idempotent
- 동시 실행 하나만 적용

### 19.4 후보자 UI 테스트

- Role1은 connected에서 closed/지난 포지션으로 이동
- Role1을 후보자 거절 archived로 세지 않음
- Role1 progress가 Role2 이름을 보여줌
- Role2는 connected Positions에 한 번만 표시
- Role2 exact stage 진행 문구 표시
- 기존 Role2 archived card와 duplicate가 생기지 않음
- desktop/mobile count 동일
- Role2 링크가 실제 card를 열음
- 한국어/영어 UI 문구 의미가 일치

### 19.5 회사 피드 테스트

- 기본 피드에는 현재 Role 질문만 보임
- source Role에서 이동 event 표시
- target Role에서 이동 event 표시
- 버튼이 항상 피드 아래에 있음
- 다른 Role 0건 empty state
- 펼치면 같은 Workspace 다른 Role 기록 최신순 표시
- 질문, 답변, 미팅, stage, note가 Role label과 함께 표시
- 다른 Workspace 기록 미노출
- 일반 회사 사용자에게 internal intro email 미노출
- pagination 중복·누락 없음

### 19.6 worker 테스트

- `ko` 제목·본문·줄바꿈·CTA
- `en` 제목·본문·줄바꿈·CTA
- Role 이름 원문 유지
- connected Position deep link
- 같은 queue retry에서 동일 copy와 idempotency key
- stale/superseded transfer queue 취소
- email과 candidate conversation 기록
- candidate reply가 자동 Role 이동/rollback을 호출하지 않음

### 19.7 test fixture 격리

E2E internal Role은 생성 전에 반드시 다음을 갖는다.

```json
{
  "testOnly": true,
  "testFixture": "company-candidate-role-move-e2e-v1",
  "testTalentIds": ["dedicated-fixture-account-id"]
}
```

- production test가 불가피하면 전용 candidate ID만 사용한다.
- 실행 전에 fixture Role의 fit row가 0건인지 확인한다.
- 실행 중에는 allowlist된 exact candidate에 대해 이 direct fixture 이동이 만든 fit row만 허용한다.
- exact ID cleanup을 즉시 수행한다.
- cleanup 뒤 fixture Role의 fit row가 다시 0건인지 확인한다.
- test-only Role을 active로 남기지 않는다.

## 20. 구현 순서

### 20.1 코드 작성 순서

1. Supabase RPC와 idempotency migration 작성
2. generated database type 갱신
3. `harper_worker`에 새 queue type과 localized copy 추가
4. `harper_beta` server wrapper와 tool executor 추가
5. company-side LLM tool/prompt/result serializer 추가
6. 후보자 Positions progress와 번역 추가
7. 회사 기본 피드 Role scope 수정
8. 다른 Role lazy feed API와 UI 추가
9. contract, RPC, worker, UI, conversational E2E 수행

### 20.2 배포 순서

배포 요청이 별도로 명시된 경우에만 실행한다.

안전한 production 순서는 다음과 같다.

1. additive DB migration 적용
2. 새 queue type을 이해하는 `harper_worker` 배포
3. worker가 active이고 새 type을 처리할 수 있는지 확인
4. feature flag를 켜지 않은 `harper_beta` 코드 배포 가능
5. company-side LLM tool feature flag 활성화
6. marked fixture 한 건으로 이동·피드·후보자 안내 확인
7. exact fixture cleanup

worker 재시작은 현재 worker 운영 계약에 맞게 in-flight job을 종료시키지 않고 진행한다.

### 20.3 번역 동기화

`/career` UI 번역을 실제 구현할 때만 다음을 수행한다.

1. `pnpm translation:plan`
2. 변경된 모든 한국어 원문의 영어를 Codex가 코드 문맥에서 직접 작성
3. `translationMethod=codex_direct`
4. `pnpm translation:sync`
5. `pnpm translation:check-career`

계획 문서 작성만으로 translation DB를 변경하지 않는다.

### 20.4 배포 후 문서 확인

실제 배포가 성공한 뒤에는 다음 Notion 문서에서 live behavior 변화가 있는 부분만 갱신한다.

- Candidate acceptance through company connection
- Role, internal follow-up, and talent-status lifecycle
- External and internal recommendation logic에서 Role 이동이 추천 집계에 미치는 부분

배포 전이나 실패한 배포에서는 Notion을 수정하지 않는다.

## 21. 완료 조건

다음이 모두 만족되면 기능 구현이 완료된 것으로 본다.

- company-side LLM에 추가된 mutation tool이 정확히 하나다.
- 후보자에게 물어보는 흐름은 기존 `contact_talent`만 사용한다.
- 후보자 답변만으로 자동 이동하지 않는다.
- 답변을 본 회사가 이동을 명령하면 같은 질문을 반복하지 않고 실행한다.
- target Role이 active, top priority, paused이면 이동할 수 있다.
- target Role이 draft, ended/stopped, deleted이면 정확한 이유로 실패한다.
- 대상 Role의 후보자 과거 수락·거절·프로세스 종료는 이동을 막지 않는다.
- 대상 Role에서 회사-visible Pipeline이 이미 진행 중인 경우만 중복 이동을 막는다.
- 열린 질문, 이력서 요청, 발송·확정 미팅이 이동을 막지 않는다.
- 과거 질문·미팅·이메일의 Role attribution이 바뀌지 않는다.
- source fit reason이 target fit reason으로 복사되고 이동 문장이 한 번 붙는다.
- 회사 피드에 Role1 → Role2 이동 event가 보인다.
- 다른 Role 기록 펼침에서 같은 Workspace의 과거 기록을 볼 수 있다.
- 후보자 UI에서 Role1은 지난 포지션, Role2는 connected Position으로 보인다.
- 후보자에게 locale별 Role 변경 안내가 줄바꿈과 Role2 link를 포함해 전달된다.
- notification 발송 실패가 Role 이동을 되돌리지 않는다.
- 재시도와 동시 실행으로 duplicate recommendation, tag, progress, email이 생기지 않는다.
- test-only Role isolation이 애플리케이션과 DB 양쪽에서 보장된다.
