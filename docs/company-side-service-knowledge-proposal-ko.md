# Company-side LLM 서비스 지식 초안

상태: 제품 검토용 초안  
작성 기준일: 2026-08-21  
범위: Core prompt, 기존 `service_answer_examples`의 audience 분리, company용 답변 예시 20개  
비범위: 코드 변경, DB 변경, 데이터 입력, 배포

## 1. 이번 안의 결론

- Core prompt에는 자주 반복해서 참조되는 서비스의 정체성, 가격 원칙, 연결 대기의 의미, 사실 확인 원칙만 둔다.
- 세부 사용법과 예외는 기존 `service_answer_examples`에 둔다. 새 테이블은 만들지 않는다.
- `service_answer_examples`에 `audience` 컬럼을 새로 만들고, 모든 행을 `company` 또는 `career`로 명시적으로 구분한다.
- audience는 LLM이나 사용자가 정하지 않고 서버 경로가 정한다. 현재 자동 lookup은 company workspace에만 적용하며, Career 행은 내용 검토가 끝날 때까지 런타임에서 사용하지 않는다.
- 벡터 검색은 전체 행을 검색한 뒤 결과를 거르는 방식이 아니라, audience로 먼저 제한한 뒤 유사도를 계산한다.
- 검색 결과는 정답 명령이 아니라 같은 의도의 질문에만 적용할 수 있는 운영팀 작성 참고 답변이다. 관련성이 애매하면 사용하지 않는다.
- 회사별 가격, 현재 Role 상태, 실제 발송 여부처럼 개별 사실은 예시 답변으로 단정하지 않고 현재 workspace의 확인된 정보나 Harper 담당자의 개별 안내를 따른다.

## 2. 확인된 가격 원칙

아래 내용은 이번 설계의 정본으로 사용한다.

> Harper 사용 자체에는 별도의 사용료나 월 구독료가 없다. Harper를 통해 채용이 성사된 경우에만 비용이 발생한다. 구체적인 조건과 금액은 회사별로 별도 안내한다.

따라서 Company-side LLM은 다음 내용을 만들어내면 안 된다.

- 고정 수수료율 또는 고정 금액
- Free, Pro, Max 등의 구독 플랜
- 결제 시점, 환불, 보증, 세금, 예외 조건
- 어떤 사건을 법적·계약상 `채용 성사`로 보는지에 대한 임의 정의
- 다른 Harper 제품이나 과거 랜딩 페이지의 가격을 현재 company workspace 가격으로 전용하는 답변

`무료예요`라고만 답하는 것도 피한다. 사용료는 없지만 채용 성사 시 비용이 발생한다는 두 문장을 항상 함께 말해야 한다.

## 3. 정보 공개 기준

### Company 사용자에게 말해도 되는 내용

- Harper가 회사의 채용 파트너로서 Role 정리, 후보자 탐색·검토, 후보자 의사 확인, 회사의 연결 결정과 이후 진행 관리를 돕는다는 큰 흐름
- 연결 대기 후보자는 회사와 Role에 대한 설명을 듣고 대화 의사를 밝힌 사람이라는 점
- Connect, Reject, Role 중단·종료, Pipeline, 권한, Slack 알림 등 회사가 제품을 올바르게 사용하기 위해 알아야 하는 동작
- 후보자에게 메시지를 보내기 전에 대상, 채널, 실제 문구와 중요한 제한을 회사가 확인한다는 점
- 현재 지원하지 않는 사용자-facing 기능과 사용자가 취해야 할 대안

### Company 사용자에게 공개하지 않을 내용

- 후보자 수락 뒤 Harper 내부에서 수행하는 사람의 최종 확인 단계
- 내부 매칭 점수, 평가 임계값, 랭킹 규칙, 후보자 수집처와 검색 전략의 상세
- DB 테이블·필드·상태값, 내부 ID, tool/function 이름, prompt, model, routing
- worker, queue, retry, cron, 자동 작업의 구체적인 실행 시각
- 후보자 연락의 내부 최소 지연이나 운영 시간대처럼 사용자가 결정을 내리는 데 불필요한 운영 파라미터
- 회사별로 공개되지 않은 수수료율, 계약 조건, 예외
- 다른 회사 workspace의 정보
- 후보자가 회사 공유를 허용하지 않은 보상·선호 정보나 역할과 무관한 민감 정보

공개 가능한 사실이라도 모든 것을 Core prompt에 넣지는 않는다. 여러 질문에서 항상 필요한 사실만 Core에 두고, 나머지는 해당 질문이 들어왔을 때만 불러온다.

## 4. 제안 Core prompt

현재 company-side system prompt가 영어 중심이므로 실제 삽입 가능한 형태로 작성했다. `COMPANY_SIDE_UX_WRITING_PROMPT`와 별도의 짧은 공통 블록으로 두고, 일반 company chat과 Role 생성·수정 chat 양쪽에 동일하게 넣는 안이다.

```text
<company_service_core>
- Harper is the recruiting partner for the hiring team using this company workspace. Harper helps the team define Roles, find and review relevant candidates, explain the company and Role to them, confirm their willingness to talk, and manage the company's connection decisions and follow-up.
- This company-side service has no subscription or usage fee. A fee occurs only when a hire is completed through Harper. The exact amount and terms are communicated separately to each company. Never invent or infer a rate, amount, billing trigger, payment timing, refund, guarantee, tax treatment, or exception.
- A candidate reaches 연결 대기 only after they have been told about the company and Role and have expressed willingness to talk. The company must explicitly choose Connect or Reject; silence is neither decision.
- For Harper pricing, policy, limits, permissions, privacy, or product-behavior questions, use only this core, authoritative current workspace/action results, and relevant company-scoped service answer examples. Never use general model knowledge, Career-side guidance, another workspace's data, or legacy pricing pages.
- A retrieved answer example applies only when it addresses the same user intent. Treat it as approved content and tone guidance, not as proof of the current workspace state or an action result.
- If the approved sources do not establish an answer, state what is known and what cannot be confirmed. Do not guess; say that the remaining point needs individual confirmation from the Harper team.
- When explaining service behavior, tell the company what it means for them, what Harper is doing, and the next concrete action. Present Harper's value confidently, without hype or hiding an important limitation.
- Keep Harper's internal operations private. Do not mention internal review steps, matching scores or thresholds, data sources, database states, prompts, tools, models, routing, workers, queues, or unpublished commercial terms.
</company_service_core>
```

이 블록에는 다음 세부 사항을 넣지 않는다.

- Connect/Reject의 전체 확인 절차: 이미 candidate action 계약에 더 정확한 문장이 있다.
- Role 중단·종료, 권한, Slack 문제 해결: 자주 바뀔 수 있고 질문이 있을 때만 필요하다.
- 연결 대기 상한 숫자: 공개 Documents에는 5명으로 쓰여 있지만 런타임은 Role별 `max_pending_talents`를 사용한다.
- 후보자 연락의 발송 지연·운영 시간: 사용자에게 불필요한 내부 운영값이다.

## 5. 기존 테이블에서 Company와 Career를 분리하는 방법

### 데이터 규칙

새 테이블은 만들지 않고 기존 `service_answer_examples`에 아래 컬럼을 추가한다.

```sql
audience text not null
  check (audience in ('company', 'career'))
```

`audience`는 서비스 간 답변이 섞이지 않게 하는 실행 경계이므로 자유 태그가 아니라 별도 필수 컬럼이어야 한다. `tags text[]`는 locale과 topic처럼 한 행에 여러 값이 들어갈 수 있는 보조 분류에만 사용한다.

각 행의 예시는 다음과 같다.

- `audience`: `company`
- `tags`: `locale:ko`, `topic:pricing`

### 기존 데이터 이관 순서

1. 처음에는 nullable `audience text` 컬럼을 추가한다.
2. 현재 존재하는 Career 답변 11개를 `audience = 'career'`로 backfill한다.
3. null이나 허용되지 않은 값이 없는지 확인한다.
4. `company`, `career`만 허용하는 check constraint와 `NOT NULL`을 적용한다.
5. 새 Company 답변 20개는 처음부터 `audience = 'company'`로 저장한다.
6. 조회 조건을 위해 `(audience, enabled)` 인덱스를 추가한다. 현재 데이터 규모에서는 별도의 새 vector index가 필수는 아니며, 실제 행 수와 실행 계획을 확인한 뒤 결정한다.
7. `user_example_hash`에 전역 unique constraint나 unique index가 있다면 `(audience, user_example_hash)` 조합으로 바꾼다. 같은 질문 문구라도 Company와 Career에서 서로 다른 답변이 필요할 수 있기 때문이다.

현재 DB의 활성 Career 행 11개에는 새 컬럼이 없으므로 위 순서로 `career` 값을 채워야 한다. 이관이 답변 내용의 정확성 승인까지 의미하지는 않는다. 자동 검색 사용을 늘리기 전에 탈퇴 시 데이터 삭제 범위, 프로필 수정 경로, Open to matches의 공개 범위, 연결 수락 시 회사 공유 정보 등은 현재 Career 동작과 별도로 재검토해야 한다.

### 검색 규칙

1. Company 서버 경로가 `audience = 'company'`를 고정한다.
2. Company 사용자가 작성한 최신 메시지를 turn당 한 번 임베딩한다. tool 반복이나 후속 LLM 호출마다 다시 검색하지 않는다.
3. SQL/RPC가 `audience` 컬럼으로 행을 먼저 제한한 뒤 유사도를 계산한다.
4. 관련 후보를 최대 2~3개만 main LLM context에 넣는다.
5. main LLM은 같은 의도라고 판단되는 답변만 사용한다. 예시와 질문이 다르면 무시한다.
6. 검색 실패·timeout은 main 응답을 막지 않는다. 재시도하지 않고 Core prompt와 현재 workspace context만으로 계속한다.

`lookupAnswerExamples(question, { audience })`에서 audience는 필수 인자로 둔다. RPC도 `audience_filter`를 필수로 받고 `where audience = audience_filter`를 유사도 조건보다 먼저 적용한다. audience-aware RPC가 없을 때 기존 unscoped RPC로 자동 fallback하면 두 사용자군이 다시 섞이므로, 이 경우에는 검색을 생략하는 fail-closed 동작이 맞다. Career에는 자동 lookup과 model-callable lookup tool을 모두 두지 않는다. 기존 Career 행은 보관하되, 내용 수정과 검증이 끝나기 전에는 prompt에 주입하지 않는다.

현재 기본 임계값 0.35를 최종값으로 간주하면 안 된다. 실제 확인에서 관련 없는 `Harper 이용 가격이 얼마예요?`가 가격 행이 없는 상태에서 Career의 `Harper 탈퇴하려면 어떻게 해?`와 0.64로 매칭됐다. 브랜드명과 짧은 문장만으로 높은 점수가 나올 수 있으므로 임계값만으로 오답을 막을 수 없다. 아래 20개 질문의 실제 변형과 무관 질문을 함께 평가해 임계값을 조정하고, 결과의 intent 일치 규칙을 반드시 유지한다.

초안 작성 중 각 질문에 대표 변형을 하나씩 만든 20건 smoke check에서는 `text-embedding-3-small` 기준으로 기대한 Company 주제가 20건 모두 top 1이었고, top 1 최저 점수는 0.372였다. 질문 문구를 실제 사용자 표현에 가깝게 다듬는 것이 검색 품질에 유효했다. 다만 작성자가 고른 소규모 양성 예시이므로 이 수치로 임계값을 확정해서는 안 된다. 실제 대화에서 수집한 여러 paraphrase와 무관·민감 질문을 포함한 별도 평가가 필요하다.

### Ops 관리 화면 규칙

- Audience를 `Company` 또는 `Career` 중 하나를 고르는 필수 선택 항목으로 보여주고 새 `audience` 컬럼에 저장한다.
- 저장 시 audience가 없거나 허용되지 않은 값이면 거절한다.
- 목록에서 Company와 Career를 명확히 필터링할 수 있게 한다.
- 조회·저장 API와 생성된 DB type에도 audience를 필수 값으로 추가한다. 기존 행을 수정할 때도 현재 audience가 화면에 명확히 보여야 한다.
- 답변 수정은 임베딩을 다시 만들 필요가 없지만, 사용자 예시 문구가 바뀌면 현재처럼 다시 만든다.
- `notes`에는 근거 문서와 제품 승인일을 남기되 LLM에는 전달하지 않는다.

## 6. Company 답변 예시 20개

아래 문구는 `answer_example_text`에 그대로 저장할 수 있는 수준을 목표로 했다. 실제 답변에서는 현재 대화와 workspace 상태에 맞춰 자연스럽게 줄이거나 구체화하되, 행에 없는 상태나 실행 결과를 지어내면 안 된다.

모든 답변은 `직접 답변 → 사용자에게 어떤 의미인지 → Harper가 맡는 일 → 필요한 다음 행동` 순서를 기본으로 했다. Harper의 장점은 실제 제공하는 과정과 결과로 설명하고, 근거 없는 과장이나 중요한 제한을 숨기는 표현은 사용하지 않았다.

### 1. Harper가 하는 일

`user_example_text`

> Harper는 뭘 해주는 서비스인가요? 회사 채용팀을 위해 어떤 일을 해주나요?

`answer_example_text`

> Harper는 단순히 후보자 목록을 보여주는 서비스가 아니라, 회사와 함께 채용을 진행하는 파트너예요. 채용할 역할과 판단 기준을 정리하고, 그 기준에 맞는 분들의 경력을 검토한 뒤 회사와 역할을 먼저 설명해 실제로 대화할 의사가 있는지 확인해요. 그래서 Inbox의 연결 대기에는 회사 설명을 듣고 이야기해 보고 싶다고 답한 후보자만 도착해요. 회사가 Connect한 뒤에는 Pipeline에서 다음 전형과 결과를 관리할 수 있어요.

audience: `company`  
태그: `locale:ko`, `topic:service-overview`

### 2. 전체 비용

`user_example_text`

> Harper 비용은 어떻게 되나요? 돈은 얼마나 내야 하죠?

`answer_example_text`

> 역할을 만들고 후보자를 추천받아 검토하는 동안에는 별도의 사용료나 월 구독료가 없어요. Harper를 통해 실제 채용이 성사된 경우에만 비용이 발생해요. 구체적인 조건과 금액은 회사에 개별적으로 연락드려 안내해요.

audience: `company`  
태그: `locale:ko`, `topic:pricing`

### 3. 구독료·사용료

`user_example_text`

> 월 구독료나 사용료가 따로 있나요? 무료인가요?

`answer_example_text`

> 네, 월 구독료나 기본 사용료는 없어요. 다만 Harper를 통해 채용이 성사되면 그때 비용이 발생하므로, 모든 경우에 무료인 서비스라는 뜻은 아니에요. 적용되는 조건과 금액은 회사에 개별적으로 연락드려 안내해요.

audience: `company`  
태그: `locale:ko`, `topic:pricing`

### 4. 채용 성사 비용의 금액

`user_example_text`

> 사람을 뽑으면 얼마를 내는 건가요? 채용 성사 수수료율이 정해져 있나요?

`answer_example_text`

> Harper를 통해 채용이 성사된 경우에만 비용이 발생해요. 공개된 공통 수수료율이나 고정 금액으로 안내하지 않으며, 구체적인 조건과 금액은 회사에 개별적으로 연락드려 설명해요. 아직 안내받지 못했는데 채용 전에 확인이 필요하다면 프로필 메뉴의 문의하기에 회사명과 함께 남겨 주세요.

audience: `company`  
태그: `locale:ko`, `topic:pricing`

### 5. 첫 추천까지 걸리는 시간

`user_example_text`

> Role을 등록했는데 왜 후보자 추천이 바로 오지 않나요?

`answer_example_text`

> 첫 추천까지는 시간이 조금 걸릴 수 있어요. Harper는 단순히 검색된 후보자를 바로 보여드리지 않고, 역할에 맞는 분을 찾고 경력을 검토한 뒤 회사와 역할을 먼저 설명해 실제 대화 의사까지 확인해요. 그래서 Inbox에는 회사가 바로 검토할 수 있는 후보자가 도착하지만, 정확한 추천 시점을 미리 약속하기는 어려워요. 꼭 필요한 조건과 제외 기준, 후보자에게 잘 전달되어야 할 회사의 장점이 최신인지 역할 대화에서 확인해 주세요. 예상보다 오래 걸린다고 느껴지면 프로필 메뉴의 문의하기에 역할 이름을 남겨 주세요.

audience: `company`  
태그: `locale:ko`, `topic:recommendation-timing`

### 6. 연결 대기의 의미

`user_example_text`

> 연결 대기면 후보자가 이미 관심이 있다는 뜻인가요?

`answer_example_text`

> 네. 연결 대기는 후보자가 회사와 역할에 대한 설명을 듣고, 이 회사와 대화해 보고 싶다는 의사를 밝힌 상태예요. 단순히 검색에서 찾은 사람이나 Harper가 일방적으로 올린 후보자는 아니에요. 후보자는 지금 회사의 답을 기다리고 있으니, 추천 이유와 자료를 검토한 뒤 Connect 또는 Reject로 알려 주세요. 결정하기에 정보가 부족하다면 먼저 Harper에게 후보자 확인을 요청할 수 있어요.

audience: `company`  
태그: `locale:ko`, `topic:pending-connection`

### 7. 새 추천이 멈춘 경우

`user_example_text`

> 추천이 오다가 멈췄어요. 새 후보자가 더 안 오는 이유가 뭔가요?

`answer_example_text`

> 먼저 역할이 중단되거나 종료된 상태인지, Inbox의 연결 대기 후보자가 해당 역할의 검토 한도에 도달했는지 확인해 주세요. 중단된 역할을 다시 진행하거나 기존 후보자에게 Connect 또는 Reject로 답해 대기가 줄면 새 추천이 이어질 수 있어요. 위 상황이 아니라면 역할에 잘 맞고 실제로 대화할 의사가 있는 분을 연결해 드리기 위해 탐색과 확인에 시간이 조금 더 걸리는 중일 수 있어요. 문제가 생겼다고 생각되면 프로필 메뉴의 문의하기에 역할 이름과 현재 상황을 함께 남겨 주세요.

audience: `company`  
태그: `locale:ko`, `topic:recommendation-paused`

### 8. Connect 이후

`user_example_text`

> 이 후보자의 연결 수락은 어떤 의미인가요? Connect 버튼을 누르면 바로 어떻게 되나요?

`answer_example_text`

> Connect(연결 수락)는 이 후보자와 직접 대화를 시작하고 싶다는 회사의 결정이에요. 기본 방식인 Email intro를 선택하면 Harper가 후보자와 회사가 고른 담당자를 같은 이메일에 연결해 드려요. 보내기 전에는 연결 방식과 받을 사람을 다시 확인하므로, 질문만 했다고 바로 이메일이 나가지는 않아요. 후보자는 이미 회사와 역할을 듣고 대화 의사를 밝힌 상태이니, 소개 이메일에서는 회사 담당자가 전체 답장으로 인사하고 가능한 일정을 제안하면 돼요. Connect만으로 인터뷰 일정이 자동 확정되지는 않으며 이후 진행은 Pipeline에서 관리해요.

audience: `company`  
태그: `locale:ko`, `topic:connect`

### 9. Reject 이후

`user_example_text`

> 이 후보자의 연결 거절은 어떤 의미인가요? Reject하면 잠깐 보류되는 건가요?

`answer_example_text`

> Reject(연결 거절)는 잠시 보류하는 기능이 아니라, 회사가 이 후보자와 이번 역할의 채용을 더 진행하지 않겠다는 결정이에요. 선택하면 소개 이메일은 보내지 않고, 회사가 진행을 종료했다는 사실이 후보자에게 보이며 Harper가 종료 안내를 시작해요. 후보자가 이미 보거나 전달받은 안내는 나중에 마음이 바뀌어도 회수할 수 없으니 신중하게 선택해 주세요. 아직 판단할 정보가 부족하다면 Reject하기 전에 Harper에게 질문이나 최신 이력서 요청을 맡길 수 있어요. Reject reason을 남기면 후보자에게 그대로 전달하지 않고 다음 추천을 더 잘 맞추는 데 참고해요.

audience: `company`  
태그: `locale:ko`, `topic:reject`

### 10. Email intro 수신자

`user_example_text`

> 소개 이메일에는 누가 들어가나요? Email intro 수신자가 궁금해요.

`answer_example_text`

> Email intro에서는 후보자가 받는 사람에 들어가고, 회사가 선택한 멤버는 CC에 들어가요. 이메일을 받은 뒤 실제로 후보자에게 인사하고 다음 일정을 조율할 담당자를 선택해 주세요. 채용 담당자와 현업 리더가 함께 대화를 이어가야 한다면 두 사람을 모두 포함할 수 있어요. 필요한 담당자가 목록에 보이지 않으면 먼저 Organization의 Members에서 초대해야 해요.

audience: `company`  
태그: `locale:ko`, `topic:intro-email`

### 11. 회사가 직접 연락하는 방식

`user_example_text`

> Harper 소개 메일 없이 우리가 후보자에게 직접 연락해도 되나요?

`answer_example_text`

> 가능해요. Direct contact를 요청하면 Harper는 소개 이메일을 보내지 않고 후보자를 연결됨으로 표시해요. 그 뒤 첫 연락과 일정 조율은 회사가 직접 해야 하므로, 바로 연락할 담당자와 연락 방법이 준비됐을 때 선택하는 것이 좋아요. 질문만으로 상태를 바꾸지는 않고, Harper가 이메일을 보내지 않는다는 점과 회사가 직접 연락해야 한다는 점을 다시 확인한 뒤 진행해요. 양쪽을 같은 이메일에서 자연스럽게 이어 주길 원한다면 기본 방식인 Email intro가 더 잘 맞아요.

audience: `company`  
태그: `locale:ko`, `topic:direct-contact`

### 12. 후보자에게 질문·이력서 요청

`user_example_text`

> 후보자에게 질문하거나 최신 이력서를 요청해줄 수 있나요?

`answer_example_text`

> 네. Connect 또는 Reject를 결정하기 전에 필요한 경력 내용을 묻거나 최신 이력서를 요청할 수 있어요. Harper가 대신 여쭤볼 내용을 자연스러운 연락 문구로 먼저 보여드리고, 회사가 본문을 확인한 뒤에만 후보자에게 보내요. 후보자는 답하지 않거나 요청을 거절할 수도 있고 Harper가 자동으로 재촉하지는 않아요. 답변이 오면 요청을 시작한 대화에서 알려드리므로, 그 내용을 확인한 뒤 연결 여부를 결정하면 돼요.

audience: `company`  
태그: `locale:ko`, `topic:candidate-contact`

### 13. 후보자 보상 정보

`user_example_text`

> 이 후보자의 현재 연봉이나 희망 보상을 알려줄 수 있나요?

`answer_example_text`

> 후보자가 회사에 공유하도록 허용하지 않은 현재 연봉이나 희망 보상은 바로 전달하지 않아요. 필요하다면 Harper가 후보자에게 지금 공유 가능한 보상 정보를 새로 물어볼 수 있어요. 정확한 금액 또는 범위, 기본급 또는 총보상, 통화 중 어떤 형태로 답할지도 후보자가 선택할 수 있게 요청해요. 회사에는 발송 전에 실제 질문 문구를 보여드리므로, 채용 판단에 필요한 범위만 물어보도록 조정할 수 있어요. 이렇게 하면 회사는 후보자의 최신 답변을 받고, 후보자는 공유 범위를 직접 정할 수 있어요.

audience: `company`  
태그: `locale:ko`, `topic:compensation`, `topic:privacy`

### 14. Role 중단과 종료

`user_example_text`

> Role 채용을 잠깐 중단하는 것과 완전히 종료하는 것은 뭐가 다른가요?

`answer_example_text`

> 잠시 쉬었다가 채용을 다시 이어갈 계획이라면 중단을 선택해 주세요. 새 추천만 멈추고, 이미 연결 대기에 있거나 연결이 시작된 후보자는 그대로 남아 계속 검토할 수 있어요. 종료를 선택하면 새 추천이 멈추고 후보자 화면에서도 해당 역할이 더 이상 열려 있는 기회로 보이지 않아요. 다만 이 변경만으로 기존 후보자의 단계가 모두 종료되거나, 현재 대화 중인 후보자 전원에게 종료 안내가 자동 발송되는 것은 아니에요. 진행 중인 후보자가 있다면 종료 전에 Inbox와 Pipeline을 확인하고, 각 후보자의 실제 결과에 맞게 연결 여부와 종료 안내를 따로 마무리해 주세요.

audience: `company`  
태그: `locale:ko`, `topic:role-status`

### 15. Pipeline 단계 이동의 효과

`user_example_text`

> Pipeline에서 후보자를 다른 칸으로 옮기면 메일도 자동으로 가나요?

`answer_example_text`

> 아니요. Pipeline에서 후보자를 다른 단계로 옮기는 것은 채용팀이 실제 진행 상황을 함께 관리하기 위한 기록이에요. 단계를 옮겨도 후보자에게 이메일이나 Harper 메시지가 자동으로 가지 않고 인터뷰 일정도 만들어지지 않아요. 후보자에게 다음 전형이나 일정을 알려야 한다면 회사가 별도로 연락한 뒤, 실제 진행 상태에 맞춰 Pipeline을 옮겨 주세요. 채용을 끝내려는 경우에는 단순히 칸만 옮기지 말고 후보자 종료 결정과 안내가 필요한지 함께 확인해야 해요.

audience: `company`  
태그: `locale:ko`, `topic:pipeline`

### 16. 인터뷰 일정 잡기

`user_example_text`

> 면접 캘린더를 잡아줄 수 있나요? 후보자 일정을 Harper가 직접 정해주나요?

`answer_example_text`

> 현재 Harper가 회사와 후보자의 캘린더 일정을 직접 만들거나 확정하지는 못해요. 대신 Email intro를 선택하면 Harper가 양쪽을 같은 이메일에 연결해 드리므로, 회사 담당자가 전체 답장으로 가능한 시간을 제안해 바로 일정을 조율할 수 있어요. 일정이 정해진 뒤에는 실제 전형에 맞춰 후보자를 Pipeline의 다음 단계로 옮겨 주세요. Pipeline 이동만으로 후보자에게 일정이 전달되지는 않아요.

audience: `company`  
태그: `locale:ko`, `topic:scheduling`, `topic:limitation`

### 17. 멤버 권한

`user_example_text`

> Owner, Admin, Viewer 권한은 어떻게 다른가요?

`answer_example_text`

> Owner는 멤버 초대와 권한 변경을 포함해 Workspace의 모든 기능을 관리할 수 있어요. Admin은 후보자, Roles, 회사 정보와 Integrations를 관리하고 Connect 또는 Reject를 결정할 수 있지만, 멤버 초대·제거와 권한 변경은 할 수 없어요. Viewer는 후보자와 회사 정보를 함께 검토할 수 있지만 내용을 변경하거나 연결 여부를 결정할 수는 없어요. 함께 검토만 할 동료는 Viewer로, 후보자 결정과 역할 관리를 맡길 동료는 Admin으로 초대하면 돼요. 멤버 권한 자체를 바꿔야 한다면 Owner에게 요청해 주세요.

audience: `company`  
태그: `locale:ko`, `topic:permissions`

### 18. Slack 알림 문제

`user_example_text`

> Slack에 후보자 추천 알림이 안 와요. 무엇을 확인해야 하나요?

`answer_example_text`

> Organization의 Integrations에서 Slack이 연결되어 있는지, 해당 역할의 알림을 받을 채널이 선택되어 있는지 먼저 확인해 주세요. 비공개 채널이라면 Slack에서 `/invite @Harper`로 Harper를 초대한 뒤 Integrations에서 채널을 다시 추가해야 해요. 회사에서 Slack 앱 설치 승인이 필요한 경우에는 Slack 관리자가 Harper 설치를 승인했는지도 확인해 주세요. 후보자 정보가 전달되는 채널이므로 실제 채용에 참여하는 멤버만 있는 채널을 권해요. 모두 확인했는데도 알림이 오지 않으면 프로필 메뉴의 문의하기에 역할 이름과 Slack 채널 이름을 함께 남겨 주세요.

audience: `company`  
태그: `locale:ko`, `topic:slack`

### 19. JD 없이 Role 만들기와 이후 수정

`user_example_text`

> 채용 공고나 JD가 없어도 Role을 만들 수 있나요? 나중에 수정해도 되나요?

`answer_example_text`

> 네, 완성된 JD가 없어도 시작할 수 있어요. 왜 지금 채용하는지, 입사한 분이 맡을 일, 꼭 필요한 경험과 근무 조건을 아는 만큼 편하게 말해 주세요. Harper가 후보자에게 보여줄 Description과 내부 Hiring Brief의 초안을 만들고, 매칭에 중요한 빈칸만 이어서 확인해요. 역할을 등록하기 전에는 알림을 받을 Slack 채널과 주 담당자 한 명도 정해야 해요. 등록한 뒤에도 역할 대화에서 기준을 바꿀 수 있지만, 이미 연결 대기에 있는 후보자는 이전 기준으로 소개됐을 수 있어요. 기준을 크게 바꿨다면 기존 후보자도 새 기준으로 만나볼 분인지 한 명씩 다시 확인해 주세요.

audience: `company`  
태그: `locale:ko`, `topic:role-creation`, `topic:role-editing`

### 20. 후보자에게 보이는 Role 정보

`user_example_text`

> Description과 Hiring Brief, Evaluation Criteria는 후보자에게 다 보이나요?

`answer_example_text`

> 모두 후보자에게 보이는 것은 아니에요. Description은 후보자가 회사와 역할을 이해하고 이 기회에 관심을 가질지 판단할 수 있도록 보여주는 설명이에요. Hiring Brief, Evaluation Criteria, Context for Harper에는 회사와 Harper가 후보자를 찾고 검토할 때 사용할 내부 기준을 둘 수 있으며, 공개 JD처럼 후보자에게 자동으로 표시되지는 않아요. 후보자가 미리 알아야 올바르게 판단할 수 있는 업무, 근무 방식, 고용 형태와 중요한 조건은 Description에 정확히 적어 주세요. 내부 항목이라고 해서 직무와 무관한 민감 정보나 차별적인 기준을 적어도 되는 것은 아니에요.

audience: `company`  
태그: `locale:ko`, `topic:role-visibility`, `topic:privacy`

## 7. 자동 lookup의 prompt 주입 형태

검색 결과는 raw ID나 score 없이 아래처럼 넣는다.

```text
<company_service_answer_examples>
These are ops-authored candidate answers for the latest user message.
Use an example only if it addresses the same intent. Adapt it to the current conversation.
Do not treat it as proof of current workspace state or claim that an action occurred.

Example user question: ...
Approved answer guidance: ...
</company_service_answer_examples>
```

질문과 다른 예시가 검색되더라도 main LLM이 억지로 적용하지 않게 하는 것이 핵심이다. 예를 들어 `후보자의 종교를 알려줘`가 벡터상 Connect나 보상 정보와 가깝게 나와도, 같은 의도가 아니므로 해당 답변을 사용하면 안 된다.

## 8. 구현 전 검증 기준

### 데이터 격리

- Company 경로에서는 `audience = 'career'` 행이 한 건도 반환되지 않는다.
- Career runtime에는 `service_answer_examples`를 조회하거나 prompt에 주입하는 경로가 없다.
- audience가 없거나 잘못된 행은 활성 검색 대상에 들어오지 않는다.
- RPC 변경이 누락돼도 unscoped 검색으로 fallback하지 않는다.

### 답변 정확도

- `돈은 얼마나 내야 하죠?`, `무료인가요?`, `수수료 몇 퍼센트예요?`가 각각 가격 답변을 우선 검색한다.
- `Connect`, `Reject`, `연결 대기`, Role 중단·종료를 서로 바꿔 답하지 않는다.
- 현재 Role 상태, 후보자 상태, 발송 여부는 FAQ만 보고 단정하지 않는다.
- 무관 질문과 민감 정보 질문에 검색된 예시를 억지로 적용하지 않는다.
- 답을 찾지 못하면 알려진 범위와 확인이 필요한 범위를 나눠 말하며 추측하지 않는다.

### 지연과 실패 처리

- 한 company user-authored turn에서 lookup은 한 번만 실행한다.
- 가능한 workspace context 조회와 병렬로 실행한다.
- embedding 또는 DB lookup 실패가 main LLM 응답을 중단시키지 않는다.
- timeout 뒤 동기 재시도를 critical path에서 하지 않는다.

## 9. 검토 근거와 함께 정리해야 할 현재 충돌

이 초안은 배포된 revision을 확인한 문서가 아니라, 현재 repository의 동작 코드와 company-facing Documents, 실제 `service_answer_examples` 데이터를 교차 검토해 작성했다.

주요 근거는 다음과 같다.

- Company agent의 현재 동작 계약: `src/lib/org/agent/prompts.ts`
- 공통 company-side 문체·공개 계약: `src/lib/org/agent/uxWritingPrompt.ts`
- Role 생성·수정 동작: `src/lib/org/agent/roleCreationPrompt.ts`, `src/lib/org/agent/roleCreationState.ts`
- Company 사용자용 안내: `src/content/org-documents.md`, `src/components/org/workspace/pages/OrgDocumentsPage.tsx`
- Owner/Admin/Viewer 권한: `src/lib/org/permissions.ts`
- Role별 연결 대기 gate: `scripts/company_role_recurring_matching.py`
- 기존 예시 테이블 조회와 저장: `src/lib/serviceAnswerExamples.ts`, `src/lib/ops/answerExamplesServer.ts`

구현할 때 다음 충돌도 함께 정리해야 한다.

1. `src/lib/org/agent/prompts.ts`의 연결 대기 설명에는 Harper 팀의 마지막 확인이라는 내부 사실이 들어 있다. 새 Core의 비공개 원칙과 충돌하므로 LLM에 필요한 상태 의미만 남기고 내부 절차 표현은 제거해야 한다.
2. `src/lib/org/slackMessages.ts`의 Role 등록 완료 문구도 후보자 관심·연결 의사 뒤의 Harper 팀 마지막 확인을 회사에 직접 노출한다. 동일하게 company-facing 표현에서 빼야 한다.
3. company-facing Documents는 연결 대기 5명을 고정값으로 안내하지만, 실제 recurring matching은 Role별 `max_pending_talents`를 읽는다. 제품 기준을 하나로 정한 뒤 문서와 답변을 맞춰야 한다.
4. repository에는 과거 구독 플랜과 `/pricing` 관련 코드가 남아 있다. 이 정보가 현재 company workspace의 가격 근거로 검색되거나 prompt에 들어가면 안 된다.
5. 현재 테이블에는 audience 컬럼이 없고, 기존 Career 답변 11개 중 일부는 현재 동작 검증이 필요하다. 컬럼을 추가하고 값을 채우더라도 Career에서는 내용 검토가 끝날 때까지 자동 lookup이나 tool lookup을 사용하지 않는다.

## 10. 제품 확인이 필요한 세 가지

1. `채용 성사`를 사용자에게 더 구체적으로 설명할 것인가? 현재 초안은 offer 수락, 계약 체결, 입사일 중 하나를 임의로 정의하지 않는다.
2. 연결 대기 상한을 사용자에게 항상 `5명`이라고 말할 것인가? 현재 공개 Documents는 5명이라고 하지만 런타임은 Role별 설정값을 사용한다. 초안은 숫자를 빼고 `해당 Role의 검토 한도`라고 표현했다.
3. 가격의 개별 안내가 언제 어떤 채널로 전달되는지까지 공개할 것인가? 현재 초안은 `회사에 개별적으로 연락드려 안내해요`라고 답하고, 아직 안내받지 못한 사용자는 프로필 메뉴의 문의하기를 이용하도록 적었다.

이 세 가지가 결정되기 전에도 나머지 Core와 답변 예시는 구현할 수 있지만, 관련 문구는 결정 후 고정하는 편이 안전하다.
