# Talent 정보 최신화 통화 구현 계획

> 상태: 로컬 구현 완료, 미배포
>
> 문서 기준: 2026-09-08
>
> 범위: Career 사용자 대상 scheduler, opportunity orchestrator, 이메일 답장, Career re-engagement, 채팅 composer, Harper 통화

## 1. 결론

정보 최신화 연락은 아래처럼 구현한다.

1. 마지막으로 완료한 온보딩 통화 또는 `career_check_in` 통화로부터 75일이 지나면 첫 검토 회차가 열린다.
2. 그 뒤 통화를 완료하지 않은 동안에는 45일마다 다시 검토한다.
3. 다만 각 검토 시점에 아래 두 조건 중 하나라도 해당하면 그 회차는 LLM에 올리지 않고 건너뛴다.
   - 최근 30일 안에 사용자가 internal 기회 추천을 수락했다.
   - 최근 30일 안에 사용자가 보낸 메시지가 call, chat, mail을 합쳐 15개 이상이다.
4. 두 skip 조건에 해당하지 않을 때만 기존 opportunity orchestration LLM에 `career_check_in`을 가능한 action으로 제공한다.
5. Orchestrator가 선택하면 Harper와의 짧은 통화를 주 CTA로 요청한다. 이메일 발송이 성공하면 `career_check_in` pending call을 하나 만들고, 통화가 완료될 때까지 Career의 처리할 항목으로 유지한다. 동시에 통화가 어렵다면 이메일이나 채팅으로 짧게 근황만 알려줘도 된다고 안내한다.
6. Orchestrator가 선택하지 않으면 아무것도 보내지 않는다. 45일 뒤 다시 같은 방식으로 검토한다.
7. 최초 요청을 실제로 보냈는데 반응이 없을 때만 약 7일 뒤 follow-up을 한 번 검토한다. 두 번째 follow-up은 없다.

핵심은 `75일/45일`은 **발송 주기**가 아니라 **LLM에게 연락 여부를 검토시킬 수 있는 주기**라는 점이다. 자동 발송은 없다.

별도 캠페인 시스템, 별도 판정 LLM, 정보 최신화 점수, 키워드 규칙은 만들지 않는다. 기존 scheduler와 기존 orchestration LLM을 확장한다.

## 2. 전체 흐름

```text
완료된 온보딩/check-in 통화
        │
        └── 75일 경과
              │
              ▼
       이번 45일 검토 회차 도래
              │
              ├── 최근 30일 internal 추천 수락 있음 ──► 이번 회차 skip
              │
              ├── 최근 30일 user message 15개 이상 ─► 이번 회차 skip
              │
              └── 둘 다 아님
                     │
                     ▼
          orchestration LLM에 action 후보 제공
                     │
              ┌──────┴──────┐
              │             │
          선택하지 않음      career_check_in 선택
              │             │
       아무것도 발송 안 함    통화 CTA + 짧은 답장 대안 발송
                            + pending talent_call 생성
              │             │
              └──────┬──────┘
                     │
                 45일 뒤 재검토

통화를 실제 완료하면 그 시점부터 다시 75일을 센다.
```

한 회차를 skip하거나 LLM이 action을 선택하지 않아도 사용자를 영구 제외하지 않는다. 해당 회차만 끝나고 45일 뒤 다시 검토한다.

## 3. Scheduler의 정확한 후보 기준

### 3.1 기준 시각

사용자별 `careerCheckInAnchorAt`은 아래 중 가장 최근 시각이다.

1. 완료된 Career 온보딩 통화
2. `kind='career_check_in'`이고 사용자의 실제 발화가 있었던 완료 통화
3. 같은 통화 완료를 기록한 `career_check_in_completed` activity event
4. 레거시 사용자에게 위 기록이 없을 때의 마지막 `profile_submit` 시각, 그것도 없으면 `talent_setting.created_at`

Profile, Brief, Memory, 설정 또는 이력서가 수정된 시각은 이 anchor에 넣지 않는다. 사용자가 한 번 정보를 수정했다고 이후 check-in을 영구히 막으면 안 되기 때문이다.

로그인, 공고 열람, 이메일 열람, 링크 클릭도 anchor를 바꾸지 않는다.

### 3.2 최초 75일과 이후 45일

사용자별 `lastCareerCheckInReviewAt`은 가장 최근에 아래 중 하나가 실제로 완료된 시각이다.

- `career_check_in` action이 orchestration LLM에 실제 후보로 제공되어 판단 결과가 run에 저장된 시각
- 두 deterministic skip 조건으로 해당 검토 회차를 건너뛴 시각

LLM이 action을 골랐는지는 이 45일 계산과 무관하다. “이번 회차를 실제로 검토했다”는 사실만 사용한다. Queue에 넣기만 하고 LLM 호출 전에 기술적으로 실패한 run은 review로 인정하지 않아 재시도할 수 있다. 반대로 check-in 메일의 실제 발송 기록이 있으면 마지막 run 상태 저장에 실패했더라도 중복 연락 방지를 위해 review로 인정한다.

```text
baseDue = now >= careerCheckInAnchorAt + 75 days

reviewDue = baseDue
  AND (
    lastCareerCheckInReviewAt is null
    OR now >= lastCareerCheckInReviewAt + 45 days
  )
```

따라서 동작은 다음과 같다.

| 시점 | 동작 |
| --- | --- |
| 마지막 온보딩/check-in 통화 후 75일 미만 | 검토하지 않음 |
| 75일 도래, 이전 검토 없음 | 첫 검토 회차 |
| 이전 회차에서 skip됨 | skip 시각으로부터 45일 뒤 다시 검토 |
| LLM이 action을 선택하지 않음 | LLM 검토 시각으로부터 45일 뒤 다시 검토 |
| 메일을 보냈지만 통화는 하지 않음 | 검토 시각으로부터 45일 뒤 다시 검토 |
| `career_check_in` 통화 완료 | 완료 시각으로 anchor 갱신, 이후 75일 동안 검토하지 않음 |

### 3.3 각 회차에서 적용할 두 가지 skip

`reviewDue=true`인 시점에만 최근 30일을 확인한다. 기간은 scheduler가 검토한 UTC 시각을 끝점으로 하는 rolling 30일이다.

#### Skip A. 최근 internal 기회 수락

아래를 모두 만족하는 formal recommendation이 하나라도 있으면 이번 회차를 skip한다.

- 사용자의 `talent_opportunity_recommendation`이다.
- 연결된 `company_roles.source_type='internal'`이다.
- recommendation의 현재 feedback이 `like` 또는 `positive`다.
- recommendation의 `saved_stage='connected'`다.
- `feedback_at >= checkedAt - interval '30 days'`다.
- test-only internal role은 제외한다.

Recommendation row 자체가 실제 매칭 제안을 받았다는 기록이고, positive feedback, `connected` stage와 `feedback_at`의 조합이 사용자의 수락 기록이다. 단순히 internal fit이 계산됐거나 Harper가 내부적으로 역할을 검토한 것만으로는 skip하지 않는다.

제안일이 30일보다 오래됐더라도 사용자의 수락이 최근 30일 안이면 skip한다. 이 조건의 목적은 “최근에 Harper와 의미 있는 연결 행동을 한 사람에게 별도의 최신화 통화를 또 요청하지 않는 것”이기 때문이다.

개념 쿼리는 다음과 같다.

```sql
exists (
  select 1
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role
    on role.role_id = recommendation.role_id
  where recommendation.talent_id = talent_id
    and lower(coalesce(role.source_type, '')) = 'internal'
    and lower(coalesce(role.information->>'testOnly', 'false')) <> 'true'
    and lower(btrim(coalesce(recommendation.feedback, '')))
      in ('like', 'positive')
    and lower(btrim(coalesce(recommendation.saved_stage, ''))) = 'connected'
    and recommendation.feedback_at
      >= checked_at - interval '30 days'
)
```

#### Skip B. 최근 user message 15개 이상

최근 30일의 `talent_messages` 중 아래 조건을 만족하는 row를 센다.

```sql
select count(*)
from public.talent_messages message
where message.user_id = talent_id
  and message.role = 'user'
  and coalesce(message.message_type, 'chat')
    in ('call_transcript', 'chat', 'mail')
  and message.created_at >= checked_at - interval '30 days'
  and message.created_at <= checked_at
```

결과가 `15 이상`이면 이번 회차를 skip한다.

카운트 단위는 저장된 사용자 메시지 row다.

- `call_transcript`: 통화 중 저장된 사용자 발화 한 개
- `chat`: 사용자가 Career 채팅에서 보낸 메시지 한 개
- `mail`: 사용자가 Harper 메일에 보낸 inbound 메시지 한 개

Assistant 메시지, outbound 이메일, `profile_submit`, 시스템 이벤트, 이메일 open/click은 세지 않는다. 같은 문장의 길이 또는 글자 수로 가중치를 주지 않는다.

### 3.4 “이번 회차를 건너뛴다”의 의미

두 skip 조건 중 하나라도 맞으면 다음처럼 처리한다.

1. `career_check_in`을 available action으로 만들지 않는다.
2. 이 trigger만으로는 discovery run을 만들지 않는다.
3. `opportunity_scheduler_checks`에는 이번 회차를 `skipped`로 기록한다.
4. `checked_at`은 `lastCareerCheckInReviewAt`으로 인정한다.
5. 다음 check-in 검토는 45일 뒤다.

두 조건이 동시에 맞으면 한 번만 skip하고 `skip_reasons`에 둘 다 남긴다.

```text
recent_internal_acceptance
high_recent_user_message_volume
```

같은 시점에 external 추천, fresh internal 추천, 회사 요청 follow-up 같은 다른 trigger가 있으면 그 run은 정상적으로 진행한다. 다만 그 run의 available actions에서 `career_check_in`만 제외한다. 즉, 이 skip은 다른 opportunity 기능의 주기를 막지 않는다.

### 3.5 이외의 활동은 주기를 바꾸지 않는다

75일/45일 계산에 추가하는 활동 조건은 위 두 개뿐이다.

아래 정보는 후보 진입이나 skip 조건으로 사용하지 않는다.

- 최근 로그인 또는 Career 접속 여부
- 최근 공고를 읽었는지 여부
- 최근 Harper가 이메일을 보냈는지 여부. 단, 발송 직전 24시간 충돌 방지는 아래 delivery guard에서만 적용한다.
- 이메일을 열거나 클릭했는지 여부
- 추천을 받았지만 수락하지 않은 기록
- 최근 메시지가 1~14개인 경우
- Profile, Brief, Memory 또는 이력서가 변경된 기록
- active, passive, stopped 같은 추천 설정
- internal-only인지 external 추천도 받는지 여부

단, 기존 `dont_share`, 삭제 계정, 온보딩 미완료, 실행 가능한 연락 채널 없음, 중복 queued/running run 같은 hard safety와 data-integrity 조건은 그대로 적용한다. 이것들은 연락 타이밍을 판단하는 행동 규칙이 아니라 기존 제품 경계다.

## 4. 기존 scheduler에 넣는 방법

### 4.1 단일 scanner 유지

`harper_worker/opp/worker.py`의 기존 scheduler를 그대로 사용한다.

`fetch_due_scheduler_check_targets()`에서 현재 periodic 후보만 통과시키는 조건을 공통 base safety와 각 trigger 조건으로 분리한다. 최종 진입 조건은 다음과 같은 OR 구조다.

```text
hasAnySchedulerTrigger =
  existingExternalDue
  OR existingInternalDue
  OR existingFollowupDue
  OR existingProfileOrHeldRoleDue
  OR careerCheckInReviewDue
```

따라서 기존 opportunity 조건에 걸리지 않는 internal-only 사용자도 check-in의 75일/45일 회차가 도래하면 scanner가 검토할 수 있다.

새 cron이나 별도 시간대 scheduler는 만들지 않는다. 사용자별 기존 `opportunity_scheduler_state.next_check_at`이 도래해 원래 메일 사유들을 검토하는 바로 그 시점에 check-in도 함께 계산한다. 같은 회차에 추천·follow-up 사유가 있으면 하나의 discovery run과 하나의 메일로 합치고, check-in만 있다면 그 기존 check 시점에 standalone 여부를 LLM이 판단한다.

Check-in 단독 메일을 만들려는 시점에 다른 Harper 메일이 최근 24시간 안에 이미 발송됐다면 이번 검토 회차를 소비하지 않고 다음 기존 scheduler check로 미룬다. 이 24시간 조건은 75/45일 후보 자격을 없애는 세 번째 행동 skip이 아니라, 서로 다른 발송 경로가 짧은 간격으로 연속 메일을 만드는 것을 막는 delivery collision guard다. 같은 run에 다른 메일 사유가 함께 있으면 별도 메일을 만들지 않고 한 메일로 합치므로 이 guard로 미루지 않는다.

또한 같은 scheduler cycle에 회사 질문·이력서 요청·미팅 시간 요청 follow-up 메일이 이미 due라면 check-in-only run을 만들지 않는다. Check-in 회차는 소비하지 않고 회사 요청 run을 먼저 보내며, 다음 기존 3일 check에서 다시 검토한다. 회사 요청 follow-up 쪽도 후보 조회와 run 생성 직전 양쪽에서 최근 24시간 outbound 메일을 다시 확인한다. 따라서 periodic run이 매우 빨리 끝나는 race가 있어도 sidecar 메일이 바로 이어서 생성되지 않는다.

### 4.2 계산 순서

한 사용자를 처리하는 순서는 고정한다.

```text
1. 공통 hard boundary 확인
2. careerCheckInAnchorAt 계산
3. 75일/45일 reviewDue 계산
4. reviewDue가 아니면 check-in 계산 종료
5. 최근 internal 수락 여부 계산
6. 최근 user message 수 계산
7. 둘 중 하나면 이번 check-in 회차 skip 기록
8. 둘 다 아니면 career_check_in_due=true로 run에 전달
9. check-in 단독 발송이고 최근 24시간 안에 Harper outbound 메일이 있으면 회차를 소비하지 않고 다음 기존 scheduler check로 지연
```

Skip 여부를 LLM에게 묻지 않는다. 반대로 최근 대화의 의미, 연락의 자연스러움, 어떤 내용을 물을지는 코드가 판단하지 않는다.

### 4.3 Scheduler payload

LLM 후보로 올리는 회차에는 아래 정도의 구조적 정보만 전달한다.

```json
{
  "careerCheckIn": {
    "due": true,
    "anchorAt": "2026-06-01T09:00:00Z",
    "daysSinceAnchor": 92,
    "latestSentEmailAt": "2026-08-28T09:00:00Z",
    "recentUserMessageCount": 6,
    "phase": "initial",
    "reviewCadence": {
      "initialDays": 75,
      "repeatDays": 45
    }
  }
}
```

실제 검토 시각은 이 payload에 복제하지 않고 바깥 `opportunity_scheduler_checks.checked_at`을 canonical 값으로 쓴다.

Skip된 회차에는 discovery run을 만들 필요가 없다. 기존 `opportunity_scheduler_checks.check_payload`에 아래처럼 남기면 충분하다.

```json
{
  "candidateFlags": {
    "careerCheckInCandidate": true,
    "careerCheckInSkipped": true
  },
  "careerCheckIn": {
    "anchorAt": "2026-06-01T09:00:00Z",
    "recentUserMessageCount": 18,
    "skipReasons": [
      "recent_internal_acceptance",
      "high_recent_user_message_volume"
    ]
  }
}
```

`careerCheckInCandidate=true`는 “75일/45일 회차가 도래했다”는 뜻이고, `careerCheckInSkipped=true`는 두 조건 때문에 LLM에는 제공하지 않았다는 뜻이다.

별도 최신화 상태 테이블은 만들지 않는다. 최근 check-in 관련 scheduler check의 `checked_at`을 다음 45일 계산에 재사용한다.

### 4.4 Dedupe와 실패 처리

- 같은 사용자에게 queued/running discovery run이 있으면 새 run을 만들지 않는다.
- 기존 run에 다른 trigger가 함께 있으면 `career_check_in` 신호만 합쳐 한 run으로 처리한다.
- Check-in-only 발송 직전 최근 24시간 메일이 확인되면 회차를 기록하지 않고 다음 기존 3일 check로 지연한다.
- Check-in-only 시점에 별도 회사 요청 follow-up이 due면 그 메일을 먼저 보내고 check-in은 회차를 소비하지 않은 채 다음 기존 3일 check로 지연한다.
- 같은 check-in 회차의 dedupe key는 talent ID, phase, anchor, 마지막 완료 review, follow-up root처럼 회차를 식별하는 안정적인 값으로 만든다. 검사할 때마다 달라지는 경과일·최근 메시지 수·최근 메일 시각은 dedupe key에 넣지 않는다.
- Scheduler check 기록이 실패하면 회차를 소비한 것으로 보지 않고 기존 retry 경로로 다시 시도한다.
- Run이 queue에 들어간 뒤 worker가 실패하면 실제 check-in 메일이 나가지 않은 경우 같은 dedupe key와 run ID를 재사용한다. 이미 발송 증거가 있으면 새 check-in run을 만들지 않는다.

## 5. Orchestration LLM 판단

### 5.1 Action 후보

아래 범용 action 하나를 추가한다.

```text
ActionType.CAREER_CHECK_IN = "career_check_in"
```

Scheduler의 두 skip을 통과한 회차에만 이 action을 `available_actions`에 포함한다. 추천할 role이 없어도 LLM이 선택할 수 있는 standalone action이다.

Check-in만으로 시작된 run은 새 external 검색이나 internal fit refresh를 수행하지 않는다. 같은 run에 실제 opportunity trigger가 있을 때만 해당 기존 검색을 수행한다.

### 5.2 LLM에게 설명할 선택 기준

Prompt에는 다음을 명시한다.

- 이 action은 75일/45일 cadence상 검토 가능해졌을 뿐, 반드시 보내야 하는 action이 아니다.
- 이번에 선택하지 않아도 45일 뒤 다시 검토된다. 억지로 지금 보낼 필요가 없다.
- 사용자가 Harper로부터 아직 추천이나 연결 가치를 거의 받지 못했다면, 단순히 “정보가 바뀌었는지 확인하자”는 standalone 통화 요청은 보통 유용하지 않다.
- 최근에 많이 사용하다가 활동이 갑자기 줄었다면, 사용 패턴 자체를 지적하지 말고 이직했거나 현재 우선순위가 달라졌는지 자연스럽게 물을 수 있다.
- 최근 대화에서 새 직장, 퇴사, 휴식, 바쁨, 관심 감소, 현재 조건 유지 등을 이미 충분히 말했다면 같은 내용을 다시 요구하지 않는다.
- 회사의 실제 요청, 일정 선택, internal 연결 결정처럼 더 중요한 pending action이 있으면 그 목적을 흐리지 않는다.
- 최근 메일을 많이 받았거나 비슷한 요청을 이미 받았다면 연락 피로도를 고려한다.
- 현재 상황을 알면 곧바로 더 좋은 연결을 제안하는 데 도움이 될 때는 다른 유용한 action과 한 메일로 자연스럽게 결합할 수 있다.
- 사용자에게 사실로 확인되지 않은 이직, 바쁨, 관심 변화를 단정하지 않는다.

이 기준은 예시와 일반 원칙으로 prompt에 둔다. 코드에 키워드 목록, 점수, AND/OR 규칙으로 옮기지 않는다.

Orchestrator는 기존 action 선택 output과 짧은 `reason`만 사용한다. `nextReviewAfterDays`, 연락 가능성 점수, 관계 단계 같은 새 중간 상태는 만들지 않는다. 선택하지 않으면 scheduler의 고정 45일 cadence가 다음 검토를 책임진다.

### 5.3 최근 사용·메일 데이터의 역할

최근 사용 여부와 메일 여부는 다음처럼 나뉜다.

| 데이터 | 75일/45일 회차에 미치는 영향 | LLM 판단 context |
| --- | --- | --- |
| 최근 internal 추천 수락 | 최근 30일이면 이번 회차 skip | 필요하면 함께 제공 |
| user call/chat/mail 메시지 수 | 최근 30일 15개 이상이면 이번 회차 skip | 15개 미만도 최근 대화 내용 제공 |
| 최근 로그인/접속 | 영향 없음 | 제공 |
| 최근 outbound 메일 | 75/45 회차와 두 skip에는 영향 없음. 단독 check-in 발송 직전 24시간이면 회차를 소비하지 않고 다음 3일 check로 지연 | 제목·목적·시각을 compact하게 제공 |
| 이메일 open/click | 영향 없음 | 필요하면 제공 |
| 공고 열람 | 영향 없음 | 필요하면 제공 |
| Profile/Brief/Memory 변경 | 영향 없음 | 변경된 현재 내용과 최근 대화를 제공 |

즉, `최근에 사용했다/안 했다`, `최근에 메일을 받았다/안 받았다`가 주기를 직접 늘리거나 줄이지는 않는다. 두 개의 명시적 skip만 scheduler가 결정하고, 나머지는 LLM이 “이번 연락이 사람답고 유용한가”를 판단하는 근거다.

## 6. 기존 메일과 섞을지, 별도로 보낼지

기본 원칙은 **모든 정기 메일에 문단을 붙이지 않는 것**이다.

- 다른 발송 action이 없고 check-in 자체가 충분히 유용하면 standalone 이메일을 보낸다.
- 특정 기회를 판단하기 위해 최근 상황을 듣는 것이 직접 도움이 되면 추천 내용과 한 메일 안에서 자연스럽게 결합할 수 있다.
- 회사 요청, 일정 조율, 수락/거절처럼 사용자가 지금 처리해야 하는 action이 있으면 check-in을 보통 미룬다.
- 좋은 추천 메일을 보내는 날이라는 이유만으로 check-in 문단을 자동으로 덧붙이지 않는다.
- 같은 run에서 이메일을 두 통 보내지 않는다.

Standalone인지 결합인지도 orchestration LLM이 결정한다. 코드에서 메일 종류별 시나리오 분기를 늘리지 않는다.

## 7. 메시지와 목표 action

### 7.1 Primary CTA

목표 action은 항상 **Harper와의 짧은 통화**다.

- 버튼: `Harper와 이야기하기`
- conversation starter: `career_check_in`
- URL 예시: `/career?start=call&starter=career_check_in&source=career_check_in_email`

다만 통화를 강요하지 않는다. 같은 메시지 안에 다음과 같은 짧은 답장 대안을 연다.

- 다른 조건은 그대로예요.
- 요즘 일이 바빠요.
- 최근 이직했어요.
- 당분간 이직 생각이 줄었어요.
- 원하는 역할이나 조건이 조금 바뀌었어요.

이 문구는 고정 템플릿이 아니라 final-delivery LLM이 사용자 맥락에 맞게 작성할 때 따라야 하는 경험 계약이다.

### 7.2 Initial 메시지의 구성

메시지에는 다음 요소가 자연스럽게 들어간다.

1. 오랜만에 사람처럼 건네는 짧은 인사
2. 사용자가 일에 집중하는 동안 Harper가 좋은 연결을 계속 살펴볼 수 있다는 사용자 이익
3. 지난 대화 이후 달라진 상황이 있는지 듣고 싶다는 이유
4. 짧은 통화 CTA
5. 통화가 어렵다면 한 줄 답장도 충분하다는 대안

다음 표현은 피한다.

- “정보가 오래되었습니다”, “프로필을 최신화하세요” 같은 시스템 문구
- 답하지 않으면 서비스를 못 받는다는 압박
- 실제 context에 없는 이직·바쁨·관심도 단정
- 사용자의 설정과 무관한 일괄적인 공고 발송 약속

### 7.3 답장 처리

기존 이메일 답장 LLM이 그대로 처리한다.

- 사용자가 알려준 현재 상황에 먼저 자연스럽게 답한다.
- 지속적으로 유용한 변화는 원래 Career LLM의 공통 Profile/Brief/Memory write tool로 저장한다.
- “다 그대로예요”처럼 현재 맥락을 충분히 확인한 답도 존중한다.
- 답장만으로 충분하면 바로 다시 통화를 요청하지 않는다.
- 사용자가 통화를 원하거나 글로 설명하기 어렵다고 할 때만 call CTA를 다시 제공한다.
- “이직 생각이 줄었다”를 자동 unsubscribe나 `stopped`로 바꾸지 않는다. 명시적인 설정 요청만 기존 tool 계약으로 처리한다.

답장의 의미를 분류하는 별도 classifier나 키워드 suppressor는 추가하지 않는다.

## 8. Follow-up은 한 번만

Initial 이메일이 실제 발송된 뒤 약 7일이 지났고 아래 조건을 만족할 때만 follow-up action을 한 번 orchestration LLM에 제공한다.

- 같은 initial에 대한 follow-up run이 아직 없다.
- 해당 initial 발송 뒤 더 새로운 45일 정기 review가 완료되지 않았다.
- Initial 발송 뒤 사용자의 inbound email이 없다.
- Initial 발송 뒤 Career chat user message가 없다.
- Initial 발송 뒤 사용자 발화가 있는 `career_check_in` 통화 완료가 없다.
- 현재도 기존 hard contact boundary를 통과한다.

아무 반응이 없어도 follow-up은 자동 발송하지 않는다. 같은 orchestration LLM이 최근 전체 맥락과 첫 메일을 보고 보낼지 결정한다.

Follow-up은 최초 메일을 같은 thread에서 짧게 상기하고, 통화 CTA와 한 줄 답장 대안만 제공한다. 미응답을 지적하거나 죄책감을 주지 않는다. 장애나 장기 중단으로 follow-up이 다음 45일 정기 review 시점까지 밀렸다면 오래된 reminder를 되살리지 않고 새 정기 review가 우선한다.

LLM이 follow-up을 선택하지 않아도 해당 initial에 대한 follow-up 기회는 사용한 것으로 본다. 기술 실패만 동일 dedupe key로 재시도한다. 같은 initial에 두 번째 follow-up은 절대 만들지 않는다.

75일/45일 회차의 두 skip 조건은 정기 initial 검토를 위한 조건이다. Follow-up은 이 절의 “initial 이후 반응 여부” 계약으로 관리해 두 주기를 섞지 않는다.

## 9. Career 안의 동일한 통화 진입점

### 9.1 Conversation starter

`harper_beta/src/lib/career/prompts/conversationStarters.ts`에 아래 ID를 추가한다.

```text
career_check_in
```

이 starter는 다음 원칙으로 대화한다.

- 지난 대화 이후 달라진 현재 상황을 편하게 듣는다.
- 저장된 온보딩 정보를 처음부터 전부 다시 묻지 않는다.
- 최근 맥락에서 가장 의미 있는 한 가지부터 묻는다.
- 한 번에 질문 하나만 한다.
- “달라진 게 없다”는 답을 존중한다.
- 새로 알게 된 durable 정보는 원래 call/chat LLM이 공통 write tool로 저장한다.

### 9.2 Re-engagement

오랜만에 Career에 들어온 사용자에게는 열린 `career_check_in` call이 있을 때만 re-engagement LLM에 해당 pending action을 제공한다.

```json
{
  "label": "최근 상황 업데이트하기",
  "action": {
    "type": "start_call",
    "starterId": "career_check_in"
  }
}
```

메일을 보내지 않았거나, 통화를 이미 완료해 열린 call이 없으면 re-engagement prompt에 `start_call` 선택지를 넣지 않고 서버도 모델이 임의로 만든 `start_call`을 제거한다. Pending 회사 요청이나 일정 선택처럼 더 중요한 action이 있으면 기존 re-engagement 우선순위가 그것을 먼저 다룬다.

### 9.3 Chat composer `+`

Composer의 `+` 메뉴에는 열린 `career_check_in` call이 있을 때만 `최근 상황 업데이트하기`를 처리할 항목으로 표시한다. 누르면 같은 `career_check_in` call starter를 실행한다. 열린 call이 없으면 일반 conversation starter나 홈 action으로 상시 노출하지 않는다.

### 9.4 통화 완료 기록

`career_check_in` 통화가 시작되면 열린 `talent_calls` row를 `active`로 바꾼다. 사용자 발화가 한 번 이상 있었고 call wrap-up이 완료되면 해당 row를 `completed`로 닫고, `talent_activity_events`에도 구조적 `career_check_in_completed` 이벤트를 남긴다. 통화를 시작할 때 만든 call-session UUID를 event ID로 써서 같은 wrap-up 요청의 재시도는 한 번만 기록한다.

이 이벤트는 “정보가 바뀌었다”는 추론이 아니라 “현재 상황 확인 통화를 완료했다”는 사실이다. 이 완료 시각이 다음 75일의 `careerCheckInAnchorAt`이 된다. 통화 화면만 열었거나 사용자 발화가 없으면 완료로 보지 않는다.

## 10. 저장과 데이터 계약

새 도메인 테이블은 만들지 않고 기존 `talent_calls`를 재사용한다.

| 필요한 사실 | 기존 저장 위치 |
| --- | --- |
| 온보딩 통화 완료 | `talent_calls` |
| Check-in 통화 요청·진행·완료 | `talent_calls`, `kind='career_check_in'` |
| Check-in 완료 idempotency·activity 기록 | `talent_activity_events`의 `career_check_in_completed` |
| 45일 review 및 skip | `opportunity_scheduler_checks` |
| LLM의 action 선택 | `opportunity_discovery_run.query_plan.v2Orchestration` |
| 실제 이메일 발송 | `talent_opportunity_delivery` 및 `career_email_messages` |
| 최근 internal 추천 수락 | `talent_opportunity_recommendation` + `company_roles` |
| 최근 user message 수 | `talent_messages` |

`opportunity_scheduler_checks`에는 구조적 시각, count, boolean, skip reason만 저장한다. “사용자가 바빠 보인다”, “관계가 약하다”, “통화 가능성이 낮다” 같은 LLM의 일시적 판단은 별도 컬럼이나 테이블로 만들지 않는다.

Outbound 메일에는 reply 복원과 follow-up dedupe에 필요한 최소 metadata만 둔다.

```json
{
  "opportunityEmailContext": {
    "careerCheckIn": {
      "phase": "initial",
      "rootRunId": "...",
      "starterId": "career_check_in"
    }
  }
}
```

기존 DB constraint와 reply 경로를 유지하기 위해 `career_email_messages.mail_type`은 기존 `opportunity_recommendation`을 그대로 쓰고, check-in 여부와 phase는 위 metadata로 구분한다.

## 11. 구현 순서와 변경 위치

### 단계 1. Scheduler cadence와 두 skip

`harper_worker/opp/worker.py`

- 공통 base safety와 기존 periodic-only 조건 분리
- `careerCheckInAnchorAt` 계산
- 최초 75일, 이후 45일 `reviewDue` 계산
- 최근 internal recommendation acceptance 조회
- 최근 `call_transcript/chat/mail` user message count 조회
- 두 skip의 `skipped` scheduler check 기록
- skip이 없을 때 기존 trigger OR에 `career_check_in_due` 추가
- 기존 run payload, dedupe, scheduler audit 확장

중요한 query 원칙:

- Due 사용자 bounded window를 먼저 만든 뒤 LATERAL/EXISTS로 두 skip을 계산한다.
- 전체 talent의 모든 message를 매 scan마다 aggregate하지 않는다.
- 성능은 `EXPLAIN (ANALYZE, BUFFERS)`로 확인하고 실제 병목이 있을 때만 index를 추가한다.

필요 시 검토할 index:

- `talent_messages(user_id, created_at desc)` with user role/message type filter
- `talent_opportunity_recommendation(talent_id, feedback_at desc)`
- `opportunity_scheduler_checks(talent_id, checked_at desc)` for the check-in flag

### 단계 2. Orchestration과 delivery

`harper_worker/opp/agentic/types.py`

`harper_worker/opp/agentic/orchestration.py`

`harper_worker/opp/agentic/context_projections.py`

`harper_worker/opp/agentic/prompts.py`

`harper_worker/opp/agentic/final_delivery.py`

`harper_worker/opp/new_harper_agent_v2.py`

`harper_worker/opp/utils/new_delivery.py`

`harper_worker/opp/utils/new_delivery_transport.py`

- `CAREER_CHECK_IN` action 추가
- `career_check_in_due`일 때만 available action으로 노출
- 최근 대화·접속·메일·추천 맥락을 compact하게 제공
- action 단독 final delivery 허용
- check-in-only run의 불필요한 opportunity 검색 생략
- 통화 CTA deep link와 outbound metadata 기록
- 이메일 발송 성공 뒤 열린 `career_check_in` call을 중복 없이 생성
- 같은 run에서 한 통의 이메일만 발송

### 단계 3. 답장과 follow-up

`harper_worker/email_reply/db.py`

`harper_worker/email_reply/prompt.py`

`harper_worker/email_reply/worker.py`

- role target이 없는 `career_check_in` 메일도 reply context로 복원
- 원래 요청의 목적과 phase 제공
- 기존 LLM과 공통 write tool로 근황 처리
- initial 이후 user response가 있으면 follow-up 후보 중단
- root run당 follow-up 최대 한 번 보장

### 단계 4. Career 진입점

`harper_beta/src/lib/career/prompts/conversationStarters.ts`

`harper_beta/src/lib/career/reengagementActions.ts`

`harper_beta/src/app/api/talent/session/reengagement/route.ts`

`harper_beta/src/components/career/chat/CareerComposerSection.tsx`

`harper_beta/src/hooks/career/useCareerAutoStart.ts`

`harper_beta/src/app/api/talent/chat/call-wrapup/route.ts`

- `career_check_in` starter 등록
- email CTA auto-start
- 열린 call이 있을 때만 re-engagement의 구조적 `start_call` action과 composer `+` 항목 노출
- 통화 시작 시 call을 `active`, 유효한 통화 완료 시 `completed`로 전환하고 완료 event 기록

## 12. 필수 테스트

### 12.1 Scheduler 단위 테스트

1. 마지막 통화 74일: 후보 아님
2. 마지막 통화 정확히 75일: 첫 검토 due
3. 최근 review 후 44일: 후보 아님
4. 최근 review 후 정확히 45일: 다시 due
5. 최근 30일 internal formal recommendation 수락: 이번 회차 skip
6. Internal fit만 있고 formal recommendation/수락 없음: skip 아님
7. External recommendation 수락: skip 아님
8. Internal 수락이 30일 window 밖: skip 아님
9. 최근 user message 14개: skip 아님
10. 최근 user message 정확히 15개: skip
11. Assistant/outbound/system message를 섞어도 user 14개면 skip 아님
12. Call/chat/mail user message를 합쳐 15개: skip
13. 두 skip이 동시에 참: scheduler check 한 건, skip reason 두 개
14. Skip 후 3일 scanner에서는 재검토하지 않음
15. Skip 후 45일이면 다시 review due
16. 다른 opportunity trigger가 함께 있음: 해당 run은 생성되고 check-in action만 제외
17. 기존 trigger가 전혀 없어도 check-in due면 run 생성
18. `dont_share`, 삭제 계정, 온보딩 미완료는 기존 hard boundary로 제외
19. Check-in 통화 완료 후 다시 75일 대기
20. Profile/Brief/Memory 변경만으로 75일 anchor가 리셋되지 않음

경계 시각은 DB와 worker 모두 UTC를 사용하고, `>=` 기준을 테스트한다.

### 12.2 LLM evaluation

LLM evaluation을 추가할 때는 `docs/evaluation/career-check-in/README.md`를 registry 계약에 맞춰 만들고, 실제 prompt builder와 normalizer를 canonical runner에서 사용한다.

최소 사례:

1. Harper가 아무 추천 가치도 제공하지 못한 가입 75일 사용자: standalone 요청을 억지로 보내지 않음
2. 최근 맥락이 거의 없고 현재 상황 확인이 이후 연결에 유용한 사용자: 자연스러운 check-in 선택 가능
3. 많이 사용하다 갑자기 조용해진 사용자: 행동 감시처럼 말하지 않고 현재 변화 중심으로 질문
4. 최근 이직했다고 명시한 사용자: 같은 내용을 다시 캐묻지 않음
5. 회사 요청/일정 선택 pending: primary action을 흐리지 않음
6. 특정 추천과 현재 상황 확인이 직접 연결됨: 한 메일로 자연스럽게 결합 가능
7. Check-in 단독 이메일: 통화가 primary CTA이고 짧은 답장 대안이 명확함
8. “그대로예요/바빠요/이직했어요” 답장: 답장을 존중하고 즉시 통화를 재촉하지 않음
9. Initial 무응답: follow-up을 보내더라도 한 번, 짧고 압박 없이 작성
10. Check-in 메일 발송 성공: pending `talent_calls` 한 건 생성
11. 열린 call 없음: composer와 re-engagement에 check-in 통화 action 없음
12. 열린 call 있음: composer와 re-engagement에서 동일 starter로 통화 시작 가능
13. 사용자 발화 후 통화 완료: call이 completed로 닫히고 action이 사라짐

Critical failure는 다음을 0건으로 둔다.

- LLM이 action을 선택하지 않았는데 fallback copy 발송
- 사용자 맥락에 없는 이직·바쁨·관심도 단정
- 답장 직후 자동 통화 독촉
- 같은 initial에 follow-up 두 번 이상
- 임의 starter ID 또는 임의 opening prompt 실행
- Check-in-only run에서 불필요한 opportunity 검색

## 13. Rollout과 관측

Scheduler initial은 `OPPORTUNITY_CAREER_CHECK_IN_SCHEDULER_ENABLED`, 1회 follow-up은 `OPPORTUNITY_CAREER_CHECK_IN_FOLLOWUP_ENABLED`로 각각 연다. 두 flag의 기본값은 off다. Career의 `career_check_in` conversation starter는 성공적으로 발송된 요청에 대응하는 열린 call이 있을 때만 활성화된다.

1. Production feature flag는 off로 유지한 채 테스트·비운영 환경에서 flag를 켜 75일/45일 due와 두 skip의 dry-run 결과를 확인한다.
2. Skip 회차가 3일마다 반복되지 않고 정확히 45일 뒤 다시 due가 되는지 확인한다.
3. Synthetic 계정으로 경계값 14/15 messages, internal/external acceptance, mixed-trigger를 검증한다.
4. 내부 계정과 소수 cohort에서 initial만 켠다.
5. 답장 suppression과 call completion anchor가 확인된 뒤 follow-up을 켠다.
6. 문제 없을 때 점진 확대한다.

Career 안의 `career_check_in` 진입점은 scheduler rollout과 별도로 항상 노출하지 않는다. Scheduler가 실제 이메일을 성공적으로 보낸 뒤 생성된 pending call이 있을 때만 열린다.

기존 trace에서 아래만 집계한다.

- 75/45 review due
- skip: recent internal acceptance
- skip: high user message volume
- LLM selected / not selected
- standalone / combined email sent
- reply received
- call started / completed
- follow-up considered / sent / suppressed
- unsubscribe / complaint

본문, 답장 원문, transcript, Memory 원문은 analytics dimension으로 복제하지 않는다.

긴급 rollback은 scheduler에서 `career_check_in_due` feature flag를 끄면 된다. 기존 opportunity 추천, internal follow-up, 이메일 답장, Career의 사용자가 직접 누르는 starter는 독립적으로 계속 동작한다.

## 14. 완료 기준

- 마지막 온보딩/check-in 통화 75일 뒤 첫 LLM 검토가 열린다.
- 이후 통화가 없으면 45일마다 다시 검토한다.
- 최근 30일 internal formal recommendation 수락이 있으면 해당 회차를 건너뛴다.
- 최근 30일 user call/chat/mail 메시지가 합계 15개 이상이면 해당 회차를 건너뛴다.
- Skip 회차도 review 시각을 기록해 다음 검토가 정확히 45일 뒤다.
- 두 skip 외 로그인, 메일 수신, 공고 열람, 개별 context update는 주기를 바꾸지 않는다.
- Skip되지 않은 회차만 기존 orchestration LLM에 `career_check_in` action 후보로 들어간다.
- LLM이 고르지 않으면 발송 없이 끝나고 45일 뒤 다시 검토한다.
- LLM이 고르면 Harper 통화를 primary CTA로, 짧은 답장을 대안으로 제공한다.
- 답장만으로 충분하면 바로 통화를 재촉하지 않는다.
- Follow-up은 약 7일 뒤 한 번만 검토하며 두 번째 follow-up은 없다.
- 이메일 발송 성공 시 pending `career_check_in` call이 생성된다.
- 열린 call이 있을 때만 re-engagement와 composer가 동일한 `career_check_in` starter를 제공한다.
- 열린 call이 없으면 `career_check_in`은 상시 노출되지 않고 임의 시작도 거부된다.
- 유효한 check-in 통화 완료만 다음 75일 anchor를 갱신한다.
- 별도 classifier, 키워드 규칙, 정보 freshness 판정, transient judgment table 없이 동작한다.
