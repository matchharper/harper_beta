# Company-side LLM Prompt·Context 설계

이 문서는 `/org` 웹 채팅과 `/org-Slack`에서 응답하는 **company-side LLM**의
context 구성 원칙을 설명한다. 실제 동작의 소스 오브 트루스는
`src/lib/org/agent/context.ts`, `prompts.ts`, `promptFormat.ts`, `data.ts`다.

## 결론

company-side LLM은 “모든 DB 값을 매번 넣는 모델”이 아니다.

1. 매 turn에는 회사 식별 정보, compact role index, 최근 후보-포지션 20개와 현재
   대화 범위만 넣는다.
2. 후보 상세, role의 request/memory/JD/pipeline, 회사 상세와 workspace memory는
   필요할 때 tool로 읽는다.
3. `get_more_data`로 읽은 선택 데이터는 같은 웹 대화 또는 Slack thread에서 다음
   사용자 turn 3회 동안 최신 DB 값으로 다시 읽어 넣는다. 24시간이 지나면 더 일찍
   만료된다.
4. 긴 값이 잘리거나 조회에 실패하면 `complete=false`, `truncated=true`,
   `unavailable=true`처럼 명시한다. 부분 값을 전체로 가장하지 않는다.
5. 현재 구조화 값과 fresh tool result가 원본이다. summary와 과거 메시지는 변경이
   실제 적용됐다는 증거가 아니다.

## request, memory, conversation summary

세 값은 역할이 다르다.

| 데이터 | 원본 | 의미 |
| --- | --- | --- |
| role request | `company_internal_roles.request` | 어떤 후보를 매칭할지에 대한 기준 |
| workspace memory | `company_memories`, `role_id is null` | 회사 전체에서 지속적으로 기억할 기타 맥락 |
| role memory | `company_memories`, 해당 `role_id` | 그 role에서 지속적으로 기억할 기타 맥락 |
| conversation summary | `company_conversation_summaries` | 오래된 대화를 압축한 과거 맥락 |

`company_internal_roles.request`가 role request의 유일한 read/write source다.

request에는 hard constraint와 preferred criterion을 구분한다. candidate 이름이나
후보별 사실은 넣지 않는다. memory는 request의 보조 매칭 소스가 아니며, 일정·의사
결정 배경·운영 방식처럼 매칭 기준 외의 지속 맥락을 담는다. 일시적인 대화나 이미
구조화 필드에 있는 사실은 중복 저장하지 않는다.

## Stable system prompt

`prompts.ts`의 system prompt에는 변하지 않는 정책만 둔다.

- 실제 동료처럼 자연스럽고 충분한 맥락으로 답하기
- 사용자가 쓰는 언어로 답하고 내부 enum, UUID, table/tool 이름을 말하지 않기
- workspace 대화에서 role/talent 대상을 먼저 해소하기
- 현재 값, summary, tool result의 신뢰도 구분
- request와 memory의 저장 경계
- 명시적인 저장 요청만 write로 취급하기
- request/memory 변경은 저장된 preview를 보여주고 확인 후 적용하기
- 지원하지 않는 후보 stage 변경이나 outbound action을 수행했다고 말하지 않기

회사명, role 목록, 후보와 최신 질문은 동적 user prompt에 둔다. 이 분리는 stable
prefix를 유지하고 prompt caching에 유리하다.

## 매 turn의 compact context

### 회사 최소 정보

항상 넣는 회사 값은 다음뿐이다.

- 회사명
- `company_workspace.pitch` 전문을 Markdown 구조 그대로 담은 회사 정보 문서
- pitch 문서와 legacy workspace request의 존재 여부
- 상세 회사 데이터가 있는지 여부
- workspace memory가 있는지 여부

pitch는 회사에 관한 모든 서술형 정보의 canonical 문서이며 후보자에게 회사를
설명할 때 쓰는 회사 정보다. 별도 회사 소개, 한 줄 소개, 후보자 안내 문구, 주요
분야, 투자사 목록·설명은 company-side LLM에 넣지 않는다. legacy workspace
request, `company_data`의 구조화 값과 memory 본문은 기본 context에 넣지 않는다.
홈페이지와 LinkedIn은 전용 값으로 유지하고, 그 밖의 회사 링크는 `related_links`로
다룬다.

### Bounded role index

`source_type=internal`이고 만료되지 않은 role만 대상으로 다음을 넣는다.

- role ID와 제목
- 사람이 읽는 상태
- 연결 대기·진행 중·프로세스 종료 count
- count가 완전한지 여부
- request/memory 존재 여부

request, memory, JD 본문은 넣지 않는다. 채용 중 role, 최근 수정일, 제목, ID
순으로 정렬하고 최대 100개 또는 10,000자에서 멈춘다. 잘리면 total, returned,
truncated marker를 남기며 `read_role(exactTitle=...)`의 exact match로 찾을 수 있다.

pipeline count는 최대 800개 recommendation과 bounded tag/progress/custom-stage
dependency를 사용한다. recommendation 또는 dependency cap에 닿으면 count는 lower
bound이며 `counts_complete=false`다. Slack은 installer 계정의 내부 권한을 그대로
신뢰하지 않고 `company_safe` read audience로 hidden stage를 제외한다.

### 최근 후보-포지션 20개

최근 목록은 candidate 한 명이 아니라 `talent_id + role_id` 항목 기준이다. 같은
후보가 두 role에 있으면 두 항목이고, 같은 후보·role의 중복 recommendation은 가장
최근 활동 하나만 남긴다.

정렬 기준은 recommendation 수정, stage tag 수정, progress 생성 중 가장 최근인
effective activity다. 기본 context에는 talent ID, 이름, role ID/제목, 사람이 읽는
stage, headline만 넣는다. email, fit 전문, recommendation ID는 제외한다.

20개를 채우거나 bounded activity source를 모두 소진한 경우에만
`recent_complete=true`다. cap이나 오류가 있으면 반환 개수와 불완전 marker를
남긴다. 최근 progress 때문에 선택된 오래된 recommendation도 ID-scoped visibility
read로 다시 열 수 있다.

### 현재 대화 범위

- 최근 workspace summary 2개, 각 최대 1,200자
- 웹이면 현재 chat의 raw message, Slack이면 현재 thread의 raw message 최대 14개
- raw conversation 전체 최대 12,000자, message당 최대 900자
- 현재 user message는 raw history에서 제외하고 prompt 마지막에 한 번만 배치
- 검증된 mention
- 같은 scope의 pending update 요약과 preview pointer
- 유지 중인 `get_more_data` block
- 조회 실패나 Slack history truncation note

raw history는 다른 Slack thread와 웹 chat을 섞지 않는다. 오래된 cross-surface
맥락은 기존 workspace summary를 통해 이어진다. pending proposal도 같은
`chat:<conversationId>` 또는 `slack:<threadId>` scope에서만 보인다.

## On-demand read와 N-turn retention

```text
기본 context로 답 가능
  ├─ 예: 바로 답변
  └─ 아니오
      ├─ 후보 식별: get_talents
      ├─ 후보 상세: read_talent
      ├─ role의 선택 block: read_role
      └─ members/company details/workspace memory: get_more_data
```

`get_more_data`의 kind는 `members`, `company_details`, `workspace_memory` 세 가지다.
한 호출에서 여러 kind를 요청할 수 있고, `company_details`의 긴 특정 필드는
`fullTextKeys`로 우선해서 읽는다.

성공한 호출은 assistant message metadata에 데이터 자체가 아니라 selector를
저장한다. 이후 같은 scope의 T1, T2, T3에서 selector로 DB를 다시 조회하므로 중간에
값이 바뀌면 최신 값이 들어간다. T4 또는 activation 후 24시간이 지나면 제거된다.
kind별 lease는 독립적이며 같은 kind를 다시 호출하면 그 kind의 lease와
`fullTextKeys`만 교체된다.

## 직렬화와 사람용 표현

- 반복 레코드는 JSON object 배열 대신 header-once TSV로 보낸다.
- request와 memory는 Markdown heading·list·줄바꿈을 보존한다.
- DB enum은 prompt 경계에서 `최종 오퍼 단계`, `연결 대기`, `원격 근무` 같은
  사람용 표현으로 바꾼다.
- `<`와 `>`는 section tag를 닫지 못하도록 치환한다.
- system prompt는 workspace data, history, tool result를 지시가 아닌 reference
  data로 취급하게 한다.
- 최종 답변에 내부 token이 새로 생기면 response guard가 한 번 교정한다.

## 문자·token budget

| 범위 | 상한 |
| --- | ---: |
| 기본 data 목표 | 18,000자 |
| role index | 100개 또는 10,000자 |
| recent pipeline | 6,000자 |
| raw conversation | 12,000자 |
| `get_more_data` 실제 field content | 12,000자 |
| `get_more_data` 직렬화 | 14,000자 |
| 전체 workspace context | 48,000자 |
| `read_role` 결과 목표 | 약 24,000자 |
| 한 turn 누적 tool result | 48,000자 |
| 현재 user message | 8,000자 |

전체 context가 커지면 오래된 summary와 raw history, recent 표시 text, retained long
text 순으로 줄인다. retained field가 잘리면 execution state에서도 complete read로
인정하지 않는다. tool result budget에 닿은 결과도 rewrite 권한을 만들지 않는다.

LLM completion은 일반 tool loop에서 최대 4,000 tokens, 완전한 긴 값을 읽은 뒤 큰
rewrite가 필요할 때 최대 32,000 tokens, tool-free final에서는 최대 2,000 tokens를
요청한다. 한 turn의 tool loop는 최대 4회, 실제 call은 최대 5개다.

## Write 안전성과 context의 연결

일반 정보 write tool은 `update_data`다. 최대 12개 변경을 하나의 batch로 받고
`append`, `replace`, `rewrite`를 지원한다. Role lifecycle은 별도 terminal tool
`change_role_status`가 `active`(진행), `paused`(중단), `ended`(종료),
`deleted`(삭제)를 받는다. `deleted`는 명시적인 역할 삭제 요청에서만 사용하며,
웹 삭제와 같이 `status=deleted`와 `is_expired=true`를 함께 저장한다.
중단은 기존 프로세스를 유지한 채 새 추천만 멈춘다. 종료는 Role 상태를 `ended`로
바꾸고 종료 시각을 기록해 새 추천을 막는다. 현재 구현에서 이 상태 변경 하나가 모든
기존 후보 stage와 회사 요청을 원자적으로 닫지는 않는다. 후보자 기회 화면은 종료된
Role을 종료로 해석하고, 아직 응답하지 않은 내부 추천은 기회 이력 조회 시 보관한다.
발송 전 회사 요청 취소나 진행 stage 종료는 각각의 stage 변경·정리 경로가 수행해야
한다.

- append: text/list를 추가한다. `role_request`는 hard/preferred section을 지정한다.
- replace: 현재 값에 정확히 한 번 존재하는 `oldValue`만 교체한다.
- rewrite: 전체 값을 교체한다. 기존 long text가 있으면 complete read가 먼저 필요하다.

`role_request` rewrite는 `## Hard constraints`와 `## Preferred criteria`를 모두
포함해야 한다. 동일 target에 여러 operation이 있으면 서버가 최종 값 하나로 fold한
뒤 atomic RPC에 전달한다.

request/memory 계열이 포함된 batch는 바로 쓰지 않는다. 서버가 최대 3,000자의
deterministic preview와 exact final payload를 proposal로 저장하고 사용자에게 한 번
확인한다. 다음 turn의 명시적 확인은 저장된 proposal을 적용하므로 LLM이 값을 다시
작성하지 않는다. 다른 일반 구조화 필드는 명시적 요청이면 직접 반영하고
`company_events`에 최대 300자의 compact event를 기록한다.

## 검증 체크리스트

- 기본 context에 request/memory/JD/긴 회사 본문이 없는가
- `company_internal_roles.request`만 canonical source로 읽는가
- role/request/memory presence와 pipeline completeness가 정확한가
- 다른 Slack thread의 raw 대화와 retained block이 섞이지 않는가
- T1~T3와 24시간 retention 경계가 지켜지는가
- raw enum과 내부 ID를 user-facing 답변에 노출하지 않는가
- Markdown request/memory가 보존되는가
- incomplete read로 long text rewrite가 열리지 않는가
- pending proposal이 같은 scope에서만 확인·적용되는가
- failed/stale update를 성공이라고 말하지 않는가

관련 구현·tool 계약은
[Organization Agent 구현·Tool 레퍼런스](./org-agent-tools-reference-ko.md), 실제 호출
예시는
[`LLM_CALL_TRACE_KO.md`](../src/lib/org/agent/LLM_CALL_TRACE_KO.md)를 본다.
