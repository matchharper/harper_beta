# Company Role Profile Calibration: Codex 실행 계약

- 문서 기준: 2026-09-07
- 상태: 로컬 구현과 연결됨, production rollout 전
- 구현 계획: [Company Role Profile Calibration 구현 계획](./company-role-profile-calibration-implementation-plan-ko.md)

## 1. 목적

새로운 internal Role이 등록되면 Codex가 `candid`에서 실제로 회사와 연결을 고려할 만한
프로필을 5명 안팎으로 고른다. 회사에는 이름과 사진만 바꾼 예시 프로필을 보여주고,
누가 좋고 나쁜지와 그 이유를 자연어로 받아 Hiring Brief를 더 정확하게 만든다.

이 작업은 정교한 가상 인물을 설계하는 실험이 아니다. 현재 Role의 Hiring Brief와 회사
정보를 기준으로 Harper가 실제 추천할 법한 사람들을 먼저 고르고, 그 판단이 회사의 생각과
맞는지 확인하는 가벼운 calibration이다.

## 2. 고정 전제

1. 기본 source는 `candid`다. `talent_users` 또는 Open to matches 사용자를 calibration
   source로 섞지 않는다.
2. 선택한 `candid`의 경력과 학력은 원문 사실을 유지한다. 이름, 사진, 개인 연락처와 개인
   프로필 링크만 회사에 노출하지 않는다.
3. 기본 목표는 5명이다. 숫자를 채우기 위해 연결 가능성이 낮은 사람을 넣지는 않는다.
4. 최종 5명 모두 회사와 후보자 양쪽에서 연결을 고려할 만해야 한다. 한쪽에만 좋아 보이는
   사람은 calibration 예시로 선택하지 않는다.
5. 다섯 명을 일부러 모두 경계 사례로 만들지 않는다. Harper가 현재 기준으로 좋다고 판단한
   사람을 중심으로 고른다.
6. 다만 모두 같은 회사·학교·경력 경로이거나 누구라도 당연히 좋아할 지나치게 완벽한
   프로필만으로 채우지는 않는다. 비슷한 수준의 후보 중에서는 서로 다른 강점을 보여주는
   쪽을 택한다.
7. 회사의 Good/Bad는 이 `candid` 개인에 대한 실제 채용 결정이 아니다. 실제 후보자 추천,
   연락, fit, pipeline과 어떤 talent 상태도 만들거나 변경하지 않는다.
8. 프로필 평가는 웹 버튼이 아니라 Role 채팅 또는 calibration Slack thread의 자연어
   답변으로만 받는다.

## 3. 예약 실행의 범위

Codex Scheduled는 12시간마다 실행한다. 한 번 깨어나면 현재 처리 가능한 calibration을
하나씩 순차 처리하고, 각 row를 terminal 또는 공개 가능한 상태로 끝낸 뒤 다음 row를
claim한다.

자동 대상은 다음을 모두 만족해야 한다.

- internal Role
- `status='active'`
- `is_expired=false`
- `company_roles.information.testOnly`이 true가 아님
- Role 등록 완료로 처음 active가 됨
- 같은 Role에 `failed`, `canceled`, `completed`를 포함한 어떤 상태의 calibration row도 없음

Draft 생성만으로는 대상이 되지 않는다. Role이 active가 되는 transaction에서 애플리케이션
또는 DB helper가 calibration row를 `queued`로 만든다. 한 Role에는 최초 calibration set 하나만
자동 생성하며, 과거 row가 terminal 상태여도 다시 만들지 않는다. Codex가 12시간마다 전체 Role을 읽고
대상을 추측하지 않는다.

Claim 뒤 Role이 중단·종료·삭제·만료됐거나 test-only로 바뀌었으면 프로필을 만들거나
Slack에 보내지 않고 `canceled`로 끝낸다. 프로필 공개 전 Role 또는 Hiring Brief가 바뀌어
source fingerprint가 달라졌다면 오래된 입력으로 계속하지 않고 현재 입력으로 다시 준비한다.
이미 회사에 공개한 프로필 set은 조용히 교체하지 않는다.

## 4. 매 실행에서 읽을 입력

Codex는 claim한 정확한 Role과 회사만 읽는다.

### Role

- Role 이름과 Description
- `company_internal_roles.request`의 최신 Hiring Brief
- `company_internal_roles.criteria`의 Evaluation Criteria
- 위치, 근무 방식, 고용 형태, 보상처럼 실제 연결 가능성을 바꾸는 값

`company_internal_roles.request`가 Hiring Brief의 유일한 read/write source다. 과거 대화에
남은 오래된 복사본보다 현재 저장값을 우선한다.

### 회사

- 회사명과 Company Description
- 제품, 시장, 단계, 팀 규모와 채용 맥락
- 회사가 전체 Role에 공통으로 밝힌 요청
- 현재 Role 판단에 직접 도움이 되는 최신 회사 행동 context가 이미 있으면 그 내용

회사 정보가 부족하더라도 공개 웹 검색으로 회사를 새로 조사하는 작업으로 넓히지 않는다.
저장된 정보만으로 후보자 입장에서 기회를 판단하기 어려우면 그 불확실성을 선택 판단에
반영한다.

## 5. `candid` retrieval

### 5.1 목적

SQL은 최종 5명을 결정하지 않는다. Role과 무관한 사람을 빠르게 제외하고 Codex가 읽을
현실적인 후보 pool을 만드는 recall 단계다. 모든 Role에 같은 고정 query를 재사용하지 않고,
현재 Role의 핵심 직무·seniority·domain을 기준으로 매번 read-only SQL을 작성한다.

### 5.2 사용할 데이터

- `candid`: headline, location, summary, 경력 개월, 갱신 시각과 상태
- `experience_user`: role, description, 기간
- `company_db`: 회사명과 회사 성격
- `edu_user`: 학교, 학위, 전공과 활동
- Role에 실제로 필요한 경우에만 `publications`

`candid.fts`와 structured experience를 함께 사용한다. 회사명과 직무가 같은 경력 row에
있어야 하는 조건은 `EXISTS`로 묶는다. Experience와 education join으로 row 수가 부풀지
않게 한다.

### 5.3 기본 제외

- `is_duplicated_old=true`
- `is_linkedin_deprecated=true`
- 주요 경력과 학력을 거의 확인할 수 없는 프로필
- 현재 회사가 채용하려는 직무와 명백히 다른 프로필
- 대상 회사의 현재 구성원처럼 calibration 예시로 부적절한 사람

`last_updated_at`은 최신 프로필을 우선하는 신호로 쓰되 오래됐다는 이유만으로 모든 row를
일괄 제외하지 않는다. 다만 오래된 경력 때문에 현재 seniority나 이동 가능성을 합리적으로
판단할 수 없으면 최종 5명에서 제외한다.

### 5.4 조회 크기와 수정

1. 첫 query는 최대 100명의 `candid_id`와 compact retrieval evidence를 반환한다.
2. Codex는 상위 결과의 headline, 최근 경력, 위치와 학력을 읽어 명백히 맞지 않는 사람을
   제외한다.
3. 실제 선택 가능성이 있는 최대 20명의 전체 structured profile을 읽는다.
4. 결과가 지나치게 좁거나 엉뚱하면 query를 한 번 넓히거나 고친다.
5. 숫자를 맞추기 위한 두 번째 무관 query는 만들지 않는다.

SQL에는 명시적 `LIMIT`과 `candid.id`를 포함한 stable tie-breaker가 있어야 한다. SQL rank,
FTS hit 수와 유명 회사·학교 이름만으로 최종 순서를 정하지 않는다.

## 6. 최종 프로필 선택

각 사람은 다음 네 질문을 모두 통과해야 한다.

### 6.1 회사가 만나볼 이유가 있는가

- Role의 핵심 일을 수행했다는 구체적인 경력 evidence가 있는가
- Hiring Brief와 Evaluation Criteria의 중요한 기준에 대체로 맞는가
- 회사가 기대하는 seniority와 문제 난이도에 무리가 없는가
- 유명 회사나 학교 이름만이 아니라 실제 역할·기여가 설명되는가

### 6.2 그 사람도 이 회사를 고려할 법한가

실제 구직 의사나 관심이 있다고 주장하지 않는다. 다음 이직을 고려하는 Harper 사용자라고
가정했을 때 이 기회를 보여주는 것이 자연스러운지만 판단한다.

- 최근 직무와 이번 Role 사이의 이동이 무리하지 않은가
- seniority, 책임 범위와 회사 단계가 경력의 다음 선택으로 설득력 있는가
- 저장된 위치와 Role의 근무 조건이 명백히 충돌하지 않는가
- 보상이나 고용 형태가 알려진 경우 뚜렷한 하향 이동이나 구조적 불일치가 없는가
- 후보자 입장에서 회사의 제품·시장·역할 scope 중 관심을 가질 만한 이유를 설명할 수 있는가

정보가 없다는 사실을 관심 없음으로 해석하지 않는다. 반대로 `candid`에는 실제 선호가 없으므로
구직 의사, 보상 수용 또는 이주 의향을 만들어내지도 않는다.

### 6.3 회사가 판단할 만큼 프로필이 충분한가

회사가 Good/Bad를 말할 수 있도록 최근 핵심 경력, 역할의 실제 내용과 학력이 충분히 보여야
한다. 빈 profile을 Harper의 추측으로 채우지 않는다.

### 6.4 최종 5명이 서로 완전히 중복되지는 않는가

앞선 세 조건을 통과한 사람 중 강한 후보를 먼저 고른다. 마지막 비교에서 상위 후보들이
사실상 같은 경력 경로라면, 연결 가능성이 비슷한 다음 후보로 한두 명을 바꿔 회사가 서로
다른 강점을 판단할 수 있게 한다. 다양성을 맞추기 위한 quota나 일부러 나쁜 예시는 만들지
않는다.

최종 목표는 5명이다. 한 번 query를 보정한 뒤에도 이 기준을 통과한 사람이 3~4명뿐이면 그
인원만 보낼 수 있다. 3명 미만이면 약한 사람으로 채우지 않고 `failed`로 끝내며 부족했던
이유를 짧게 남긴다.

## 7. 이름·사진 교체와 표시용 profile

최종 선택 뒤 helper가 회사에 보여줄 snapshot을 만든다.

- 원래 이름은 `예시 A`부터 `예시 E`까지의 label과 가상 이름으로 교체한다.
- 원래 사진은 미리 준비된 가상 profile image 중 하나로 교체한다.
- 같은 calibration set에서는 웹과 Slack에서 같은 이름과 사진을 유지한다.
- 개인 이메일, 전화번호, `linkedin_url`과 개인 links는 표시 snapshot에 넣지 않는다.
- 회사명, 학교명, 직무, 기간, 경력·학력 설명은 기본적으로 그대로 유지한다.
- 원래 이름이 경력 설명 안에 반복되면 가상 이름으로 치환한다. 그 외 경력 내용을
  익명화를 위해 다시 쓰지 않는다.

Codex가 꼭 확인하고 싶은 작은 가정이 있을 때만 원본을 조용히 수정하지 않고 별도
`가정`으로 붙인다.

```text
가정: 같은 경력을 가졌지만 전공이 인문계열이라면 판단이 달라지는지도 함께 보고 싶어요.
```

가정은 한 profile에 최대 하나이며, 현재 matching 판단을 실제로 바꿀 질문일 때만 쓴다.
질문을 만들기 위해 억지로 가정을 추가할 필요는 없다.

## 8. 프로필마다 작성할 선택 이유

각 profile에는 회사에 보여줄 짧은 `Harper가 고른 이유`를 작성한다.

1. 회사 관점: Role과 Hiring Brief의 어떤 근거 때문에 연결 후보로 보았는지
2. 후보자 관점: 이 사람이 다음 기회로 회사를 고려할 법하다고 본 이유
3. 다른 네 명과 비교해 특별히 확인하고 싶은 점이 있으면 한 문장

이유는 2~4문장으로 충분하다. 경력 전체를 다시 요약하거나 내부 점수, SQL, `candid`, model,
queue 같은 구현 용어를 노출하지 않는다. 후보자의 실제 관심을 확인한 것처럼 쓰지 않는다.

## 9. 저장 전 검증

Codex는 최종 JSON을 helper에 넘기기 전에 다음을 확인한다.

- profile 수가 3~5명이며 `profileId`가 `A`부터 순서대로 유일함
- 모든 source `candid_id`가 이번 run에서 읽은 pool에 있음
- 같은 `candid_id`가 중복되지 않음
- 모든 profile이 회사 적합성과 후보자 측 가능성을 각각 설명함
- 원래 이름, 사진, 이메일, 전화번호와 개인 profile URL이 표시 snapshot에 없음
- 경력과 학력은 source와 일치하고, 별도 가정만 명시적으로 구분됨
- 각 review status가 처음에는 `unreviewed`임
- Role과 Hiring Brief source fingerprint가 현재값과 일치함

검증이 끝난 결과만 calibration table에 저장한다. 원본 profile packet과 작성 SQL은 owner-only
ignored run directory에 두고 commit하지 않는다.

## 10. Slack 전달

프로필 준비가 끝나면 기존 Role notification 설정에서 활성화된 Slack channel에 calibration
root message를 한 번 보낸다. 같은 calibration ID와 channel에는 idempotency key를 사용해
중복 발송하지 않는다. 활성 channel이 여러 개면 각 channel에 root message 하나씩 보내며,
각 thread의 명시적 답변을 같은 Role의 calibration feedback으로 인정한다.

메시지는 한 번의 알림 안에 profile 3~5명을 짧게 나열한다. 버튼, Good/Bad select와 modal을
붙이지 않는다. 각 profile에는 Role 화면에서 상세를 여는 링크만 제공하며 URL unfurl은 끈다.

기준 문구의 구조는 다음과 같다. 실제 문장은 Role과 후보자에 맞게 자연스럽게 작성한다.

```text
*Backend Engineer 역할의 매칭 기준을 확인하고 싶어요*

Harper가 현재 Hiring Brief와 회사 정보를 기준으로, 실제로 연결을 고려할 만한 예시
프로필 5명을 골랐어요. 이름과 사진만 바꾼 calibration용 프로필입니다.

• *A · 김민준* — 최근 역할과 선택 이유
  <URL|프로필 보기>
• *B · 이서연* — 최근 역할과 선택 이유
  <URL|프로필 보기>

이 스레드에서 “A는 Good”, “C는 이런 이유로 Bad”처럼 편하게 알려 주세요. 무엇이
좋거나 아쉬운지도 함께 말씀해 주시면 Hiring Brief에 반영할게요.
```

Slack message가 성공하면 Role과 연결된 `company_slack_threads` 및 `company_messages`에
calibration reference를 남긴다. 이후 thread reply는 기존 company-side Slack 대화 경로로
들어간다. 별도의 Slack button interactivity 경로는 만들지 않는다.

Slack이 연결되지 않았거나 전달에 실패해도 준비된 웹 profile을 버리지 않는다. UI에는
계속 보이게 하고 같은 idempotency key로 다음 예약 실행에서 Slack 전달만 다시 시도한다.

## 11. Feedback 처리 경계

예약 Codex는 프로필을 준비하고 Slack에 전달하는 데까지만 책임진다. 사용자의 답변은 웹과
Slack의 기존 company-side LLM이 처리한다.

- 명시적으로 좋다고 한 profile만 `good`
- 명시적으로 나쁘다고 한 profile만 `bad`
- 평가하지 않았거나 뜻이 불분명하면 `unreviewed` 유지
- 이유가 없는 Good/Bad도 상태 자체는 저장
- 이유가 없다는 이유로 새로운 hard requirement를 만들어내지 않음
- 사용자가 나중에 판단을 고치면 최신의 명시적 판단을 적용

Hiring Brief에는 `A가 Good이었다` 같은 사건이나 가상 이름을 쓰지 않는다. 미래의 실제
후보자를 판단할 수 있는 Role 조건, 회사가 기대하는 caliber, 가산점, 허용 가능한 대체 경로와
명시적 부정 기준으로 일반화한다.

## 12. 실행 종료 체크리스트

- [ ] 정확한 queued Role 하나를 claim했다.
- [ ] Role이 active, internal, unexpired, non-test인지 다시 확인했다.
- [ ] 현재 Hiring Brief와 회사 정보를 읽었다.
- [ ] Role 전용 read-only SQL로 `candid` pool을 만들었다.
- [ ] 최종 profile 모두 회사와 후보자 양쪽에서 연결 가능성이 있었다.
- [ ] 모두 비슷하거나 지나치게 완벽한 profile만 선택하지 않았다.
- [ ] 원래 이름·사진·연락처·개인 링크를 표시 snapshot에서 제거했다.
- [ ] 경력·학력을 임의로 고치지 않았고 가정은 별도 표시했다.
- [ ] 실제 후보자 추천·fit·연락·pipeline 데이터를 변경하지 않았다.
- [ ] Calibration row와 Slack 전달 결과를 검증했다.
