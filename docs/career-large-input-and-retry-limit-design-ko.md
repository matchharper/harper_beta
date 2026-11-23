# Career 큰 입력 처리와 재시도 상한 설계

2026-11-23 작성, 같은 날 구현했다(로컬, 미커밋·미배포). 운영 DB에는 migration을 적용하지 않았다. 계기가 된 장애, 두 가지 수정, 구현에서 달라진 점과 확인 결과를 적는다. 6절이 실제 구현이다.

## 1. 계기

- 11/22 17:04 KST에 한 사용자(5b62ec6f, 대화 8391f42d)가 HTML 보고서 페이지 전체를 채팅에 붙여 보냈다(메시지 512089, 2,042,715자). 읽을 수 있는 글은 약 1만 자였다. 나머지는 페이지에 박힌 이미지 2개(base64)와 스타일 코드였다.
- Career 답변은 최근 대화 메시지를 원문 그대로 모델 입력에 넣는다(`projectCareerConversationHistory` → `formatTalentMessageContentForLlmPrompt`). 메시지 하나의 크기를 다루는 처리는 없다. 그래서 그 뒤 이 대화의 모든 답변 호출을 OpenAI가 "input exceeds the context window"로 거절했다.
- 실패한 작업은 끝나지 않았다. 큐 재시도(`career-agent-reply-v1`, 15초 간격, 메시지 보관 24시간)에 더해, 1분마다 도는 복구 작업(`dispatchCareerAgentReplies` → `claim_career_invocations`)이 끝나지 않은 invocation을 새 큐 메시지로 다시 발행했다. 큐 메시지가 계속 새로 생기니 24시간 보관 기한도 의미가 없었다. 23시간 동안 약 5,240번 실패했고, 사용자는 하루 넘게 답을 받지 못했다.
- 실패한 호출은 `llm_logs`에 사용량으로 남지 않았다. 드러난 비용은 Vercel 함수 실행 시간과 오류 로그였다.
- 11/23 22:44 KST에 제품의 '중단'과 같은 `stop_career_conversation`으로 이 대화의 작업을 끝냈다. 그 뒤 재시도는 없다. 그러나 512089는 여전히 최근 이력에 남아 있다. 그래서 이 사용자가 새 메시지를 보내면 아래 수정 전까지 같은 실패가 다시 시작된다.

## 2. 큰 입력: 원문은 보존하고, 모델에는 들어갈 수 있는 만큼만 준다

원칙은 두 가지다. 사용자가 보낸 원문은 그대로 보존한다. 모델 입력에는 실제로 들어갈 수 있는 크기만 넣는다. 크기 기준은 품질이나 보기 좋은 분량이 아니라 모델 입력 한도라는 실제 자원 한계에서 나온다.

### 2.1 모델 입력 한도를 코드에 사실로 둔다

- 지금 코드에는 모델별 입력 한도 값이 없다. `src/lib/llm/modelConfig.ts`의 각 모델에 제공사 문서의 context window(토큰)와 출처 링크를 둔다.
- 크기는 이미 쓰는 `js-tiktoken`(o200k)으로 센다. 글자 수로 세지 않는다. base64나 HTML은 글자당 토큰이 많아 글자 수로는 크기를 알 수 없다.

### 2.2 저장할 때: 아주 큰 붙여넣기는 첨부 문서로 바꾼다

- 대상은 사용자 입력이 저장되는 모든 입구다. 채팅(`/api/talent/chat`의 `admit_career_request` 직전), 메일 답장 수신(`email/runtime/reply.ts`), 폼 답변이 해당한다.
- 기준: 한 입력의 토큰 수가 Career가 쓰는 모델 중 가장 작은 입력 한도의 1/4을 넘으면 바꾼다. 1/4은 한 턴에 함께 들어가야 하는 system·도구 정의(현재 약 9만 자), 최근 이력, 여러 단계 동안 쌓이는 도구 결과, 답변 몫을 남기려는 배분이다. 90일 동안 이 기준에 걸릴 크기의 메시지는 이번 하나뿐이었다. 그래서 보통의 공고·이력서 붙여넣기는 지금처럼 그대로 대화에 들어간다.
- 바꾸는 방식은 기존 채팅 첨부와 같다.
  - 원문 전체를 비공개 문서(`talent_documents`)로 저장한다. HTML이면 원본 파일과 함께, 태그·스타일·이미지를 뺀 읽을 글을 문서 본문으로 저장한다. 이번 사례면 약 1만 자다.
  - 메시지 본문에는 사용자가 앞에 쓴 말("I'd need more worth while opportunities as per the following:")과 첨부 표시(`HARPER_CAREER_MESSAGE_ATTACHMENTS_V1`)만 남긴다.
  - 사용자 화면에는 자기 문장과 파일 칩("붙여 넣은 내용.html")이 보인다.
  - 모델은 `[Files attached to this user message]`로 파일이 있다는 것을 알고, 필요하면 `read_document`로 읽는다. 새 지침이나 새 도구는 만들지 않는다.
- 입력창에서도 같은 기준을 넘는 붙여넣기를 첨부 칩으로 바꾸면 사용자가 무슨 일이 일어나는지 바로 볼 수 있다. 다만 서버 처리가 기준이고, 입력창 처리는 화면 편의다.

### 2.3 모델에 보내기 직전: 전체 입력이 한도 안에 들어가게 맞춘다

저장할 때 막아도 이미 저장된 행(512089), 메일 원문, 실행 중 쌓이는 도구 결과처럼 한도를 넘을 길이 남는다. 그래서 Career 답변 입력을 조립하는 곳(`chatTurn`의 이력 projection과 단계별 입력 조립)에서 한 번 더 맞춘다.

- 보내기 전에 system·도구 정의·이력·현재 입력의 토큰을 센다. 합이 한도에서 답변 몫을 뺀 값을 넘을 때만 줄인다.
- 줄이는 순서:
  1. 오래된 이력부터 큰 항목을 원문 대신 짧은 표시로 바꾼다. 앞부분 발췌, 원래 크기, "전체는 입력 한도 때문에 넣지 않았다"는 사실, 다시 읽을 참조(문서면 문서 ID)를 둔다.
  2. 그래도 넘으면 이력 개수를 줄인다. 대화 요약은 남긴다.
  3. 현재 입력 하나만으로 넘으면 같은 방식으로 발췌와 참조를 준다.
- 기준을 넘지 않는 턴의 입력은 지금과 한 글자도 다르지 않다. prompt 캐시 위치도 바뀌지 않는다.
- 대화 요약 생성(`conversationSummary`)과 preload 선택 모델 입력도 같은 projection을 쓴다. 요약 단계가 같은 메시지에 다시 걸리지 않게 하기 위해서다.
- 실행 상태(`talent_agent_runtime.state.checkpoints`)에도 입력 사본이 들어가 이번 대화에서 220만 자까지 커졌다. checkpoint에는 projection된 입력을 저장한다.

### 2.4 이번 사용자

- 2.2와 2.3이 배포되면 512089는 2.3에서 발췌로 바뀌어 대화가 다시 동작한다.
- 문서로 옮기는 일(2.2)을 이미 저장된 행에도 할지는 결정이 필요하다(5절).

## 3. 재시도 상한: 오류 종류를 미리 나누지 않고, 연속 실패 횟수와 간격으로 멈춘다

어떤 오류가 다시 해도 안 되는지는 미리 정의하지 않는다. 같은 invocation이 진행 없이 연속으로 실패하면 간격을 늘리며 다시 하고, 정해진 횟수에 이르면 실패로 끝낸다. 처음 보는 오류도 같은 규칙으로 멈춘다.

### 3.1 실패 기록은 invocation 행에 둔다

- 큐 메시지마다 세면 소용이 없다. 복구 작업이 같은 invocation을 새 큐 메시지로 계속 발행하기 때문이다. 그래서 실패 횟수는 DB의 invocation 행(`talent_external_operations`, `kind='career_invocation'`)에 둔다.
- `result.failures = { count, lastError, lastFailedAt, nextAttemptAt }`처럼 기존 JSON에 넣는다. 새 테이블은 만들지 않는다.
- `processCareerAgentReply`가 예외로 끝나면(중단·이어하기·이미 완료는 제외) 새 RPC `record_career_invocation_failure(user, conversation, invocation, error)`를 부른다. 이 RPC가 대화 잠금 아래에서 횟수를 올린다.
- 진행이 있었으면 횟수를 0으로 되돌린다. 예를 들어 실패 전에 checkpoint가 앞으로 나갔으면(`completedSequence` 증가 등) 되돌린다. 긴 작업이 중간에 한 번 끊긴 것을 실패로 쌓지 않기 위해서다.

### 3.2 간격을 늘린다

- `nextAttemptAt`은 15초, 1분, 4분, 15분으로 늘린다.
- 복구 작업의 `claim_career_invocations`는 `nextAttemptAt` 전의 invocation을 발행하지 않는다.
- 큐 재전달로 일찍 도착한 시도는 실행하지 않는다. `CareerReplyDeferred`처럼 남은 시간만큼 뒤로 미룬다.

### 3.3 상한에 이르면 실패로 끝낸다

- 연속 4번 실패하면(첫 실패부터 약 20분) RPC가 invocation을 끝낸다. `status='completed'`, `result.failed=true`와 마지막 오류를 남긴다. 그리고 `stop_career_conversation`처럼 실행 상태의 `activeReply`와 그 답의 checkpoint를 풀어 다음 입력이 막히지 않게 한다. 열린 폼과 다른 작업은 건드리지 않는다.
- 해당 사용자 메시지에 `careerTurnFailed: true`를 표시한다. 화면은 끝없는 '생각 중' 대신 "답을 만들지 못했어요"와 '다시 시도'를 보여 준다. 서버가 확인한 실패이므로 고정 안내를 쓴다.
  - '다시 시도'는 같은 메시지로 새 invocation을 만든다(`queue_career_invocation`).
  - 사용자가 새 메시지를 보내도 새 invocation으로 시작한다.
- 오류 문구를 남긴다. `logs.type = 'career_turn_failed'`에 invocation ID, 시도 횟수, 마지막 오류 문구를 기록한다. 지금 도구 실패 기록(`career_tool_call_failed:*`)은 이름만 남아, 서버 로그 보관 기간(1일)이 지나면 원인을 알 수 없다. 같은 이유로 도구 실패 기록에도 오류 문구를 넣는다.
- 상한에 걸린 실패는 Slack 운영 알림으로 팀원에게 알린다. 사람이 답을 기다리는 사용자를 놓치지 않게 하기 위해서다.

### 3.4 같은 규칙을 쓸 곳

- checkpoint 복구(`claim_career_agent_checkpoint_recovery`)도 같은 방식으로 반복 발행할 수 있다. 같은 실패 기록과 상한을 적용한다.
- 다른 큐(`process-email`, `process-application-browser` 등)는 이번 범위가 아니다. 같은 문제가 있는지 따로 확인한다.

## 4. 확인 방법

- 단위 테스트
  - 2.3의 맞추기: 한도 안의 입력은 그대로인지, 넘는 이력만 발췌로 바뀌는지 본다.
  - 3의 RPC: 연속 실패 → 간격 → 상한 → 실패 종료, 진행 시 0으로 되돌림을 본다.
- 실제 모델 입력 확인: 512089가 있는 대화를 읽기 전용으로 재생해(`previewCareerBackgroundTurn`과 같은 방식) 조립된 입력 크기와 발췌 표시를 확인한다.
- 운영 확인: 배포 뒤 `career_turn_failed`와 context window 오류 로그 수를 본다.

## 6. 구현 (2026-11-23, 미커밋·미배포)

### 6.1 큰 입력

- 모델 입력 한도: `src/lib/llm/modelConfig.ts`의 `MODEL_MAX_INPUT_TOKENS`. 제공사 문서로 확인한 값만 둔다. OpenAI gpt-6.1-terra·sol·gpt-6-luna는 "Maximum input tokens 922,000", Claude Sonnet·Haiku 5.5는 1M이다. OpenRouter GLM·Muse는 공개 페이지에 값이 없어 넣지 않았다. 이 모델들에는 이력 맞추기가 적용되지 않고, 실패하면 재시도 상한으로 끝난다.
- 한 입력 한도 `CAREER_SINGLE_INPUT_TOKEN_LIMIT` = 230,500토큰(922,000의 1/4).
- 맞추기(`src/lib/career/modelInputFit.ts`)
  - 바이트 수가 한도 이하이면 토큰을 세지 않고 그대로 둔다. 토큰 하나는 UTF-8 1바이트 이상이므로 바이트 수는 토큰 수의 상한이다. 거의 모든 메시지가 여기서 끝난다.
  - 넘으면 먼저 읽을 글만 뽑는다. HTML 태그·스타일·스크립트·`data:` base64를 지운다. 그 글만 토큰으로 센다.
    - 원문을 바로 토큰화하지 않는 이유가 있다. `js-tiktoken`은 공백 없는 base64 덩어리에서 매우 느리다. 2MB 페이지 하나에 5분 넘게 걸렸고, 2,000자 조각으로 나눠도 20초였다.
    - 지금 방식으로는 2MB 페이지가 8ms 만에 처리된다. 글만으로도 크면 조각(256자)으로 나눠 세고, 앞부분만 남긴다.
  - 줄였다는 사실은 모델이 읽는 첫 줄에 적는다. "markup, style code and embedded files were removed; all N characters of readable text follow"이거나, "only its first N readable characters follow… ask the person if a missing part matters"다.
- 적용한 곳: 서버 전용 형식 함수 `formatTalentMessageContentForModel`(`src/lib/career/messageForModel.ts`)을 거친다. 해당 경로는 Career 답변 이력과 preload 선택(`chatTurn`), 대기 입력(`work/inbox`), 위임 작업 원문(`work/store`), 실행 중 들어온 메시지(`agentTurnRuntime.server`), 대화 요약 원문(`conversationSummary`), 채팅 route의 이력이다.
  - 공용 형식 함수(`opportunityFeedbackNote.ts`)에는 넣지 않았다. 채팅 화면(`CareerMessageBubble`)도 이 함수를 불러, tokenizer가 브라우저 번들에 들어가기 때문이다.
  - 같은 이유로 화면 컴포넌트가 불러오는 `schedules/server.ts`는 그대로다.
  - realtime 통화, 온보딩 정리, chatInsights 경로도 그대로다.
- 실제 메시지 512089를 이 함수에 넣으면 2,042,715자가 10,314자가 된다(26ms). 사용자가 앞에 쓴 문장과 보고서 본문, 출처 목록이 모두 남는다.
- 이력 맞추기(`fitCareerHistoryToModel`)는 답변 호출 직전에 system·도구 정의·이력을 합친다.
  - 바이트 합이 한도에서 답변 몫(128,000)을 뺀 값 이하이면 그대로 둔다.
  - 넘으면 요약과 현재 입력을 남기고, 오래된 이력부터 뺀다. 빠진 개수는 남은 첫 메시지 앞에 적는다.
  - 한 응답 안에서 단계마다 쌓이는 도구 결과까지 맞추지는 않았다. 그 경우의 실패는 재시도 상한이 끝낸다.
- 저장할 때(`src/lib/career/pastedInputDocument.server.ts`, 채팅 route)
  - 맞추기가 줄여야 하는 입력이면, 원문을 비공개 저장소(`talent-resumes`)에 `text/plain`으로 올리고 `talent_documents` 행을 만든다(`origin_type='career_chat_paste'`, `origin_id`=client request id).
    - 버킷이 HTML을 받지 않는다. 또 사용자가 붙인 마크업을 우리 도메인에서 페이지로 내려주면 스크립트가 실행될 수 있다. 그래서 파일 이름도 '붙여 넣은 페이지.txt'다.
  - 문서 본문은 읽을 글이다. 메시지에는 읽을 글의 앞 1,000자와 첨부 표시가 남고, 모델은 `read_document`로 전체를 읽는다.
  - 같은 요청을 다시 보내면 같은 문서를 쓴다(기존 unique 제약).
  - 메일 수신과 폼 답변은 저장할 때 바꾸지 않는다. 모델 입력 단계의 맞추기만 적용된다.

### 6.2 재시도 상한

- migration `supabase/migrations/20261123180000_career_invocation_failure_limit.sql`의 `record_career_invocation_failure`
  - 실패 횟수·마지막 오류·다음 시도 시각을 invocation의 `provider_refs.failures`에 둔다. 다음 시도 시각을 `dispatch_after`에도 넣어, 1분 복구 작업(`claim_career_invocations`)이 그 전에는 발행하지 않는다.
  - 기다리는 시간은 15초, 1분, 4분, 15분이다. 연속 5번째 실패에서 끝낸다. 첫 실패부터 약 20분이다.
  - 실패 사이에 그 답의 checkpoint가 바뀌었으면 진행으로 보고 1부터 다시 센다.
  - 끝낼 때는 세 가지를 한다. invocation을 `completed`·`result.failed=true`로 바꾸고, 입력 메시지에 `careerTurnFailed`를 표시하고, 실행 상태에서 그 답의 checkpoint와 `activeReply`를 푼다.
- 웹(`src/lib/career/work/invocations.ts`)
  - `processCareerInvocation`에서 실패를 잡아 위 RPC를 부른다. '다시'면 `CareerInvocationRetryLater`를 던지고, 큐 handler가 그 시간 뒤 다시 전달한다(`process-career-agent-reply/route.ts`).
  - 다음 시도 시각 전에 도착한 전달(다른 큐 메시지, 직접 실행 경로)은 실행하지 않고 남은 시간만큼 미룬다. 실패로 세지 않는다.
  - 끝났으면 `logs.type='career_turn_failed'`에 오류 문구를 남기고, Slack 활동 채널에 "Career 답변 실패"를 보낸다(`work/failureNotice.server.ts`). 테스트 계정은 기존 규칙대로 Slack에서 빠진다.
  - RPC 호출 자체가 실패하면 예전처럼 큐 재전달에 맡긴다.
- 도구 실패 기록(`career_tool_call_failed:*`)에도 `meta_data.error`로 오류 문구를 남긴다.
- 화면: 실패한 요청 뒤에 "답을 만들지 못했어요. 같은 내용을 다시 보내면 처음부터 다시 할게요."를 보여 준다. 모델이 읽는 그 메시지에도 실패 사실을 붙인다(`CAREER_TURN_FAILED_FACT`).
  - 설계의 '다시 시도' 버튼은 만들지 않았다. 다시 보내는 기존 경로가 선택지 전송 함수뿐이라 억지로 끼워야 했다.
  - 번역은 ko·en 사전에 직접 썼고, 번역 DB 동기화는 배포 전 절차로 남겼다.
- checkpoint 복구(`claim_career_agent_checkpoint_recovery`)와 legacy `sourceMessageId`·`backgroundRunId` 큐 작업에는 아직 적용하지 않았다.

### 6.3 확인

- 단위 테스트
  - `modelInputFit.test.ts` 7개가 통과했다.
  - `work/invocations.test.ts` 7개가 통과했다. 실패 기록 → 재시도 간격, 상한 → 종료와 팀 알림, 이른 전달은 세지 않음을 새로 넣었다.
  - `careerTurnProjection`·`opportunityFeedbackNote`·`turnCancellation`·`agentReplyQueue`·`agentReplyRecovery`·`conversationSummaryPolicy` 테스트가 통과했다.
  - `agentTurnRuntime.test.ts`(4개)와 `work/tools.test.ts`는 로컬에 `server-only` 패키지가 없어 실패한다. `work/activity.test.ts`(2개)는 이번에 바꾸지 않은 파일에서 실패한다.
- RPC 확인: 운영 DB에서 되돌리는 transaction 하나로 시험했다. 함수 생성, 임시 사용자·대화·invocation 생성, 8번 호출을 한 뒤 예외로 전부 되돌렸다.
  - 결과는 이렇다. 1번째 실패 뒤 15초 대기 중에는 `claim_career_invocations`가 0건을 집었다. 진행이 생긴 뒤 횟수가 1로 돌아갔다. 연속 5번째 실패에서 `failed`가 됐고, 그 뒤 호출은 `gone`이었다. 메시지에 `careerTurnFailed`가 표시됐고, 실행 상태의 `activeReply`와 checkpoint가 풀렸다.
  - 함수와 임시 행이 남지 않은 것을 확인했다.

### 6.4 배포 순서

1. migration `20261123180000`을 운영 DB에 적용한다. 함수가 없으면 웹이 실패 기록을 못 해 예전처럼 재전달된다.
2. 번역 DB를 동기화한다.
3. 웹을 배포한다.

512089가 있는 대화는 웹 배포 뒤 바로 동작한다.

## 5. 남은 결정

1. 이미 저장된 512089를 문서로 옮길지. 옮기면 사용자 화면의 메시지도 첨부 칩으로 바뀐다. 옮기지 않아도 2.3으로 대화는 동작한다.
2. 상한 값(연속 4번, 약 20분)과 간격. 제공사 장애가 20분보다 길면 사용자가 '다시 시도'를 눌러야 한다.
3. 이번 사용자에게 팀원이 직접 연락할지. 이 사용자는 11/22 17:04부터 답을 받지 못했다.
