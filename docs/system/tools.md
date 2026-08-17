# Harper Career Tools

Career의 LLM tool schema와 실행 함수는 `src/lib/talentOnboarding/tools.ts`에 있고, 실제 어떤 상황에서 LLM에 노출할지는 `src/lib/career/llmTools.ts`가 결정한다.

## Tool 목록

| tool | 하는 일 | 채널 |
|---|---|---|
| `web_search` | 최신/외부 웹 정보 검색 | chat, realtime voice |
| `open_url` | 사용자가 준 URL의 페이지 markdown 읽기 | chat |
| `recommend_job_postings` | 기본 instant(기존 legacy 동기 검색, 최대 5개) 또는 명시적으로 허용된 bulk(worker 정밀 검색, 기본 15·최대 20개, 완료 이메일)로 새 job posting 검색·rerank·저장 | chat |
| `read_recommended_opportunities` | 기존 추천 opportunity 이력 읽기 | chat, realtime voice |
| `get_role_context` | 특정 roleId의 JD/company/recommendation 상세 맥락 읽기 | chat, realtime voice |
| `update_recommended_opportunity_feedback` | 추천 공고에 like/dislike 저장 | chat |
| `research_company` | 특정 회사 조사 후 company snapshot 답변 생성 | chat |
| `lookup_answer_examples` | ops가 관리하는 답변 예시 검색 | chat |
| `read_talent_activity_events` | 최근 profile/preference/activity summary 읽기 | chat |
| `update_setting` | 추천 발송 설정 변경 | chat |
| `update_talent_profile` | 프로필, row memo, future matching memory 저장 | chat |
| `record_internal_fit_reevaluation_information` | hidden internal fit hold 질문에 대한 답변 저장 | chat |

## LLM 노출 상황

| 상황 | LLM에 들어가는 tools |
|---|---|
| Text chat, onboarding 진행 중 | `web_search`, `update_talent_profile`, `open_url` |
| Text chat, onboarding 완료 후 | `web_search`, `open_url`, `recommend_job_postings`, `read_recommended_opportunities`, `get_role_context`, `update_recommended_opportunity_feedback`, `research_company`, `lookup_answer_examples`, `read_talent_activity_events`, `update_setting`, `update_talent_profile` |
| Text chat, hidden internal fit hold 질문이 활성화된 경우 | onboarding 완료 후 tool 목록에 `record_internal_fit_reevaluation_information` 추가 |
| `/api/talent/chat`의 voice channel onboarding | `update_talent_profile` |
| Realtime voice call, onboarding 진행 중 | 없음 |
| Realtime voice call, onboarding 완료 후 | `web_search`, `read_recommended_opportunities`, `get_role_context` |
| Onboarding completion wrap-up 생성 | `update_setting`, `update_talent_profile`만 허용 |
| Voice call wrap-up follow-up | `update_setting`, `update_talent_profile`만 허용 |
| Opportunity feedback follow-up | 기본은 일반 text chat allowlist를 사용. `immediate_internal_feedback` trigger는 tools 없음 |
| Company watchlist follow-up | tools 없음 |

## 특수 동작

- `research_company`는 `stopAfterExecution` tool이다. LLM이 tool call을 만들면 route-local executor가 company snapshot을 생성하고, 일반 tool loop 후속 답변을 이어가지 않는다.
- `allowedToolNames`가 빈 배열이면 tools가 전부 빠진다. 값이 있으면 상황별 allowlist를 통과한 tool 중 해당 이름만 남긴다.
- `update_talent_profile`은 onboarding 중에는 profile/row memo 중심이고, onboarding 완료 후에는 future matching memory도 저장할 수 있다.
- `update_setting`은 recommendation delivery 설정만 바꾼다. role/location/company preference 같은 matching memory는 `update_talent_profile` 대상이다.
- `recommend_job_postings`는 durable hard filter가 포함된 요청이면 먼저 `update_talent_profile`로 저장한 뒤 fresh search를 돌리도록 prompt되어 있다.
- LLM 비용 attribution은 `src/lib/llm/usageLogging.ts`에서 `career_tool:<tool>` source로 기록한다. Tool 자체 실행 비용이 아니라 tool 판단, tool call JSON, tool result 반영 답변 비용까지 포함될 수 있다.
