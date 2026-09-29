# Harper 상호 연결 양방향 소통 설계와 구현

- 문서 상태: 로컬 구현 완료, 미배포
- 기준일: 2026-09-22
- 적용 제품: Career Harper, Company Harper, company contact worker
- 핵심 원칙: 정성적 판단은 LLM이 하고, 코드는 권한·식별자·관계·멱등성·전송 상태만 검증한다.

## 1. 결론

기존 구현은 회사가 `company_talent_requests`로 Talent에게 질문·이력서 요청·일반 연락을 실제로 보낸 경우에만 Talent가 같은 관계를 통해 회사로 답하거나 후속 메시지를 보낼 수 있었다. `company_talent_relays.company_talent_request_id`가 필수였기 때문이다.

이번 구현은 다음 두 문제를 분리해서 해결한다.

1. 진행 설명의 분리
   - 회사가 먼저 보낸 `Request Intro`를 Talent가 수락한 경우에는 사실을 LLM에 제공하고, LLM이 현재 대화에 맞게 설명하거나 회사 확인을 제안한다.
   - Harper가 먼저 추천한 일반 `internal_recommendation`은 기존 7일·21일 계산, 고정 `progress.message`, 종료 처리를 그대로 유지한다.
2. 양방향 중계 범위의 일반화
   - 중계는 Request Intro 전용 기능이 아니다.
   - Harper를 통해 양측 관계가 실제로 성립한 모든 관계를 하나의 `recommendation_id` 연결로 다룬다.
   - 회사 질문에서 시작한 관계, 회사 Request Intro 수락 관계, Harper 추천이 회사에 실제로 전달된 관계가 같은 read/relay 계약을 사용한다.

회사 → Talent 방향에서는 기존 `contact_talent`를 유지하면서 action을 두 가지 의미로 나눈다.

- 회사가 먼저 공식 질문·이력서 요청·여전한 관심 여부 확인·새 안내를 시작하면 기존 `create_draft → 회사 팀원 확인 → schedule` 흐름을 쓴다.
- Talent가 Harper를 통해 보낸 메시지에 회사가 현재 대화에서 답하거나 자연스럽게 이어가는 경우에는 LLM이 `contact_talent(action="send")`를 선택할 수 있다. 이 경우 후보자용 문구를 LLM이 작성하고 추가 draft 확인 없이 즉시 발송 queue에 등록한다.

코드에는 질문 종류, 특정 단어, 말투, 경과 일수로 `create_draft`와 `send`를 고르는 분기가 없다. 회사 대화를 읽는 LLM이 의미로 판단한다.

## 2. 원하는 사용자 경험

### 2.1 회사 Request Intro 수락 뒤 Talent가 진행을 물음

예시 흐름은 다음과 같다.

1. 회사가 Talent에게 Request Intro를 보낸다.
2. Talent가 수락한다.
3. 일정 시간이 지나도 새 소식이 없다.
4. Talent가 Career Harper에게 “이 회사 어떻게 되고 있어?”라고 묻는다.
5. Career Harper는 다음 사실을 읽는다.
   - 회사 요청 시점
   - Talent 수락 시점
   - 연결 확정 시점
   - 최근 회사 → Talent 연락 시점
   - 최근 Talent → 회사 relay 시점과 실제 queue 상태
   - 이 관계로 회사에 메시지를 보낼 수 있는지
6. Career LLM이 현재 대화와 사실을 종합해 직접 답한다.
   - 아직 자연스럽게 기다려 볼 만한 상황이면 그렇게 설명할 수 있다.
   - 예상보다 길어졌고 확인이 유용하다고 보면 Harper가 대신 확인할지 제안할 수 있다.
   - 회사가 이미 예상 일정을 말했거나 relay가 아직 queue 처리 중이면 그 사실을 우선 반영한다.
7. Talent가 연락을 승인하면 LLM이 `relay_to_company`를 호출한다.

여기에는 “7일이면 이 문장”, “10일이면 확인 제안”, “21일이면 종료” 같은 Request Intro 전용 deterministic 분기가 없다. 시간은 LLM에게 제공되는 사실일 뿐이다.

### 2.2 Harper 추천 뒤 이미 회사와 연결된 Talent가 회사에 메시지를 보냄

일반 `internal_recommendation`도 다음 조건을 만족하면 같은 중계 기능을 쓸 수 있다.

1. Talent가 추천을 수락했다.
2. 단순 수락 상태에 머문 것이 아니라 Harper의 확인을 거쳐 회사에 실제로 공유됐다.
3. 회사가 볼 수 있는 연결 단계가 현재 상태 또는 과거 회사 단계 전환 기록으로 남아 있다.
4. Talent가 Harper에게 해당 회사로 질문·보충 설명·정정·후속 메시지를 전달해 달라고 요청한다.

Career Harper는 `read_company_connections`에서 이 관계를 찾고, Talent 승인 뒤 `relay_to_company`를 호출한다.

단순히 Talent가 추천을 수락했지만 아직 회사에 공유되지 않은 상태는 중계 가능한 상호 연결로 취급하지 않는다.

### 2.3 회사가 Talent 메시지에 답함

Talent의 relay가 회사 Slack 또는 `/org` Role 대화에 도착하면 assistant message metadata에 exact `candidateRelayRef`가 붙는다. 회사 팀원의 다음 발화를 처리하는 Company LLM은 이 private ref와 대화 내용을 함께 본다.

- 현재 발화가 그 Talent 메시지에 대한 답이나 자연스러운 대화 continuation이면 `contact_talent(action="send")`
- 회사가 별도의 공식 질문·이력서 요청·재관심 확인·새 outbound를 시작하면 `contact_talent(action="create_draft")`
- 의미가 불명확하면 바로 발송하지 않고 회사 팀원에게 확인

`send`가 선택되면 다음 일이 일어난다.

1. exact relay 관계와 Talent·Role을 읽는다.
2. Talent의 저장 언어와 bounded 회사 대화를 candidate-copy LLM에 준다.
3. LLM이 제목·본문·전달 맥락을 작성한다.
4. 서버가 현재 회사 message와 relay가 같은 company conversation 또는 Slack thread에 실제로 존재하는지 검증한다.
5. 후보자 발송 queue에 `deliveryMode=immediate`로 등록한다.
6. Company Harper는 queue 등록을 발송 완료나 열람 완료로 과장하지 않는다.

## 3. 진행 설명과 중계 권한은 서로 다른 계약이다

두 개념을 하나로 묶지 않는다.

| 항목 | 회사 Request Intro | Harper-first internal recommendation |
| --- | --- | --- |
| 진행 설명 | 사실 projection을 LLM이 해석 | 기존 7일·21일 `internalProgress` 유지 |
| 고정 progress 문장 | 없음 | 기존 문장 유지 |
| 자동 종료 | 새 silence 기준 없음 | 기존 21일 및 stage/Role 종료 처리 유지 |
| 회사 중계 | 수락 후 `connecting` 또는 `connected`에서 가능 | 회사에 실제 공유된 company-visible stage에서 가능 |
| 회사 질문이 먼저 있었어야 하는가 | 아니오 | 아니오 |

`buildInternalRecommendationProgress`는 `OpportunityType.IntroRequest`에서 즉시 `null`을 반환한다. 이 조건 외의 기존 함수 본문과 7일·21일 상수는 바꾸지 않았다.

## 4. 상호 연결 권한 모델

### 4.1 공통 anchor

모든 중계의 공통 anchor는 `talent_opportunity_recommendation.id`다.

이 값은 다음을 안정적으로 연결한다.

- Talent
- Role
- company workspace
- opportunity origin
- Talent 수락 사실
- 회사 pipeline 또는 Request Intro handoff
- 양방향 relay와 contact history

`company_intro_candidate_id` 같은 시나리오별 anchor를 relay에 추가하지 않았다. Request Intro는 상호 연결을 입증하는 한 종류의 사실이며, relay 자체의 identity는 recommendation 관계다.

### 4.2 중계가 허용되는 durable evidence

DB의 `create_company_talent_relay_v2`는 recommendation과 Talent가 일치하고 `feedback='like'`인 상태에서 다음 중 하나를 요구한다.

1. 회사 연락이 Talent에게 실제 전달됨
   - 같은 recommendation의 `company_talent_requests`
   - `company_request_candidate_delivery.status='sent'`
   - `sent_at` 존재
2. 회사 Request Intro를 Talent가 수락함
   - 같은 recommendation의 `company_intro_candidates`
   - status가 `connecting` 또는 `connected`
3. Harper-first 추천이 회사에 실제 공유됨
   - 해당 Talent·Role의 현재 company-visible tag가 다음 중 하나이거나, 같은 recommendation에 해당 단계로 이동한 `org_stage_change` 기록이 존재함
   - `내부:연결대기`
   - `내부:연결됨`
   - `내부:최종오퍼`
   - `내부단계:*`

다음은 상호 연결 evidence가 아니다.

- 추천 row가 존재한다는 사실만 있음
- Talent가 수락했지만 아직 회사에 공유되지 않음
- company-first search에서 회사가 후보자를 내부적으로 조회만 함
- `ready` 또는 `awaiting_talent` Request Intro
- LLM이 대화만 보고 관계가 있을 것이라고 추측함

### 4.3 관계가 닫힌 뒤의 소통

한번 성립한 관계를 Role 종료나 현재 pipeline 종료만으로 삭제하지 않는다. Talent가 결과나 종료 이유를 묻거나, 이미 열린 대화에서 양측이 마지막 내용을 전달해야 할 수 있기 때문이다.

이를 위해 열린 관계는 현재 company-visible tag로 확인하고, 종료 이후에는 recommendation에 귀속된 과거 `org_stage_change`의 company-visible stage를 durable evidence로 사용한다. 단순 수락이나 Talent 개인 저장 상태는 이 증거를 만들지 않는다.

relay나 direct reply는 pipeline stage를 다시 열거나 변경하지 않는다. stage mutation은 기존 전용 tool과 동의 계약을 계속 따른다.

### 4.4 test-only 및 계정 경계

test-only Role은 `information.testOnly=true`와 `testTalentIds` allowlist를 DB와 server read 양쪽에서 검증한다. 일반 Talent에게 test-only 관계가 중계 대상으로 노출되거나 queue가 생성되면 안 된다.

worker는 비활성 Talent 계정의 queue를 기존 정책대로 취소한다.

## 5. 데이터 모델

구현 migration:

`supabase/migrations/20260922190000_mutual_company_talent_relays.sql`

### 5.1 `company_talent_relays`

변경 사항:

```sql
alter table public.company_talent_relays
  add column recommendation_id uuid not null;

alter table public.company_talent_relays
  alter column company_talent_request_id drop not null;
```

의미:

- `recommendation_id`: 모든 relay의 필수 관계 anchor
- `company_talent_request_id`: 회사 질문에서 시작한 경우에만 남는 optional provenance
- `source_talent_message_id`: 이번 전송을 승인한 exact Talent message
- `relay_content`: Talent가 회사에 전달하도록 허용한 내용
- `document_id`: 선택적 공유 문서

기존 row는 request의 recommendation으로 backfill한다. 이후 기존 v1·resume·legacy trigger가 request-only insert를 하더라도 `fill_company_talent_relay_recommendation_v1` trigger가 recommendation을 채운다.

### 5.2 멱등성

한 recommendation과 source Talent message 조합에 대해 unique index와 transaction advisory lock을 두고 기존 relay를 먼저 찾는다. 같은 user message retry에서는 새 relay와 queue를 만들지 않고 기존 relay와 실제 delivery 상태를 반환한다.

기존 request-specific unique와 relay delivery outbox unique도 유지한다.

### 5.3 회사 direct reply provenance

`company_talent_requests`에는 다음 optional FK를 추가한다.

```sql
in_reply_to_company_talent_relay_id uuid
  references public.company_talent_relays(id) on delete set null
```

이 값은 단순한 transient LLM 판단을 저장하려는 것이 아니다. 다음 concrete reader가 필요로 하는 durable causality다. 같은 source company message와 relay 조합에는 unique index와 advisory lock을 함께 사용해 concurrent retry도 한 번의 전송 등록으로 수렴시킨다.

- direct send authorization
- 같은 회사 message retry 멱등성
- worker의 closed-stage 전송 처리
- 양방향 대화 timeline과 운영 감사

회사 공식 first outbound row에서는 null이고, exact inbound Talent relay에 직접 답한 row에서만 값이 있다.

### 5.4 공식 draft와 direct reply의 동시성

기존 open-contact partial unique는 `in_reply_to_company_talent_relay_id is null`인 공식 outbound에만 적용한다. 따라서 무관한 draft가 남아 있다는 이유로 이미 열린 inbound 답장이 막히지 않는다.

## 6. DB 함수

### 6.1 `create_company_talent_relay_v2`

입력:

```text
p_recommendation_id
p_talent_id
p_source_message_id
p_relay_content
p_document_id optional
p_request_id optional
```

책임:

1. recommendation과 Talent 수락 사실 검증
2. Role·workspace resolve
3. test-only 경계 검증
4. 세 종류의 durable mutual-connection evidence 검증
5. exact Talent-authored source message 검증
6. optional document ownership 검증
7. 같은 recommendation/source message retry 멱등성
8. relay row 저장
9. `company_contact_company_delivery` queue 생성
10. 실제 queue 상태 반환

기존 `create_company_talent_relay_v1`은 request에서 recommendation을 resolve한 뒤 v2를 호출하는 compatibility wrapper다. 기존 질문 답변·resume relay 경로는 유지된다.

### 6.2 `send_company_talent_relay_reply_v1`

입력:

```text
p_relay_id
p_workspace_id
p_source_company_message_id
p_subject
p_body
p_request_context
```

서버가 검증하는 것:

- relay의 recommendation이 현재 workspace Role에 속함
- source company message가 현재 workspace의 실제 user message임
- 같은 company conversation 또는 Slack thread에 해당 `candidateRelayRef.relayId`를 가진 이전 Harper message가 있음
- source message가 relay message보다 뒤에 있음
- test-only 경계가 맞음
- subject/body/context가 구조적으로 존재하고 길이 제한을 만족함
- 같은 source company message와 relay retry는 기존 request와 실제 outbox 상태를 반환함

서버가 판단하지 않는 것:

- 회사 문장이 답변처럼 보이는지
- 정중한지
- 질문인지 안내인지
- draft 확인이 더 나은지
- 특정 단어가 포함됐는지

이 정성적 판단은 Company LLM이 한다.

성공 시 candidate-facing copy를 저장하고 `company_request_candidate_delivery`를 `deliveryMode=immediate`로 queue한다. 함수 반환은 `queued`이며 발송·수신·열람 완료를 뜻하지 않는다.

## 7. Career 구현

### 7.1 Request Intro 사실 projection

`TalentOpportunityHistoryItem.companyRequestIntroProgress`가 다음 최소 사실을 제공한다.

```ts
type TalentCompanyRequestIntroProgressFacts = {
  origin: "company_request_intro";
  status: string;
  requestedAt: string | null;
  talentAcceptedAt: string | null;
  connectedAt: string | null;
  latestCompanyContactAt: string | null;
  latestCandidateRelayAt: string | null;
  latestCandidateRelayStatus: "queued" | "sent" | "failed" | "cancelled" | null;
  canRelayToCompany: boolean;
  connectionId: string;
};
```

`message`, `recommendedAction`, `elapsedBucket`, `shouldWait`, `shouldOfferContact` 같은 qualitative 필드는 만들지 않는다.

### 7.2 `read_recommended_opportunities`

- 일반 internal recommendation: 기존 `progress.message` 반환
- Request Intro: `companyRequestIntroProgress` 사실만 반환
- Request Intro silence를 자동으로 closed로 바꾸지 않음
- `shouldCloseRecommendedOpportunityFromProgress`는 기존 `internalProgress`만 봄

Career prompt는 origin이 Request Intro이면 7일·21일 문구를 쓰지 말고 사실과 현재 대화로 판단하도록 설명한다.

### 7.3 `read_company_connections`

기존 request-only `list_company_requests` 대신 하나의 일반 read tool을 노출한다.

이 tool은 다음을 recommendation 단위로 합친다.

- accepted recommendation과 Role/company
- Request Intro connecting/connected
- company-visible pipeline tag
- recommendation에 귀속된 과거 company-visible `org_stage_change`
- 실제로 sent된 company contact
- 최근 Talent relay와 실제 queue 상태

반환되는 `connectionId`는 private opaque ref다.

```text
recommendation:<uuid>
```

이 prefix는 qualitative 분기가 아니라 identifier contract다.

### 7.4 `relay_to_company`

입력:

```ts
{
  connectionId: string;
  relayContent: string;
}
```

LLM은 Talent가 명확하게 전달을 승인한 뒤에만 호출한다. `relayContent`에는 현재 Talent가 허용한 내용만 담고, 다른 Memory·Search Brief·추천 이력은 자동으로 섞지 않는다.

tool result는 DB가 반환한 `queued | sent | failed | cancelled`를 그대로 사용한다. `queued`를 “회사에 전달했다”로 표현하지 않는다.

## 8. Talent → 회사 worker와 전달 endpoint

### 8.1 worker projection

`harper_worker/email_reply/contact_queue.py`의 `company_contact_company_delivery` consumer는 이제 request를 먼저 찾지 않는다.

relay id에서 다음을 resolve한다.

- recommendation
- Talent
- Role
- workspace
- optional original request
- optional company source message
- optional shared document

request가 없는 generic relay도 같은 copy writer와 outbox를 사용한다.

### 8.2 company-facing copy

기존 `build_company_contact_relay_copy`를 그대로 재사용한다. 이 writer는 Candidate message가 다음 중 무엇이든 될 수 있다고 이미 계약되어 있다.

- 첫 답변
- 후속 설명
- 정정
- 질문
- Talent가 먼저 전달해 달라고 한 정보

request가 없으면 earlier company message와 contact context는 비어 있을 수 있다. writer는 request/answer narrative를 강제하지 않는다.

### 8.3 destination

- original company request Slack thread가 있으면 같은 thread
- 없으면 Role workspace Slack destination
- Slack과 별개로 `/org` Role conversation에 한 번 mirror

generic relay는 `{ relayId }`, legacy request relay는 `{ requestId, relayId }`로 delivery endpoint를 호출할 수 있다.

### 8.4 company conversation metadata

mirror message에는 다음 private ref를 저장한다.

```ts
candidateRelayRef: {
  relayId: string;
  recommendationId: string;
  requestId?: string | null;
  roleId: string;
  talentId: string;
}
```

Company LLM context에는 이 값이 `candidate_contact_ref`로 직렬화된다. 사용자에게 ID를 보여 주기 위한 값이 아니라 exact reply authorization과 tool targeting을 위한 값이다.

## 9. Company `contact_talent` 구현

### 9.1 유지되는 action

- `create_draft`: 공식 first outbound 초안 생성
- `revise_draft`: 현재 초안 수정
- `schedule`: 회사 팀원이 승인한 exact revision 발송 등록
- `immediate`: 이미 승인·queue된 발송 시점만 앞당김
- `cancel`: 취소 가능한 draft/queue 취소

### 9.2 새 `send` action

입력:

```ts
{
  action: "send";
  relayId: string;
  messageContent: string;
}
```

executor 순서:

1. relay id로 workspace-scoped reply target 조회
2. Talent email과 언어 확인
3. 기존 candidate-copy LLM을 `direct_reply` 작성 모드로 호출
4. exact company source message와 relay를 DB RPC에 전달
5. immediate queue 생성
6. `queued`, scheduledAt, idempotent 여부 반환

`send`는 `createCompanyTalentContactDraft`나 `scheduleCompanyTalentContact`를 호출하지 않는다. 따라서 불필요한 두 번째 draft 승인 turn이 없다.

`send`의 회사-facing 완료 응답은 고정 fallback 문구로 덮지 않는다. Company LLM이 `queued`, `scheduledAt`, `idempotent` 같은 구조적 결과를 보고 현재 대화에 맞게 설명한다.

### 9.3 LLM 선택 계약

Tool description은 다음 경험 차이를 설명하지만 코드 분기로 번역하지 않는다.

- 새 공식 요청·질문·이력서 요청·재관심 확인·독립 outbound → `create_draft`
- 현재 conversation의 exact Talent relay에 대한 답이나 자연스러운 continuation → `send`
- 모호함 → 팀원에게 확인

단어 목록, 정규식, intent classifier, confidence score, scenario enum을 추가하지 않았다.

### 9.4 candidate-facing copy

기존 candidate-copy LLM에 다음만 제공한다.

- 현재 회사 지시
- bounded recent company conversation
- 회사명·Role명·Talent 이름
- Talent 저장 언어
- 회사가 전달하려는 substantive content
- 추가 회사 검토를 기다리는 draft가 아니라 즉시 queue할 direct reply라는 작성 목적

LLM output은 기존 최소 구조인 subject/body/requestContext/reason을 사용한다. direct reply 전용 semantic JSON을 추가하지 않는다.

기존 공식 outbound의 hard-safety 계약은 건드리지 않는다. 다만 `send`는 이미 검증된 inbound relay에 대한 의미적 답변이므로 공식 질문용 단어 목록·정규식 validator를 재사용하지 않는다. direct reply에서는 JSON shape, 필수 문자열, 길이 같은 machine contract만 검증하고, 답변의 의미와 표현은 LLM prompt가 책임진다.

## 10. 전송 상태와 진실성

| 상태 | 의미 | 사용자에게 말할 수 있는 것 |
| --- | --- | --- |
| `queued` | outbox 등록, 아직 처리 중 | Harper가 전달을 접수했고 보내는 중 |
| `sent` | 외부 transport 완료 | 회사 또는 Talent 쪽 전달 transport 완료 |
| `failed` | 처리 실패 | 아직 전달되지 않음 |
| `cancelled` | 취소됨 | 전달되지 않음 |

어떤 상태도 상대가 읽었거나 답할 것임을 보장하지 않는다.

기존 `record_company_request_response`도 새 relay queue를 실제 전달 완료로 과장하지 않도록 `queued_for_company`를 반환하게 바꿨다.

## 11. 파일별 구현

### `harper_beta`

| 파일 | 변경 |
| --- | --- |
| `supabase/migrations/20260922190000_mutual_company_talent_relays.sql` | recommendation anchor, optional request provenance, direct reply FK, v2 relay RPC, direct reply RPC |
| `src/types/database.types.ts` | 새 column·FK·RPC type |
| `src/lib/companyTalentRequests/server.ts` | general connection read, recommendation-based relay, relay reply target/send |
| `src/lib/talentOpportunity.ts` | Request Intro factual progress projection, IntroRequest의 기존 7·21 progress 제외 |
| `src/lib/talentOnboarding/tools.ts` | `read_company_connections`, generalized `relay_to_company`, truthful queue status |
| `src/lib/career/llmTools.ts` | 새 connection reader 노출 |
| `src/lib/career/prompts/toolPolicyPrompt.ts` | origin별 progress 판단과 relay 사용 계약 |
| `src/lib/org/agent/tools.ts` | `contact_talent(action=send)` schema와 의미 계약 |
| `src/lib/org/agent/toolExecution.ts` | direct reply copy 생성 및 immediate queue 실행 |
| `src/lib/companyTalentRequests/copy.ts` | candidate-copy LLM에 review draft와 direct reply 작성 목적 전달 |
| `src/lib/companyTalentRequests/copyPrompt.ts` | direct reply에서 추가 회사 검토를 가정하지 않는 prompt 계약 |
| `src/lib/org/agent/candidateContactAction.ts` | `send` lifecycle action |
| `src/lib/org/agent/types.ts` | recommendation 기반 `candidateRelayRef` |
| `src/lib/org/agent/context.ts` | exact relay ref private context 직렬화 |
| `src/app/api/internal/company-talent-requests/deliver/route.ts` | relay-id-first delivery와 generic relationship resolve |
| `src/components/career/types.ts` | Request Intro factual progress client type |

### `harper_worker`

| 파일 | 변경 |
| --- | --- |
| `email_reply/contact_queue.py` | generic relay projection, request 없는 relay delivery, direct reply의 closed-stage continuation 허용 |

## 12. 테스트

구현에 추가·수정한 핵심 contract:

- relay가 recommendation anchor를 필수로 가짐
- request provenance가 optional임
- 기존 request relay v1이 계속 동작함
- 세 종류의 mutual-connection evidence가 허용됨
- 현재 pipeline이 종료된 뒤에도 과거 company-visible stage 기록으로 이미 성립한 관계를 확인함
- 단순 accepted recommendation은 허용되지 않음
- Request Intro는 기존 7·21 progress를 사용하지 않음
- 일반 internal recommendation 함수와 기존 테스트 기대값은 유지됨
- Career tool은 `connectionId`를 사용함
- queue 상태를 delivery 완료로 과장하지 않음
- Company tool이 `send`를 LLM 판단으로 선택할 수 있음
- direct reply DB RPC가 같은 conversation/thread의 exact relay를 검증함
- route metadata에 relay/recommendation/Role/Talent ref가 남음
- worker가 request 없는 generic relay를 처리함
- direct reply는 기존 target-active stage check를 우회하지만 exact relay provenance를 요구함

실행한 검증:

- 관련 TypeScript contract/tool/copy/prompt 테스트 56개 통과
- `pnpm exec tsc --noEmit`에서 이번 변경 관련 type error 없음
  - 기존 `growthTalentGtmReport.test.ts`의 unrelated type error 5건 때문에 전체 명령 exit는 실패
- worker `python3 -m py_compile email_reply/contact_queue.py` 통과
- worker `python3 -m unittest -q tests.test_company_talent_request` 22개 통과

이 환경에서는 로컬 Supabase/Postgres가 실행 중이지 않아 migration을 실제 DB에 apply하는 통합 검증은 하지 않았다. 배포 전 staging 또는 동일 schema의 검증 DB에서 migration transaction과 기존 row backfill을 확인해야 한다.

`talentOpportunity.test.ts` 단독 실행은 기존 test harness가 import 시 `server-only` 모듈을 요구해 이 환경에서 시작되지 않았다. Request Intro progress 분리는 별도 source contract test와 TypeScript compile로 확인했다.

## 13. 배포 순서

이 문서 작성 시점에는 배포하지 않았다.

배포 시 안전한 순서는 다음과 같다.

1. DB migration 적용
2. `harper_worker` rolling restart
   - generic relay schema와 route payload를 worker가 이해해야 함
3. `harper_beta` 배포
   - Career tool과 Company `send` 노출
4. 실환경 smoke
   - legacy company question response
   - Request Intro accepted follow-up
   - Harper-first company-visible connection follow-up
   - Company direct reply
   - retry/idempotency
5. 실제 배포된 behavior 기준으로 Notion 문서 동기화

DB보다 app/tool이 먼저 배포되면 새 RPC와 column이 없어 실패한다. worker보다 Career relay가 먼저 열리면 request 없는 queue를 이전 worker가 취소할 수 있으므로 순서를 지켜야 한다.

## 14. 운영 관측

최소 운영 지표:

- origin별 relay queued/sent/failed/cancelled
- recommendation relationship별 relay latency
- company direct reply queued/sent/failed
- direct reply idempotent retry 수
- authorization rejection reason
- relay만으로 pipeline stage가 변한 건수: 항상 0이어야 함

일반 metric label과 로그에는 원문, 이력서 내용, Memory, private candidate data를 넣지 않는다.

## 15. 완료 기준

- 회사 Request Intro 수락 뒤 Career Harper가 fixed day branch 없이 실제 사실로 답할 수 있다.
- 필요하다고 LLM이 판단하면 Talent에게 회사 확인을 제안할 수 있다.
- Talent가 승인하면 이전 회사 질문이 없어도 같은 mutual connection으로 회사에 메시지를 queue할 수 있다.
- Harper-first 추천도 회사에 실제 공유된 뒤에는 같은 중계 기능을 쓸 수 있다.
- 일반 internal recommendation의 기존 7일·21일 progress와 closure는 유지된다.
- 기존 company request 답변·resume relay는 회귀하지 않는다.
- 회사가 inbound Talent relay에 답할 때 LLM이 `contact_talent(send)`를 선택하면 추가 draft 승인 없이 immediate queue가 생성된다.
- 회사가 새 공식 outbound를 시작하면 기존 draft 확인 흐름이 유지된다.
- qualitative 판단을 위한 룰베이스·키워드 매칭·고정 output 문장·semantic state machine이 없다.
- 서버는 exact relationship, source message, conversation scope, 권한, test-only, 멱등성, queue 상태만 책임진다.

## 16. 명시적으로 하지 않는 것

- 일반 internal recommendation의 7일·21일 기준을 바꾸지 않는다.
- Request Intro에 새 고정 안내 문장을 만들지 않는다.
- “10일 지남” 같은 경과 시간으로 연락 제안을 강제하지 않는다.
- 단순 추천 수락을 회사와의 상호 연결로 간주하지 않는다.
- candidate message 내용을 분류하는 별도 intent classifier를 만들지 않는다.
- `contact_talent(send)` 선택을 특정 단어·정규식·score로 강제하지 않는다.
- relay용 conversation session/state machine/table을 만들지 않는다.
- company intro 전용 relay table이나 `company_intro_candidate_id` anchor를 만들지 않는다.
- relay가 pipeline stage나 Role lifecycle을 변경하지 않는다.
- queue 등록을 상대 수신·열람·답변 완료로 표현하지 않는다.
