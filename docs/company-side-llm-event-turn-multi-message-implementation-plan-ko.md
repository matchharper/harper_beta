# Company-side LLM Web Action Wake · Multi-message 실행 구현 계획

- 문서 기준: 2026-09-22
- 문서 버전: v3
- 상태: `codex/company-agent-web-action-multimessage` 브랜치 구현·정적 검증 완료, staging DB·실제 모델 검증 전. migration 적용 또는 production 배포 전이며, 이 문서만으로 live 동작을 주장하지 않는다.
- 적용 범위:
  - 인증된 팀원이 `/org` 웹 UI에서 실행하고 서버가 성공 처리한 명시적 action으로 company-side LLM을 한 번 깨우는 흐름
  - 기존 웹 채팅과 Slack 대화에서 하나의 agent run이 선택적인 진행 메시지와 확인된 최종 결과를 서로 다른 말풍선으로 전달하는 흐름
- 명시적 비적용 범위:
  - LLM tool 실행으로 생긴 상태 변경
  - Slack의 버튼·action
  - 후보자 답변, 이메일·메시지 전달 결과, 일정 변경, matching 완료 같은 외부·비동기 사건
  - DB row update를 포괄적으로 감지하는 generic event trigger

관련 정본:

- [Company-side UX Writing Guide](./company-side-ux-writing-guide-ko.md)
- [Company-side LLM Prompt·Context 설계](./org-agent-context-engineering-ko.md)
- [Organization Agent 도구 참고](./org-agent-tools-reference-ko.md)
- [Harper Slack Agent 구현 문서](./org-slack-agent-implementation-plan-ko.md)
- [Company Request Intro 수락 뒤 양방향 소통 구현 계획](./company-request-intro-bidirectional-relay-implementation-plan-ko.md)
- [Company ↔ Talent 지속 중계 구현 계획](./company-talent-ongoing-relay-implementation-plan-ko.md)

## 1. 최종 결정

이번 구현은 두 기능을 분리해서 만든다.

### 1.1 Web Action Wake

인증된 팀원이 `/org` 웹 화면에서 다음과 같은 명시적 action을 완료하면, 그 action의 서버 처리 성공 뒤 company-side LLM이 한 번 깨어날 수 있다.

- 먼저 제안하기(Request Intro)
- 제안하지 않기
- 후보자 연결
- 후보자 거절
- 후보자 stage 이동
- Role 진행·중단·재개·종료처럼 범위에 포함하기로 한 명시적 lifecycle action

Wake는 회사가 방금 한 action을 다시 실행시키기 위한 것이 아니다. 이미 commit된 action과 최신 상태를 company-side LLM이 읽고, 추가로 할 일이 있는지 또는 팀원에게 새로 알려 줄 내용이 있는지 판단할 기회다.

모든 web-action turn은 아무 메시지 없이 정상 종료할 수 있다.

> Web action이 company-side LLM을 깨웠다는 사실은 발화 의무를 만들지 않는다. 화면에 이미 결과가 충분히 보이거나 새로 할 일이 없다면 tool 사용 여부와 관계없이 침묵할 수 있다.

### 1.2 Multi-message Delivery

기존 웹 채팅, 기존 Slack 대화, 새 web-action turn에서 company-side LLM은 필요할 때 다음 구조로 말할 수 있다.

```text
선택적 진행 메시지
→ 여러 LLM step과 여러 tool call
→ 선택적 terminal 메시지
```

이것은 `MAX_VISIBLE_MESSAGES = 2`에서 agent 실행을 자르는 기능이 아니다.

- tool loop는 기존 실행 budget 안에서 계속된다.
- progress를 보낸 뒤에도 모든 필요한 tool을 호출한다.
- 이후 non-terminal assistant content와 tool call은 모델 context에 유지할 수 있다.
- 같은 run의 중간 진행 발화를 매 tool step마다 surface message로 보내지 않는다.
- tool이 없는 terminal completion에서 확인된 결과 또는 필요한 질문을 별도 message로 전달할 수 있다.

결과적으로 한 foreground run에서 보이는 말풍선은 보통 0~2개지만, 이는 agent 능력을 제한하는 숫자 cap이 아니라 `progress`와 `terminal`이라는 delivery phase의 결과다.

## 2. Trigger 범위: 웹 action만 허용

### 2.1 허용되는 wake source

새 event-style wake를 만들 수 있는 source는 하나뿐이다.

```text
인증된 팀원
→ /org 웹 UI action
→ /api/org/... action route
→ domain mutation 성공
→ server가 web_action job 생성
→ company-side LLM 한 번 실행
```

`origin = org_web_action`은 client가 body나 header로 주장하는 값이 아니다. 인증된 `/org` action route가 서버 내부에서 부여한다.

현재 1차 연결 지점은 다음과 같다.

| 웹 action | 현재 서버 경계 | Wake 시점 |
| --- | --- | --- |
| 먼저 제안하기 | `POST /api/org/company-intro`, `action=request` | `requestOrgCompanyIntro` 성공 뒤 |
| 제안하지 않기 | `POST /api/org/company-intro`, `action=pass` | `passOrgCompanyIntro` 성공 뒤 |
| 연결·거절·stage 이동 | `POST /api/org/stage` | `setOrgCandidateStage` 성공 뒤 |
| Role lifecycle | `PATCH /api/org/role` | 선택된 lifecycle mutation 성공 뒤 |

처음부터 모든 `/org` mutation을 wake 대상으로 만들지 않는다. 이름·설명·notification 설정·팀원 관리처럼 단순 field edit 또는 채용 agent의 후속 판단이 필요하지 않은 action은 제외한다.

### 2.2 Wake source가 아닌 것

다음 source는 이번 구현에서 company-side LLM을 새로 깨우지 않는다.

- company-side LLM이 tool로 실행한 `setOrgCandidateStage`
- company-side LLM이 tool로 실행한 intro request/pass
- company-side LLM이 tool로 실행한 Role update
- 웹 채팅 내부 tool result
- Slack company-side LLM의 tool result
- Slack 버튼과 interactivity
- 후보자의 수락·거절·후속 답변
- candidate relay 수신
- 연락 queue의 queued/sent/failed 전환
- 이메일 provider callback
- meeting availability·확정·취소
- matching search 완료
- scheduler·worker 결과
- `company_events` insert
- DB trigger로 관찰한 일반 row update
- React Query invalidation, refetch, optimistic state
- thinking log의 running/done 전환

이러한 사건을 장차 proactive agent wake로 연결하려면 별도 범위 검토가 필요하다. 이번 문서의 trigger를 일반 event bus로 확장하지 않는다.

### 2.3 Agent 자기증식 루프가 구조적으로 없는 이유

Wake enqueue를 공용 domain 함수 안에 넣지 않는다.

잘못된 구조:

```text
setOrgCandidateStage()
  → DB 변경
  → 언제나 agent job enqueue
```

이렇게 만들면 웹 action뿐 아니라 agent tool, Slack, worker가 같은 함수를 호출할 때도 새 agent turn이 생긴다.

목표 구조:

```text
/api/org/stage route
  → 인증된 팀원 확인
  → setOrgCandidateStage() 호출
  → 성공 결과 확인
  → enqueueCompanyAgentWebActionTurn()

company-side LLM tool executor
  → setOrgCandidateStage() 호출
  → 완료
  → enqueue 없음
```

즉 다음 불변식을 코드로 보장한다.

```text
Only authenticated /org web action routes can enqueue a web-action turn.
Domain functions and tool executors cannot enqueue one implicitly.
```

`company_messages` insert도 wake source가 아니다. 따라서 progress·terminal message를 저장해도 다시 agent가 실행되지 않는다.

별도의 재귀 depth, `rootRunId` 기반 추론 또는 “이번 event가 agent가 만든 것 같은가”라는 heuristic이 필요하지 않다. 애초에 enqueue authority를 웹 action route에만 둔다.

### 2.4 직접 대화는 기존 trigger다

웹 채팅에서 팀원이 메시지를 보내거나 Slack에서 Harper를 명시적으로 호출하는 것은 event wake가 아니라 기존의 직접 대화 turn이다. 이 경로는 계속 company-side LLM을 실행한다.

이번 제한은 다음 뜻이다.

- 웹 채팅 메시지: 기존처럼 실행
- Slack 팀원 메시지: 기존처럼 실행
- `/org` 웹 버튼 action: 새 wake 추가
- 그 밖의 background event: 새 wake 없음

## 3. Web action turn의 의미

### 3.1 Action은 이미 끝난 사실이다

company-side LLM에 제공하는 event context는 다음을 명확히 한다.

```text
<web_action_context>
This turn was caused by an authenticated company team member's completed web action.
The recorded action has already been applied successfully.
Do not repeat the action.
Read current state before considering any related follow-up.
</web_action_context>
```

예를 들어 `company_intro_requested`는 “intro를 요청하라는 명령”이 아니다. 팀원이 이미 먼저 제안하기를 완료했고 그 mutation이 commit됐다는 reference fact다.

### 3.2 Wake는 추가 권한이 아니다

팀원이 web action을 수행했다는 사실만으로 unrelated write·연락·공유 권한이 새로 생기지는 않는다. 기존 tool authorization과 product contract를 그대로 사용한다.

다만 이번 설계에서는 event마다 임의의 tool allowlist를 만들지 않는다.

- company-side LLM에는 정상적인 company-side tool set을 제공한다.
- 현재 state와 event context를 보고 모델이 필요한 read를 선택한다.
- 기존 tool의 확인·동의·상태 precondition은 그대로 적용한다.
- prompt는 action이 이미 끝났으며 반복하지 말아야 한다고 명시한다.

모델이 의도적으로 무관한 action을 할 가능성은 낮다고 본다. 그래도 기존 서버 authorization, idempotency와 상태 검증을 제거하지 않는다. 이 방어는 새 event-specific state machine을 만들기 위한 것이 아니라 기존 write 안정성을 보존하기 위한 것이다.

### 3.3 Silence는 기본적으로 안전하다

이번 trigger는 web action에만 붙는다. 팀원은 이미 다음 feedback을 가진다.

- 버튼 loading과 성공·실패 결과
- 카드 또는 stage의 실제 이동
- Role 상태 label
- action API response
- 기존 toast 또는 error UI

따라서 company-side LLM이 침묵해도 원래 action 자체가 보이지 않게 사라지지는 않는다.

반대로 후보자 답변, 전달 실패 같은 background 사건은 이번 wake 범위에 없으므로, 중요한 외부 사실의 발견을 LLM의 silence 판단에 맡기는 문제도 이번 구현에는 없다. 그러한 사실은 기존 UI 상태·notification·relay 흐름이 계속 담당한다.

## 4. Silent completion 계약

### 4.1 모든 web-action turn에서 0개 message 허용

다음 결과는 모두 정상이다.

| Agent 판단·행동 | Visible message | 결과 |
| --- | ---: | --- |
| action과 현재 state를 읽고 추가 가치가 없다고 판단 | 0개 | `completed_silent` |
| read tool을 사용했지만 화면보다 유용한 새 정보가 없음 | 0개 | `completed_silent` |
| action의 정상 continuation을 처리했지만 팀원이 새로 알아야 할 내용이 없음 | 0개 | `completed_silent` |
| 중요한 제한·부분 결과가 있어 설명 | 1개 | `completed_message` |
| 실질적인 후속 작업을 맡았다고 알리고 같은 run에서 결과 설명 | 2개 | `completed_message` |

### 4.2 직접 대화는 silent로 끝내지 않는다

직접 웹·Slack 메시지는 팀원이 답을 기다리는 turn이다.

- 최종 답을 제공한다.
- 중요한 대상·의미가 unresolved면 질문한다.
- tool 실패나 부분 완료면 현재 결과와 복구 가능성을 설명한다.
- terminal content가 비면 직접 대화용 fallback을 사용한다.

`allowSilentCompletion=true`는 `origin=org_web_action`에만 적용한다.

### 4.3 특수 문자열로 silence를 판정하지 않는다

다음 방식은 사용하지 않는다.

- `NO_REPLY`
- `<SILENT>`
- `SKIP_MESSAGE`
- 특정 접두사·접미사
- regex로 빈 응답처럼 바꾸기
- `finish_silently` 같은 시나리오용 신규 tool

목표 contract는 terminal completion에 assistant content가 없으면 message를 insert하지 않는 것이다.

다만 현재 production 모델과 provider adapter가 실제로 empty terminal content를 안정적으로 반환하는지는 구현 전에 반드시 검증해야 한다. 이 동작이 불안정하면 prompt 문구를 계속 쌓거나 특수 문자열을 도입하지 말고, machine-consumed minimum response contract 자체를 다시 검토한다.

## 5. Multi-message 정책

### 5.1 세 출력을 분리한다

| 출력 | Web | Slack | 대화 메시지인가 |
| --- | --- | --- | --- |
| thinking/tool status | 표시 가능 | 표시하지 않음 | 아니오 |
| progress assistant message | 선택적으로 표시 | 선택적으로 전송 | 예 |
| terminal assistant message | content가 있으면 표시 | content가 있으면 전송 | 예 |

참고 서비스 화면에서 보이는 다수의 `Checking...`, `Sending...`, `Worked for...`는 대부분 thinking/activity다. 이 항목을 Slack message로 옮기지 않는다.

### 5.2 Progress phase

tool call이 있는 non-terminal completion에서 모델이 assistant content를 함께 생성할 수 있다.

첫 user-visible non-terminal content만 progress 후보가 된다.

- 아직 확인되지 않은 성공을 주장하지 않는다.
- Harper가 무엇을 맡았는지 지금 알려 주는 가치가 있을 때만 사용한다.
- routine read, 짧은 write, 즉시 끝나는 action을 매번 낭독하지 않는다.
- 질문·승인 요청·선택 버튼을 넣지 않는다.
- `처리할게요` 같은 고정 receipt가 아니다.
- 첫 LLM step에 반드시 나올 필요는 없다.

Web-action turn에서는 원래 action이 이미 완료됐다. 따라서 `Request Intro를 처리할게요` 같은 progress는 잘못이다. 추가 후속 작업이 실제로 필요한 경우에만 그 후속 작업에 대한 progress를 만들 수 있다.

### 5.3 Progress 뒤 tool loop

progress를 한 번 발행한 뒤에도 agent는 계속 일한다.

```text
progress published
→ tool call 1
→ LLM step
→ tool call 2, 3
→ LLM step
→ recovery read
→ terminal completion
```

다음과 같은 hard stop을 두지 않는다.

```ts
if (visibleMessageCount >= 2) stopAgentRun(); // 금지
```

현재의 tool-loop budget과 total-tool-call budget만 안전 경계로 유지한다. Visible message 정책은 남은 tool 호출 수, reasoning effort, recovery 여부와 무관하다.

### 5.4 이후 non-terminal content

progress가 이미 발행된 뒤 tool call과 함께 생성된 assistant content는 새 말풍선으로 보내지 않는다.

- tool call은 정상 실행한다.
- content는 model continuity를 위해 context에 보존할 수 있다.
- 팀원에게 전달되지 않았다는 visibility를 다음 LLM step에 명확히 알린다.
- terminal response가 숨긴 말을 팀원이 들었다고 가정하지 않게 한다.

개념적 envelope:

```text
<undelivered_non_terminal_content>
This content was retained as internal loop context and was not delivered to the company team member.
Do not refer to it as prior communication with the team member.
...
</undelivered_non_terminal_content>
```

이 envelope는 문구 의미를 분류하는 rule이 아니다. Publisher가 이미 progress phase를 외부에 보냈다는 구조적 delivery 사실을 model context에 전달한다.

1차 방어는 prompt가 progress 뒤의 non-terminal step에서 narration 없이 필요한 tool call만 요청하도록 하는 것이다. Envelope는 모델이 그래도 content를 만든 경우의 visibility 보정이다.

### 5.5 Terminal phase

tool call이 없는 completion의 content가 terminal message 후보다.

- 실제 tool result로 확인된 결과를 전달한다.
- 완료·부분 완료·실패·불확실성을 구분한다.
- progress를 표현만 바꿔 반복하지 않는다.
- 팀원의 결정이 필요하다면 이 단계에서 질문한다.
- Slack choice button도 terminal 단계에서만 활성화한다.
- web-action turn에서는 content가 없으면 silent로 끝난다.
- 직접 대화에서는 content가 없으면 fallback 또는 오류 응답을 사용한다.

### 5.6 가능한 visible 결과

| Progress | Terminal | 경험 |
| --- | --- | --- |
| 없음 | 없음 | Web-action turn만 가능. 조용히 종료 |
| 없음 | 있음 | 결과·설명·질문 한 번 |
| 있음 | 있음 | 일을 맡은 첫 메시지 뒤 확인된 결과 |
| 있음 | 없음 | 원칙적으로 허용하지 않음. 아래 durable continuation 예외만 가능 |

Progress만 남는 것은 팀원에게 “Harper가 계속 일하고 있다”는 약속을 만든다. 따라서 terminal이 없는 종료는 다음 조건을 모두 충족할 때만 가능하다.

1. 실제 async continuation이 durable하게 등록되었다.
2. 그 continuation의 현재 상태를 UI에서 확인할 수 있다.
3. 성공·실패 결과를 전달하는 기존 제품 경로가 있다.
4. agent process가 종료되어도 continuation이 사라지지 않는다.

이번 generic web-action wake는 background 결과 event로 company-side LLM을 다시 깨우지 않는다. 그러므로 위 예외를 새로 일반화하지 않고, 기존 durable async tool contract가 이미 있는 경우에만 사용한다. 그렇지 않으면 같은 run에서 terminal message까지 만든다.

### 5.7 사용하지 않는 방식

- 최종 답변을 마침표, 줄바꿈, 글자 수로 두 조각 내지 않는다.
- 매 tool 호출 전에 progress를 생성하지 않는다.
- 사람처럼 보이기 위한 인위적인 sleep을 넣지 않는다.
- 숨길 content를 키워드·문장 유사도·길이로 판정하지 않는다.
- progress를 반드시 생성하지 않는다.
- terminal을 반드시 두 번째 말풍선으로 만들지 않는다.

## 6. Prompt 계약

### 6.1 Web-action turn

모든 web-action turn은 하나의 공통 계약을 사용한다. Action별 완성 문장이나 답변 template을 두지 않는다.

```text
<web_action_turn_contract>
This turn was caused by an authenticated company team member's completed action in the /org web product.
The recorded action has already been applied successfully. Do not repeat it.

Being awakened does not create an obligation to speak.
Silence is a valid successful outcome, including after using tools.

Read current state when needed. Decide whether any additional work or company-visible update is genuinely useful.
Do not acknowledge or summarize the action merely because it happened.
Do not repeat information already clear from the visible product state.

You may use tools and finish without a message.
You may take no further action and produce no assistant content.
Speak only when the team gains materially useful new information, needs to make a decision, may otherwise misunderstand the result, or should reasonably know the result of additional work Harper performed.

The completed web action does not authorize unrelated writes, sharing, contact, or state changes.
</web_action_turn_contract>
```

### 6.2 Multi-message

```text
<multi_message_contract>
An assistant completion that requests tools may include a user-visible progress message.
Use it only when the company team genuinely benefits from knowing that substantial work is underway.
Routine reads, quick writes, and individual tool calls do not need narration.

A non-terminal progress message must not ask a consequential question, request approval, or claim an unverified result.

After tool results arrive, continue until the work is complete or a consequential team decision is required.
Do not stop because a progress message was sent.

When the run reaches a terminal step, communicate verified results or the necessary question without repeating the progress message.
If earlier non-terminal content is marked undelivered, do not assume the team saw it and do not refer to it as prior communication.
</multi_message_contract>
```

## 7. Server 구조

### 7.1 공통 agent core

현재 `runOrgAgentChat()`의 책임을 다음처럼 분리한다.

1. 직접 팀원 메시지 검증·저장
2. Web-action context 구성
3. 공통 workspace·conversation context 구성
4. LLM/tool loop
5. Visible assistant segment persistence
6. Surface delivery
7. 직접 대화용 fallback과 background turn용 silent completion

개념적 type:

```ts
type OrgAgentTurnOrigin =
  | {
      kind: "team_message";
      teamMessageId: number;
      surface: "web" | "slack";
    }
  | {
      kind: "org_web_action";
      webActionJobId: string;
      webActionType: string;
      sourceRef: string;
    };

type OrgAgentTurnResult = {
  assistantMessages: OrgAgentMessage[];
  kind: "messages" | "silent";
  model: string;
  state: OrgAgentExecutionState;
};
```

Transition 기간 동안 기존 호출자 호환을 위해 다음 값을 둘 수 있다.

```ts
assistantMessage: assistantMessages.at(-1) ?? null
```

정본은 `assistantMessages[]`이며 web-action turn에서는 빈 배열이 유효하다.

### 7.2 Visible segment publisher

```ts
type PublishAssistantSegment = (args: {
  content: string;
  phase: "progress" | "terminal";
  runId: string;
  sequence: number;
  model: string;
  thinkingLogs: OrgAgentThinkingLog[];
}) => Promise<OrgAgentMessage>;
```

Publisher는 다음을 담당한다.

1. 같은 `runId + sequence` message의 중복 insert 방지
2. `company_messages`에 durable message 저장
3. web SSE 또는 Slack surface adapter에 전달
4. stale run이면 terminal publish 중단
5. retry가 generation과 tool side effect를 다시 실행하지 않게 existing message 재사용

### 7.3 Tool loop 알고리즘

```ts
let progressPublished = false;
let sequence = 0;

for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
  const completion = await runCompletion({ messages, tools });
  const assistantText = extractAssistantText(completion.message);
  const toolCalls = normalizeToolCalls(completion.message);

  if (toolCalls.length > 0) {
    let delivered = false;

    if (assistantText && !progressPublished) {
      await persistAssistantSegment({
        content: assistantText,
        phase: "progress",
        runId,
        sequence: sequence++,
      });
      progressPublished = true;
      delivered = true;
    }

    messages.push(
      toAssistantToolHistory(completion.message, {
        content: delivered
          ? assistantText
          : markAsUndeliveredInternalContext(assistantText),
      })
    );

    // Surface provider 전송을 기다리지 않고 tool work를 계속한다.
    await executeAuthorizedToolCalls(toolCalls);
    continue;
  }

  if (assistantText) {
    await persistAssistantSegment({
      content: assistantText,
      phase: "terminal",
      runId,
      sequence: sequence++,
    });
  } else if (origin.kind === "team_message") {
    await persistAssistantSegment({
      content: buildDirectTurnFallback(state),
      phase: "terminal",
      runId,
      sequence: sequence++,
    });
  }

  return publishedMessages.length
    ? { kind: "messages", assistantMessages: publishedMessages }
    : { kind: "silent", assistantMessages: [] };
}
```

실제 구현은 기존 staged proposal, exact preview, required link, final reply invariant, abort signal, usage logging과 tool budget을 보존한다.

## 8. Web-action job

### 8.1 필요한 durable fact

새 persistence가 보존하는 irreducible fact는 다음 하나다.

> 인증된 `/org` web action이 성공했고, 그 action을 company-side LLM이 검토하도록 등록했으며, 현재 queued·processing·completed·failed 중 어느 상태인가.

Reader는 web-action agent worker다. LLM의 판단, communication plan, confidence나 recommendation rationale를 저장하지 않는다.

기존 `company_events`는 이 job으로 사용하지 않는다. `company_events`는 compact audit text이며 claim, retry, source identity, conversation routing이 없다.

### 8.2 최소 schema

```text
company_agent_web_action_jobs
  id uuid primary key
  workspace_id uuid not null
  conversation_id uuid not null
  role_id uuid nullable
  talent_id uuid nullable

  action_type text not null
  source_ref text not null
  action_request_id text not null
  actor_user_id uuid not null

  available_at timestamptz not null
  status text not null
  attempt_count integer not null
  locked_at timestamptz nullable
  locked_by text nullable
  last_error text nullable
  completed_at timestamptz nullable

  unique(workspace_id, action_request_id, action_type)
```

다음 field는 두지 않는다.

- `should_reply`
- `communication_plan`
- `confidence`
- `intent`
- `recommended_tool`
- 완성된 event별 메시지

Job은 source reference만 저장하고 worker가 실행 시점의 authoritative state를 다시 읽는다.

### 8.3 Enqueue 경계

Web action route만 다음 helper를 호출할 수 있다.

```ts
enqueueCompanyAgentWebActionTurn({
  actionRequestId,
  actionType,
  actorUserId: user.id,
  conversationId,
  roleId,
  talentId,
  workspaceId,
});
```

`actionRequestId`는 double click과 network retry를 dedupe하는 server-verified identity다. Client가 임의 action type이나 대상 ID를 바꿔 재사용할 수 없게 workspace·actor·target과 함께 검증한다.

Mutation 성공과 job enqueue의 원자성은 구현 전에 route별로 결정한다.

- 가능하면 domain mutation과 wake job insert를 같은 transaction에 둔다.
- Worker 장애는 job insert를 막지 않으므로 action request를 지연시키지 않는다.
- Wake job schema 오류 때문에 핵심 web action 전체가 장기간 막히지 않도록 rollback 경계를 둔다.
- Transaction으로 묶지 못하는 route는 mutation 성공 뒤 idempotent enqueue를 수행하고, enqueue 실패를 action 성공으로 위장하지 않도록 운영 error를 기록한다. 다만 이미 commit된 domain action을 자동으로 다시 실행하지 않는다.

### 8.4 Job 결과

| 상태 | 의미 |
| --- | --- |
| `queued` | Web action 성공 뒤 검토 대기 |
| `processing` | Worker가 claim하고 fresh state를 읽는 중 |
| `completed_silent` | 추가 message 없이 정상 종료 |
| `completed_message` | 하나 이상의 visible message 저장 |
| `retry` | transient LLM·DB 오류 |
| `failed` | retry 소진, 운영 확인 필요 |
| `superseded` | 더 최신 직접 팀원 메시지가 있어 stale 발화를 만들지 않음 |

`completed_silent`는 오류가 아니다. `failed`도 generic 오류 message를 회사 대화에 자동 삽입하지 않는다. Web action 자체는 이미 성공했고 UI에 반영됐기 때문이다.

## 9. Message run identity와 idempotency

### 9.1 구조적 field

```text
company_messages.agent_run_id uuid nullable
company_messages.agent_sequence integer nullable
company_messages.agent_phase text nullable
```

```text
unique(agent_run_id, agent_sequence)
where agent_run_id is not null
```

이 값은 transient LLM judgment가 아니다.

- 보존할 사실: 어느 run에서 몇 번째 visible message로 발행되었는가.
- Reader: web cache dedupe, Slack delivery retry, ordering, diagnostics.

### 9.2 Message idempotency와 tool idempotency는 다르다

`runId + sequence`는 같은 progress message가 두 번 insert되는 것을 막을 뿐이다. Tool action이 두 번 실행되는 것은 각 tool의 기존 idempotency와 상태 precondition이 막아야 한다.

이번 web-action trigger는 원래 action이 이미 commit됐다는 context를 주고 “반복하지 말라”고 지시한다. 모델이 같은 action을 다시 호출할 가능성은 낮지만, 다음 기존 방어는 유지한다.

- expected previous state
- unique request/delivery identity
- already requested·already passed·already connected 상태 처리
- uncertain delivery의 verify-before-retry

이는 LLM을 불신해서 event별 guard를 만드는 것이 아니라 network retry와 동시 실행에서도 domain integrity를 유지하기 위한 일반 방어다.

## 10. Web UI

### 10.1 직접 채팅 SSE

한 stream에 여러 message cycle이 올 수 있다.

```text
user_message
tool_status*
text_delta*                 progress
assistant_message           persisted progress
tool_status*
text_delta*                 terminal
assistant_message           persisted terminal
done
```

Client는 첫 `assistant_message`에서 run을 finish하지 않는다.

1. Persisted row를 cache에 append한다.
2. 현재 `streamingText`를 비운다.
3. active thinking state를 유지한다.
4. 다음 `text_delta`를 새 transient bubble로 보여 준다.
5. `done`에서만 active run을 종료한다.

SSE, query invalidation과 향후 realtime이 같은 row를 전달할 수 있으므로 `message.id`와 `runId + sequence`로 dedupe한다.

### 10.2 Web-action turn UI

Web action의 성공 feedback은 원래 action UI가 담당한다.

- Agent용 optimistic user message를 만들지 않는다.
- Silent turn을 위해 빈 assistant placeholder를 만들지 않는다.
- Background thinking spinner를 강제로 띄우지 않는다.
- Agent가 실제 progress 또는 terminal message를 저장했을 때만 Role conversation에 나타낸다.
- 현재 Role 화면이 열려 있으면 query refresh 또는 authorized realtime으로 반영한다.

### 10.3 새 팀원 메시지

Progress 뒤 팀원이 새 메시지를 보내면 오래된 terminal이 그 뒤에 끼어들 수 있다.

각 terminal publish 전에 같은 conversation의 최신 팀원 message를 확인한다.

- Origin보다 최신 팀원 message가 있으면 old run의 terminal을 suppress 또는 supersede한다.
- 이미 commit된 tool side effect는 되돌리지 않는다.
- 새 turn이 fresh state와 tool result를 읽고 대화를 이어 간다.

Web composer를 progress 이후에도 열어 둘지는 별도 rollout 단계다. Composer를 열면 위 supersede contract가 먼저 구현되어야 한다.

## 11. Slack

### 11.1 Slack에서 새 event wake는 없다

이번 구현은 Slack action·external event로 새 agent turn을 만들지 않는다. 기존 Slack 팀원 메시지로 시작된 turn에 multi-message delivery만 적용한다.

### 11.2 Thinking 비노출

- `tool_status`를 Slack message로 보내지 않는다.
- progress가 있으면 첫 assistant message를 보낸다.
- 중간 tool step은 조용히 수행한다.
- terminal content가 있으면 다음 assistant message를 보낸다.
- terminal에만 choice button을 붙인다.

### 11.3 Slack API를 tool critical path에 두지 않는다

다음 구조는 사용하지 않는다.

```text
progress persist
→ chat.postMessage 응답 대기
→ tool 실행
```

Slack latency·rate limit이 agent 작업 시작을 늦출 수 있기 때문이다.

현재 구현 구조:

```text
progress persist
→ Slack delivery promise 시작
→ agent tool loop 계속

terminal 전달 경계
→ progress delivery가 끝났는지 확인
→ sequence 1 전달
```

Slack provider 전송은 tool execution과 동시에 진행하되 terminal 직전에 합류해 순서를 지킨다. Stable provider client ID와 기존 `company_messages` row를 사용하므로 job retry가 같은 progress를 중복 전송하지 않는다. Progress 전송 실패는 terminal 생성과 전송을 막지 않으며, 미전송 progress row는 visible history에서 제외한다.

### 11.4 알림 noise

Progress와 terminal은 Slack mobile notification을 두 번 만들 수 있다. 따라서 prompt와 evaluation에서 다음을 본다.

- 즉시 끝나는 read·write에 progress를 만들지 않는가.
- progress가 단순 acknowledgment가 아닌가.
- 실제로 시간이 들거나 여러 단계를 맡은 경우에만 progress가 유용한가.
- progress와 terminal이 몇 초 간격으로 같은 내용을 반복하지 않는가.

이를 tool 개수, 글자 수 또는 고정 시간 threshold로 판정하지 않는다.

## 12. 확인된 부작용과 대응

이 절은 구현 후 발견할 문제가 아니라, 설계 단계에서 예상한 부작용과 반드시 지킬 대응이다.

### 12.1 Agent 자기증식 루프

**위험**

Agent tool이 stage를 바꾸고 그 DB 변경이 새 agent event를 만들면 무한 또는 장기 연쇄 실행이 생길 수 있다.

**결정**

- Generic DB event trigger를 만들지 않는다.
- Domain service 함수가 agent job을 자동 enqueue하지 않는다.
- `/org` web action route만 enqueue authority를 갖는다.
- Agent tool, Slack, worker, external callback에는 enqueue API를 제공하지 않는다.

이 결정으로 재귀 여부를 LLM 판단이나 causal heuristic에 맡기지 않는다.

### 12.2 Progress만 남는 false promise

**위험**

`확인해볼게요`를 보낸 뒤 tool 실패·process crash가 발생하면 Harper가 계속 일하는 것처럼 보이지만 실제 continuation은 없다.

**대응**

- 직접 foreground work는 같은 run의 terminal result 또는 failure explanation으로 닫는다.
- Progress-only 종료는 durable continuation이 이미 등록된 경우에만 허용한다.
- Async job 등록 전에는 장기 continuation을 약속하지 않는다.
- Web-action turn에서 action 자체는 이미 commit됐다는 사실을 분리해 말한다.

### 12.3 Hidden content를 팀원이 들었다고 착각

**위험**

전달하지 않은 non-terminal content가 plain assistant history로 남으면 모델이 terminal에서 `앞서 말씀드린 것처럼`이라고 쓸 수 있다.

**대응**

- Prompt는 progress 뒤 non-terminal narration을 최소화한다.
- Suppressed content에는 undelivered envelope를 붙인다.
- Terminal evaluation에서 unseen prior-reference를 실패로 판정한다.

### 12.4 질문과 tool 실행이 동시에 진행

**위험**

Non-terminal progress에서 질문을 해 놓고 agent가 답을 기다리지 않은 채 tool을 계속 실행할 수 있다.

**대응**

- Consequential question, confirmation과 choice는 terminal only다.
- Progress는 ownership·진행 안내만 가능하다.
- 팀원 답이 필요하면 tool call 없이 terminal completion으로 끝낸다.

### 12.5 Slack 두 번 알림

**위험**

짧은 작업에서 progress와 terminal이 연달아 오면 한 메시지보다 거슬린다.

**대응**

- Progress는 선택이며 기본 receipt가 아니다.
- Slack에는 thinking을 보내지 않는다.
- 짧은 완료는 terminal 하나로 끝내도록 prompt·evaluation을 조정한다.
- 메시지 개수를 줄이기 위해 agent tool loop를 중단하지 않는다.

### 12.6 Slack 전송 때문에 tool 실행 지연

**위험**

`chat.postMessage`를 await한 뒤 tool을 시작하면 surface latency가 실제 작업 latency가 된다.

**대응**

- Message DB persistence까지만 generation path에서 보장한다.
- Slack provider delivery promise는 다음 tool 실행과 동시에 진행한다.
- Terminal delivery 전에 progress delivery promise에 합류해 순서를 보장한다.
- Progress delivery 실패는 terminal과 tool loop를 실패시키지 않으며, stable client ID로 retry 중복을 막는다.

### 12.7 Progress가 완료 사실처럼 summary에 남음

**위험**

`Babitha에게 확인해볼게요`가 나중에 `확인했다` 또는 `답을 받았다`로 잘못 요약될 수 있다.

**대응**

- `agent_phase=progress`를 conversation summary context에 제공한다.
- Progress는 완료 증거가 아니다.
- Fresh tool result와 structured current state가 message보다 우선한다.
- Summary scheduling은 progress마다 실행하지 않고 run terminal에서 한 번 수행한다.
- Terminal 없는 progress는 pending commitment로만 취급한다.

### 12.8 Message row와 context 증가

**위험**

Assistant message가 하나에서 둘로 늘면 raw history가 더 빨리 잘리고 summary 비용이 증가한다.

**대응**

- Progress는 routine action에서 생성하지 않는다.
- Thinking은 `company_messages` row로 만들지 않는다.
- Context builder는 progress metadata를 알고 terminal·fresh state를 우선한다.
- Run 단위로 summary를 한 번만 schedule한다.
- Rollout에서 conversation당 message 증가율과 token 증가를 측정한다.

### 12.9 Silent turn도 LLM 비용 발생

**위험**

Message 0개여도 context build와 LLM 호출 비용은 발생한다. Stage drag가 잦으면 silence가 많아도 비용이 커질 수 있다.

**대응**

- Trigger를 web의 material action으로만 제한한다.
- 모든 field edit에 붙이지 않는다.
- 한 action request ID당 job 하나만 만든다.
- Stage 이동처럼 빈도가 높은 action은 shadow에서 useful-action·message·tool-call 비율을 먼저 측정한다.
- 비용이 가치보다 크면 trigger 종류를 줄이지, 작은 classifier나 keyword gate를 추가하지 않는다.

### 12.10 모델·provider별 차이

**위험**

- 어떤 모델은 `content + tool_calls`를 거의 생성하지 않을 수 있다.
- 어떤 모델은 매 step에 narration을 만들 수 있다.
- Empty terminal content를 잘 따르지 않아 web-action turn이 불필요하게 말할 수 있다.
- Adapter가 assistant content와 tool call을 함께 보존하지 못할 수 있다.

**대응**

- Production model과 fallback model을 각각 평가한다.
- Responses/chat adapter contract test로 content+tool-call round trip을 검증한다.
- Silence가 불안정하면 특수 문자열·regex를 추가하지 않고 generation contract를 재검토한다.
- 모델 교체 release gate에 silence precision과 multi-message behavior를 포함한다.

### 12.11 동시 web action

**위험**

여러 팀원이 같은 후보자를 거의 동시에 이동하거나 connect/reject할 수 있다. 두 web-action job이 서로 다른 시점의 state로 말할 수 있다.

**대응**

- 각 worker는 action payload snapshot이 아니라 fresh current state를 읽는다.
- 같은 conversation의 job을 DB 생성 순서대로 하나씩 실행한다.
- Event payload는 해당 시점에 action이 성공했다는 기록이며, 실행 시점의 fresh state와 tool result가 더 최신이면 이를 우선한다.
- 각 tool 실행 직전과 terminal publish 직전에 최신 직접 팀원 message를 확인한다.
- Domain write conflict는 기존 expected state와 transaction이 처리한다.

더 최신 web action이 앞 action을 지우는 것으로 간주하지는 않는다. 둘 다 실제로 성공한 행동이므로 순서대로 검토하되, 앞 job이 뒤 action 이전 상태를 현재 상태라고 주장하지 않게 prompt에서 event snapshot과 fresh state의 우선순위를 분리한다.

### 12.12 Message delivery 중복

**위험**

Worker가 message를 저장한 뒤 응답 전에 죽거나 Slack 전송 뒤 timestamp 저장 전에 죽으면 같은 말풍선이 두 번 생길 수 있다.

**대응**

- DB unique `(agent_run_id, agent_sequence)`
- Web cache의 message ID dedupe
- Slack sequence별 stable provider idempotency identity
- Retry는 generation이 아니라 persisted message delivery만 재개

### 12.13 Tool action 중복

**위험**

LLM이 같은 action을 반복할 가능성은 낮다. 하지만 model retry, network uncertainty 또는 process retry 때문에 tool executor가 같은 요청을 두 번 볼 수 있다.

**대응**

- Web-action context에 원래 action이 이미 commit됐다고 명시한다.
- Tool executor의 일반 idempotency와 current-state verification을 유지한다.
- Uncertain external delivery는 verify-before-retry한다.
- Event별 새 판단 state machine은 만들지 않는다.

### 12.14 Background 중요 사건 누락

**위험**

후보자 답변·전달 실패까지 silent-capable LLM event로 확장하면 중요한 사실이 말없이 지나갈 수 있다.

**결정**

- 이번 trigger 범위에서 background 사건을 제외한다.
- 기존 inbox, Role state, notification과 relay가 계속 정본이다.
- 장차 background wake를 추가할 때는 guaranteed product notification과 LLM 발화를 별도로 설계한다.

### 12.15 Cross-surface 혼란

**위험**

Web action이 Slack에도 message를 보내면 팀원이 한 행동 때문에 예상치 못한 cross-surface 알림이 생긴다.

**대응**

- Web-action turn의 message는 해당 web Role conversation에만 저장한다.
- Slack에 proactive message를 보내지 않는다.
- Slack multi-message는 Slack에서 시작한 직접 대화에만 적용한다.

### 12.16 Web rendering race

**위험**

SSE progress, persisted query refresh와 realtime update가 같은 row를 중복 렌더링하거나, progress 뒤 thinking 위치가 튈 수 있다.

**대응**

- Message ID와 run sequence를 함께 dedupe한다.
- `assistant_message`에서는 streaming text만 reset하고 run은 유지한다.
- `done`에서만 run을 finish한다.
- Silent web-action turn에는 optimistic assistant placeholder를 만들지 않는다.

### 12.17 새 직접 메시지와 이미 실행 중인 tool의 경쟁

**위험**

Background web-action turn이 외부 write tool을 이미 실행하기 시작한 직후 팀원이 새 직접 메시지를 보낼 수 있다. 새 메시지를 발견한 뒤에는 다음 tool과 terminal을 막을 수 있지만, 이미 외부 시스템에 전송된 요청이나 commit된 write를 안전하게 되돌릴 수는 없다.

**대응과 명시적 한계**

- Progress 저장 직전, 각 tool 실행 직전, terminal 저장 직전에 anchor보다 최신인 직접 팀원 message를 확인한다.
- 최신 직접 메시지를 확인하면 job을 `superseded`로 끝내고 이후 tool과 terminal을 실행하지 않는다.
- 이미 시작되어 commit된 side effect는 자동 rollback하지 않는다. 되감기가 더 큰 중복·데이터 손상을 만들 수 있기 때문이다.
- Tool 자체의 authorization, idempotency와 expected-state 검증은 계속 적용한다.
- 따라서 이 계약은 **새 메시지 이후 아직 시작하지 않은 작업과 stale 발화를 차단**하는 계약이지, 이미 실행 중인 외부 작업의 원자적 취소를 보장하는 계약은 아니다.
- 이 경계를 완전히 없애려면 모든 write tool과 직접 메시지 insert가 같은 DB lock·transaction 또는 취소 가능한 durable command contract를 공유해야 한다. 이번 범위를 넘어서는 별도 플랫폼 변경 없이는 그런 보장을 주장하지 않는다.

## 13. 오류와 retry

### 13.1 Web action 실패

원래 action API가 실패하면 job을 만들지 않는다. Company-side LLM이 실패한 action을 성공한 event처럼 해석할 수 없게 한다.

### 13.2 Agent job 실패

원래 web action이 성공한 뒤 agent job이 실패해도 다음을 지킨다.

- 원래 action을 다시 실행하지 않는다.
- generic 오류 message를 company conversation에 자동 삽입하지 않는다.
- transient LLM·DB 오류는 bounded retry한다.
- retry는 같은 `action_request_id`와 run identity를 사용한다.
- retry exhaustion은 운영 관측 대상이다.

### 13.3 Partial tool result

직접 대화에서 일부 tool만 성공하면 terminal message가 완료된 범위와 남은 범위를 설명한다.

Web-action turn은 팀원에게 실제로 유용한 partial result가 있을 때만 말할 수 있다. 침묵하더라도 job trace와 tool logs는 운영에서 확인 가능해야 한다.

## 14. 파일별 구현 계획

### 14.1 Web action enqueue

- `src/app/api/org/company-intro/route.ts`
  - request/pass mutation 성공 뒤 web-action job enqueue
- `src/app/api/org/stage/route.ts`
  - stage mutation 성공 뒤 web-action job enqueue
- `src/app/api/org/role/route.ts`
  - 범위에 포함한 lifecycle action만 enqueue
- 신규 `src/lib/org/agent/webActionTurnJobs.ts`
  - enqueue, claim, retry, complete, supersede

Wake enqueue를 `src/lib/org/server.ts`의 공용 domain 함수 안에 넣지 않는다. Agent tool executor도 이 helper를 import하지 않는다.

### 14.2 Agent core

- `src/lib/org/agent/chat.ts`
  - 공통 turn runner 분리
  - first non-terminal progress publication
  - terminal publication
  - web-action silent completion
  - `assistantMessages[]`
- `src/lib/org/agent/types.ts`
  - turn origin, run identity, segment phase
- `src/lib/org/agent/store.ts`
  - idempotent run-message insert와 조회
- `src/lib/org/agent/prompts.ts` 또는 compact 별도 module
  - web-action 공통 계약
  - multi-message 공통 계약

### 14.3 Web

- `src/app/api/org/agent/chat/route.ts`
  - 한 SSE stream의 여러 assistant message
- `src/hooks/org/useOrgAgent.ts`
  - first assistant message에서 finish하지 않음
  - streaming text reset과 sequence dedupe
- `src/store/useOrgAgentLiveChatStore.ts`
  - active run과 current segment 분리
- `src/components/org/agent/OrgAgentPanel.tsx`
  - persisted progress 아래 live thinking 표시

### 14.4 Slack

- `src/app/api/internal/org-agent/slack-turn/route.ts`
  - single response에서 run messages 기반으로 전환
  - Slack direct turn에만 multi-message 적용
- Slack progress delivery adapter
  - provider 전송을 tool loop와 동시에 진행
  - terminal 직전 ordering barrier와 stable provider idempotency

### 14.5 Database

- `company_agent_web_action_jobs`
- `company_messages.agent_run_id`
- `company_messages.agent_sequence`
- `company_messages.agent_phase`
- Unique run-sequence index
- Bounded claim·complete RPC

## 15. 검증 계획

### 15.1 Trigger boundary test

| Case | 기대 결과 |
| --- | --- |
| `/org/company-intro` request 성공 | web-action job 1개 |
| 같은 request network retry | 같은 action ID로 job 1개 |
| `/org/stage` 성공 | web-action job 1개 |
| `/org/stage` 실패 | job 0개 |
| Agent tool이 `setOrgCandidateStage` 호출 | job 0개 |
| Slack에서 stage 변경 | 새 web-action job 0개 |
| 후보자 답변 도착 | 새 web-action job 0개 |
| delivery sent/failed callback | 새 web-action job 0개 |
| `company_events` insert | 새 web-action job 0개 |
| assistant message insert | 새 web-action job 0개 |

### 15.2 Silence·message test

| Case | 기대 결과 |
| --- | --- |
| Web action, no tool, empty terminal | message 0개, `completed_silent` |
| Web action, read tool, empty terminal | message 0개, tool result 유지 |
| Web action, terminal content | message 1개 |
| 직접 팀원 turn, empty terminal | fallback 또는 오류 message |
| content + tool call | progress row 저장, tool 계속 실행 |
| progress 뒤 5번의 content + tool call | 추가 progress bubble 없음, 모든 tool 실행 |
| terminal content | terminal row 별도 저장 |
| progress 뒤 question + tool attempt | evaluation 실패 |
| terminal이 hidden content를 prior message처럼 참조 | evaluation 실패 |

### 15.3 Retry·ordering test

| Case | 기대 결과 |
| --- | --- |
| Message insert 뒤 worker crash | 같은 sequence 중복 insert 없음 |
| Slack progress 전달 뒤 crash | progress 중복 없이 terminal 이어서 전달 |
| Slack API 성공 뒤 timestamp update 실패 | provider idempotency로 중복 방지 |
| Progress 뒤 새 팀원 message | stale terminal suppress |
| 같은 후보자 web action 두 개 | 오래된 job supersede 또는 fresh state 기반 silence |

### 15.4 Conversational evaluation

재사용 가능한 평가는 `docs/evaluation/` registry 계약을 따라 별도 task로 등록한다.

평가할 행동:

- 화면에 이미 보이는 web action 결과를 receipt처럼 반복하지 않는가.
- Silence가 적절한 action에서 실제로 침묵하는가.
- Progress가 필요하지 않은 짧은 작업에서 terminal 하나로 끝나는가.
- Progress가 완료되지 않은 성공을 주장하지 않는가.
- Progress 뒤에도 tool completion과 recovery가 유지되는가.
- Terminal이 progress 또는 hidden narration을 반복하지 않는가.
- Slack에 thinking/tool log가 message처럼 쌓이지 않는가.
- 원래 web action을 다시 실행하려 하지 않는가.
- 예상하지 못한 유사 web action도 같은 context와 일반 tool로 처리하는가.

Release metric은 message 개수 하나로 정하지 않는다.

- Task completion
- Tool success·recovery
- Silence precision
- Unnecessary message rate
- Unsupported completion claim
- Duplicate domain action
- Duplicate message delivery
- Stale terminal rate
- Slack notification count
- Token·LLM cost per web action

## 16. 단계별 rollout

### Phase 1 — 직접 대화 multi-message core

- Tool-call 동반 첫 content를 progress로 저장할 수 있게 함
- Terminal message 별도 저장
- Web SSE multi-message
- Hidden narration visibility marker
- 직접 팀원 turn fallback 유지

새 web-action trigger 없이 message persistence와 UI부터 검증한다.

### Phase 2 — 좁은 Web Action Wake

- `company_agent_web_action_jobs`
- Request Intro와 제안하지 않기만 연결
- Silence와 job observability
- Agent tool과 Slack에서 job이 절대 만들어지지 않는 contract test

### Phase 3 — 후보자 결정·stage action

- Connect·Reject
- Stage 이동
- conversation 단위 생성 순서 실행과 fresh-state 우선
- 비용과 useful-message 비율 검토

### Phase 4 — Slack direct-turn multi-message

- 새 Slack event wake 없이 기존 직접 대화만 적용
- Concurrent progress delivery와 terminal ordering barrier
- Thinking 비노출
- Progress·terminal retry idempotency

### Phase 5 — Role lifecycle 검토

- 진행·중단·재개·종료 action 중 실제 agent wake 가치가 있는 범위만 선택
- 일반 field edit는 제외

후보자 답변, delivery 결과, meeting과 matching completion은 이 rollout에 포함하지 않는다.

## 17. 완료 조건

1. 새 event-style wake는 인증된 `/org` web action route에서만 생성된다.
2. Agent tool, Slack, worker, external callback, DB trigger와 message insert는 wake를 만들지 않는다.
3. Web action은 LLM 실행 전에 성공한 durable fact이며 agent는 원래 action을 반복하지 않는다.
4. 모든 web-action turn이 message 0개로 정상 종료할 수 있다.
5. Silence를 특수 문자열·regex·시나리오용 tool로 판정하지 않는다.
6. Tool-call 동반 첫 content는 필요할 때 progress message가 될 수 있다.
7. Progress 뒤에도 tool loop, recovery와 terminal 판단이 중단되지 않는다.
8. 이후 non-terminal narration은 team surface에 반복 전송되지 않는다.
9. Hidden narration은 팀원에게 전달된 말로 model history에서 오인되지 않는다.
10. Consequential question과 choice는 terminal step에서만 발생한다.
11. Web thinking은 계속 표시할 수 있고 Slack에는 thinking message가 쌓이지 않는다.
12. Slack provider latency가 agent tool execution을 막지 않는다.
13. Visible message는 run·sequence idempotency를 가진다.
14. Progress-only 종료는 durable continuation이 있는 경우에만 가능하다.
15. Fresh state, summary와 context가 progress를 완료 증거로 사용하지 않는다.
16. 새 직접 팀원 message 뒤 stale terminal이 발행되지 않고, 연속 web action은 생성 순서와 fresh state를 기준으로 처리된다.
17. Silent job 실패와 completed silence를 운영에서 구분할 수 있다.
18. Background·external event는 이번 generic wake 범위에 들어오지 않는다.

## 18. 목표 경험

이미 UI가 충분히 설명하는 action:

```text
팀원이 Request Intro 클릭
→ 서버 mutation 성공
→ 카드 상태 변경
→ company-side LLM wake
→ 추가 가치 없음
→ message 없이 정상 종료
```

추가 설명이 유용한 action:

```text
팀원이 후보자를 다음 stage로 이동
→ 서버 mutation 성공
→ company-side LLM이 현재 Role과 stage guidance 확인
→ 팀원이 알아야 할 중요한 후속 조건이 있음
→ Harper가 그 조건만 자연스럽게 설명
```

직접 대화에서 실질적인 tool 작업:

```text
팀원: 이 두 분에게 서울 근무와 풀타임 합류 가능 여부를 확인해줘.
Harper: 두 분께 확인할 내용을 정리해서 진행할게요.      ← 선택적 progress

[웹 thinking은 계속 보임. Slack에는 thinking message 없음]

Harper: 두 분께 확인 요청을 보냈어요. 답이 오면 기존 연락·inbox 흐름에서 확인할 수 있어요.  ← verified terminal
```

짧은 직접 요청:

```text
팀원: Mina를 Technical Interview로 옮겨줘.
Harper: Mina를 Technical Interview 단계로 옮겼어요.
```

목표는 자주 말하는 agent가 아니다. **웹에서 팀원이 실제 행동했을 때만 한 번 더 생각할 기회를 얻고, 직접 대화에서는 필요한 일을 끝까지 수행하면서도 surface에는 의미 있는 진행과 결과만 남기는 company-side LLM**이다.

## 19. 현재 브랜치 구현 기록

### 19.1 구현된 범위

- 직접 웹·Slack turn의 기존 최대 30회 tool-call budget은 유지했다.
- 첫 tool-call 동반 assistant content만 선택적 progress로 저장하고, 뒤의 non-terminal content는 model history에만 남긴다.
- terminal은 별도 message로 저장하며 `runId + phase` unique index로 retry 중복을 막는다.
- 웹 SSE client는 첫 `assistant_message`에서 turn을 종료하지 않고 같은 stream의 terminal을 계속 받는다.
- Slack progress delivery는 tool loop와 동시에 진행되고, terminal 전달 직전에만 delivery 순서를 합류한다.
- Slack progress 전달 실패는 tool loop와 terminal을 실패시키지 않는다. 전달되지 않은 progress row는 `agent_internal`로 바꿔 웹·Slack history에 보이지 않게 한다.
- Request Intro, 제안하지 않기, 후보자 stage 결정·이동, Role lifecycle 상태 변경 성공 뒤에만 durable web-action job을 만든다.
- 일반 Role 이름·설명·Hiring Brief·근무 정보 수정은 web-action wake를 만들지 않는다.
- action route가 발급한 client action identity와 DB unique key로 동일 action의 job 중복을 막는다.
- hidden `web_action` message를 tool idempotency anchor로 쓰되 visible conversation과 prompt history에서는 제외한다.
- 한 conversation의 web-action job은 생성 순서대로 하나씩 claim한다.
- anchor 뒤에 새 direct web user message가 생기면 남은 tool과 terminal을 중단하고 `superseded`로 종료한다.
- `completed_silent`, `completed_message`, `superseded`, `retry`, `failed`를 별도 상태로 보존한다.
- Vercel Queue 즉시 전달이 실패하면 durable job을 남기고 5분 recovery dispatcher가 다시 전달한다.
- web-action turn은 기존 company-side LLM의 일반 tool set을 그대로 받고, 별도 시나리오 tool이나 intent classifier를 추가하지 않는다.

### 19.2 구현 파일

- 실행·message phase: `src/lib/org/agent/chat.ts`
- prompt 계약: `src/lib/org/agent/prompts.ts`
- durable enqueue·dispatch: `src/lib/org/agent/webActionTurn.ts`, `src/lib/org/agent/webActionQueue.ts`
- Queue consumer: `src/app/api/queues/process-company-agent-web-action/route.ts`
- recovery: `src/app/api/internal/org-agent/web-action-dispatch/route.ts`
- UI 관찰: `src/app/api/org/agent/web-action/status/route.ts`, `src/hooks/org/useOrg.ts`, `src/hooks/org/useOrgAgent.ts`
- trigger route: `src/app/api/org/company-intro/route.ts`, `src/app/api/org/stage/route.ts`, `src/app/api/org/role/route.ts`
- migration: `supabase/migrations/20260922082129_company_agent_web_action_turns.sql`

### 19.3 검증된 계약

- 새 wake enqueue는 인증된 세 web action route에만 존재한다.
- migration은 DB trigger를 만들지 않는다.
- job table은 RLS를 켜고 `anon`, `authenticated` 직접 접근을 회수한다.
- Queue duplicate·stale lease와 conversation concurrency는 DB claim이 판정한다.
- direct browser turn은 progress 뒤에도 SSE를 닫지 않는다.
- Slack provider 실패가 tool loop를 중단하지 않는다.
- silent completion은 magic string, regex 또는 전용 finish tool을 사용하지 않는다.

### 19.4 남아 있는 검증·운영 경계

다음은 숨기지 않고 release gate로 남긴다.

- 원래 product mutation과 wake job 생성은 서로 다른 DB transaction이다. action이 성공한 직후 process가 종료되면 wake가 누락될 수 있지만, 이미 성공한 채용 action을 실패로 되돌리거나 client에 거짓 실패를 반환하지 않는다. job이 생성된 뒤의 Queue 장애는 recovery한다.
- 실제 model이 action별로 적절히 침묵하는 비율과 progress 문구 품질은 production-like LLM evaluation으로 확인해야 한다. runtime은 empty completion을 정상 상태로 지원하지만 prompt만으로 silence precision 100%를 보장하지 않는다.
- local Supabase가 실행 중이지 않은 환경에서는 migration을 실제 Postgres에 적용하는 lint·RPC integration test를 할 수 없다. migration 적용 전 staging DB 검증이 필요하다.
- 이 브랜치는 아직 migration 적용·push·배포되지 않았다.

### 19.5 현재 완료된 정적 검증

- 새 prompt·web-action 계약 테스트 14개 통과
- 기존 company-side LLM 저장·웹/Slack 표면·Slack delivery 관련 회귀 테스트를 합친 41개 테스트 통과
- 변경 파일 ESLint 통과
- Next.js production build 통과
- 변경 파일 whitespace 검사 통과
- Build 중 로컬 환경에 `VERCEL_REGION`이 없어 Queue client가 `iad1`을 기본값으로 쓴다는 경고만 발생했으며, Vercel runtime에서는 platform 환경값이 주입된다.
