# Company-side UX Writing 코드 반영 검토안

> 상태: 로컬 구현 반영 완료 · 배포 전 임시 문서
>
> 기준 문서: `docs/company-side-ux-writing-guide-ko.md`
>
> 범위: `/org`, company-side Harper, company-side Slack
>
> 이 문서는 구현 결과를 확인한 뒤 삭제한다. 2026-08-21 기준 제품 코드, 프롬프트와 관련 테스트에 반영했으며 배포하지 않았다.

## 1. 결론

현재 문구는 한 파일에서 관리되지 않는다. 같은 의미가 다음 네 층에 흩어져 있다.

1. company-side Harper의 system prompt와 역할 작성 prompt
2. tool 실행 전후에 서버가 직접 만드는 확정 문구
3. `/org` React 화면과 상태 라벨
4. Slack 알림, Block Kit, modal, 오류 메시지

따라서 prompt에 가이드 한 문단을 추가하는 것만으로는 일관된 UX가 만들어지지 않는다. 다음 구조가 적절하다.

- 반복되는 제품 고유명은 작은 vocabulary 모듈에서 관리한다.
- 대화형 Harper prompt에는 공통 UX writing contract를 삽입한다.
- 상태·실행 결과·확인 버튼처럼 사실 정확도가 중요한 문구는 기존 실행 코드 가까이에서 명시적으로 작성하고 테스트한다.
- 일반 Harper 대화와 구조화된 Slack 후보자 추천 prompt는 목적이 다르므로 같은 prompt 전체를 공유하지 않는다.
- `수락/거절`을 전역 치환하지 않는다. 후보자 연결, 멤버 초대, candidate-side acceptance, 내부 enum은 서로 다른 개념이다.

이번 작업은 문구와 표현 체계를 맞추는 작업이다. route, DB schema, API payload, enum, 권한, 상태 전이, 연락 방식의 기본 동작은 바꾸지 않는다.

## 2. 먼저 지킬 구현 원칙

### 2.1 영어를 줄이거나 늘리는 것이 목표가 아니다

영어는 다음 조건에서 유지하거나 새로 사용한다.

- 제품 안에서 반복되는 고유한 목적지나 문서 이름이다.
- 영어가 더 빨리 인식되고 더 정확하다.
- 채용팀이 실제 업무에서 영어로 쓰는 용어다.
- 억지로 번역하면 더 길거나 모호해진다.

예: `Roles`, `New role`, `Company`, `Members`, `Integrations`, `Company Description`, `Hiring Brief`, `Evaluation Criteria`, `Context for Harper`, `Connect`, `Reject`.

반대로 설명, 오류, 상태 변화, 다음 행동은 자연스러운 한국어 해요체가 더 정확하다. 같은 문장 안에서도 확정된 product label은 번역하지 않는다.

### 2.2 사용자가 보는 이름과 내부 값은 분리한다

다음 내부 값은 UX writing 때문에 바꾸지 않는다.

| 내부 값 | 유지 이유 | 사용자에게 보이는 표현 |
| --- | --- | --- |
| `/org/jobs` | route 호환성 | `Roles` |
| `yes` / `no` | 역할 작성 확인 payload | `Create role` / `Keep editing` |
| `accept` / `reject` | 후보자 결정 action·저장 값 | 첫 결정 UI에서는 `Connect` / `Reject` |
| `cc_intro` / `contact_directly` | 연결 방식 enum | 승인 후 정한 표시 이름 |
| `active` / `paused` / `ended` | 역할 상태 enum | `진행 중` / `중단` / `종료` |
| revision number | 동시성·수정 이력 | 일반 사용자 문구에서는 숨김 |

### 2.3 같은 상태를 다른 말로 부르지 않는다

Role lifecycle의 표시 이름은 한 곳에서 관리한다.

- `draft` → `작성 중`
- `active` → `진행 중`
- `paused` → `중단`
- `ended` → `종료`

`진행중`, `일시중지`, `중지`, raw `active` 같은 변형을 제거한다. 단, Pipeline의 `연결 대기`, `연결됨`, `프로세스 종료`는 Role lifecycle과 다른 상태이므로 합치지 않는다.

### 2.4 결과 문구는 실제 상태보다 앞서가지 않는다

- draft는 `준비했어요`. 보내지 않았다면 이를 같이 쓴다.
- scheduled는 `보내도록 등록했어요`. 아직 전달되지 않았다고 쓴다.
- processing은 `전달 준비 중이에요`. 취소 가능 여부를 정확히 쓴다.
- sent만 `보냈어요`라고 쓴다.
- unanswered는 Connect도 Reject도 아니다.
- 후보자의 candidate-side acceptance만으로 회사에 자동 공유됐다고 표현하지 않는다.

## 3. 제안하는 공통 코드 구조

### 3.1 제품 고유명 vocabulary

신규 파일 제안:

`src/lib/org/productVocabulary.ts`

여기에는 번역 함수나 모든 문장을 넣지 않고, 실제로 여러 화면에서 반복되는 안정적인 고유명만 둔다.

```ts
export const ORG_PRODUCT_LABELS = {
  home: "Home",
  inbox: "Inbox",
  roles: "Roles",
  newRole: "New role",
  recent: "Recent",
  organization: "Organization",
  company: "Company",
  members: "Members",
  integrations: "Integrations",
  pipeline: "Pipeline",
  companyDescription: "Company Description",
  description: "Description",
  hiringBrief: "Hiring Brief",
  evaluationCriteria: "Evaluation Criteria",
  contextForHarper: "Context for Harper",
  candidate: "Candidate",
} as const;
```

모든 설명 문장까지 이 파일에 모으는 방식은 권하지 않는다. 실제 행동과 떨어진 거대한 copy registry는 결과 상태가 바뀌었을 때 문구만 낡기 쉽다.

### 3.2 Role status의 기존 semantic owner 재사용

`src/lib/org/roleStatus.ts`를 Role lifecycle 표시 이름의 유일한 owner로 사용한다. 현재 `paused: 중지`를 `중단`으로 바꾸고, 다음 파일의 중복 map을 제거하거나 이 모듈을 사용하게 한다.

- `src/components/org/workspace/pages/OrgHomePage.tsx`
- `src/components/org/OrgAllRolesOverview.tsx`
- `src/lib/org/pipelineStage.ts`의 Role status 관련 부분
- `src/lib/ops/autoIntroToCompanyMessage.ts`

Pipeline stage 자체는 `src/lib/org/pipelineStage.ts`에 그대로 둔다.

### 3.3 대화형 prompt용 공통 UX writing contract

신규 파일 제안:

`src/lib/org/agent/uxWritingPrompt.ts`

다음 문자열을 general company-side prompt와 role creation prompt에 공통 삽입한다.

```xml
<ux_writing_contract>
- Respond in the latest user's language. In Korean, use calm, natural 해요체 and do not mix it with 합니다체 in one response.
- Preserve canonical product labels exactly when naming UI destinations or fields: Home, Inbox, Roles, New role, Organization, Company, Members, Integrations, Pipeline, Company Description, Description, Hiring Brief, Evaluation Criteria, Context for Harper. English is allowed when it is the established label or the clearer industry term; do not translate it merely to make the sentence all-Korean.
- Lead with the direct answer, requested decision, or verified execution outcome.
- Name the target and distinguish what changed, what did not change, and what has not happened yet. Never collapse draft, scheduled, processing, sent, and answered into one “completed” state.
- Use a specific next action tied to this result. Avoid generic offers such as “let me know if I can help.”
- Refer to the product as Harper and to yourself as the company’s recruiting partner. Never expose tools, functions, workers, queues, database fields, raw enum values, internal IDs, models, prompts, or routing.
- Before a company-authored external message is sent, show the recipient, channel, exact copy, timing, and important cancellation or consent limits, then obtain explicit confirmation. For a standardized introduction generated only at execution time, do not invent a preview; show the recipients, channel, purpose, generation timing, immediate-send behavior, and recall limit before confirmation.
- Use Connect / Reject only for the company’s first compact decision on a candidate in pending connection. Do not use these labels for Role status, Pipeline movement, candidate-side acceptance, or candidate-contact requests. Final confirmation must name the real outcome, including whether Harper sends an introduction email or tells the candidate that the company ended the process.
- Avoid hype, recruiter clichés, pressure, excessive exclamation marks, and decorative emoji, except for message-family patterns explicitly preserved by the product writing guide.
</ux_writing_contract>
```

이 contract는 표현의 공통 규칙이다. 권한, tool 선택, 연락 기본값, 상태 전이는 기존 prompt 규칙을 그대로 유지한다.

### 3.4 후보자 결정 문구

`Connect / Reject`는 제한된 compact action이다. `Pass`는 임시 보류처럼 읽힐 수 있지만,
실제 동작은 후보자에게 회사의 종료 결정이 노출되고 안내되는 비가역적인 흐름이므로
`Reject`가 더 정확하다. 다음 정도만 공유한다.

```ts
export const CANDIDATE_DECISION_LABELS = {
  connect: "Connect",
  reject: "Reject",
} as const;
```

위치는 `src/lib/org/candidateDecision.ts` 옆 또는 작은 `candidateDecisionCopy.ts`가 적절하다. 최종 확인 버튼은 결과가 서로 달라 공통 상수 하나로 뭉치지 않는다.

- 소개 이메일 방식: `Send intro & connect`
- 직접 연락 방식: `Mark as connected`
- Reject 최종 확인: `Reject candidate`

한국어를 선택한다면 각각 `소개 이메일 보내고 연결하기`, `직접 연락으로 연결하기`, `후보자 연결 거절하기`로 한 세트를 사용한다.

## 4. Prompt 변경안

### 4.1 General company-side Harper

대상:

- `src/lib/org/agent/prompts.ts`
- `src/lib/org/agent/prompts.test.ts`

#### 바꿀 내용

1. Web 진입 안내의 `*New*`를 `*New role*`로 바꾼다.
2. identity 문구의 `iconic companies`와 `career agent`를 제거한다.
3. `do not mix writing systems` 규칙을 제거한다. 확정된 영어 product label과 정확한 업계 용어를 허용한다.
4. 한국어 voice 예시의 `너가`, 미완성 placeholder인 `나는 ~~~`를 제거한다.
5. 위의 `<ux_writing_contract>`를 삽입한다.
6. navigation marker의 화면 이름을 맞춘다.

현재 개념:

```text
[Home](home)
[Roles](roles)
[Text](role:id)
[이름](talent:id)
[Team](team)
```

제안:

```text
[Home](home)
[Roles](roles)
[저장된 역할명](role:id)
[후보자 이름](talent:id)
[Members](team)
```

marker의 실제 target 값 `home`, `roles`, `role:id`, `talent:id`, `team`은 바꾸지 않는다. 사용자에게 보이는 label만 바꾼다.

7. 후보자 결정 설명에서 모든 문장을 `수락/거절`로 부르지 않는다.
   - compact 첫 선택: `Connect / Reject`
   - 자연어 설명: `연결하기 / 연결 거절하기`
   - 확정 결과: 실제로 소개 이메일을 보냈는지, 직접 연락으로 표시했는지 구체적으로 쓴다.
8. 현재 기본 행동은 유지한다.
   - Harper가 먼저 제시하는 기본 연결 방식은 CC introduction이다.
   - direct contact는 사용자가 명시적으로 요청했을 때만 사용한다.
   - Pipeline 이동만으로 외부 연락을 보내지 않는다.

#### identity 제안

```text
You are Harper, the recruiting partner for the hiring team using this company workspace.
```

#### 테스트 변경

- `do not mix writing systems`를 기대하는 assertion 삭제
- `*New*` 대신 `*New role*` 확인
- canonical product label 보존 확인
- Korean 해요체와 합니다체 혼용 금지 확인
- 상태별 `not sent yet` 구분 규칙 확인
- `Connect / Reject`의 제한된 사용 범위 확인
- tool, queue, raw enum, model, prompt 등 내부 표현 금지 확인
- 기존 CC introduction 기본값, direct contact 조건, permission 규칙 테스트는 유지

### 4.2 Role creation prompt

대상:

- `src/lib/org/agent/roleCreationPrompt.ts`
- `src/lib/org/agent/roleCreationTools.ts`
- `src/lib/org/agent/roleCreationChat.ts`
- `src/lib/org/agent/roleCreationConfirmation.ts`
- 관련 테스트

#### prompt identity와 style

현재의 `company-side LLM`이라는 내부 호칭과 `natural Korean conversation` 고정 지시를 제거한다. Harper의 정체성을 company recruiting partner로 맞추고 latest user language를 따른다. 공통 `<ux_writing_contract>`를 삽입한다.

role creation 고유 규칙은 별도로 유지한다.

- 한 번에 필요한 질문만 한다.
- 이미 받은 정보를 다시 묻지 않는다.
- 링크·파일에서 확인한 사실과 사용자가 직접 말한 사실을 구분한다.
- 확인하지 못한 정보를 채워 넣지 않는다.
- 최종 등록 전에 무엇이 저장되는지 요약한다.

#### 역할 등록 확인

현재 server와 tool 설명의 `[예/아니오]`를 사용자에게 의미가 드러나는 action으로 바꾼다.

Slack marker:

```text
[Create role](button:role-confirm:yes)
[Keep editing](button:role-confirm:no)
```

button metadata label도 `Create role` / `Keep editing`으로 바꾼다. 내부 value인 `yes` / `no`는 유지한다.

클릭 후 대화 이력에 저장하는 사용자 메시지도 단순 `예`, `아니오`보다 의미 있는 label을 저장하는 편이 좋다.

- `yes` → `Create role`
- `no` → `Keep editing`

이렇게 해야 나중에 history를 읽는 Harper도 어떤 질문에 대한 예/아니오였는지 추측하지 않는다.

#### outcome prompt

`buildRoleCreationOutcomePrompt`의 “acknowledge and suggest useful next steps”는 너무 넓다. 다음 조건을 명시한다.

```text
- Start with the verified outcome: completed, declined, or revalidation failed.
- Name the Role and its current state when known.
- State what did not happen, especially when the Role was not created or no Slack message was sent.
- If validation failed, name only the fields the user can fix; do not expose raw field names or IDs.
- Give one next action that directly resolves or advances this result.
- Preserve the current web or Slack output format.
```

### 4.3 Structured Slack candidate recommendation prompt

대상:

- `src/lib/ops/autoIntroToCompanyLlmPrompt.ts`
- `src/lib/ops/autoIntroToCompanyLlm.test.ts`

이 prompt에는 general `<ux_writing_contract>` 전체를 넣지 않는다. 이 모델의 출력은 자유 대화가 아니라 renderer가 정한 후보자 field value이므로, 일반 대화의 “다음 행동을 말하라” 같은 규칙이 구조를 오염시킬 수 있다.

대신 다음 local addendum만 추가한다.

```text
- Write like a calm, specific recruiting partner. Avoid hype, pressure, recruiter clichés, exclamation marks, and decorative emoji.
- The renderer owns the schema labels. Never repeat, translate, or invent headings such as Candidate, Role, Location, Education, TL;DR, Harper Note, Work Summary, or Preferences inside field values.
- Preserve the candidate's natural working language, company names, role names, and proper nouns when translation would reduce precision.
- Do not include a call to action or Connect / Reject instructions inside candidate field values.
```

현재 prompt의 사실성 규칙과 heading 금지 규칙은 유지한다.

### 4.4 Prompt를 넣지 않을 곳

다음은 목적이 다르거나 사용자가 보는 자유 응답을 만들지 않으므로 공통 contract를 넣지 않는다.

- `src/lib/org/slackReplyRouter.ts`: 분류기
- `src/lib/org/slackFiles.ts`: 파일 입력 정규화
- `src/lib/org/introEmail.ts`: 후보자에게 보내는 소개 이메일 prompt. 이번 가이드의 detailed voice 범위 밖
- `src/lib/companyTalentRequests/copy.ts`: 후보자 대상 연락문 생성. company-facing preview/status만 이번 범위

## 5. 실행 단계와 deterministic response 변경안

LLM prompt를 고쳐도 아래 문구는 서버가 직접 만들기 때문에 자동으로 바뀌지 않는다.

### 5.1 `src/lib/org/agent/toolExecution.ts`

#### status label

다음 원칙으로 정리한다.

| 현재 계열 | 제안 |
| --- | --- |
| 웹에서 확인하는 중 | 웹 검색 중 |
| 웹 검색 완료 | 웹 검색 완료 |
| 웹 검색을 완료하지 못했습니다 | 웹 검색 실패 |
| 추가 회사 정보 | 회사 정보 또는 정확한 field 이름 |
| 포지션 | 자연어 문장에서는 역할, UI 고유명은 Role |
| 평가 기준 | field를 지칭하면 Evaluation Criteria |
| 반영 완료 | 무엇을 바꿨는지 구체적으로 표시 |

검색 결과 0건과 기술적 실패는 다르게 써야 한다.

- 0건: `조건에 맞는 결과를 찾지 못했어요.`
- 실패: `웹 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`

#### 회사·역할·기준 수정 결과

`반영했습니다`, `회사 정보 업데이트됨` 같은 문구는 target과 scope를 숨긴다. 다음 패턴으로 바꾼다.

```text
Company Description을 저장했어요.
Evaluation Criteria 2개를 추가했어요. 기존 기준 3개는 그대로예요.
Backend Engineer 역할의 근무 지역을 서울로 바꿨어요. 고용 형태는 바꾸지 않았어요.
```

실제로 바뀌지 않은 경우도 구분한다.

```text
이미 같은 내용으로 저장되어 있어 바뀐 것은 없어요.
```

#### Role status 결과

```text
Backend Engineer 역할을 중단했어요. 새 후보자 추천은 멈추지만 기존 후보자와 진행 중인 연결은 그대로예요.

Backend Engineer 역할을 종료했어요. 새 후보자 추천은 멈추고, 기존 후보자 기록은 남아 있어요.
```

실제 구현의 효과가 위 문장과 다르면 표현을 구현에 맞춘다. copy를 기준으로 동작을 추정하지 않는다.

#### 후보자 연락 draft·schedule·processing·sent

현재 사용자에게 보이는 `revision`, `발송 대기열`, `발송 등록`은 내부 구현의 언어다. payload에는 유지하되 문구에서는 숨긴다.

```text
{candidate}님에게 보낼 문구를 준비했어요. 아직 이메일이나 Harper 채팅으로 보내지 않았어요.

{KST 시각}에 이메일과 Harper 채팅으로 보내도록 등록했어요. 아직 전달되지 않았어요.

지금 전달을 준비하고 있어요. 이 단계에서는 취소할 수 없어요.

{candidate}님에게 이메일과 Harper 채팅으로 보냈어요.
```

어느 channel이 실제로 가능한지에 따라 문장을 조합해야 한다. 이메일 주소가 없거나 한 channel만 사용되면 둘 다 보낸 것처럼 쓰면 안 된다.

#### 후보자 연결 결과

연결 확정 후에는 compact label을 반복하지 않고 실제 결과를 쓴다.

```text
{candidate}님과 연결하기로 했어요. Harper가 {recipient}에게 소개 이메일을 보냈어요.

{candidate}님과 직접 연락하기로 표시했어요. Harper가 소개 이메일을 보내지는 않았어요.

{candidate}님의 연결을 거절했어요. 회사가 이번 연결을 진행하지 않기로 했다는
종료 결정이 후보자에게 노출되고 Harper가 이를 안내해요. 이미 후보자에게 보이거나
전달된 안내는 회수할 수 없어요.
```

### 5.2 `src/lib/companyTalentRequests/presentation.ts`

현재 preview heading의 `(revision N)`과 `발송 대기열` 표현을 제거한다. revision parameter와 concurrency check는 유지한다.

```md
**{candidate}님에게 보낼 문구**

{role} 역할과 관련해 이메일과 Harper 채팅으로 같은 내용을 보내요.

**제목**
...

**내용**
...

아직 보내지 않았어요. 이 문구 그대로 보낼까요, 고칠 내용을 알려주시겠어요?
```

### 5.3 role creation 실행 상태

대상:

- `src/lib/org/agent/roleCreationChat.ts`
- `src/lib/org/agent/roleCreationCompletionMessage.ts`
- `src/lib/org/agent/slackRoleCreationMessages.ts`

#### 실행 status

```text
링크 읽는 중 → 링크 확인 완료 / 링크 확인 실패
웹 검색 중 → 웹 검색 완료 / 웹 검색 실패
알림 설정 저장 중 → 알림 설정 저장 완료 / 알림 설정 저장 실패
등록 조건 확인 중 → 등록 조건 확인 완료 / 확인할 항목이 있어요
```

`Company Description 저장 중`은 실제로 그 문서를 저장할 때만 사용한다. 여러 회사 field를 함께 저장하면 `회사 정보 저장 중`이라고 쓴다.

#### 역할 등록 완료 메시지

web과 Slack 모두 다음 네 정보만 짧게 담는다.

1. 등록된 Role과 현재 상태
2. Harper가 이제 하는 일
3. 회사의 Connect / Reject와 unanswered 경계
4. Evaluation Criteria를 나중에 바꿀 수 있다는 안내

예시:

```text
{company}의 {role} 역할을 등록했어요.

Harper가 Evaluation Criteria에 맞는 후보자를 찾아 추천할게요. 후보자를 검토한 뒤 회사가 Connect 또는 Reject를 선택하면 그 결정에 따라 다음 단계를 진행해요. Reject하면 회사가 더 진행하지 않기로 했다는 종료 결정이 후보자에게 안내돼요. 답하지 않은 후보자를 임의로 처리하지 않아요.

기준이 달라지면 Evaluation Criteria에서 언제든 수정할 수 있어요.
```

Slack delivery 결과는 별도 한 줄로 정확히 붙인다.

```text
선택한 Slack 채널에도 역할 등록과 후보자 탐색 시작을 알렸어요.
```

실패 시:

```text
Slack에는 등록 안내를 보내지 못했어요. 역할 등록과 후보자 탐색은 정상적으로 시작됐어요. Slack 연결과 알림 채널을 확인해 주세요.
```

#### Slack 역할 작성 시작 메시지

현재 emoji 중심 문구를 다음 구조로 줄인다.

```text
*{role} 역할 작성을 시작했어요*
{source 설명}

초안 상태예요. 이 thread에서 정보를 더 보내거나 <{url}|웹에서 계속 작성하기>를 선택할 수 있어요.
```

## 6. `/org` 화면 변경안

### 6.1 Sidebar와 navigation

대상: `src/components/org/workspace/OrgWorkspaceSidebar.tsx`

| 현재 | 제안 |
| --- | --- |
| New | New role |
| recent 영역의 Roles | Recent |
| 회사정보 | Company |
| 멤버 | Members |
| Integration | Integrations |

`Home`, `Inbox`, `Roles`, `Organization`, `Workspace`는 유지한다.

Slack 연결 card는 기능명보다 결과가 먼저 보이도록 다듬는다.

- `역할 생성` → 문맥에 따라 `역할 작성` 또는 `역할 등록`
- 연결됨/끊김, 알림 channel, 사용자가 할 수 있는 다음 행동을 분리

### 6.2 Home

대상: `src/components/org/workspace/pages/OrgHomePage.tsx`

- raw `active`, `paused`, `ended`, `waiting`을 노출하지 않는다.
- Role lifecycle은 공통 status 모듈을 사용한다.
- `등록된 Job이 없습니다.` → `아직 등록된 Role이 없어요.`
- empty state에는 `New role` action을 함께 둔다.
- Quick action이 navigation과 같은 목적지라면 `Company`, `Members`, `Integrations` label을 재사용하고 설명은 한국어로 쓴다.

### 6.3 Roles list

대상: `src/components/org/OrgAllRolesOverview.tsx`

- 자체 status map을 제거하고 `roleStatus.ts`를 사용한다.
- `진행중`, `작성중`을 각각 `진행 중`, `작성 중`으로 통일한다.
- `조건에 맞는 Role이 없습니다.` → `조건에 맞는 역할이 없어요.`
- `새로운 역할 등록을 완료하세요.` → `{role} 역할 작성을 이어가세요.`
- `Open {relative date}`는 `updatedAt`을 사용하고 있어 의미가 맞지 않을 가능성이 있다. 구현 때 실제 값의 의미를 확인하고 `Updated {date}` 또는 정확한 사건 이름으로 고친다.

### 6.4 Organization

대상:

- `src/components/org/workspace/pages/OrgTeamPage.tsx`
- `src/components/org/workspace/pages/OrgSettingsPage.tsx`

변경안:

- page header: `Company`, `Members`, `Integrations`
- `회사 설명` field와 document title: `Company Description`
- `Integration`: `Integrations`
- 개별 Slack section: `Slack` 또는 `Slack integration`
- placeholder의 `인재`: `후보자`
- `인재 연결 제안`: `후보자 추천 및 검토 알림`
- `메시지 내용에서 포지션을 자동 판단`: `메시지에서 Role 자동 선택`

멤버 초대의 `수락 대기`, 초대 수락/거절은 후보자 결정이 아니므로 `Connect / Reject`로 바꾸지 않는다.

### 6.5 Role documents

대상:

- `src/components/org/role-overview/OrgRoleMatchingContent.tsx`
- `src/components/org/role-overview/OrgRoleDetailsContent.tsx`
- `src/components/org/role-overview/OrgRoleSettingsContent.tsx`

| 현재 | 제안 |
| --- | --- |
| Role Request | Hiring Brief |
| 평가 기준 | Evaluation Criteria |
| 역할 정보 document title | Description |
| Guide for Harper | Context for Harper |

`Context for Harper`는 현재 UI가 주석 처리되어 있다면 runtime에는 손대지 않고, 다시 활성화하기 전에 이름부터 맞춘다.

Evaluation Criteria 설명의 `민감한 사항도 전부 괜찮습니다`는 너무 넓고 안전하지 않다. 다음처럼 범위를 좁힌다.

```text
공개 Description에 넣기 어려운 내부 기준도 작성할 수 있어요. 직무와 관련된 기준만 남겨 주세요.
```

criteria 개수 도움말은 실제 제약과 맞춘다.

```text
2–4개를 권장하며, 최대 6개까지 추가할 수 있어요.
```

저장 toast도 target을 명시한다.

- `정보를 저장했습니다` → `Description을 저장했어요.`
- `Role 설정을 저장했습니다` → `알림 설정을 저장했어요.` 또는 실제 변경한 setting 이름

### 6.6 Harper panel과 composer

대상:

- `src/components/org/agent/OrgAgentPanel.tsx`
- `src/components/org/agent/OrgAgentComposer.tsx`
- `src/components/org/agent/OrgAgentMessage.tsx`
- `src/hooks/org/useOrgAgent.ts`

#### panel 안내

현재 설명은 실제 tool capability와 어긋난 부분이 있다. 다음처럼 고친다.

```text
후보자와 역할을 찾고, 회사 정보와 채용 기준을 확인하거나 바꿀 수 있어요. 후보자는 이름이나 @로 지정해 주세요. 외부 연락과 중요한 상태 변경은 결과를 설명한 뒤 확인받아요.
```

empty state:
```text
어떤 역할을 채용하려고 하시나요? JD 링크나 파일을 보내거나, 생각해 둔 내용을 편하게 적어 주세요.
```

#### composer

- aria의 `company-side LLM 모델` → `Harper 모델 선택`
- `연결 목록`, talent 문구 → 후보자 개념으로 통일
- `Searching...` → `후보자 찾는 중`
- `에이전트 응답을 만들지 못했습니다.` → `답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.`
- `작성 중...` → `답변 작성 중`

composer placeholder와 후보자 검색 관련 microcopy는 현행을 유지한다.

### 6.7 Candidate decision

대상:

- `src/components/org/OrgRoleTalentBoard.tsx`
- `src/components/org/TalentDetailSimpleView.tsx`
- `src/components/org/OrgCandidateDecisionDialogs.tsx`
- `src/lib/org/candidateDecision.ts`

첫 compact action만 통일한다.

- `연결 수락`, `수락`, `연결하기` → `Connect`
- `연결 거절`, `거절`, `이번에는 연결하지 않기` → `Reject`

modal의 마지막 button은 `확인`이 아니라 결과를 쓴다.

- Email intro: `Send intro & connect`
- Direct contact: `Mark as connected`
- Reject: `Reject candidate`

모바일과 desktop, list와 detail, web과 Slack에서 같은 action family를 써야 한다.

activity/feed에 이미 끝난 결과를 표시하는 `수락/거절`은 compact action이 아니다. event 의미를 확인한 뒤 `연결 시작`, `연결하지 않음`처럼 결과형으로 바꾸고, 전역 치환은 하지 않는다.

Reject reason preset의 내용은 이번 작업에서 바꾸지 않는다. label만 decision taxonomy와
맞추며 preset 값과 사용자 저장 값은 현행을 유지한다.

### 6.8 사용자 도움말과 legacy surface

대상:

- `src/components/org/workspace/pages/OrgDocumentsPage.tsx`
- `src/content/org-documents.md`
- `src/components/org/OrgDocsModal.tsx`
- `src/components/org/OrgSlackPanel.tsx`

새 Documents page만 고치면 안 된다. `OrgDocsModal`과 `OrgSlackPanel`이 여전히 mount되는 live surface이면 같은 release에서 문구를 맞추거나 retire해야 한다.

- `Integration` → `Integrations`
- 첫 후보자 결정 UI 설명 → `Connect / Reject`
- 설명 문장에서는 `연결하기 / 연결 거절하기` 사용 가능
- 멤버 초대의 `수락 대기`는 유지

`src/components/org/workspace/pages/OrgInboxPage.tsx`의 `수락 후 대기`는 candidate-side acceptance 또는 Harper 최종 확인 단계일 수 있으므로 자동 변경하지 않는다. 일반 회사 사용자에게 보이는 상태인지와 실제 의미를 확인한 뒤 `Harper 확인 대기` 같은 더 정확한 이름을 검토한다.

## 7. Slack 변경안

### 7.1 Welcome

대상:

- `src/lib/org/slackWelcome.ts`
- `src/lib/org/slackWelcome.test.ts`

현재의 축하형 emoji와 기능별 emoji는 연결 완료와 사용법을 구분하기 위해 의도된
message-family 표현이다. 제거하거나 개수를 줄이지 않고 현행을 유지한다. 주변 문구의
용어와 해요체만 다른 Slack surface와 맞춘다.

### 7.2 Role notification

대상:

- `src/lib/org/slackMessages.ts`
- `src/lib/org/agent/slackRoleCreationMessages.ts`
- 관련 notification 테스트

- title은 사건을 구체적으로 쓴다: `{role} 역할을 등록했어요`
- actor email은 꼭 필요하지 않으면 노출하지 않는다. 이름을 우선하고 email은 fallback으로만 쓴다.
- 상태와 다음 행동을 분리한다.
- emoji는 상태 전달에 꼭 필요한 경우 최대 1개만 사용한다.

### 7.3 Candidate recommendation renderer

대상:

- `src/lib/ops/autoIntroToCompanyMessage.ts`
- `src/lib/ops/autoIntroToCompanyNotifications.ts`
- `src/lib/ops/autoIntroToCompanyPolicy.ts`
- 관련 테스트

schema는 영어를 유지한다.

```text
*Candidate* ...
*Role* ...
*Location* ...
*Education* ...

*TL;DR*
...

*Harper Note*
...

*Work Summary*
...

*Preferences*
...
```

candidate block 안의 all-caps `PLEASE REPLY...`와 divider는 여러 후보자 card의 경계를
빠르게 인식시키기 위해 의도된 구조다. 문구, capitalization, 위치와 divider 형식을
현행 유지한다. 일반 Slack 메시지의 기본 규칙으로 확대하지 않는다.

notification 시작:

```text
*새로 검토할 후보자가 있어요*
```

긴 인사말은 생략한다. response guidance는 다음 정도로 줄인다.

```text
프로필을 확인한 뒤 Connect 또는 Reject를 선택해 주세요. Reject하면 회사가 더
진행하지 않기로 했다는 종료 결정이 후보자에게 안내돼요. 이번 추천과 맞지 않는 점이
있다면 다음 추천에 반영할 기준도 알려 주세요.
```

추가 질문이 있을 때:

```text
*다음 추천을 위한 질문* {question}
```

Role summary의 `진행중`, `일시중지`는 공통 status 표시를 사용해 `진행 중`, `중단`으로 맞춘다.

### 7.4 Slack Candidate Review와 modal

대상:

- `src/lib/org/slackTalentReviewView.ts`
- `src/app/api/internal/slack/interactivity/route.ts`
- 관련 테스트

첫 button:

- `수락` → `Connect`
- `거절` → `Reject`

read-only 안내:

```text
후보자 정보는 볼 수 있지만 연결 여부는 결정할 수 없어요. Owner 또는 Admin에게 요청해 주세요.
```

final submit은 web과 같은 결과형 label을 사용한다. Slack plain-text 길이 제한을 구현 때 확인한다.

결과 메시지는 다음을 구분한다.

- 소개 이메일을 실제로 보냄
- direct contact로 연결 처리했고 이메일은 보내지 않음
- Reject 처리했고 후보자에게 회사의 종료 결정이 안내됨
- 이미 다른 사용자가 결정해 현재 상태가 바뀜
- 권한 없음
- 이메일 없음 또는 Slack 연결 문제

### 7.5 Slack choice와 runtime error

대상:

- `src/lib/org/slackChoiceButtons.ts`
- `src/app/api/internal/org-agent/slack-turn/route.ts`
- `src/lib/org/slackIntegration.ts`

`선택해 주세요`라는 fallback은 무엇을 선택하는지 알 수 없다. caller가 질문을 반드시 제공하게 하거나, 최소한 `다음 행동을 선택해 주세요`로 바꾼다. 역할 등록은 `Create role / Keep editing`, 후보자 검토는 `Connect / Reject`처럼 각 caller의 action을 쓴다.

runtime status와 오류:

- `답변을 작성 중입니다…` → `답변 작성 중`
- `Slack file` → `Slack 파일`
- 파일 권한 오류 → `Slack 파일을 읽을 권한이 없어요. Workspace 관리자가 Harper Slack 앱을 다시 연결해 주세요.`
- 내부 API error, raw payload, stack, model 이름은 사용자에게 전달하지 않는다.
- `Workspace` 표기를 통일한다.

### 7.6 기타 Slack surface

`src/lib/org/slack.ts`의 후보자 프로세스 중단 알림과 `src/lib/org/slackHarper*`의 사용자 전달 오류도 구현 때 함께 검색한다. 내부 log만 바꾸지는 않고 실제 web/Slack으로 전달되는 문자열만 수정한다.

## 8. 변경하지 말아야 할 동작과 영역

문구 변경 중 아래 invariant가 깨지면 안 된다.

1. 후보자의 candidate-side acceptance만으로 회사에 자동 공유하지 않는다. Harper human final check 뒤에 `연결 대기`가 된다.
2. 회사가 명시적으로 Connect 또는 Reject해야 Harper matching flow가 끝난다. 무응답을 어느 쪽으로도 추론하지 않는다.
3. company-side Harper가 먼저 안내하는 연결 방식은 CC introduction이다. direct contact는 명시적 요청에만 사용한다.
4. direct contact에서는 Harper가 소개 이메일을 보내지 않는다.
5. Pipeline stage 이동만으로 외부 연락을 보내지 않는다.
6. 역할 중단·종료가 기존 후보자 기록이나 진행 중 연결에 주는 영향은 실제 구현 그대로 설명한다.
7. organization member invitation의 accept/reject는 `Connect / Reject` taxonomy와 합치지 않는다.
8. 내부 enum, route, API action, DB field는 문구와 함께 rename하지 않는다.
9. candidate-facing 이메일 본문의 detailed voice는 별도 initiative다. 이번에는 company-facing preview와 상태만 맞춘다.

## 9. 테스트 변경안

### 9.1 직접 영향받는 테스트

- `src/lib/org/agent/prompts.test.ts`
- `src/lib/org/agent/roleCreationPrompt.test.ts`
- `src/lib/org/agent/roleCreationCompletionMessage.test.ts`
- `src/lib/org/agent/roleCreationCompletionContract.test.ts`
- `src/lib/org/agent/slackRoleCreation.test.ts`
- `src/lib/org/agent/toolExecution.test.ts`
- `src/lib/org/agent/promptFormat.test.ts`
- `src/lib/companyTalentRequests/presentation.test.ts`
- `src/lib/ops/autoIntroToCompanyLlm.test.ts`
- `src/lib/ops/autoIntroToCompanyMessage.test.ts`
- auto-intro notification 관련 테스트
- `src/lib/org/slackWelcome.test.ts`
- `src/lib/org/slackNotifications.test.ts`
- `src/lib/org/slackChoiceButtons.test.ts`
- `src/lib/org/slackTalentReviewView.test.ts`
- `src/lib/org/documentsPageContract.test.ts`
- `src/lib/org/roleWorkspaceResponsiveContract.test.ts`
- `src/lib/org/candidateConnectionDefaultsContract.test.ts`
- `src/lib/org/candidateReactivationContract.test.ts`
- `src/lib/org/roleStatus.test.ts`

### 9.2 새 regression contract 제안

repository 전체를 단순 검색하는 테스트는 내부 enum과 합법적인 다른 문맥까지 막을 수 있다. 실제 사용자 surface 파일만 대상으로 다음 회귀를 검사한다.

- sidebar의 standalone `New`
- category label의 standalone `Integration`
- `Role Request`
- `진행중`, `작성중`, `일시중지`
- 사용자에게 보이는 `company-side LLM`, `career agent`
- role creation 마지막 단계의 generic `예/아니오`
- 후보자 첫 compact action의 `수락/거절`

문자열 snapshot만 추가하지 말고 행동 invariant 테스트를 유지한다.

- default CC introduction
- direct contact는 explicit request에만 사용
- direct contact에서 email 미발송
- unanswered를 decision으로 추론하지 않음
- candidate acceptance precondition
- Pipeline 이동만으로 외부 연락 없음
- draft / scheduled / processing / sent 구분

### 9.3 수동 QA matrix

| 영역 | 확인할 경우 |
| --- | --- |
| General Harper | 한국어 질문, 영어 질문, product label이 포함된 한국어 답변 |
| Role creation | web/Slack, 링크/파일/직접 입력, Create role/Keep editing, validation 실패 |
| 수정 tool | 성공, no-op, 일부 field만 변경, 권한 오류 |
| Role status | active/paused/ended와 기존 후보자 영향 설명 |
| 후보자 연락 | draft, revise, schedule, cancel, processing, sent, email 없음 |
| Candidate decision | Connect/Reject, Email intro/Direct contact, 중복 결정, read-only 사용자 |
| Slack | welcome, role created, candidate recommendation, role summary, file 권한 오류 |
| format | web GFM link marker, Slack mrkdwn, Block Kit button/modal 길이 |
| parity | web과 Slack에서 같은 개념에 같은 이름 사용 |

## 10. 구현 순서

### Phase 0 — 아래 제품 선택 확정

연결 방식, Role workspace tab, composer microcopy, Reject reason을 확정한다.

### Phase 1 — foundation

- `productVocabulary.ts`
- `uxWritingPrompt.ts`
- `roleStatus.ts` 정리
- 후보자 compact action constant

### Phase 2 — prompt와 deterministic execution

- general prompt
- role creation prompt·confirmation·completion
- `toolExecution.ts`
- contact preview

### Phase 3 — `/org` navigation과 documents

- sidebar, Home, Roles, Organization
- Company Description, Hiring Brief, Evaluation Criteria, Description
- Harper panel과 composer

### Phase 4 — Candidate decision parity

- web list/detail/modal
- Slack button/modal/interactivity
- 결과와 권한 오류

### Phase 5 — Slack notification

- welcome
- role creation/created
- auto-intro renderer, notification, response guidance
- secondary Slack surface

### Phase 6 — help와 legacy surface

- Documents page/content
- legacy modal/panel 동기화 또는 retire

### Phase 7 — test와 수동 QA

- 기존 behavior invariant 유지
- surface-scoped copy regression 추가
- web/Slack matrix 확인

## 11. 확정된 구현 선택

### A. 연결 방식 이름

권장:

- `Email intro`
- `Direct contact`

이유: 두 방식의 실제 차이를 짧고 정확하게 보여주고, `CC로 연결`보다 Harper가 이메일을 보낸다는 결과가 명확하다. 한국어 설명은 아래에 붙인다.

- Email intro — Harper가 회사 담당자와 후보자에게 소개 이메일을 보내요.
- Direct contact — 회사가 직접 연락해요. Harper는 소개 이메일을 보내지 않아요.

web과 Slack modal에 함께 적용한다.

### B. Role workspace tab family

현재: `매칭 기준 / 역할 정보 / 설정 / 파이프라인`

현재 한국어 tab을 유지하고 내부 document만 `Hiring Brief / Evaluation Criteria /
Description`으로 바꾼다. 한 tab만 `Pipeline`으로 바꾸는 부분 혼용도 하지 않는다.

### C. Harper composer placeholder

현행 유지. 이번 작업에서 수정하지 않는다.

### D. Reject reason preset

현행 유지. `연봉 기대치가 높을 것 같음`을 포함한 preset 문구와 값은 이번 작업에서
수정하지 않는다.

## 12. 완료 기준

다음 조건을 모두 만족하면 이 writing 반영 작업이 끝난 것으로 본다.

- `/org`와 company-side Slack의 동일 개념이 같은 이름을 쓴다.
- English/Korean 선택이 언어 비율이 아니라 인식 속도와 정확성에 근거한다.
- Harper의 한국어 답변이 한 응답 안에서 해요체로 일관된다.
- 모든 실행 결과가 target, changed/unchanged/not-yet, 다음 행동을 구분한다.
- 외부 발송 전 recipient, channel, timing, 취소·동의 한계를 보여주고 확인받는다. 회사가
  작성·수정할 수 있는 연락은 exact copy까지 보여주며, 실행 시 생성되는 정형 소개
  이메일은 원문 미리보기를 약속하지 않고 목적과 생성 시점을 밝힌다.
- compact candidate decision에서만 `Connect / Reject`를 쓴다.
- Reject confirmation은 후보자에게 회사의 종료 결정이 안내되고 이미 전달된 안내는
  회수할 수 없다는 점을 CTA 전에 분명히 보여준다.
- final confirmation은 실제 결과를 action label로 쓴다.
- 사용자에게 내부 구현 용어가 노출되지 않는다.
- 기존 권한, 상태 전이, 연락 방식과 후보자 연결 invariant가 그대로다.
- 관련 테스트와 web/Slack 수동 QA가 통과한다.

## 13. 로컬 구현 확인 결과

2026-08-21 기준으로 이 문서의 writing 변경을 로컬 코드에 반영했다. 배포하거나
Notion의 배포 문서를 수정하지 않았다.

- `Connect / Reject`, `Email intro / Direct contact`와 결과형 final CTA를 web과 Slack에
  맞췄다.
- Reject와 진행 중 연결 종료를 구분했다. Reject 확인 전에는 후보자에게 종료 결정이
  안내되고 이미 노출·전달된 안내를 회수할 수 없다는 점을 보여준다.
- 외부 발송의 최종 결과를 확인할 수 없는 오류에서는 `보내지 않았다`고 단정하지 않고,
  중복 연락을 막기 위해 현재 상태와 메일을 먼저 확인하도록 했다.
- C의 composer placeholder와 D의 Reject reason preset은 현행을 유지했다.
- Slack welcome의 emoji, 후보자 recommendation의 all-caps CTA와 divider를 유지했다.
- TypeScript `--noEmit`, 변경 범위 ESLint와 관련 테스트 128개가 통과했다.
- 전체 `src/lib/org` 테스트는 344개 중 340개가 통과했다. 남은 4개는 현재 worktree의
  writing 범위 밖 contract 실패다: 존재하지 않는 migration 파일을 기대하는 allowlist
  테스트 2개, company-information card 스타일 contract 1개, draft Role activation access
  contract 1개다.

실제 Slack API 전송과 후보자 이메일 발송은 이 작업에서 실행하지 않았다. 최종 수동
QA는 배포 전 test workspace에서 Connect, Reject, Email intro, Direct contact, 진행 중
연결 종료와 중복 클릭을 각각 확인해야 한다.
