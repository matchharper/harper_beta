# Organization Agent Prompt·Context·Tool 설계

이 문서는 Harper Organization Agent의 prompt와 LLM input을 왜 현재 형태로
구성했는지 설명한다. 목적은 “가장 짧은 prompt”가 아니라, 답변 품질과 write
안전성을 유지하면서 매 turn 반복 비용을 줄이는 것이다.

## 결론

현재 설계 원칙은 다음과 같다.

1. 항상 필요한 작고 안정적인 정보만 prompt에 넣는다.
2. 후보 프로필, role pipeline, progress처럼 크고 드문 정보는 tool로 늦게 읽는다.
3. 동종 레코드는 JSON object 배열 대신 `column header 1회 + TSV rows`로 보낸다.
4. 식별·추론에 쓰지 않는 ID와 timestamp 정밀도는 제거한다.
5. tool argument는 JSON schema로 엄격하게 제한하되, tool result는 다음 판단에
   필요한 필드만 compact text로 변환한다.
6. system prompt에는 변하지 않는 행동 정책만 두고, DB data와 user query는 동적
   user prompt에 둔다.
7. 긴 reference data 뒤에 최신 user query를 배치한다.
8. 오래된 대화는 summary로 바꾸고, 최근 대화는 문자 budget 안에서 최신 turn을
   우선한다.
9. token 절감 때문에 write 정확성을 잃지 않는다. 잘린 role request는 전체 값으로
   간주할 수 없으므로 `read_role` 전에는 replacement update를 실행하지 않는다.
10. 감으로 최적화하지 않고 실제 운영 model의 token count와 대표 task eval을 함께
    본다.

## 조사에서 확인한 내용

OpenAI의 최신 model guidance는 반복 지시와 예시를 줄인 lean prompt, 관련 tool만
노출하는 구성, 명확한 성공 기준을 권한다. 또한 큰 tool result를 서버에서
filter·rank·dedupe·aggregate해 작은 구조로 돌려주는 방식이 적합하다고 설명한다.
OpenAI가 공개한 내부 coding-agent 사례에서는 leaner system prompt가 token과
비용을 크게 줄이면서 평가 점수도 개선됐지만, 이 수치는 특정 workload의
directional result이므로 Harper 자체 eval이 필요하다.

- [OpenAI Model guidance](https://developers.openai.com/api/docs/guides/latest-model)

Anthropic은 prompt engineering 전에 성공 기준과 empirical eval을 먼저 정의하라고
권장한다. 긴 data-rich input은 앞에 놓고 query를 뒤에 두며, 일관된 tag로 문서
경계를 표시하는 것이 유리하다고 설명한다. Tool 정의에서는 무엇을 하는지뿐 아니라
언제 쓰는지, 어떤 parameter와 return을 갖는지 분명히 적는 것이 중요하다. 동시에
tool schema와 tool result도 모두 input token으로 과금되므로, 설명을 무작정
장황하게 만드는 대신 “호출 판단에 필요한 정보가 빠지지 않은 최소 설명”을
Harper의 절충점으로 삼았다.

- [Anthropic Prompt engineering overview](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview)
- [Anthropic Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- [Anthropic Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [Anthropic Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)

구조화 data 연구에서는 “항상 JSON보다 특정 포맷이 우월하다”는 결론이 나오지
않는다. 9,649개 실험을 수행한 연구는 format 평균 효과보다 model별 민감도가
중요하다고 보고했다. 반면 반복 key가 많은 homogeneous JSON array는 header-once
표현으로 줄일 여지가 크고, JTON 연구에서는 이런 방식이 compact JSON보다 평균
28.5% 적은 token을 사용했다. 따라서 Harper는 생소한 custom grammar를 도입하지
않고 모델이 익숙한 TSV를 사용하며, 비교용 tokenizer endpoint로 다시 잰다.

- [Structured Context Engineering for File-Native Agentic Systems](https://arxiv.org/abs/2602.05447)
- [JTON: A Token-Efficient JSON Superset](https://arxiv.org/abs/2604.05865)

Tool output 처리 연구에서는 같은 data라도 표현·processing 방식에 따라 tool QA
성능 차이가 크게 날 수 있고, 복잡한 raw JSON을 그대로 이해시키는 것이 여전히
어렵다고 보고한다. 또 최종 답변까지 JSON으로 강제하면 reasoning 성능이 낮아질 수
있다는 연구가 있으므로, Harper는 tool call argument만 schema로 제한하고 최종
user-facing 답변은 자연어로 유지한다.

- [How Good Are LLMs at Processing Tool Outputs?](https://aclanthology.org/2026.eacl-long.134/)
- [Let Me Speak Freely? The Impact of Format Restrictions on Performance of Large Language Models](https://aclanthology.org/2024.emnlp-industry.91/)

## 세 층으로 나눈 input

### 1. Stable system prompt

`src/lib/org/agent/prompts.ts`에 다음 정책만 둔다.

- workspace 공용 Agent이며 현재 role이 고정되지 않았다는 점
- 답변 언어·길이·사실성
- role/talent scope 해소 방법
- 최소 read 원칙
- update의 replacement·scope·성공 확인 규칙
- 후보 반응을 채용 기준으로 바꾸는 규칙
- 지원하지 않는 후보 상태 변경

회사 이름, role 목록, 후보, 날짜는 system prompt에 넣지 않는다. 이 부분이
변하지 않아야 provider가 지원하는 prompt-prefix cache를 활용하기도 쉽다. 현재
OpenAI-compatible Anthropic/xAI 호출 경로에는 explicit cache breakpoint를
추가하지 않았지만, 안정된 prefix라는 전제는 유지한다.

### 2. Always-on workspace context

매 turn 들어가는 data는 다음뿐이다.

| Section | 항상 넣는 값 | 줄이는 방법 |
| --- | --- | --- |
| company | name, description, pitch, company request | field/value table |
| role_core | 모든 role의 ID/name/status/location/mode/type/date | header 1회 |
| role_requests | 비어 있지 않은 request | role당 600자, 전체 8,000자 |
| recent_recommendations | 최근 20명의 ID/name/headline/role/stage/fit/date | email·recommendation ID 제외 |
| older_summaries | 최근 summary 2개 | 각 1,200자 |
| recent_conversation | 웹·Slack 통합 최신 14개 조회 | 최신 우선, 전체 약 8,000자 |
| resolved_mentions | mention된 talent ID/role ID | recommendation ID 제외 |
| user_message | 최신 요청 | 마지막 배치, 최대 8,000자 |

날짜는 `YYYY-MM-DD`만 사용한다. row가 이미 최신순으로 정렬되므로 초·밀리초와
timezone은 현재 질문의 판단에 필요하지 않다.

후보 이메일은 “최근 추천 목록을 간단히 보여준다”는 목적에는 필요하지 않다.
이메일로 후보를 찾는 요청이 오면 `get_talents`가 검색 결과에서 이메일을 반환한다.
마찬가지로 `workspaceId`는 서버가 이미 tool scope로 고정하므로 LLM argument에
필요 없고, `recommendationId`는 현재 제공된 tool 중 어느 것도 argument로 받지
않으므로 제거했다.

### 3. On-demand tools

큰 data는 다음 순서로 늦게 읽는다.

```text
항상 context로 답 가능
  └─ yes: 바로 답변
  └─ no
      ├─ 후보 식별이 필요: get_talents
      ├─ 후보의 stage/progress/profile 필요: read_talent
      ├─ role의 pipeline/JD/전체 request 필요: read_role
      └─ 명시적 변경: update_company 또는 update_role
```

Tool schema는 다음 네 가지를 반드시 설명한다.

- 무엇을 하는가
- 언제 쓰고, 비슷한 다른 tool과 어떻게 구분하는가
- 핵심 argument의 의미와 limit/default
- 어떤 범주의 결과를 반환하는가

현재 tool이 5개뿐이고 모두 범용 recruiting 대화에 직접 관련되므로 매 turn 전부
노출한다. keyword heuristic으로 write tool을 숨기면 한국어·영어 혼합 요청이나
간접적인 수정 요청을 놓칠 수 있다. Tool 수가 크게 늘면 먼저 tool group/router
eval을 만들고 deferred loading을 검토한다.

## Tool result 직렬화

Application service는 typed object를 반환하지만, `chat.ts`는 그 object를 그대로
`JSON.stringify`하지 않는다. `promptFormat.ts`가 tool별 LLM view를 만든다.

예를 들어 후보 20명 검색 결과의 내부 object는 후보마다 `candidate`, `role`,
`recommendedAt` 같은 key가 반복된다. LLM view는 다음처럼 key를 한 번만 쓴다.

```text
status=ok
offset=0 limit=20 has_more=false
<matches>
talent_id  name  email  headline  role_id  role  stage  fit  recommended
...        ...   ...    ...       ...      ...   ...    ...  2026-07-30
</matches>
```

`update_company`와 `update_role` 결과는 다음 reasoning에 전체 entity가 필요하지
않다. 따라서 `status`, `change`, entity ID/name만 돌려주고, 수천 자 description을
다시 echo하지 않는다.

Candidate profile의 experience/education도 column header를 한 번만 쓰고, DB
service 단계와 serializer 단계에서 description/memo 길이를 이중으로 제한한다.

## 대화와 summary

웹과 Slack의 최근 message를 합쳐 최대 14개 조회하고, 최종 prompt에서는 약
8,000자 budget을 적용한다. 뒤에서부터 채워 최신 message를 우선하고, 한
message는 900자로 제한한다. Slack speaker는 `표시 이름 [Slack user ID]`이므로
여러 사람의 말을 구분한다.

웹·Slack 통합 대화의 오래된 segment가 일정 크기를 넘으면 하나의 workspace
summary로 저장된다. 매 turn에는 가장 최근 summary 2개만 각 1,200자까지 넣는다.
따라서 웹에서 나눈 대화를 Slack이 기억하고, 여러 Slack thread에서 나눈 대화도
웹과 다른 Slack thread가 이어서 기억한다. 첫 mention 직전에는 Slack
`conversations.replies` 한 page를 동기화하고, 이후 자동 답변하지 않는 일반
댓글도 Events API에서 저장해 다음 turn의 통합 context로 사용한다.

## Write 안전성과 token 절감의 경계

`role.request`는 patch가 아니라 전체 replacement다. 하지만 모든 role의 최대
6,000자 request를 매 turn 넣으면 role 수에 비례해 prompt가 커진다.

그래서 항상 context에는 role당 600자, 전체 8,000자만 넣는다. 대신:

1. 전체 request가 보인 role ID를 execution state에 기록한다.
2. `…`로 잘린 role과 budget 때문에 빠진 role은 full 상태로 기록하지 않는다.
3. 그런 role에 `update_role(request=...)`가 먼저 오면 executor가 거절한다.
4. LLM이 `read_role`을 호출하면 전체 request를 tool result로 받는다.
5. 같은 parallel tool batch의 update는 아직 결과를 보지 못했으므로 계속 막고,
   결과를 실제로 본 다음 completion의 `update_role`부터 허용한다.

즉 token 절감이 기존 기준의 silent deletion으로 이어지지 않는다.

## 측정 결과

2026-07-30에 Anthropic의 무료 `messages/count_tokens` endpoint와
`claude-sonnet-5` tokenizer를 사용해 비교했다. 현재 기본 model은 `grok-4.3`이며,
실제 운영 token 사용량은 각 assistant message의 `metadata.llmUsage`로 확인한다.
대표 fixture는 role 12개, 최근 추천 20명, 최근
대화 12개, summary 2개, company 정보, 5개 tool schema를 포함한다.

| 비교 | 이전 | 개선 후 | 감소 |
| --- | ---: | ---: | ---: |
| 첫 completion 전체 input | 9,422 tokens | 7,664 tokens | 18.7% |
| system + dynamic prompt 문자 | 13,668 | 9,282 | 32.1% |
| `get_talents` 20명 tool result | 4,913 tokens | 2,584 tokens | 47.4% |
| 같은 tool result 문자 | 8,870 | 4,069 | 54.1% |

첫 completion은 tool schema까지 포함한 수치다. Tool result 비교는 같은 object를
raw JSON과 현재 compact serializer로 각각 count했다.

이 benchmark는 token 비용을 보여주지만 답변 품질을 보장하지는 않는다. Prompt를
바꿀 때는 최소한 다음 representative eval을 함께 확인해야 한다.

- context만으로 최근 추천 질문에 답하는가
- 동명이인·비슷한 role에서 섣불리 target을 고르지 않는가
- 이메일/이름/role title 검색 후 올바른 candidate를 읽는가
- profile이 필요할 때만 `includeProfile=true`를 쓰는가
- 전체 pipeline 질문에는 stage filter 없이 정확한 stage count를 쓰는가
- 특정 stage의 후보 목록에서 pagination을 지키는가
- 잘린 request를 먼저 읽지 않고 덮어쓰지 않는가
- update가 실패했는데 성공했다고 말하지 않는가
- 최종 답변에 내부 UUID/tool 이름을 노출하지 않는가
- tool 결과 언어와 무관하게 최신 사용자 언어로 답하는가
- Slack thread의 사용자와 이전 맥락을 구분하는가

실제 workspace 대상 eval은 write tool을 dry-run으로 막은 다음 아래처럼 실행한다.

```bash
pnpm org-agent:live-eval -- <company-workspace-id>
```

실제 completion의 provider-reported usage는 assistant message
`metadata.llmUsage`에 completion 수, input/output/total token, cache
read/write token 합계로 저장한다. 운영 data에서 품질 지표와 함께 추적해야 한다.

## Slack context 관련 제약

Slack은 `conversations.replies`로 cursor-paginated thread를 제공하고, 일반적으로
한 번에 200개 이하를 권장한다. 다만 2025-05-29 이후 새로 설치된
비-Marketplace 상용 배포 app은 1 request/minute, 최대 15개 제한을 받을 수 있다.
Marketplace app과 고객이 직접 만든 internal app은 Tier 3 제한을 사용한다.

- [Slack conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Slack non-Marketplace rate-limit change](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/)

Harper는 mention 직전에 한 page만 동기화하고, 그 뒤 managed thread의 message
event를 계속 저장한다. Page가 잘리면 `<context_notes>`에 partial history임을
명시해 LLM이 전체를 읽었다고 주장하지 않게 한다. 고객 Slack 전체에서 오래된
대형 thread까지 즉시 완전하게 읽어야 한다면 app의 Slack Marketplace 승인이
사실상 필요하다. 1분마다 background pagination하는 방식은 답변 latency가 너무
커서 현재 turn path에는 넣지 않았다.

사용자 이름은 `users.info`로 읽는다. 표시 이름에는 `users:read`만 필요하고
이메일을 읽지 않으므로 `users:read.email`은 요청하지 않는다.

- [Slack users.info](https://docs.slack.dev/reference/methods/users.info/)
