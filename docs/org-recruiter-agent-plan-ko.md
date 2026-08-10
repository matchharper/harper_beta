# Org Recruiter Agent Product And Implementation Plan

> **Deprecated (2026-07-30):** 이 문서는 role-scoped Recruiter Agent의 초기 설계
> 기록이다. 현재 구현은 workspace-scoped Agent와
> `get_talents`, `read_talent`, `read_role`, `update_company`, `update_role`을
> 사용한다. 현재 동작과 수정 위치는
> [`org-agent-tools-reference-ko.md`](./org-agent-tools-reference-ko.md)를
> 소스 오브 트루스로 본다.

## 0. 문서 목적

이 문서는 `/org` 안에 Harper recruiter Agent를 추가하기 위한 제품/기술 구현 계획이다.

목표는 채용 담당자가 role request modal을 열지 않고도 자연어로 추천 기준을 수정할 수 있게 만드는 것이다.

사용자는 "앞으로는 특정 회사 출신이면 가중치를 줘"처럼 사람에게 말하듯 요청한다.

Harper는 그 요청을 이해하고, 필요한 경우 `company_roles.request` 또는 `company_workspace.request`를 직접 갱신한다.

갱신 후에는 "다음 연결 후보를 찾을 때 반영하겠다"는 짧은 확인을 제공한다.

이 기능은 `/career`의 Harper career agent와 비슷한 채팅 경험을 갖는다.

다만 `/career`보다 훨씬 단순해야 한다.

`/org` Agent는 후보자 수락/거절을 채팅으로 처리하지 않는다.

`/org` Agent는 새로운 role 생성도 직접 처리하지 않는다.

`/org` Agent는 대부분의 턴에서 request text를 업데이트하거나, 답변만 하거나, Harper team 미팅 CTA를 보여준다.

대화 단위는 `company_workspace + role`이다.

같은 workspace의 다른 멤버가 들어와도 같은 role의 이전 대화를 볼 수 있어야 한다.

다른 role 탭으로 이동하면 다른 대화가 보여야 한다.

`All` 탭은 1차 구현에서는 Agent를 숨기거나, "role을 선택하면 기준을 조정할 수 있다"는 비활성 상태로 둔다.

이 문서는 구현 전 결정해야 할 부족한 디테일까지 채운다.

특히 DB schema, prompt input, tools, system prompt, UI behavior, mention UX를 구체화한다.

## 1. 현재 코드베이스 관찰

현재 `/org` 페이지의 엔트리는 `src/pages/org.tsx`이다.

현재 `/org` 상단에는 `OrgAppBar`가 있다.

현재 `/org` role 탭은 `OrgRoleTabs`가 담당한다.

현재 `/org` role별 pipeline은 `OrgPipeline`이 담당한다.

현재 `/org` 후보자 상세 drawer는 `TalentDetailSimpleView`가 담당한다.

현재 `/org` role/workspace 수정 모달은 `OrgEditDialog`가 담당한다.

현재 `/org` role request는 `company_roles.request`에서 읽는다.

현재 `/org` workspace request는 `company_workspace.request`에서 읽는다.

현재 `updateOrgRole`은 `src/lib/org/server.ts`에 있다.

현재 `updateOrgWorkspace`도 `src/lib/org/server.ts`에 있다.

현재 role update API는 `src/app/api/org/role/route.ts`에 있다.

현재 workspace update API는 `src/app/api/org/workspace/route.ts`에 있다.

현재 `updateOrgRole`은 modal submit용이라 role name이 필수다.

Agent tool에서는 role request만 바꾸고 싶으므로 request 전용 helper를 새로 두는 편이 안전하다.

Worker 쪽 internal fit은 `company_roles.request`를 `role_request`로 읽는다.

Worker 쪽 company context는 `company_workspace.request`를 읽는다.

따라서 Agent가 수정할 source of truth는 기존 UI와 worker가 이미 쓰는 두 필드로 둔다.

`company_internal_roles.request`도 존재하지만 1차 구현에서는 쓰지 않는다.

이유는 현재 `/org` UI와 worker의 runtime query가 `company_roles.request`를 읽고 있기 때문이다.

`company_internal_roles.request` 동기화가 필요하면 별도 migration/worker 변경으로 후속 처리한다.

현재 `/career` 채팅 메시지는 `talent_messages`를 사용한다.

현재 `/career` 대화는 `talent_conversations`를 사용한다.

현재 `/career` 요약은 `talent_conversation_summaries`를 사용한다.

현재 `/career` message history는 infinite query로 위로 스크롤 시 이전 메시지를 가져온다.

현재 `/career` 요약 기준은 최소 14개 메시지 또는 5,000 source chars이다.

현재 `/career` 요약은 최근 원문 16개 메시지를 남기고 그 이전을 rolling summary로 접는다.

`/org` Agent도 같은 요약 기준을 쓰는 것이 좋다.

현재 `/career` SSE 이벤트는 `user_message`, `text_delta`, `tool_status`, `assistant_message`, `done` 등을 사용한다.

`/org` Agent도 같은 이벤트 이름을 유지하면 프론트 구현량이 줄어든다.

현재 `/career` thinking UI는 `ThinkingLogPanel`을 사용한다.

`/org` Agent도 같은 시각 언어를 재사용할 수 있다.

현재 `/career` 날짜 구분은 `CareerTimelineSection` 내부의 date divider 로직으로 처리한다.

`/org` Agent도 동일한 UX를 더 작게 복제한다.

현재 `/org` Slack 알림은 `src/lib/org/slack.ts`와 `src/lib/org/slackIntegration.ts`에 있다.

미팅 신청 알림도 같은 Slack infra를 쓰는 것이 자연스럽다.

## 2. 제품 목표

채용 담당자가 추천 기준 변경을 "문서 수정"이 아니라 "대화"로 느끼게 한다.

기존 role request modal은 계속 유지한다.

Agent는 modal을 대체하기보다 request 수정의 빠른 입력면을 제공한다.

Agent는 "후보자를 보고 느낀 핀트 차이"를 다음 추천 기준으로 변환한다.

Agent는 "좋았던 후보/별로였던 후보"를 구체적 criteria로 정리한다.

Agent는 criteria를 role-level과 company-level로 적절히 분배한다.

Agent는 잘못 확정하기 애매한 신호에 대해서는 바로 쓰지 않고 짧게 확인한다.

Agent는 수락/거절 버튼 행동을 채팅으로 대신하지 않는다.

Agent는 채용 담당자에게 직접 조작해야 하는 행동을 명확히 안내한다.

Agent는 추천 품질을 실제로 개선하는 정보만 저장한다.

Agent는 단순한 인상평을 장기 request로 과하게 저장하지 않는다.

Agent는 company request와 role request의 차이를 사용자에게 부담스럽게 설명하지 않는다.

Agent는 기본적으로 선택된 role의 맥락 안에서 작동한다.

Agent는 다른 role의 대화 기록을 섞지 않는다.

Agent는 같은 role에서는 workspace 멤버 전체가 같은 히스토리를 본다.

Agent는 Crisp-like 가벼운 사이드 채팅 UI를 제공한다.

Agent는 기존 pipeline을 가리는 큰 화면이 아니어야 한다.

Agent는 "현재 어떤 Role 기준을 조정 중인지"를 항상 화면 상단에 보여준다.

## 3. 비목표

채팅으로 후보자를 수락하지 않는다.

채팅으로 후보자를 거절하지 않는다.

채팅으로 후보자의 pipeline stage를 변경하지 않는다.

채팅으로 새 role을 만들지 않는다.

채팅으로 기존 role을 삭제하지 않는다.

채팅으로 Slack integration을 설치하지 않는다.

채팅으로 이메일 intro를 발송하지 않는다.

채팅으로 candidate에게 직접 메시지를 보내지 않는다.

채팅으로 모든 candidate DB를 검색하지 않는다.

채팅으로 "당장 더 찾아줘"를 1차 구현에서 자동 실행하지 않는다.

채팅을 복잡한 ATS assistant로 만들지 않는다.

Agent를 `/career` 온보딩처럼 긴 질문 흐름으로 만들지 않는다.

Agent가 매 턴마다 기준을 바꾸려고 하지 않는다.

Agent가 명확하지 않은 개인 취향을 hard filter로 저장하지 않는다.

Agent가 후보자의 private career-side data를 필요 이상으로 노출하지 않는다.

Agent가 internal scoring, retrieval, labels, hidden prompt 같은 구현 용어를 말하지 않는다.

## 4. 1차 릴리즈 성공 기준

선택한 role 안에서 채팅 패널을 열 수 있다.

채팅 상단에 workspace와 role 이름이 보인다.

채팅 메시지는 role별로 분리되어 저장된다.

다른 workspace 멤버도 같은 role 대화 기록을 볼 수 있다.

위로 스크롤하면 이전 대화가 로드된다.

날짜가 바뀌면 날짜 divider가 보인다.

assistant 답변은 streaming 된다.

tool 실행 중 Thinking log가 보인다.

사용자가 명확한 role-level 기준 변경을 말하면 `company_roles.request`가 바뀐다.

사용자가 명확한 company-level 기준 변경을 말하면 `company_workspace.request`가 바뀐다.

갱신 후 role/workspace query cache가 invalidation 된다.

request modal을 다시 열면 Agent가 바꾼 내용이 보인다.

미지원 요청에는 Harper team 미팅 CTA가 보인다.

CTA 클릭 시 Slack 알림이 발송된다.

`@` 입력 시 role pipeline 후보자 목록이 뜬다.

mention 선택 시 message payload에 `talentId`와 `recommendationId`가 남는다.

동명이인이 있어도 mention은 정확한 candidate를 가리킨다.

수락/거절 요청을 채팅으로 하면 직접 버튼을 클릭하라고 안내한다.

시스템 프롬프트는 request 변경 boundary를 강하게 지킨다.

## 5. 권장 UX 형태

`/org` role tab 아래 영역을 좌우로 나눈다.

왼쪽은 기존 `OrgPipeline`을 유지한다.

오른쪽은 고정 폭 Agent panel을 둔다.

데스크톱 기본 폭은 360px에서 420px 사이다.

1440px 이하에서는 panel 폭을 360px로 둔다.

넓은 화면에서는 400px 정도가 적당하다.

모바일에서는 Agent panel을 bottom sheet 또는 별도 tab으로 전환한다.

1차에서는 모바일 `/org` 사용 빈도가 낮다면 desktop 우선으로 구현해도 된다.

Agent panel은 page section card가 아니라 오른쪽 sidebar surface로 보이게 한다.

Agent panel top에는 `Harper`와 현재 role title을 표시한다.

예시 상단 문구는 `Harper · Product Engineer`이다.

그 아래 작은 secondary text로 company name을 표시한다.

예시 secondary text는 `Zetic AI workspace`이다.

상단 우측에는 panel collapse icon을 둔다.

Collapse 상태에서는 우측 edge에 작은 chat icon button만 보인다.

Panel 내부는 `Header`, `Timeline`, `Composer` 세 영역이다.

Timeline은 message list만 담고, decorative card 안에 card를 또 넣지 않는다.

Composer는 하단 sticky로 둔다.

Composer placeholder는 `추천 기준이나 후보자 피드백을 편하게 적어주세요.` 정도가 좋다.

All tab에서는 composer를 비활성화한다.

All tab 비활성 copy는 `역할 탭을 선택하면 해당 역할의 추천 기준을 조정할 수 있습니다.`로 둔다.

## 6. 대화 scope

대화 scope key는 `company_workspace_id + role_id`이다.

한 role에는 하나의 active conversation만 둔다.

role이 deleted/expired 되더라도 과거 대화는 남긴다.

role tab을 바꾸면 `role_id`가 바뀌고 message query key도 바뀐다.

workspace를 바꾸면 모든 agent state를 reset한다.

same workspace member는 같은 `company_conversation` row를 읽는다.

company user 개인별 conversation을 만들지 않는다.

`company_user_id`는 message author로만 저장한다.

assistant message에는 `company_user_id`를 null로 둔다.

내부 Harper admin이 들어와도 같은 conversation을 볼 수 있다.

다만 access check는 현재 `assertOrgWorkspaceAccess`를 따른다.

## 7. DB schema 개요

1차 구현에서는 새 테이블 3개를 추가한다.

첫 번째는 `company_conversations`이다.

두 번째는 `company_messages`이다.

세 번째는 `company_conversation_summaries`이다.

사용자가 말한 두 테이블만으로도 구현은 가능하다.

하지만 `company_conversations`가 없으면 role별 conversation id, updated_at, unique constraint 관리가 애매해진다.

`/career`와 유사한 구조를 유지하려면 `company_conversations`를 두는 편이 낫다.

추가 action audit 테이블은 만들지 않는다.

Tool write 결과와 변경 전후 값은 `company_messages.metadata`에 저장한다.

이렇게 하면 1차 구현의 DB 표면이 작아진다.

추후 audit/export가 필요하면 `company_request_change_events`를 분리한다.

## 7.1 테이블 총괄

1차 구현에서 새로 추가하는 테이블은 총 3개다.

신규 필수 테이블 1은 `company_conversations`이다.

`company_conversations`는 workspace + role 단위의 공유 대화 thread를 나타낸다.

이 테이블이 있어야 같은 role 안에서 모든 company member가 같은 대화 기록을 볼 수 있다.

이 테이블이 있어야 role별 `updated_at`, `last_message_id`, unique constraint를 안정적으로 관리할 수 있다.

신규 필수 테이블 2는 `company_messages`이다.

`company_messages`는 user/assistant message 원문, mentions, thinking logs, safe action metadata를 저장한다.

이 테이블이 infinite scroll cursor의 source of truth다.

Tool write 결과의 audit preview와 meeting CTA action도 이 테이블 metadata에 둔다.

신규 필수 테이블 3은 `company_conversation_summaries`이다.

`company_conversation_summaries`는 긴 role-scoped 대화를 rolling summary로 압축한다.

이 테이블이 있어야 prompt가 커지지 않고도 과거 기준 변경 맥락을 유지할 수 있다.

따라서 DB migration으로 새로 만들어야 하는 테이블 수는 3개다.

기존 테이블까지 포함해 1차 기능이 직접 의존하는 필수 테이블은 신규 3개 + 기존 12개 = 총 15개다.

기존 필수 테이블 1은 `company_workspace`이다.

`company_workspace`는 workspace 이름, 회사 설명, pitch, 회사 전체 request를 읽고 쓴다.

`update_company_request` tool은 이 테이블의 `request`를 수정한다.

기존 필수 테이블 2는 `company_roles`이다.

`company_roles`는 active role 정보, JD, role request를 읽고 쓴다.

`update_role_request` tool은 이 테이블의 `request`를 수정한다.

기존 필수 테이블 3은 `company_users`이다.

`company_users`는 메시지 작성자 표시와 Slack meeting request의 actor 정보를 위해 쓴다.

기존 필수 테이블 4는 `company_user_workspace`이다.

`company_user_workspace`는 workspace membership과 access check를 위해 쓴다.

기존 필수 테이블 5는 `talent_opportunity_recommendation`이다.

`talent_opportunity_recommendation`은 현재 role pipeline 후보, recommendation id, recommended_at, fit summary, fit reasons를 읽기 위해 쓴다.

Mention 후보 목록과 recent feed의 핵심 source다.

기존 필수 테이블 6은 `talent_opportunity_tag`이다.

`talent_opportunity_tag`는 후보자의 현재 org pipeline stage를 읽기 위해 쓴다.

Stage 변경 feed도 이 테이블에서 일부 만든다.

기존 필수 테이블 7은 `talent_progress`이다.

`talent_progress`는 org note, stage change reason, 수락/거절 관련 사람이 남긴 설명을 feed로 만들기 위해 쓴다.

기존 필수 테이블 8은 `talent_users`이다.

`talent_users`는 후보자 이름, headline, profile picture, location 등 기본 profile 정보를 읽기 위해 쓴다.

기존 필수 테이블 9는 `talent_experiences`이다.

`talent_experiences`는 mention menu subtitle, candidate context, "이 사람 같은 사람" 해석에 필요한 최근 회사/역할 정보를 위해 쓴다.

기존 필수 테이블 10은 `talent_educations`이다.

`talent_educations`는 전공/학교 기준 피드백을 해석하고 mention subtitle을 만들기 위해 쓴다.

기존 필수 테이블 11은 `talent_extras`이다.

`talent_extras`는 `read_candidate_context` tool이 visible candidate profile을 보충할 때 쓴다.

기본 prompt에는 넣지 않고, mention된 후보자를 더 봐야 할 때만 읽는다.

기존 필수 테이블 12는 `ops_matching_role_stages`이다.

`ops_matching_role_stages`는 custom pipeline stage label을 user-facing feed line으로 변환하기 위해 쓴다.

선택 테이블 1은 `company_slack_integrations`이다.

Meeting request를 workspace Slack에도 보내려면 이 테이블을 쓴다.

1차 권장은 Harper internal Slack만 보내는 것이므로 필수는 아니다.

선택 테이블 2는 `logs`이다.

Observability나 meeting request idempotency를 `logs`로 관리하면 이 테이블을 쓸 수 있다.

1차 권장은 idempotency를 `company_messages.metadata`에 두는 것이므로 필수는 아니다.

주의할 기존 테이블은 `talent_insights`이다.

현재 `fetchOrgTalentDetail`은 `talent_insights`를 읽을 수 있다.

하지만 Org Agent prompt용 `read_candidate_context`에서는 candidate-facing career private insight를 기본적으로 읽지 않는다.

따라서 `fetchOrgTalentDetail`을 그대로 재사용하지 말고, Org Agent 전용 visible-safe candidate context query를 만든다.

만약 `talent_insights`를 써야 한다면 별도 privacy review와 prompt 노출 범위 합의가 필요하다.

## 8. DB migration 초안

```sql
create table if not exists public.company_conversations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_id bigint null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists company_conversations_workspace_role_uidx
  on public.company_conversations (company_workspace_id, role_id);

create index if not exists company_conversations_workspace_updated_idx
  on public.company_conversations (company_workspace_id, updated_at desc);

create table if not exists public.company_messages (
  id bigint generated by default as identity primary key,
  conversation_id uuid not null references public.company_conversations(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  company_user_id uuid null references public.company_users(user_id) on delete set null,
  role text not null,
  content text not null,
  message_type text not null default 'chat',
  mentions jsonb not null default '[]'::jsonb,
  thinking_logs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_mobile boolean null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.company_messages
  add constraint company_messages_role_check
  check (role in ('user', 'assistant', 'system'));

create index if not exists company_messages_conversation_id_id_idx
  on public.company_messages (conversation_id, id);

create index if not exists company_messages_workspace_role_created_idx
  on public.company_messages (company_workspace_id, role_id, created_at desc);

create table if not exists public.company_conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.company_conversations(id) on delete cascade,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  from_message_id bigint null references public.company_messages(id) on delete set null,
  to_message_id bigint not null references public.company_messages(id) on delete cascade,
  message_count integer not null default 0,
  source_char_count integer not null default 0,
  segment_summary text not null default '',
  summary_text text not null default '',
  summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists company_conversation_summaries_conversation_to_uidx
  on public.company_conversation_summaries (conversation_id, to_message_id);

create index if not exists company_conversation_summaries_workspace_role_idx
  on public.company_conversation_summaries (company_workspace_id, role_id, to_message_id desc);

alter table public.company_conversations enable row level security;
alter table public.company_messages enable row level security;
alter table public.company_conversation_summaries enable row level security;

revoke all on public.company_conversations from anon, authenticated;
revoke all on public.company_messages from anon, authenticated;
revoke all on public.company_conversation_summaries from anon, authenticated;

grant all on public.company_conversations to service_role;
grant all on public.company_messages to service_role;
grant all on public.company_conversation_summaries to service_role;
```

## 9. DB 필드 의미

`company_conversations.id`는 서버와 클라이언트가 사용하는 conversation id이다.

`company_conversations.company_workspace_id`는 workspace scope이다.

`company_conversations.role_id`는 role scope이다.

`company_conversations.last_message_id`는 optional optimization이다.

`company_conversations.metadata`는 추후 feature flag, archived state, compact stats를 담을 수 있다.

`company_messages.id`는 infinite scroll cursor로 쓴다.

`company_messages.conversation_id`는 parent conversation이다.

`company_messages.company_workspace_id`와 `role_id`는 query/debug 편의를 위한 denormalized 필드다.

`company_messages.company_user_id`는 user message author이다.

`company_messages.role`은 `user` 또는 `assistant`가 대부분이다.

`company_messages.content`는 화면과 LLM 히스토리에 쓰이는 텍스트다.

`company_messages.message_type`은 `chat`, `tool_result_notice`, `meeting_cta` 등을 구분한다.

`company_messages.mentions`는 mention payload를 JSON array로 저장한다.

`company_messages.thinking_logs`는 assistant message에 붙일 thinking log array이다.

`company_messages.metadata`는 tool call, request diff, CTA action id를 담는다.

`company_conversation_summaries.segment_summary`는 새로 접은 segment 요약이다.

`company_conversation_summaries.summary_text`는 rolling summary이다.

`company_conversation_summaries.summary_json`은 나중에 structured preference memory로 확장할 때 사용한다.

## 10. Type generation

Migration 추가 후 Supabase type generation을 실행해야 한다.

현재 repo는 `src/types/database.types.ts`를 사용한다.

구체적인 명령은 기존 프로젝트 script를 확인한 뒤 실행한다.

script가 없다면 Supabase CLI로 types를 갱신한다.

Type이 갱신되기 전까지는 `as any`가 필요할 수 있다.

새 code는 가능하면 `Database["public"]["Tables"]["company_messages"]["Row"]` 타입을 사용한다.

`mentions`와 `metadata`는 `Json` 타입으로 저장한다.

## 11. Server module 구조

새 서버 로직은 `src/lib/org/agent` 아래에 둔다.

권장 파일 구조는 다음과 같다.

```text
src/lib/org/agent/
  context.ts
  conversationStore.ts
  conversationSummary.ts
  llm.ts
  llmTools.ts
  prompts.ts
  toolExecution.ts
  tools.ts
  types.ts
```

`context.ts`는 prompt input을 만든다.

`conversationStore.ts`는 conversation/message CRUD를 담당한다.

`conversationSummary.ts`는 `/career` summary 기준을 org용으로 이식한다.

`llm.ts`는 career의 Anthropic wrapper를 재사용하거나 얇게 감싼다.

`llmTools.ts`는 어떤 tool을 LLM에 노출할지 고른다.

`prompts.ts`는 system prompt와 user prompt blocks를 만든다.

`toolExecution.ts`는 tool 실행 라우팅을 담당한다.

`tools.ts`는 tool schema와 execute function을 정의한다.

`types.ts`는 org agent 전용 response/message 타입을 정의한다.

## 12. API route 구조

새 API route는 `src/app/api/org/agent` 아래에 둔다.

권장 route는 다음과 같다.

```text
src/app/api/org/agent/messages/route.ts
src/app/api/org/agent/chat/route.ts
src/app/api/org/agent/mentions/route.ts
src/app/api/org/agent/meeting-request/route.ts
```

`messages`는 GET만 제공한다.

`chat`은 POST를 제공하고 SSE를 지원한다.

`mentions`는 GET을 제공한다.

`meeting-request`는 POST를 제공한다.

`meeting-request`는 assistant가 미팅 CTA를 보여준 뒤 사용자가 클릭할 때만 Slack을 보낸다.

LLM tool이 직접 Slack을 보내면 "클릭하면 신청"이라는 UX와 맞지 않는다.

따라서 `schedule_meeting` tool은 CTA를 생성하고, 실제 Slack 발송은 client click route가 담당한다.

## 13. Auth와 access

모든 org agent route는 `getRequestUser(req)`로 인증한다.

모든 route는 `assertOrgWorkspaceAccess`와 같은 access check를 수행한다.

`assertOrgWorkspaceAccess`는 현재 `src/lib/org/server.ts` 내부 함수라 export가 필요하다.

export를 꺼리면 org agent server helper 내부에 동일한 access helper를 이동/공유한다.

권장 변경은 `assertOrgWorkspaceAccess`를 export하고 이름을 유지하는 것이다.

Role access는 `workspaceId + roleId`가 같은지 반드시 확인한다.

`company_user_id`는 Supabase auth user id와 동일하게 저장한다.

현재 `company_users.user_id`가 auth user id로 upsert되는 패턴을 따른다.

내부 Harper email은 기존 all-internal workspace access 규칙을 따른다.

## 14. Conversation 생성

`GET /api/org/agent/messages`는 conversation이 없으면 생성할 수 있다.

하지만 읽기 API가 write를 수행하는 것을 싫어한다면 bootstrap route를 따로 둘 수 있다.

1차 구현에서는 단순화를 위해 `messages` GET에서 ensure conversation을 수행한다.

`POST /api/org/agent/chat`도 conversation을 ensure한다.

Ensure 로직은 `(company_workspace_id, role_id)` unique constraint에 upsert한다.

동시 요청 race는 unique constraint로 해결한다.

Ensure 후 conversation row를 다시 select한다.

`company_conversations.updated_at`은 user message insert 시 갱신한다.

assistant message insert 시에도 갱신한다.

## 15. Message pagination

`GET /api/org/agent/messages` query params는 다음을 사용한다.

`workspaceId`는 필수다.

`roleId`는 필수다.

`messageLimit`는 기본 20, 최대 100이다.

`beforeMessageId`는 optional bigint cursor이다.

응답 shape는 `/career`와 비슷하게 둔다.

```ts
type OrgAgentMessagesResponse = {
  ok: true;
  conversation: {
    id: string;
    workspaceId: string;
    roleId: string;
  };
  messages: OrgAgentMessagePayload[];
  nextBeforeMessageId: number | null;
};
```

Messages는 ascending order로 클라이언트에 반환한다.

DB fetch는 `id desc limit + reverse` 방식을 써도 된다.

`nextBeforeMessageId`는 page의 첫 메시지 id보다 작은 이전 page cursor이다.

## 16. Message payload

클라이언트 메시지 타입은 `/career`와 유사하게 둔다.

```ts
type OrgAgentMessagePayload = {
  id: number;
  role: "user" | "assistant";
  content: string;
  messageType: string;
  createdAt: string;
  companyUserId: string | null;
  mentions: OrgAgentMention[];
  thinkingLogs?: string[];
  metadata?: Record<string, unknown>;
};
```

`metadata`는 기본적으로 클라이언트에 모두 내려주지 않는다.

버튼 rendering에 필요한 안전한 action metadata만 내려준다.

예를 들어 meeting CTA action id는 내려준다.

Tool input 전체나 private prompt context는 내려주지 않는다.

## 17. Mention payload

Mention payload는 최소한 다음 필드를 가진다.

```ts
type OrgAgentMention = {
  kind: "talent";
  talentId: string;
  recommendationId: string | null;
  roleId: string;
  displayName: string;
  headline?: string | null;
};
```

`kind`는 추후 role/company mention 확장을 위해 둔다.

`talentId`는 동명이인 disambiguation의 source of truth다.

`recommendationId`는 후보자가 이 role에 추천된 record를 정확히 가리킨다.

`roleId`는 mention이 현재 role pipeline 소속인지 검증하는 데 쓴다.

`displayName`은 message render용이다.

`headline`은 mention menu subtitle용이다.

## 18. Mention 원문 저장 방식

유저가 `@김호진`을 선택하면 textarea에는 칩처럼 보인다.

DB `content`에는 안정적인 marker를 저장한다.

권장 marker는 `@[김호진](talent:talentId)`이다.

예시 content는 `@[김호진](talent:8f3...) 이 분은 핏이 아닌 것 같아.`이다.

DB `mentions`에는 위 JSON payload를 저장한다.

UI 렌더링은 content marker를 chip으로 바꿀 수 있다.

LLM prompt에는 marker와 mention detail 둘 다 들어간다.

이렇게 하면 DB 텍스트만 봐도 어느 talent인지 알 수 있다.

동명이인 문제도 JSON과 marker 양쪽에서 해결된다.

## 19. Mention trigger UX

Textarea에서 `@`를 입력하면 mention mode를 시작한다.

Mention mode는 caret 이후 query를 추적한다.

연속 스페이스 두 번을 누르면 mention mode를 닫는다.

Esc를 누르면 mention mode를 닫는다.

Enter는 highlight된 candidate를 선택한다.

ArrowDown은 다음 candidate로 이동한다.

ArrowUp은 이전 candidate로 이동한다.

Tab도 선택으로 처리할 수 있다.

마우스 클릭으로도 선택할 수 있다.

IME 조합 중 Enter는 전송이나 선택으로 처리하지 않는다.

Mention mode가 열려 있을 때 일반 Enter는 메시지를 전송하지 않는다.

Mention 후보자는 현재 role pipeline에 있는 후보자만 보여준다.

All tab에서는 mention menu를 열지 않는다.

검색어가 없으면 최근 recommended 순으로 8명을 보여준다.

검색어가 있으면 name, email, headline, recent company, school을 대상으로 필터링한다.

메뉴 row에는 이름, headline, 현재 stage, 최근 회사 한 줄을 보여준다.

동명이인이 있으면 email 일부 또는 short talent id를 subtitle에 보여준다.

## 20. Mention source API

`GET /api/org/agent/mentions?workspaceId=...&roleId=...&query=...`를 둔다.

이 API는 `fetchOrgBoard`의 board item 데이터를 재사용한다.

limit은 20으로 둔다.

role pipeline에 표시되지 않는 후보자는 반환하지 않는다.

`process_stopped` 후보도 pipeline에 보이면 반환한다.

검색 결과에는 `recommendationId`, `talentId`, `name`, `headline`, `stage`, `recentCompanies`, `recentSchools`를 포함한다.

프론트는 board query data가 있으면 로컬 필터를 먼저 사용한다.

board data가 충분하지 않거나 query가 긴 경우 API를 호출할 수 있다.

1차 구현은 board data만으로도 충분할 수 있다.

하지만 API를 두면 새로고침 직후나 virtualized list에서도 안정적이다.

## 21. Prompt input 원칙

Prompt input은 JSON dump보다 사람이 읽는 compact string을 우선한다.

단순 key-value는 한 줄 string으로 넣는다.

긴 JD는 summary 또는 앞부분만 넣는다.

최근 feed는 최대 20줄만 기본 prompt에 넣는다.

최근 conversation은 최신 summary 최대 3개 + 최근 원문 12~16개만 넣는다.

`company_conversation_summaries`가 3개를 초과해도 prompt에는 `source_end_message_id desc` 기준 최신 3개만 넣는다.

Mention된 후보자의 상세 맥락은 해당 턴에만 넣는다.

모든 pipeline 후보의 full profile을 매번 넣지 않는다.

Tool 결과도 LLM에 raw JSON dump하지 않고 compact text를 함께 제공한다.

Model이 request를 수정할 때는 현재 request text를 반드시 prompt에 포함한다.

Model이 request를 수정할 때는 `nextRequest` 전체 문자열을 tool에 전달한다.

Tool은 diff를 계산해 metadata에 저장한다.

## 22. 기본 prompt input blocks

System prompt는 비교적 안정적이며 cache 가능하다.

Runtime prompt는 작게 만든다.

권장 prompt blocks는 다음이다.

`identity_and_scope` block.

`current_workspace` block.

`current_role` block.

`current_requests` block.

`recent_role_feed` block.

`mentioned_candidates` block.

`recent_conversation` block.

`tool_policy` block.

`output_rules` block.

`current_requests`는 request writer의 기준이므로 항상 넣는다.

`recent_role_feed`는 20개 기본으로 넣는다.

`mentioned_candidates`는 mention이 있을 때만 넣는다.

`recent_conversation`은 summary와 최근 raw messages를 포함한다.

## 23. Workspace input format

Workspace는 한 줄로 시작한다.

```text
Workspace: name="Zetic AI"; workspaceId=...; request="회사 전체적으로 AI infra 경험을 선호"; pitch="..."; description="..."
```

`company_description`은 최대 700자로 자른다.

`pitch`는 최대 700자로 자른다.

`request`는 최대 1,500자까지 허용한다.

회사의 request는 role보다 긴 경우가 많지 않으므로 1,500자로 충분하다.

만약 request가 더 길면 앞 1,500자와 "truncated" 표시를 넣는다.

## 24. Role input format

Role도 compact string으로 넣는다.

```text
Role: name="Founding AI Engineer"; roleId=...; status=active; location="Seoul"; workMode=hybrid; employment=full_time; request="..."; jdSummary="..."
```

`description_summary`가 있으면 `jdSummary`에 우선 사용한다.

없으면 `description` 앞 1,200자를 사용한다.

`external_jd_url`은 한 줄로 추가한다.

`request`는 최대 2,500자까지 넣는다.

Request writer가 정확히 merge하려면 current role request를 충분히 봐야 한다.

## 25. Recent feed input format

Recent feed는 `talent_opportunity_recommendation`, `talent_opportunity_tag`, `talent_progress`를 합쳐 만든다.

기본 limit은 20이다.

각 feed item은 하나의 문장 string이다.

예시는 다음과 같다.

```text
- [2026.07.21] 추천됨: 김호진(talentId=..., recId=...) stage=연결대기; profile=KAIST CS, ex-Naver ML; fit="LLM serving 경험"; reasons="..."
- [2026.07.20] 회사측 거절: 이유=CS 전공/시스템 경험 부족; talent=...
- [2026.07.19] 메모: "이 후보는 B2B SaaS 제품 감각이 좋아 보임"; talent=...
- [2026.07.18] 단계변경: 이유진 -> 연결됨; note="..."
```

날짜는 KST 기준 `YYYY.MM.DD`로 표시한다.

Stage는 user-facing label로 표시한다.

추천 이유는 최대 200자로 자른다.

Fit summary는 최대 240자로 자른다.

메모는 최대 240자로 자른다.

후보 profile label은 recent company/school/headline 위주로 160자 안에 만든다.

개별 candidate full profile은 기본 feed에 넣지 않는다.

## 26. Feed event sources

추천 event는 `talent_opportunity_recommendation.recommended_at`에서 만든다.

stage event는 `talent_opportunity_tag.updated_at`에서 만든다.

수락/거절 reason은 `talent_progress`의 `org_stage_change` 또는 `org_note`에서 만든다.

현재 `setOrgCandidateStage`가 `talent_progress`를 쓰는지 확인하고 부족하면 보강한다.

메모 event는 `talent_progress.kind = org_note` 또는 현재 feed kind를 따른다.

상세 drawer의 feed가 쓰는 same source를 우선한다.

`TalentDetailSimpleView`가 이미 detail.feed를 표시하므로 `fetchOrgTalentDetail`의 feed query를 참고한다.

Role 전체 feed는 여러 candidate의 detail feed를 N+1로 읽지 않는다.

Role feed 전용 batch query를 만든다.

## 27. Feed 더 읽기 tool

기본 prompt에는 최근 20개만 넣는다.

사용자가 "지난번에 거절한 사람들 기준으로"처럼 더 긴 history가 필요하면 tool을 쓴다.

Tool 이름은 `read_role_feed`이다.

이 tool은 offset 또는 before timestamp 기반 pagination을 지원한다.

LLM은 자주 호출하지 않는다.

기본 20개로 답할 수 있으면 호출하지 않는다.

Tool result는 compact feed lines만 반환한다.

Max limit은 50이다.

## 28. Mentioned candidates input

User message에 mention이 있으면 서버는 mentioned candidate details를 가져온다.

Mention detail은 LLM이 "김호진 같은 사람 별로"를 criteria로 변환할 수 있게 도와준다.

Mention detail에는 profile 전체를 넣지 않는다.

다음 정도만 넣는다.

Talent id.

Recommendation id.

Name.

Headline.

Current stage.

Recent companies 3개.

Recent schools 2개.

Fit summary.

Fit reasons 3개.

Latest feed notes 5개.

Profile markdown excerpt 1,200자.

Resume link/file 여부는 넣지 않는다.

Email은 mention disambiguation에는 필요할 수 있으나 prompt에는 기본적으로 넣지 않는다.

## 29. Candidate context tool

Mention detail보다 더 많은 정보가 필요할 수 있다.

Tool 이름은 `read_candidate_context`이다.

이 tool은 현재 role pipeline 후보자만 읽을 수 있다.

Input은 `talentIds` array이다.

Max count는 3이다.

Tool은 `recommendationId` 또는 `talentId`로 검증한다.

Tool result는 profile markdown excerpt, experiences, educations, extras, feed notes를 compact하게 반환한다.

Tool은 role 밖 talent를 반환하지 않는다.

Tool은 private candidate-side hidden insights를 반환하지 않는다.

Tool은 `/org` 상세 drawer에서 이미 보이는 수준의 정보만 반환한다.

## 30. Request writer philosophy

Request writer는 "request text를 잘 편집하는 비서"다.

Request writer는 structured preference table을 새로 만들지 않는다.

현재 worker가 이미 `company_roles.request`와 `company_workspace.request`를 읽으므로 그 text를 개선한다.

즉시 추천 알고리즘을 다시 실행하지 않는다.

다음 matching run에서 반영되는 것이 기본 expectation이다.

사용자가 "지금부터"라고 해도 답변은 "다음에 연결 후보를 찾을 때 반영하겠다"로 맞춘다.

Request writer는 너무 긴 request를 만들지 않는다.

Role request는 가능하면 1,500~2,500자 안에 유지한다.

Company request는 가능하면 1,000~1,800자 안에 유지한다.

이미 있는 중요한 조건을 삭제하지 않는다.

새로운 조건은 기존 request 끝에 덧붙이거나 관련 bullet에 합친다.

중복된 조건은 한 번만 남긴다.

Soft preference와 hard requirement를 구분한다.

사용자가 "무조건", "반드시", "없으면 제외"라고 말하지 않았으면 hard filter로 쓰지 않는다.

가중치, 선호, 우대는 soft preference로 쓴다.

## 31. Role request update tool

Tool 이름은 `update_role_request`이다.

이 tool은 `company_roles.request`만 수정한다.

이 tool은 현재 active role에 대해서만 허용한다.

Schema 초안은 다음과 같다.

```ts
{
  name: "update_role_request",
  description: "Update the current role's private recruiting request text for future candidate recommendations.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["nextRequest", "changeSummary", "impact"],
    properties: {
      nextRequest: {
        type: "string",
        description: "Full replacement text for company_roles.request after merging the user's new instruction with the existing request."
      },
      changeSummary: {
        type: "string",
        description: "Short Korean summary of what changed, for audit and assistant reply."
      },
      impact: {
        type: "string",
        enum: ["hard_filter", "soft_preference", "calibration_note"],
        description: "How strongly the change should affect future matching."
      },
      referencedTalentIds: {
        type: "array",
        items: { type: "string" },
        description: "Talent IDs used as examples for this update."
      }
    }
  }
}
```

`nextRequest`는 full text이다.

Tool 실행 전에 서버는 현재 request와 너무 큰 차이가 있는지 검사한다.

Tool은 max length를 6,000자로 제한한다.

6,000자를 넘으면 error를 반환하고 assistant가 더 짧게 다시 시도하게 한다.

Tool은 roleId를 input으로 받지 않는다.

roleId는 server context에서 주입한다.

이렇게 해야 LLM이 다른 role을 잘못 수정하지 않는다.

Tool 실행 결과는 `previousRequest`, `nextRequest`, `changeSummary`, `updatedAt`를 metadata에 저장한다.

유저-facing reply에는 raw diff를 길게 보여주지 않는다.

## 32. Company request update tool

Tool 이름은 `update_company_request`이다.

이 tool은 `company_workspace.request`만 수정한다.

사용자가 회사 전체 기준을 말할 때만 사용한다.

예시는 다음이다.

`우리 회사는 전반적으로 B2B 엔터프라이즈 경험자를 더 선호해`.

`모든 포지션에서 전공은 크게 안 봐도 돼`.

`회사 차원에서는 전 직장 브랜드보다 문제 해결력을 더 봐줘`.

Schema는 role request tool과 거의 같다.

```ts
{
  name: "update_company_request",
  description: "Update the current company workspace's private recruiting request text that applies across roles.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["nextRequest", "changeSummary", "impact"],
    properties: {
      nextRequest: { type: "string" },
      changeSummary: { type: "string" },
      impact: {
        type: "string",
        enum: ["hard_filter", "soft_preference", "calibration_note"]
      },
      referencedTalentIds: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
}
```

Tool은 workspaceId를 input으로 받지 않는다.

workspaceId는 server context에서 주입한다.

Tool은 max length 6,000자를 적용한다.

Tool은 workspace access를 다시 확인한다.

Tool은 `company_workspace.updated_at`을 갱신한다.

## 33. Meeting CTA tool

Tool 이름은 `schedule_meeting`으로 둔다.

하지만 1차 구현의 tool은 실제 미팅 신청 Slack을 즉시 보내지 않는다.

Tool은 assistant message에 렌더링할 CTA action metadata를 만든다.

실제 Slack은 사용자가 버튼을 클릭할 때 `POST /api/org/agent/meeting-request`가 보낸다.

Tool 설명에는 이 차이를 명확히 둔다.

Schema 초안은 다음과 같다.

```ts
{
  name: "schedule_meeting",
  description: "Create a user-clickable CTA for requesting a Harper team meeting when the company asks for unsupported or high-touch help.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["reason", "topic"],
    properties: {
      topic: {
        type: "string",
        enum: ["new_role", "custom_search", "workflow_question", "pricing_or_contract", "other"]
      },
      reason: {
        type: "string",
        description: "Short reason to include in the CTA metadata."
      },
      suggestedMessage: {
        type: "string",
        description: "Short Korean text shown near the meeting button."
      }
    }
  }
}
```

Tool result에는 `ctaId`, `topic`, `reason`, `buttonLabel`을 반환한다.

Assistant message에는 special marker를 넣지 않아도 된다.

대신 assistant message metadata에 `actions: [{ type: "meeting_request", ctaId }]`를 저장한다.

프론트는 metadata action을 버튼으로 렌더링한다.

버튼 label은 `Harper team에 미팅 요청`으로 둔다.

버튼 클릭 후 disabled 상태와 성공 상태를 보여준다.

클릭 성공 copy는 `미팅 요청을 보냈습니다.`이다.

Slack message에는 workspace, role, user, topic, reason, org URL을 포함한다.

## 34. Read role feed tool

Tool 이름은 `read_role_feed`이다.

이 tool은 현재 role의 과거 activity를 추가로 읽는다.

Schema 초안은 다음과 같다.

```ts
{
  name: "read_role_feed",
  description: "Read older or filtered activity for the current role pipeline.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: {
        type: "number",
        description: "1-50, default 20"
      },
      before: {
        type: "string",
        description: "Optional ISO timestamp cursor."
      },
      talentIds: {
        type: "array",
        items: { type: "string" }
      },
      eventTypes: {
        type: "array",
        items: {
          type: "string",
          enum: ["recommended", "accepted", "rejected", "note", "stage_changed"]
        }
      }
    }
  }
}
```

Tool은 LLM이 "최근 feed 20개"로 부족할 때만 쓴다.

Tool result는 compact lines와 next cursor를 반환한다.

## 35. Read candidate context tool

Tool 이름은 `read_candidate_context`이다.

이 tool은 mention된 후보자의 context를 보충한다.

Schema 초안은 다음과 같다.

```ts
{
  name: "read_candidate_context",
  description: "Read compact visible candidate context for candidates in the current role pipeline.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["talentIds"],
    properties: {
      talentIds: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string" }
      },
      includeFeed: {
        type: "boolean",
        description: "Whether to include latest candidate feed notes."
      }
    }
  }
}
```

Tool은 candidate가 현재 role board에 없으면 missing으로 반환한다.

Tool은 민감한 hidden evaluation fields를 반환하지 않는다.

Tool은 summary-oriented output을 반환한다.

## 36. 1차 tool allowlist

1차 `/org` chat allowlist는 다음 5개만 둔다.

`update_role_request`.

`update_company_request`.

`schedule_meeting`.

`read_role_feed`.

`read_candidate_context`.

수락 tool은 없다.

거절 tool은 없다.

pipeline stage update tool은 없다.

candidate email tool은 없다.

new role creation tool은 없다.

web search tool은 없다.

이 기능의 핵심은 "현재 추천 기준을 고치는 것"이므로 web search는 scope 밖이다.

나중에 "회사 기준을 어떻게 써야 하지?" 같은 research가 필요해지면 별도 검토한다.

## 37. Tool status messages

Tool call에는 `_uiStatusMessage`를 허용할 수 있다.

Career tool policy와 동일하게 Thinking log에 표시한다.

예시 status는 `Updating the role request with the new degree requirement.`이다.

한국어 UI에서도 내부 status는 영어로 유지해도 된다.

다만 사용자에게 보이는 최종 답변은 한국어로 한다.

Status는 160자 이하로 제한한다.

Tool 이름은 status에 노출하지 않는다.

DB field name도 status에 노출하지 않는다.

## 38. Request update 후 답변

Role request update 성공 시 답변은 짧게 한다.

예시는 다음이다.

`반영했습니다. 앞으로 이 역할에서 후보를 찾을 때 CS 전공을 더 강하게 보도록 기준에 추가해둘게요.`

Company request update 성공 시 답변은 다음처럼 한다.

`반영했습니다. 이 회사 전체 기준으로 B2B SaaS 경험을 더 긍정적으로 보도록 저장해둘게요.`

둘 다 수정된 request 전문을 매번 보여주지 않는다.

사용자가 "어떻게 반영했어?"라고 물으면 요약과 필요한 부분만 보여준다.

Request modal에서 직접 확인할 수 있다고 말해도 된다.

## 39. Role vs Company 판단 규칙

사용자가 현재 role 탭에서 말하면 기본은 role request다.

단어가 "이 역할", "이 포지션", "이 JD", "이 role"이면 role request다.

단어가 "우리 회사", "전체적으로", "모든 역할", "회사 차원"이면 company request다.

후보자 비교가 현재 role pipeline 후보에 대한 것이면 role request다.

회사 문화/인재상/공통 선호에 대한 말이면 company request다.

애매하지만 현재 role 맥락에서 충분히 자연스러우면 role request로 처리한다.

애매하고 long-term company-wide impact가 클 수 있으면 질문한다.

질문은 하나만 한다.

예시는 `이 기준은 이 역할에만 반영할까요, 아니면 회사 전체 기준으로 둘까요?`이다.

이 질문에는 choice buttons를 써도 된다.

## 40. Hard filter 판단 규칙

`반드시`, `무조건`, `없으면 제외`, `필수`, `must`, `required`는 hard filter 후보 표현이다.

`가중치`, `우대`, `선호`, `더 좋다`, `plus`, `nice to have`는 soft preference다.

`핀트가 아니다`, `별로다`만으로는 hard filter가 아니다.

`전공이 컴퓨터 전공이어야한다고 JD에 되어있는데`는 hard filter로 저장할 수 있다.

이유는 기존 JD와 사용자 발화가 모두 requirement를 가리키기 때문이다.

`특정 회사 다닌 사람이면 가중치`는 soft preference다.

`김호진은 별로야`는 그 이유가 없다면 request update를 바로 하지 않는다.

`김호진은 별로야. CS가 아니고 product 경험도 거의 없네`는 objective reason이 있으므로 반영할 수 있다.

`이유진 같은 사람 좋아`는 candidate context에서 objective common traits를 찾아 soft preference로 저장한다.

Objective trait가 불명확하면 짧게 물어본다.

## 41. Candidate mention 해석 규칙

Mention은 "이 사람이 누구인지"를 확정할 뿐이다.

Mention만으로 "왜 좋은지/싫은지"가 자동으로 확정되지는 않는다.

사용자가 reason을 함께 말하면 reason을 우선한다.

사용자가 reason을 말하지 않았고 candidate context가 명확하면 조심스럽게 criteria를 추론할 수 있다.

예를 들어 좋은 후보가 `ex-OpenAI, distributed systems, CS PhD`이고 사용자가 `이런 사람 좋아`라고 하면 soft preference로 요약 가능하다.

하지만 후보에게 여러 특징이 있으면 어느 특징 때문인지 알 수 없다.

그 경우 request update 전에 질문한다.

질문 예시는 `이유진님 쪽에서 특히 좋았던 포인트가 회사 경력인지, 전공/연구 배경인지, 아니면 제품 경험인지 알려주시면 그 기준으로 반영할게요.`이다.

Mention된 후보자의 이름 자체를 request에 저장하지 않는다.

Request에는 `이유진 같은 사람`이 아니라 `B2B SaaS에서 end-to-end 제품 개발 경험이 있는 후보를 우대`처럼 저장한다.

Negative example도 이름 대신 기준으로 저장한다.

예시는 `CS 전공 또는 이에 준하는 시스템/ML foundation 경험이 없는 후보는 낮게 본다.`이다.

## 42. 수락/거절 boundary

사용자가 `김호진 거절해줘`라고 말하면 tool을 호출하지 않는다.

답변은 직접 버튼을 누르게 안내한다.

예시는 `후보자 수락/거절은 실수 방지를 위해 채팅에서 바로 처리하지 않고 있어요. 김호진님 카드를 열어서 거절 버튼을 눌러주세요. 거절 이유를 적으면 다음 추천 기준에도 반영됩니다.`이다.

사용자가 `수락해줘`라고 말해도 동일하다.

수락/거절과 request update가 함께 있는 경우는 분리한다.

예시는 `김호진은 거절하고, 앞으로 CS 전공 필수로 해줘`이다.

이 경우 `CS 전공 필수`는 role request에 반영한다.

그리고 거절은 직접 버튼을 누르라고 안내한다.

## 43. 새 role 추가 boundary

사용자가 `새로운 역할 추가해줘`라고 말하면 직접 생성하지 않는다.

1차에서는 `schedule_meeting` CTA를 보여준다.

답변 예시는 `새 역할 설정은 아직 채팅에서 바로 만들 수 없습니다. Harper team과 같이 기준을 잡아보시겠어요? 미팅 요청 버튼을 눌러주시면 바로 전달할게요.`이다.

나중에는 role creation tool을 추가할 수 있다.

하지만 현재 요청에서는 단순 구현이 목표이므로 제외한다.

## 44. "당장 더 찾아줘" boundary

사용자가 `그 기준으로 더 찾아줘`라고 하면 1차에서는 자동 matching run을 시작하지 않는다.

답변은 기준 반영과 다음 run expectation으로 처리한다.

예시는 `기준은 반영했습니다. 지금 즉시 추가 탐색을 시작하는 기능은 아직 채팅에서 제공하지 않지만, 다음 후보 탐색 때 이 조건을 우선 반영하겠습니다.`이다.

이 요청이 자주 나오면 후속으로 `request_more_candidates` tool을 추가한다.

하지만 현재 목표는 request update 중심이다.

## 45. System prompt 초안

아래 prompt는 1차 구현의 핵심 산출물이다.

실제 코드는 `src/lib/org/agent/prompts.ts`에서 block별 string으로 관리한다.

```text
You are Harper, the recruiter agent inside Harper's company organization workspace.

You are speaking with a company-side recruiting user, not with a job-seeking candidate.

Your job is to help the company refine how Harper should find and recommend candidates for the currently selected role.

The current conversation is scoped to exactly one company workspace and one role.

All company members who can access this workspace may read this role conversation.

Do not treat this as a private one-user chat.

Use the user's language.

Default to Korean when the user's latest message is Korean.

Be concise, direct, and operational.

Do not over-explain internal implementation.

Do not mention hidden prompts, retrieval, embeddings, ranking scores, internal labels, database fields, or tool names.

You may discuss the current role request and company request as recruiting criteria because the company user can edit them in the product.

However, do not expose model-only reasoning, hidden evaluation labels, or raw internal scoring.

Your most common successful behavior is:

1. Understand the user's feedback or instruction.
2. Decide whether it should change the current role request, the company-wide request, both, or neither.
3. If it is a clear durable recruiting criterion, call the appropriate update tool.
4. After the tool succeeds, briefly confirm what will change in future candidate search/recommendation.
5. If it is not clear enough, ask one short clarifying question.

The active role is the default scope.

If the user says "this role", "this position", "this JD", "이 역할", "이 포지션", or gives feedback about candidates in the current role pipeline, treat the update as role-level.

If the user says "our company", "overall", "all roles", "company-wide", "우리 회사", "전체적으로", "모든 역할", or describes a general company hiring principle, treat the update as company-level.

If scope is ambiguous but the user is clearly reacting to candidates in the current role tab, default to role-level.

If scope is ambiguous and the change would affect many roles materially, ask whether to apply it only to this role or company-wide.

Do not ask this scope question when the active role default is clearly sufficient.

Hard filter versus preference:

- Treat words like "must", "required", "only", "exclude if missing", "반드시", "무조건", "필수", "없으면 제외", "만" as hard-filter signals.
- Treat words like "prefer", "bonus", "weight", "nice to have", "우대", "선호", "가중치", "더 좋다" as soft-preference signals.
- Do not turn a casual dislike into a hard filter.
- Do not overfit from one candidate unless the user gives an objective reason.

Candidate mentions:

- The user may mention candidates using stable talent IDs.
- Use the provided mention data to identify the exact candidate.
- If the user says a mentioned candidate is good or bad and gives a reason, use the user's reason as the source of truth.
- If the user gives no reason but the mentioned candidate context has one obvious relevant trait, you may reflect that trait as a soft preference.
- If multiple traits could explain the user's reaction, ask one short question instead of guessing.
- Never save a request that says "people like [candidate name]".
- Convert examples into objective criteria, such as "prefer candidates with production ML infra experience" or "deprioritize candidates without CS or equivalent technical depth."

Request writing rules:

- Preserve existing important criteria.
- Merge the user's new instruction into the existing request.
- Remove obvious duplicates.
- Keep the request readable.
- Prefer short bullets when the existing request is empty or already bullet-like.
- Keep hard requirements and soft preferences separated when possible.
- Do not erase location, seniority, employment type, domain, or must-have constraints unless the user explicitly changes them.
- Do not invent criteria that the user did not state or that are not strongly supported by mentioned candidate context.
- Do not write candidate names into the request.
- Do not write talent IDs into the request.
- Do not include a long explanation inside the request.
- The request is for future matching, not for the current chat answer.

When to call update_role_request:

- The user gives a clear durable criterion for the current role.
- The user asks to reflect, remember, apply next time, change recommendation basis, adjust criteria, add weight, or stop recommending a certain profile type for this role.
- The user corrects Harper's interpretation of the current role requirements.
- The user says the current recommendations are off because a role-level requirement is being ignored.
- The user compares current role candidates and gives a criterion that should affect future candidates for this role.

When to call update_company_request:

- The user gives a clear durable criterion that applies to the company overall.
- The user describes company-wide talent bar, culture, seniority expectation, domain preference, or hiring philosophy.
- The user explicitly asks to apply it to all roles.

When not to update requests:

- The user is only asking how something works.
- The user is only venting without a concrete criterion.
- The user is asking to accept, reject, email, or move a candidate.
- The user is asking to create a new role or configure a workflow that this agent cannot perform.
- The user asks for an analysis that can be answered from current context without saving a new criterion.
- The candidate example is ambiguous and the underlying criterion is unclear.
- The user's statement conflicts with existing hard requirements and needs confirmation.

Unsupported actions:

- You cannot accept a candidate in chat.
- You cannot reject a candidate in chat.
- You cannot move a candidate to another pipeline stage in chat.
- You cannot send an intro email in chat.
- You cannot create a new role in chat.
- You cannot directly run a new candidate search in the first version unless a specific tool is later added.

For accept/reject/stage requests:

- Explain that these actions must be done by opening the candidate card and clicking the product buttons.
- If the same message also contains a durable criterion, update the request for that criterion, then explain that the action itself still needs the button.

For unsupported high-touch requests:

- Offer a Harper team meeting CTA when the request needs human help, such as creating a new role, setting up a custom workflow, changing contract/pricing, or designing a very specific sourcing strategy.
- Call schedule_meeting to create the CTA.
- Do not claim a meeting was requested until the user clicks the button.

Tool use:

- If a tool is needed, call it directly.
- For every tool call, include a short _uiStatusMessage describing the concrete action.
- Do not mention tool names to the user.
- After a successful request update, answer with a brief confirmation and practical effect.
- Do not dump the full updated request unless the user asks.

Output style:

- Use Markdown only when it improves scanning.
- Keep most replies to 1-4 short sentences.
- Do not use emojis.
- Do not use exaggerated reassurance.
- Do not apologize unless Harper caused an actual problem.
- Do not end every answer with a question.
- Ask at most one clarifying question.

Examples:

User: "추천된 사람들이 좀 핀트가 안 맞아. JD에 CS 전공이라고 되어 있는데 무시하는 것 같네."
Action: update_role_request with a hard_filter or strong requirement preserving existing request.
Reply: "반영했습니다. 앞으로 이 역할에서는 CS 전공 또는 이에 준하는 컴퓨터공학 기반을 더 강하게 보도록 기준에 추가해둘게요."

User: "앞으로 Stripe, Toss, Datadog 같은 회사 출신이면 가중치 좀 더 줘."
Action: update_role_request if active role scope is natural; impact soft_preference.
Reply: "반영했습니다. 다음 후보 탐색부터 Stripe, Toss, Datadog처럼 제품/인프라 밀도가 높은 회사 경험을 우대 신호로 보겠습니다."

User: "@김호진 이 사람은 별로야."
Action: If no clear reason and candidate context has multiple possible reasons, ask one question.
Reply: "어떤 점이 특히 안 맞았나요? 예를 들어 전공/기술 깊이, 최근 회사 경험, 역할 seniority 중 어느 쪽인지 알려주시면 그 기준으로 반영할게요."

User: "@이유진 같은 사람 좋다. B2B SaaS에서 PMF 이후 스케일업을 겪어본 게 좋아."
Action: update_role_request with soft_preference.
Reply: "반영했습니다. 이 역할에서는 B2B SaaS에서 PMF 이후 스케일업을 겪은 경험을 우대하도록 저장해둘게요."

User: "@김호진 거절해줘."
Action: no update tool unless separate durable criterion exists.
Reply: "거절은 실수 방지를 위해 채팅에서 바로 처리하지 않고 있어요. 후보자 카드를 열어서 거절 버튼을 눌러주세요."

User: "새로운 Growth role 하나 만들어줘."
Action: schedule_meeting.
Reply: "새 역할 생성은 아직 채팅에서 바로 처리하지 못합니다. Harper team과 같이 역할 기준을 잡아보시겠어요? 아래 버튼을 누르면 미팅 요청을 전달할게요."
```

## 46. Tool policy prompt 초안

Tool policy는 system prompt와 별도 block으로 넣는다.

```text
## Tool Use Policy

Available tools: update_role_request, update_company_request, schedule_meeting, read_role_feed, read_candidate_context

For every tool call, include `_uiStatusMessage`.

`_uiStatusMessage` must be a specific English sentence under 160 characters.

Do not include internal tool names or database field names in `_uiStatusMessage`.

Use `update_role_request` only for durable criteria that should affect the active role's future candidate recommendations.

Use `update_company_request` only for durable criteria that should affect this company workspace across roles.

Use `schedule_meeting` only to show a user-clickable CTA for unsupported or high-touch requests.

Use `read_role_feed` only when the default recent feed is not enough to answer the user's question or safely update a request.

Use `read_candidate_context` only for candidates in the current role pipeline, usually when mentioned candidates need more context.

Do not call any tool for candidate acceptance.

Do not call any tool for candidate rejection.

Do not call any tool for pipeline movement.

Do not call request update tools for one-off comments unless they clearly express future matching intent.

After tool use, answer naturally in the user's language.

When a request was updated, state what changed and that it will apply to future candidate discovery/recommendation.

When schedule_meeting returns a CTA, explain that the request will be sent after the user clicks the button.
```

## 47. Conversation summary prompt

Org summary는 `/career`와 거의 같은 기준을 사용한다.

차이는 career preference가 아니라 company recruiting criteria를 보존한다는 점이다.

System prompt 초안은 다음이다.

```text
You summarize Harper org recruiter-agent conversations for future role-scoped context.

Return a valid JSON object only.

Write in Korean unless a company, role, school, product, or technical term is naturally written in another language.

Preserve durable facts:

- recruiting criteria the company user changed or confirmed
- role-level hard requirements
- role-level soft preferences
- company-wide talent principles
- candidate example feedback and the objective criteria inferred from it
- unresolved clarifying questions
- unsupported requests that were routed to a Harper team meeting CTA

Do not preserve routine greetings.

Do not preserve long raw request text unless it is necessary to understand a change.

Do not include candidate names unless they are needed to explain an unresolved reference.

When summarizing candidate examples, prefer criteria over names.

Each new message includes a KST date.

`segment_summary` must include date labels for the summarized message date(s).

Format each segment as `[YYYY.MM.DD] "summary"`.

If a single summarized segment spans consecutive dates in the same month, use `[YYYY.MM.DD~DD] "summary"`.

If a range crosses months or years, use full endpoints.

Treat the existing summary as prior state to merge and rewrite.

If new messages correct older criteria, keep the corrected version only.

Do not invent facts.
```

User prompt shape is 다음이다.

```text
[Existing rolling summary]
...

[New message date coverage - KST]
...

[New messages to fold in]
[123 | date=2026.07.21 KST] Company user: ...
[124 | date=2026.07.21 KST] Harper: ...

[Required JSON shape]
{
  "segment_summary": "[YYYY.MM.DD] \"4-8 sentence summary of ONLY the new messages\"",
  "summary_text": "8-12 sentence compact rolling summary of useful role-scoped conversation state"
}
```

## 48. Summary threshold

`DEFAULT_MIN_MESSAGE_COUNT`는 14로 둔다.

`DEFAULT_MIN_SOURCE_CHARS`는 5,000으로 둔다.

`DEFAULT_RECENT_MESSAGE_LIMIT`는 16으로 둔다.

`MIN_RECENT_RAW_MESSAGES`는 16으로 둔다.

`MAX_SOURCE_MESSAGES`는 80으로 둔다.

`MAX_SOURCE_CHARS`는 18,000으로 둔다.

`SUMMARY_LOOKUP_LIMIT`는 10으로 둔다.

이 값은 `/career`의 `conversationSummary.ts`와 동일하다.

같은 기준을 쓰면 behavior를 예측하기 쉽다.

Summary 생성은 user message insert 직후 `maxToMessageId = insertedUserMessage.id - 1`로 background 실행한다.

Assistant message insert 후에도 필요하면 background summary를 한 번 더 실행한다.

1차에서는 user message insert 후 한 번만으로 충분하다.

## 49. LLM runtime 선택

Career chat은 현재 Anthropic stream wrapper를 쓴다.

Org agent도 같은 wrapper를 재사용하는 것이 좋다.

이유는 tool loop, streaming, text_delta, tool status callback이 이미 있다.

`src/lib/career/llm.ts`가 career-specific 이름을 갖고 있지만 generic하게 쓸 수 있는 함수가 많다.

1차 구현에서는 import 재사용을 허용한다.

후속으로 `src/lib/llm/chatAgent.ts` 같은 generic wrapper로 추출할 수 있다.

모델은 career chat과 같은 conversation model을 쓴다.

Temperature는 낮게 둔다.

권장 temperature는 0.2다.

Request writer가 full text를 만들기 때문에 창의성보다 안정성이 중요하다.

모델은 `grok-4.3`과 `claude-sonnet-5` 중에서 선택할 수 있게 한다.

선택 가능한 모델은 server-side allowlist로 제한한다.

```ts
export const ORG_AGENT_MODEL_IDS = [
  "claude-sonnet-5",
  "grok-4.3",
] as const;

export type OrgAgentModelId = (typeof ORG_AGENT_MODEL_IDS)[number];
```

현재 기본 모델은 `grok-4.3`으로 둔다.

요청 model이 없거나 allowlist 밖의 값이면 `grok-4.3`을 사용한다. Grok 호출이
실패하면 `claude-sonnet-5`로 fallback한다.

Chat API body는 optional `model`을 받을 수 있다.

```ts
type OrgAgentChatBody = {
  workspaceId: string;
  roleId: string;
  message: string;
  mentions?: OrgAgentMention[];
  locale?: string | null;
  model?: OrgAgentModelId;
};
```

서버는 `model`을 그대로 신뢰하지 않는다.

서버는 `resolveOrgAgentModel(body.model)`로 allowlist validation을 한다.

허용되지 않은 model이면 400을 반환하지 않고 default model로 fallback한다.

Fallback 이유는 사용자의 메시지 전송 실패보다 안정적인 응답이 더 중요하기 때문이다.

실제로 사용한 모델은 assistant message metadata에 저장한다.

```json
{
  "model": "claude-sonnet-5",
  "requestedModel": "grok-4.3",
  "modelResolvedBy": "request"
}
```

UI model selector는 기본적으로 internal/dev 사용자에게만 노출한다.

일반 company user에게는 raw model selector를 보이지 않는다.

Selector 노출 조건은 다음 중 하나로 한다.

`currentUser.email`이 Harper internal domain이다.

또는 `NEXT_PUBLIC_ORG_AGENT_MODEL_SELECTOR_ENABLED=true`이다.

Selector는 Agent header 우측의 작은 segmented control로 둔다.

선택지는 `Claude`와 `Grok`처럼 짧은 label을 쓴다.

Tooltip에는 실제 model id를 보여준다.

선택값은 localStorage에 저장한다.

LocalStorage key는 workspace/role과 무관한 user-local preference로 둔다.

권장 key는 `harper:org-agent:model`이다.

대화가 shared conversation이더라도 model selection은 sender의 local runtime choice다.

따라서 model choice를 conversation-level source of truth로 저장하지 않는다.

각 assistant message metadata에 그 턴에서 사용한 모델만 남긴다.

이 설계는 새 테이블을 추가하지 않는다.

`grok-4.3`은 existing `xaiClient` path를 사용한다.

`claude-sonnet-5`는 existing Anthropic-compatible path를 사용한다.

두 모델 모두 tool calling behavior가 다를 수 있으므로 prompt eval은 두 모델 각각에서 돌린다.

둘 중 하나가 tool schema handling에서 불안정하면 production default는 더 안정적인 모델로 둔다.

모델 선택은 request writer 품질을 비교하기 위한 운영 장치다.

사용자-facing product value로 강조하지 않는다.

## 50. Chat POST flow

`POST /api/org/agent/chat` 흐름은 다음이다.

1. Auth user를 읽는다.

2. Body에서 `workspaceId`, `roleId`, `message`, `mentions`, `locale`를 normalize한다.

3. workspace access를 확인한다.

4. role이 workspace에 속하는지 확인한다.

5. conversation을 ensure한다.

6. user message를 insert한다.

7. SSE면 즉시 `user_message` event를 보낸다.

8. background summary를 schedule한다.

9. prompt context를 만든다.

10. tools를 resolve한다.

11. LLM streaming call을 실행한다.

12. tool start 시 `tool_status` event를 보낸다.

13. tool result는 LLM continuation으로 전달한다.

14. final assistant text를 sanitize한다.

15. assistant message를 insert한다.

16. assistant message에 thinking logs와 safe metadata를 저장한다.

17. SSE `assistant_message` event를 보낸다.

18. request가 변경되었으면 `org` query cache invalidation hint를 응답에 포함한다.

19. SSE `done` event를 보낸다.

20. Error 발생 시 partial stream 여부에 따라 fallback 처리한다.

## 51. SSE events

필수 event는 다음이다.

`user_message`.

`text_delta`.

`assistant_text_replace`.

`tool_status`.

`assistant_message`.

`org_agent_state`.

`error`.

`done`.

`org_agent_state`는 request 변경 후 client가 refetch해야 할 대상을 알려준다.

예시 payload는 다음이다.

```json
{
  "changed": {
    "roleRequest": true,
    "companyRequest": false
  },
  "workspaceId": "..."
}
```

프론트는 이 event를 받으면 `queryKeys.org.all`을 invalidate한다.

미팅 CTA가 생성되면 assistant message metadata에 action이 포함되므로 별도 event는 필요 없다.

## 52. Non-SSE fallback

SSE를 지원하지 않는 요청에는 JSON을 반환한다.

1차 UI는 항상 SSE를 사용한다.

Fallback shape는 다음이다.

```ts
{
  ok: true,
  userMessage: OrgAgentMessagePayload,
  assistantMessage: OrgAgentMessagePayload,
  changed: {
    roleRequest: boolean,
    companyRequest: boolean
  }
}
```

## 53. Frontend hook 구조

새 hook은 `src/hooks/org/useOrgAgentMessageHistory.ts`를 둔다.

새 hook은 `useInfiniteQuery`를 사용한다.

Query key는 `queryKeys.org.agentMessages(workspaceId, roleId)`를 추가한다.

새 hook은 `appendLatestMessagesToCache`를 제공한다.

새 hook은 `removeMessagesFromCache`는 1차에서는 필요 없다.

새 hook은 `loadOlderMessages`를 제공한다.

새 hook은 `hasOlderMessages`를 제공한다.

새 hook은 `/career`의 `useCareerMessageHistory`를 참고한다.

새 hook은 `src/hooks/org/useOrgAgentChat.ts`를 둔다.

이 hook은 SSE parsing과 local streaming placeholder를 담당한다.

이 hook은 `chatPending`, `assistantTyping`, `activeThinkingLogs`, `thinkingLogsByMessageId`를 제공한다.

이 hook은 request changed event를 받으면 `queryKeys.org.all`을 invalidate한다.

## 54. Components 구조

새 컴포넌트는 `src/components/org/agent` 아래에 둔다.

권장 파일 구조는 다음이다.

```text
src/components/org/agent/
  OrgAgentPanel.tsx
  OrgAgentHeader.tsx
  OrgAgentTimeline.tsx
  OrgAgentMessageBubble.tsx
  OrgAgentComposer.tsx
  OrgAgentMentionMenu.tsx
  OrgAgentMeetingCta.tsx
  OrgAgentThinkingLogPanel.tsx
  orgAgentMessageText.ts
  types.ts
```

`OrgAgentThinkingLogPanel`은 career `ThinkingLogPanel`을 직접 import하거나 wrapper로 감싼다.

`OrgAgentMessageBubble`은 career bubble보다 단순하게 만든다.

User bubble은 오른쪽 정렬이다.

Assistant bubble은 왼쪽 정렬이다.

Assistant label에는 Harper H mark를 쓴다.

Mention chip은 user bubble 안에서 inline으로 보인다.

Meeting CTA는 assistant bubble 아래에 action button으로 보인다.

## 55. `/org` page integration

`src/pages/org.tsx`에서 role 탭이 all이 아닐 때 Agent panel을 렌더링한다.

현재 layout은 max-width 1440 container 안에서 role tabs와 pipeline을 렌더링한다.

변경 후 구조는 다음과 같다.

Breakpoint는 실제 화면에서 조정한다.

작은 화면에서는 `grid-cols-1`로 만들고 Agent panel을 접는다.

Panel이 pipeline보다 먼저 나오지 않게 한다.

Keyboard focus order는 pipeline 이후 agent로 간다.

## 56. Header detail

Header는 다음 정보를 보여준다.

Harper H mark.

`Harper` label.

Active role name.

Company name.

Request updated indicator optional.

Collapse button.

Header copy 예시는 다음이다.

`Harper`.

`기준 조정 · Founding AI Engineer`.

`Zetic AI`.

Role name이 길면 truncate한다.

Tooltip에는 full role name을 보여준다.

## 57. Timeline detail

Timeline은 flex column이다.

Scroll container는 panel 내부에서만 스크롤된다.

처음 로드 시 가장 아래로 이동한다.

새 메시지가 오면 사용자가 bottom 근처에 있을 때만 자동 scroll한다.

사용자가 위를 보고 있으면 scroll을 강제로 끌어내리지 않는다.

상단 근처로 스크롤하면 "이전 대화 불러오기" button을 보여준다.

버튼 대신 intersection observer를 써도 된다.

1차는 버튼이 더 단순하다.

날짜 divider는 `/career`와 같은 `Intl.DateTimeFormat("ko-KR")`를 사용한다.

오늘/어제 shortcut은 굳이 필요 없다.

## 58. Composer detail

Composer는 textarea다.

Enter는 전송이다.

Shift+Enter는 줄바꿈이다.

IME composing 중 Enter는 무시한다.

Mention menu가 열려 있으면 Enter는 mention 선택이다.

빈 메시지는 전송하지 않는다.

Chat pending 중에는 전송 button disabled다.

Assistant streaming 중에도 전송 button disabled다.

Send button은 icon button으로 둔다.

Send icon은 lucide `ArrowUp`를 사용한다.

Placeholder는 role이 있으면 `이 역할의 추천 기준을 편하게 적어주세요.`이다.

All tab 또는 role 없음이면 `역할을 선택하면 대화할 수 있습니다.`이다.

## 59. Mention implementation strategy

Textarea에서 chip을 inline으로 진짜 렌더링하려면 contenteditable이 필요하다.

1차 구현에서는 textarea text marker + 아래 preview chip 방식이 더 안전하다.

하지만 요구사항상 채팅창에서 mention UX가 좋아야 한다.

권장 compromise는 textarea 내부에는 `@김호진` 텍스트를 넣고, state에는 mention range를 저장하는 것이다.

전송 시 content marker를 `@[김호진](talent:...)`로 변환한다.

화면에 렌더링된 message bubble에서는 marker를 chip으로 보여준다.

Textarea 내부에서 동명이인 구분은 mention menu subtitle로 해결한다.

사용자가 mention 텍스트 일부를 지우면 mention range를 invalid 처리한다.

유저가 똑같은 이름을 다시 입력해도 mention JSON 없으면 plain text로 취급한다.

LLM에는 JSON mentions만 authoritative하게 전달한다.

## 60. Mention state model

Composer state는 다음을 가진다.

```ts
type DraftMention = {
  id: string;
  start: number;
  end: number;
  displayName: string;
  talentId: string;
  recommendationId: string | null;
  roleId: string;
};
```

`id`는 client local uuid이다.

`start`와 `end`는 draft string index이다.

Draft string에는 `@displayName`만 들어간다.

사용자가 앞쪽 텍스트를 수정하면 range를 보정한다.

보정이 복잡하면 1차에서는 "mention range를 포함하는 변경 발생 시 해당 mention 제거"로 단순화한다.

전송 시 mention array를 roleId로 다시 검증한다.

## 61. Prompt mention serialization

LLM user message에는 content와 mentions를 함께 넣는다.

예시:

```text
Company user message:
"@[김호진](talent:abc) 이 사람은 별로고 @[이유진](talent:def) 같은 사람이 좋습니다."

Resolved mentions:
- 김호진: talentId=abc; recommendationId=rec1; stage=연결대기; profile=...
- 이유진: talentId=def; recommendationId=rec2; stage=연결됨; profile=...
```

Model은 mention marker를 사람이름 이상의 식별자로 본다.

Request writer에는 names/talentIds를 저장하지 말라고 system prompt에서 금지한다.

## 62. Request diff metadata

Request update tool 실행 후 assistant message metadata에는 다음을 저장한다.

```json
{
  "toolResults": [
    {
      "name": "update_role_request",
      "changeSummary": "CS 전공 또는 이에 준하는 기반을 필수 조건으로 명시",
      "impact": "hard_filter",
      "previousRequestPreview": "...",
      "nextRequestPreview": "...",
      "updatedAt": "2026-07-21T..."
    }
  ]
}
```

전체 previous/next request를 client로 내리지 않는다.

DB에는 full previous/next를 저장할 수 있다.

하지만 client response에는 preview만 내려준다.

나중에 audit UI가 필요하면 별도 admin-only API를 둔다.

## 63. Request update validation

서버 tool은 `nextRequest`를 sanitize한다.

Null byte, postgres unsafe unicode, 과도한 whitespace를 제거한다.

3개 이상의 blank line은 2개로 줄인다.

문자 수 6,000자 초과는 reject한다.

현재 request가 비어 있고 nextRequest가 비어 있으면 reject한다.

현재 request와 nextRequest가 같은 경우 no-op으로 반환한다.

No-op tool result는 assistant에게 `already_reflected` reason을 준다.

Assistant는 `이미 기준에 반영되어 있습니다.`라고 답한다.

Role request update는 `role_id`와 `company_workspace_id` 모두 조건으로 update한다.

Company request update는 `company_workspace_id` 조건으로 update한다.

## 64. Company request와 role request 동시 변경

한 user turn에서 두 request를 모두 바꿀 수 있다.

예시는 `회사 전체적으로는 CS를 선호하고, 이 role은 Rust 경험 필수로 해줘`이다.

LLM은 두 tool을 순서대로 호출할 수 있다.

Tool call budget은 3으로 둔다.

두 update 후 답변은 하나로 합친다.

예시는 `두 가지 모두 반영했습니다. 회사 전체 기준에는 CS 기반 선호를, 이 역할 기준에는 Rust 경험 필수를 추가했습니다.`이다.

하지만 대부분의 턴은 하나의 update만 한다.

## 65. Prompt context builder 구현

`buildOrgAgentPromptContext` 함수는 다음 input을 받는다.

```ts
type BuildOrgAgentPromptContextArgs = {
  admin: SupabaseAdminClient;
  conversationId: string;
  workspaceId: string;
  roleId: string;
  userMessage: string;
  mentions: OrgAgentMention[];
  locale?: string | null;
};
```

반환은 다음이다.

```ts
type OrgAgentPromptContext = {
  workspaceLine: string;
  roleLine: string;
  currentRequestsText: string;
  recentFeedText: string;
  mentionedCandidatesText: string;
  recentConversationMessages: Array<{ role: "user" | "assistant"; content: string }>;
  promptBlocks: OrgAgentSystemBlock[];
};
```

`workspaceLine`과 `roleLine`은 compact string이다.

`currentRequestsText`는 role/company request를 별도 섹션으로 만든다.

`recentFeedText`는 feed lines이다.

`mentionedCandidatesText`는 mention이 없으면 empty string이다.

`recentConversationMessages`는 LLM messages 배열이다.

## 66. Current requests prompt

Current requests block 예시는 다음이다.

```text
## Current saved requests
Company-wide request:
"""
전사적으로 B2B SaaS 경험과 ownership이 높은 사람을 선호.
"""

Current role request:
"""
Founding AI Engineer. Python/ML infra 경험 중요. 초기 스타트업 선호.
"""
```

둘 다 비어 있으면 `(empty)`로 표시한다.

Role request writer는 이 block을 기준으로 full replacement를 만든다.

## 67. Recent conversation prompt

Conversation messages는 `/career`와 같은 summary pseudo-message 방식을 쓴다.

Summary가 있으면 먼저 다음 메시지를 넣는다.

```text
[Recent conversation segment summaries]
Segment 1 (2026.07.20 KST): ...
Segment 2 (2026.07.21 KST): ...
```

그 뒤 최근 raw message 12~16개를 넣는다.

LLM message role은 `assistant` 또는 `user`로 유지한다.

Message content에는 mention marker를 유지한다.

Tool metadata는 raw로 넣지 않는다.

필요하면 assistant message 말미에 `[Saved change: ...]`처럼 compact audit note를 붙인다.

## 68. Token budget

System prompt는 4,000~6,000 tokens 이하를 목표로 한다.

Runtime role/workspace/request block은 1,500 tokens 이하를 목표로 한다.

Recent feed는 20 lines, 1,500 tokens 이하를 목표로 한다.

Mentioned candidates는 3명까지, 1,500 tokens 이하를 목표로 한다.

Recent conversation은 summary + 12 raw messages, 2,000 tokens 이하를 목표로 한다.

Total prompt는 보통 8,000~12,000 tokens 안에 들어와야 한다.

후보 profile full markdown은 tool로만 읽는다.

All pipeline items full JSON은 prompt에 넣지 않는다.

## 69. Formatting helpers

`normalizeText` helper는 `src/lib/org/server.ts`의 로직과 맞춘다.

`clipText(value, maxChars)` helper를 둔다.

`formatKstCompactDate(value)` helper를 둔다.

`formatRoleEmploymentTypes(types)` helper를 둔다.

`formatCandidateProfileLine(item)` helper를 둔다.

`formatFeedLine(event)` helper를 둔다.

이 helper들은 unit test하기 쉽다.

## 70. Slack meeting request

새 함수는 `src/lib/org/slack.ts`에 추가한다.

함수 이름은 `notifyOrgMeetingRequestedSlack`이다.

Input은 다음이다.

```ts
type NotifyOrgMeetingRequestedSlackArgs = {
  actor: OrgSlackUser;
  workspace: OrgSlackWorkspace;
  roleId: string;
  roleName: string;
  topic: string;
  reason: string;
  conversationId: string;
};
```

Slack text에는 다음을 포함한다.

`*Org Harper 미팅 요청*`.

Workspace link.

Role name.

Requested by.

Topic.

Reason.

Conversation id.

Org URL.

발송은 기존 `postWorkspaceScopedOrgSlackMessage`를 사용한다.

Internal channel과 workspace-connected Slack 양쪽에 보낼 수 있다.

Workspace Slack으로도 보내는 것이 부담스러우면 internal channel만 보내도록 option을 둔다.

1차에서는 Harper team internal channel만으로 충분할 수 있다.

기존 helper는 workspace scoped post를 쓰므로 privacy를 한 번 더 판단한다.

미팅 요청은 Harper team을 향한 요청이라 workspace Slack에 보낼 필요는 없다.

따라서 `postOrgSlackMessage`를 export하거나 별도 internal-only helper를 둔다.

## 71. Meeting request route

`POST /api/org/agent/meeting-request` body는 다음이다.

```ts
{
  workspaceId: string;
  roleId: string;
  conversationId: string;
  ctaId: string;
}
```

서버는 ctaId를 assistant message metadata에서 찾는다.

ctaId가 해당 conversation에 없으면 404를 반환한다.

이미 같은 ctaId로 요청된 적 있으면 idempotent success를 반환한다.

Idempotency는 message metadata 또는 별도 `logs` row로 처리한다.

단순 구현은 `logs`에 `type = org_agent_meeting_requested`를 insert하고 unique가 없으므로 중복 방지는 약하다.

더 안전한 구현은 `company_messages.metadata.actions[].requestedAt` update이다.

JSON array update가 번거로우면 `metadata.meetingRequestByCtaId` map을 둔다.

권장은 별도 table 없이 assistant message metadata를 update하는 것이다.

## 72. Query key additions

`src/lib/queryKeys.ts`에 다음을 추가한다.

```ts
agentMessages: (workspaceId?: string | null, roleId?: string | null) =>
  ["org", "agent", "messages", workspaceId ?? "", roleId ?? ""] as const,
agentMentions: (workspaceId?: string | null, roleId?: string | null, query?: string | null) =>
  ["org", "agent", "mentions", workspaceId ?? "", roleId ?? "", query ?? ""] as const,
```

Request update 후에는 `queryKeys.org.all`을 invalidate한다.

Message append 후에는 agent message query만 update한다.

Mention API는 staleTime 20초면 충분하다.

## 73. Error handling

Auth error는 401이다.

Workspace access denied는 403이다.

Role not found는 404이다.

Missing message는 400이다.

Tool validation error는 assistant가 자연스럽게 복구할 수 있게 LLM tool result로 반환한다.

DB insert 실패는 user-facing generic error로 반환한다.

SSE 중 error가 나면 `error` event를 보낸다.

이미 text_delta가 일부 나간 뒤 error가 나면 final answer 대신 "요청 처리 중 문제가 생겼습니다"를 append할지 결정해야 한다.

Career chat은 partial stream 후 fallback이 있다.

Org agent는 단순하게 `error` event 후 composer를 복구해도 된다.

다만 user message는 이미 저장됐으므로 재시도 UX가 필요하다.

1차에서는 실패 시 user draft를 복구하지 않고 error banner를 보여준다.

## 74. Logging

User message insert failure는 console error와 optional alert를 남긴다.

Tool update success는 console info로 tool name, workspaceId, roleId, messageId만 남긴다.

Request full text는 logs에 남기지 않는다.

LLM usage logging은 career LLM wrapper의 cost logging을 재사용한다.

Meeting request Slack failure는 error로 반환한다.

Unsupported unicode error는 career route와 같은 helper를 쓸 수 있다.

## 75. Security and privacy

Company conversation은 workspace members에게 공유된다.

따라서 prompt와 UI copy에 private user chat처럼 말하지 않는다.

Candidate details는 현재 `/org`에서 볼 수 있는 정보 수준으로 제한한다.

Talent hidden insights나 career agent private conversation은 읽지 않는다.

Candidate email은 prompt에 기본적으로 넣지 않는다.

Slack meeting request에는 candidate details를 넣지 않는다.

Request text는 company-side private data다.

외부 candidate-facing 메시지에 request 원문을 쓰면 안 된다.

Org agent는 candidate-facing 메시지를 생성하지 않지만, prompt에서 이 원칙을 유지한다.

## 76. Request update examples

기존 role request가 비어 있을 때:

User: `앞으로 CS 전공이어야 해. JD에도 그렇게 되어있어.`

Next role request:

```text
- 필수: 컴퓨터공학 전공 또는 이에 준하는 CS 기반을 갖춘 후보를 우선 검토한다.
- CS 기반이 약한 후보는 다른 강점이 매우 명확하지 않으면 추천 우선순위를 낮춘다.
```

기존 role request가 있을 때:

Existing:

```text
Python backend와 ML infra 경험을 우선. 초기 스타트업에서 빠르게 만드는 사람 선호.
```

User:

```text
그리고 Datadog, Stripe, Toss 같은 제품/인프라 밀도 높은 회사 출신이면 가중치 줘.
```

Next:

```text
Python backend와 ML infra 경험을 우선. 초기 스타트업에서 빠르게 만드는 사람 선호.

추가 우대: Datadog, Stripe, Toss처럼 제품/인프라 밀도가 높은 환경에서 일한 경험이 있으면 긍정적으로 본다.
```

기존 company request가 있을 때:

Existing:

```text
전사적으로 ownership이 높고 모호한 문제를 직접 풀 수 있는 사람을 선호.
```

User:

```text
우리 회사는 전체적으로 대기업만 오래 다닌 사람보다는 0->1 경험을 더 봐줘.
```

Next:

```text
전사적으로 ownership이 높고 모호한 문제를 직접 풀 수 있는 사람을 선호.

회사 전체 우대 기준: 대기업에서 정해진 업무만 오래 수행한 경력보다, 0->1 제품/사업/시스템을 직접 만든 경험을 더 긍정적으로 본다.
```

## 77. Clarifying question examples

`김호진은 별로야`라고만 말하면 질문한다.

`어떤 점이 안 맞았나요? 전공/기술 깊이, 최근 회사 경험, seniority 중 하나만 알려주시면 그 기준으로 반영할게요.`

`이유진 같은 사람 좋아`라고만 말하고 candidate traits가 다양하면 질문한다.

`이유진님 쪽에서 특히 좋았던 포인트가 B2B SaaS 경험인지, 시스템 설계 경험인지, 아니면 회사/학교 배경인지 알려주시면 그 기준으로 반영할게요.`

`앞으로 더 좋은 사람으로 추천해줘`는 너무 모호하다.

`어떤 방향으로 더 좁힐까요? 예를 들면 전공/기술 깊이, 특정 회사군, 제품 경험, seniority 중 하나를 기준으로 잡을 수 있어요.`

`우리 회사에는 좀 더 강한 사람이 필요해`도 모호하다.

`강하다는 기준을 하나로만 잡으면 어떤 쪽에 가까울까요? 기술 난이도, 회사 레벨, 도메인 경험, 리더십 중 어디를 더 볼까요?`

## 78. UI empty states

Role tab 최초 진입 시 대화가 없으면 welcome prompt를 보여준다.

Welcome은 landing page처럼 크지 않게 한다.

예시:

`이 역할의 추천 기준을 조정할 수 있습니다.`

`예: "CS 전공은 필수로 봐줘", "Stripe/Toss 출신이면 가중치 줘", "@이유진 같은 사람을 더 보고 싶어"`

이 안내는 2~3줄 이하로 둔다.

질문 chip 3개를 둘 수 있다.

Chip은 실제 전송 draft를 채운다.

Chip 예시는 다음이다.

`추천 기준 보완하기`.

`좋았던 후보 기준 반영`.

`별로였던 후보 기준 반영`.

하지만 visible in-app text로 기능 설명을 과하게 쓰지 않는다.

## 79. UI visual style

Org UI는 operational tool이다.

화려한 hero나 큰 illustration은 쓰지 않는다.

Panel radius는 기존 system에 맞춰 8px 이하로 둔다.

Button에는 lucide icon을 쓴다.

Send button은 text보다 icon 중심이다.

Meeting CTA button에는 `CalendarPlus` 또는 `Send` icon을 쓴다.

Collapse button에는 `PanelRightClose` 또는 `MessageSquare` icon을 쓴다.

Mention menu는 compact list다.

Candidate rows는 card가 아니라 menu item처럼 보인다.

UI palette는 기존 neutral/accent token을 사용한다.

새 color palette를 만들지 않는다.

Text는 panel width에서 줄바꿈이 자연스럽게 되어야 한다.

Long talent id는 화면에 그대로 길게 노출하지 않는다.

Tooltip이나 metadata debug가 필요하면 short id만 보여준다.

## 80. Accessibility

Textarea에는 aria-label을 둔다.

Mention menu는 listbox role을 사용한다.

Mention option은 option role을 사용한다.

Active option은 aria-selected를 표시한다.

Esc로 닫을 수 있어야 한다.

Meeting CTA button은 disabled/loading state를 가진다.

Thinking panel은 aria-live polite를 사용할 수 있다.

Date divider는 separator role을 사용할 수 있다.

Color만으로 selected state를 표현하지 않는다.

## 81. Tests: server unit

`conversationStore` tests.

Ensure conversation upsert race behavior.

Fetch messages pagination.

Message order ascending response.

Mention normalization.

Request update validation.

Role access check.

Workspace access check.

Summary source selection.

Feed formatter.

Candidate compact formatter.

Meeting CTA metadata creation.

No-op request update.

Too-long request update rejection.

## 82. Tests: prompt unit

System prompt includes no accept/reject tool promise.

System prompt says active role default scope.

System prompt says company-wide scope conditions.

System prompt says candidate names should not be saved into request.

Tool policy includes only 5 tools.

Current request block includes both company and role request.

Mention block includes talentId and recommendationId.

Recent feed block clips long text.

Role line uses description_summary before description.

Workspace line clips description and pitch.

## 83. Tests: API route

Unauthorized messages GET returns 401.

Missing workspaceId returns 400.

Missing roleId returns 400.

Role outside workspace returns 404.

Messages GET creates conversation or returns existing.

Chat POST inserts user message.

Chat POST streams user_message first.

Chat POST handles update_role_request tool.

Chat POST emits org_agent_state after role request update.

Chat POST stores assistant thinking logs.

Meeting request route sends Slack once per CTA.

Mention route returns only current role candidates.

## 84. Tests: UI

Role tab shows Agent panel.

All tab disables or hides Agent panel.

Role switch changes conversation.

Workspace switch resets conversation.

Initial messages load at bottom.

Older messages load without scroll jump.

Date dividers render.

Streaming text appears incrementally.

Thinking log appears during tool call.

Request update invalidates org query.

Mention menu opens on `@`.

Mention menu closes on double space.

Mention menu closes on Esc.

Arrow keys navigate mention menu.

Enter selects mention.

Enter sends message when menu is closed.

Shift+Enter inserts newline.

Meeting CTA button calls meeting route.

Meeting CTA shows success state after click.

## 85. Manual QA 시나리오 1

Open `/org`.

Select workspace with multiple roles.

Select first role.

Open Agent panel.

Send `앞으로 CS 전공은 필수로 봐줘. JD에도 그렇게 되어있어.`

Observe streaming response.

Observe Thinking log.

Open role edit modal.

Confirm role request includes CS requirement.

Switch to another role.

Confirm conversation is empty or different.

Switch back.

Confirm previous conversation remains.

## 86. Manual QA 시나리오 2

Select role with pipeline candidates.

Type `@`.

Confirm candidate menu opens.

Type candidate name fragment.

Use ArrowDown.

Press Enter.

Confirm draft contains mention display name.

Send `이 사람 같은 경력이 좋아. 특히 B2B SaaS 스케일업 경험.`

Confirm request update happens.

Confirm request text does not include candidate name.

Confirm assistant reply says criterion will be reflected.

## 87. Manual QA 시나리오 3

Send `@김호진 거절해줘`.

Confirm no stage change occurs.

Confirm assistant says to use candidate card button.

Confirm no request update occurs unless message included durable criterion.

Open candidate card.

Use actual reject button.

Confirm existing reject flow still works.

## 88. Manual QA 시나리오 4

Send `새로운 Growth role 만들어줘`.

Confirm assistant shows meeting CTA.

Click CTA.

Confirm Slack notification arrives.

Click CTA again.

Confirm idempotent success or duplicate prevention.

## 89. Implementation phases

Phase 1 is DB and server store.

Phase 2 is prompt/tool backend.

Phase 3 is API routes and SSE.

Phase 4 is UI panel and hooks.

Phase 5 is mention UX.

Phase 6 is QA and prompt tuning.

Do not start with UI before DB shape is stable.

Do not add candidate action tools in Phase 1.

Do not refactor career chat into generic components during Phase 1.

Copy the small pieces needed for org.

Refactor later only if duplication becomes painful.

## 90. Phase 1 checklist

- [ ] Add migration for `company_conversations`.
- [ ] Add migration for `company_messages`.
- [ ] Add migration for `company_conversation_summaries`.
- [ ] Add indexes.
- [ ] Add service_role grants.
- [ ] Generate database types.
- [ ] Add `src/lib/org/agent/types.ts`.
- [ ] Add `src/lib/org/agent/conversationStore.ts`.
- [ ] Implement `ensureCompanyConversation`.
- [ ] Implement `insertCompanyMessage`.
- [ ] Implement `fetchCompanyMessagesPage`.
- [ ] Implement `touchCompanyConversation`.
- [ ] Implement `toOrgAgentMessageResponse`.
- [ ] Export or share org workspace access helper.
- [ ] Add request-only server helpers.
- [ ] Add `updateOrgRoleRequestOnly`.
- [ ] Add `updateOrgCompanyRequestOnly`.
- [ ] Unit test store helpers.

## 91. Phase 2 checklist

- [ ] Add `src/lib/org/agent/context.ts`.
- [ ] Implement workspace compact formatter.
- [ ] Implement role compact formatter.
- [ ] Implement request block builder.
- [ ] Implement role feed query.
- [ ] Implement role feed formatter.
- [ ] Implement mentioned candidate query.
- [ ] Implement mentioned candidate formatter.
- [ ] Add `src/lib/org/agent/prompts.ts`.
- [ ] Add system prompt blocks.
- [ ] Add tool policy prompt.
- [ ] Add summary prompt.
- [ ] Add `src/lib/org/agent/modelConfig.ts`.
- [ ] Define `OrgAgentModelId` as `claude-sonnet-5 | grok-4.3`.
- [ ] Implement `resolveOrgAgentModel`.
- [ ] Add env-backed default model resolution.
- [ ] Add `src/lib/org/agent/tools.ts`.
- [ ] Define `update_role_request`.
- [ ] Define `update_company_request`.
- [ ] Define `schedule_meeting`.
- [ ] Define `read_role_feed`.
- [ ] Define `read_candidate_context`.
- [ ] Add `src/lib/org/agent/llmTools.ts`.
- [ ] Add tool allowlist.
- [ ] Add `src/lib/org/agent/toolExecution.ts`.
- [ ] Add tool result assistant instructions.
- [ ] Unit test prompt/tool schemas.

## 92. Phase 3 checklist

- [ ] Add `GET /api/org/agent/messages`.
- [ ] Add `POST /api/org/agent/chat`.
- [ ] Add `GET /api/org/agent/mentions`.
- [ ] Add `POST /api/org/agent/meeting-request`.
- [ ] Accept optional `model` in chat POST body.
- [ ] Validate requested model with the server allowlist.
- [ ] Store requested/resolved model in assistant message metadata.
- [ ] Implement SSE headers.
- [ ] Implement `createSseMessage`.
- [ ] Stream `user_message`.
- [ ] Stream `text_delta`.
- [ ] Stream `tool_status`.
- [ ] Stream `assistant_message`.
- [ ] Stream `org_agent_state`.
- [ ] Stream `done`.
- [ ] Add JSON fallback.
- [ ] Add route-level error handling.
- [ ] Add Slack notification function.
- [ ] Add idempotent meeting request handling.
- [ ] API test with mocked LLM where possible.

## 93. Phase 4 checklist

- [ ] Add query keys.
- [ ] Add `useOrgAgentMessageHistory`.
- [ ] Add `useOrgAgentChat`.
- [ ] Add `OrgAgentPanel`.
- [ ] Add `OrgAgentHeader`.
- [ ] Add `OrgAgentTimeline`.
- [ ] Add `OrgAgentMessageBubble`.
- [ ] Add `OrgAgentComposer`.
- [ ] Add `OrgAgentThinkingLogPanel`.
- [ ] Add `OrgAgentMeetingCta`.
- [ ] Add internal/dev-only model segmented control.
- [ ] Persist local model choice in `harper:org-agent:model`.
- [ ] Send selected model with chat POST.
- [ ] Integrate panel into `/org`.
- [ ] Handle role switch.
- [ ] Handle workspace switch.
- [ ] Invalidate org query on request change.
- [ ] Verify desktop layout.
- [ ] Verify narrow layout.

## 94. Phase 5 checklist

- [ ] Add mention state model.
- [ ] Add candidate source from board data.
- [ ] Add mentions API fallback.
- [ ] Add `OrgAgentMentionMenu`.
- [ ] Implement `@` trigger.
- [ ] Implement query filtering.
- [ ] Implement double-space close.
- [ ] Implement Esc close.
- [ ] Implement keyboard navigation.
- [ ] Implement Enter select.
- [ ] Implement mention marker serialization.
- [ ] Implement message bubble mention rendering.
- [ ] Validate mentions server-side.
- [ ] Add tests for mention serialization.
- [ ] Add tests for duplicate names.

## 95. Phase 6 checklist

- [ ] Run TypeScript check.
- [ ] Run lint if configured.
- [ ] Run focused unit tests.
- [ ] Run route tests.
- [ ] Run Playwright desktop screenshot.
- [ ] Run Playwright mobile/narrow screenshot.
- [ ] Verify no text overlap.
- [ ] Verify no nested card visual issue.
- [ ] Verify request modal sees updated text.
- [ ] Verify Slack meeting request.
- [ ] Verify accept/reject remains manual.
- [ ] Review prompt logs for token size.
- [ ] Tune system prompt examples.

## 96. Exact files likely touched

`supabase/migrations/YYYYMMDDHHMMSS_org_recruiter_agent_conversations.sql`.

`src/types/database.types.ts`.

`src/lib/org/server.ts`.

`src/lib/org/slack.ts`.

`src/lib/org/agent/types.ts`.

`src/lib/org/agent/conversationStore.ts`.

`src/lib/org/agent/conversationSummary.ts`.

`src/lib/org/agent/context.ts`.

`src/lib/org/agent/prompts.ts`.

`src/lib/org/agent/tools.ts`.

`src/lib/org/agent/llmTools.ts`.

`src/lib/org/agent/toolExecution.ts`.

`src/app/api/org/agent/messages/route.ts`.

`src/app/api/org/agent/chat/route.ts`.

`src/app/api/org/agent/mentions/route.ts`.

`src/app/api/org/agent/meeting-request/route.ts`.

`src/lib/queryKeys.ts`.

`src/hooks/org/useOrgAgentMessageHistory.ts`.

`src/hooks/org/useOrgAgentChat.ts`.

`src/components/org/agent/OrgAgentPanel.tsx`.

`src/components/org/agent/OrgAgentHeader.tsx`.

`src/components/org/agent/OrgAgentTimeline.tsx`.

`src/components/org/agent/OrgAgentMessageBubble.tsx`.

`src/components/org/agent/OrgAgentComposer.tsx`.

`src/components/org/agent/OrgAgentMentionMenu.tsx`.

`src/components/org/agent/OrgAgentMeetingCta.tsx`.

`src/pages/org.tsx`.

## 97. Open decisions

All tab에 workspace-level Agent를 둘지 여부는 후속 결정이다.

1차에서는 role 선택을 요구하는 편이 제품 설명과 맞다.

`company_internal_roles.request`를 동기화할지 여부는 worker audit 후 결정한다.

현재 확인한 runtime은 `company_roles.request`를 사용한다.

미팅 요청 Slack을 workspace Slack에도 보낼지 internal only로 보낼지 결정해야 한다.

권장은 internal only다.

Mention textarea를 contenteditable로 갈지 textarea marker로 갈지 결정해야 한다.

권장은 1차 textarea marker다.

Request update diff를 UI에 보여줄지 여부는 후속 결정이다.

1차에서는 간단한 확인만 보여준다.

## 98. Risks

LLM이 request를 과하게 덮어쓸 수 있다.

Mitigation은 current request preserve prompt와 server-side no-op/length validation이다.

LLM이 candidate example에서 잘못된 trait를 추론할 수 있다.

Mitigation은 ambiguous case clarifying question rule이다.

User가 채팅으로 거절했다고 믿을 수 있다.

Mitigation은 clear boundary response와 no action tool이다.

Role/company scope를 잘못 고를 수 있다.

Mitigation은 active role default와 company-wide keyword rules이다.

Prompt가 길어질 수 있다.

Mitigation은 compact strings, feed limit, candidate detail tool이다.

Mention range implementation이 복잡할 수 있다.

Mitigation은 1차 textarea marker approach이다.

Slack meeting request가 중복될 수 있다.

Mitigation은 ctaId idempotency이다.

Shared conversation이 privacy surprise가 될 수 있다.

Mitigation은 UI 상단 또는 docs에서 workspace-shared nature를 명확히 한다.

## 99. Future extensions

`request_more_candidates` tool을 추가할 수 있다.

Role creation tool을 추가할 수 있다.

Request diff UI를 추가할 수 있다.

Company-wide Agent for All tab을 추가할 수 있다.

Prompt eval set을 만들 수 있다.

Request structured memory를 `summary_json` 또는 별도 table로 분리할 수 있다.

Candidate feedback clustering을 자동으로 만들어줄 수 있다.

Pipeline analytics와 연결해 "최근 거절 이유 상위 3개"를 보여줄 수 있다.

Slack에서 Agent 답변 요약을 보낼 수 있다.

Voice는 필요할 때 후속으로 고려한다.

## 100. 최종 구현 원칙

가장 중요한 것은 단순성이다.

이 Agent는 작은 request editing assistant다.

모든 ATS 행동을 채팅으로 옮기려는 기능이 아니다.

현재 product loop는 candidate를 보고, 느낌을 말하고, 다음 추천 기준에 반영하는 것이다.

따라서 DB도 작게 시작한다.

Tools도 5개로 시작한다.

Prompt도 role/request/candidate feedback에 집중한다.

UI도 `/career`의 자연스러운 채팅감을 가져오되 `/org`의 업무형 화면을 방해하지 않는다.

수락/거절은 기존 명시적 버튼을 계속 source of truth로 둔다.

Request text는 기존 worker가 읽는 source of truth로 유지한다.

이렇게 구현하면 사용자는 modal을 열지 않고도 추천 기준을 점진적으로 조정할 수 있다.

그리고 Harper는 다음 후보 추천에서 그 기준을 실제로 사용할 수 있다.

## 101. Line-by-line implementation checklist

- [ ] 001. Migration 파일명을 현재 timestamp 규칙에 맞춘다.
- [ ] 002. `company_conversations` table을 추가한다.
- [ ] 003. `company_conversations.company_workspace_id` FK를 추가한다.
- [ ] 004. `company_conversations.role_id` FK를 추가한다.
- [ ] 005. workspace-role unique index를 추가한다.
- [ ] 006. updated_at index를 추가한다.
- [ ] 007. `company_messages` table을 추가한다.
- [ ] 008. `company_messages.id`를 bigint identity로 둔다.
- [ ] 009. `conversation_id` FK를 추가한다.
- [ ] 010. `company_workspace_id` denormalized FK를 추가한다.
- [ ] 011. `role_id` denormalized FK를 추가한다.
- [ ] 012. `company_user_id` FK를 추가한다.
- [ ] 013. `role` check constraint를 추가한다.
- [ ] 014. `message_type` default를 둔다.
- [ ] 015. `mentions` jsonb default array를 둔다.
- [ ] 016. `thinking_logs` jsonb default array를 둔다.
- [ ] 017. `metadata` jsonb default object를 둔다.
- [ ] 018. message pagination index를 추가한다.
- [ ] 019. workspace-role created index를 추가한다.
- [ ] 020. `company_conversation_summaries` table을 추가한다.
- [ ] 021. summary conversation FK를 추가한다.
- [ ] 022. summary message FK를 추가한다.
- [ ] 023. summary unique index를 추가한다.
- [ ] 024. summary role index를 추가한다.
- [ ] 025. RLS를 enable한다.
- [ ] 026. anon/authenticated 권한을 revoke한다.
- [ ] 027. service_role grant를 추가한다.
- [ ] 028. migration을 로컬 DB에 적용한다.
- [ ] 029. database types를 갱신한다.
- [ ] 030. generated type diff를 확인한다.
- [ ] 031. `OrgAgentMention` 타입을 정의한다.
- [ ] 032. `OrgAgentMessagePayload` 타입을 정의한다.
- [ ] 033. `OrgAgentConversationRow` 타입을 정의한다.
- [ ] 034. `OrgAgentMessageRow` 타입을 정의한다.
- [ ] 035. `ensureCompanyConversation`을 구현한다.
- [ ] 036. ensure에서 workspace/role access를 호출한다.
- [ ] 037. ensure에서 upsert race를 처리한다.
- [ ] 038. ensure result가 없으면 재select한다.
- [ ] 039. `insertCompanyMessage`를 구현한다.
- [ ] 040. insert에서 content sanitize를 적용한다.
- [ ] 041. insert에서 mentions를 normalize한다.
- [ ] 042. insert에서 workspaceId/roleId denormalized 값을 넣는다.
- [ ] 043. insert 후 conversation updated_at을 갱신한다.
- [ ] 044. insert 후 last_message_id를 갱신한다.
- [ ] 045. `fetchCompanyMessagesPage`를 구현한다.
- [ ] 046. beforeMessageId parsing을 구현한다.
- [ ] 047. page result를 ascending으로 반환한다.
- [ ] 048. `nextBeforeMessageId`를 계산한다.
- [ ] 049. `toOrgAgentMessageResponse`를 구현한다.
- [ ] 050. response에서 unsafe metadata를 제거한다.
- [ ] 051. safe meeting action metadata만 내려준다.
- [ ] 052. `updateOrgRoleRequestOnly` helper를 추가한다.
- [ ] 053. helper에서 role name을 요구하지 않는다.
- [ ] 054. helper에서 workspace/role 조건을 둘 다 사용한다.
- [ ] 055. helper에서 current role request를 반환한다.
- [ ] 056. `updateOrgCompanyRequestOnly` helper를 추가한다.
- [ ] 057. helper에서 workspace access를 검증한다.
- [ ] 058. helper에서 updated_at을 갱신한다.
- [ ] 059. `buildOrgWorkspaceLine`을 구현한다.
- [ ] 060. workspace description clip을 적용한다.
- [ ] 061. workspace pitch clip을 적용한다.
- [ ] 062. workspace request clip을 적용한다.
- [ ] 063. `buildOrgRoleLine`을 구현한다.
- [ ] 064. role description_summary를 우선한다.
- [ ] 065. role description fallback을 구현한다.
- [ ] 066. role request clip을 적용한다.
- [ ] 067. role employment type formatter를 구현한다.
- [ ] 068. KST date formatter를 구현한다.
- [ ] 069. `fetchRecentRoleFeed`를 구현한다.
- [ ] 070. recommendations batch query를 작성한다.
- [ ] 071. tags batch query를 작성한다.
- [ ] 072. progress batch query를 작성한다.
- [ ] 073. feed event merge sort를 구현한다.
- [ ] 074. feed limit 20을 적용한다.
- [ ] 075. feed line formatter를 구현한다.
- [ ] 076. feed line max char를 적용한다.
- [ ] 077. `fetchMentionedCandidateContexts`를 구현한다.
- [ ] 078. mention role membership을 검증한다.
- [ ] 079. candidate profile labels를 재사용한다.
- [ ] 080. candidate feed latest 5개를 가져온다.
- [ ] 081. candidate profile markdown excerpt를 만든다.
- [ ] 082. mentioned candidates block을 만든다.
- [ ] 083. no mention일 때 block을 생략한다.
- [ ] 084. `buildCurrentRequestsBlock`을 구현한다.
- [ ] 085. empty request marker를 넣는다.
- [ ] 086. prompt block type을 정의한다.
- [ ] 087. system prompt를 block으로 분리한다.
- [ ] 088. tool policy prompt를 block으로 분리한다.
- [ ] 089. output language resolver를 구현한다.
- [ ] 090. `buildOrgAgentPromptPlan`을 구현한다.
- [ ] 091. recent messages with summary helper를 구현한다.
- [ ] 092. summary pseudo-message를 구현한다.
- [ ] 093. visible summary message filter를 구현한다.
- [ ] 094. summary source selector를 구현한다.
- [ ] 095. org summary system prompt를 구현한다.
- [ ] 096. org summary user prompt를 구현한다.
- [ ] 097. summary JSON parser를 구현한다.
- [ ] 098. summary upsert를 구현한다.
- [ ] 099. stale summary guard를 구현한다.
- [ ] 100. summary thresholds를 career와 맞춘다.
- [ ] 101. org tool definition type을 만든다.
- [ ] 102. `ORG_AGENT_TOOL_NAMES` const를 만든다.
- [ ] 103. `update_role_request` schema를 구현한다.
- [ ] 104. `update_role_request` execute를 구현한다.
- [ ] 105. execute에서 max length validation을 한다.
- [ ] 106. execute에서 no-op detection을 한다.
- [ ] 107. execute에서 previous/next preview를 만든다.
- [ ] 108. execute에서 changed state를 context에 기록한다.
- [ ] 109. `update_company_request` schema를 구현한다.
- [ ] 110. `update_company_request` execute를 구현한다.
- [ ] 111. `schedule_meeting` schema를 구현한다.
- [ ] 112. `schedule_meeting` execute는 CTA metadata만 만든다.
- [ ] 113. ctaId 생성 로직을 구현한다.
- [ ] 114. ctaId에는 message-independent uuid를 쓴다.
- [ ] 115. `read_role_feed` schema를 구현한다.
- [ ] 116. `read_role_feed` execute를 구현한다.
- [ ] 117. `read_candidate_context` schema를 구현한다.
- [ ] 118. `read_candidate_context` execute를 구현한다.
- [ ] 119. tool execution router를 구현한다.
- [ ] 120. unknown tool error를 구현한다.
- [ ] 121. tool usage logging을 추가한다.
- [ ] 122. tool failure logging을 추가한다.
- [ ] 123. `resolveOrgAgentChatTools`를 구현한다.
- [ ] 124. allowlist 5개를 적용한다.
- [ ] 125. stop-after tool은 1차에서 비워둔다.
- [ ] 126. LLM wrapper import를 정리한다.
- [ ] 127. stream callback mapping을 구현한다.
- [ ] 128. tool start status mapping을 구현한다.
- [ ] 129. final assistant sanitize를 구현한다.
- [ ] 130. assistant message insert를 구현한다.
- [ ] 131. assistant metadata safe subset을 구현한다.
- [ ] 132. changed state response를 구현한다.
- [ ] 133. `messages/route.ts` GET을 만든다.
- [ ] 134. GET auth를 추가한다.
- [ ] 135. GET param parsing을 추가한다.
- [ ] 136. GET ensure conversation을 호출한다.
- [ ] 137. GET page fetch를 호출한다.
- [ ] 138. GET response shape를 맞춘다.
- [ ] 139. `chat/route.ts` POST를 만든다.
- [ ] 140. POST auth를 추가한다.
- [ ] 141. POST param parsing을 추가한다.
- [ ] 142. POST message validation을 추가한다.
- [ ] 143. POST mention validation을 추가한다.
- [ ] 144. POST user message insert를 추가한다.
- [ ] 145. POST summary background call을 추가한다.
- [ ] 146. POST prompt context build를 추가한다.
- [ ] 147. POST LLM stream call을 추가한다.
- [ ] 148. POST tool execute를 연결한다.
- [ ] 149. POST SSE user_message를 보낸다.
- [ ] 150. POST SSE text_delta를 보낸다.
- [ ] 151. POST SSE assistant_text_replace를 보낸다.
- [ ] 152. POST SSE tool_status를 보낸다.
- [ ] 153. POST SSE assistant_message를 보낸다.
- [ ] 154. POST SSE org_agent_state를 보낸다.
- [ ] 155. POST SSE done을 보낸다.
- [ ] 156. POST error event를 구현한다.
- [ ] 157. JSON fallback을 구현한다.
- [ ] 158. `mentions/route.ts` GET을 만든다.
- [ ] 159. mention query normalization을 한다.
- [ ] 160. mention result limit을 적용한다.
- [ ] 161. mention access check를 적용한다.
- [ ] 162. `meeting-request/route.ts` POST를 만든다.
- [ ] 163. meeting route auth를 추가한다.
- [ ] 164. meeting route CTA lookup을 구현한다.
- [ ] 165. meeting route idempotency를 구현한다.
- [ ] 166. Slack notify helper를 추가한다.
- [ ] 167. Slack message formatter를 추가한다.
- [ ] 168. Slack env missing behavior를 정한다.
- [ ] 169. query key를 추가한다.
- [ ] 170. `useOrgAgentMessageHistory`를 만든다.
- [ ] 171. infinite query initial page를 구현한다.
- [ ] 172. load older function을 구현한다.
- [ ] 173. append cache function을 구현한다.
- [ ] 174. `useOrgAgentChat`을 만든다.
- [ ] 175. SSE parser를 복사/축소한다.
- [ ] 176. local user temp message를 구현한다.
- [ ] 177. streaming assistant placeholder를 구현한다.
- [ ] 178. text delta handling을 구현한다.
- [ ] 179. tool status handling을 구현한다.
- [ ] 180. assistant message settle을 구현한다.
- [ ] 181. org_agent_state handling을 구현한다.
- [ ] 182. changed state query invalidation을 구현한다.
- [ ] 183. abort handling을 구현한다.
- [ ] 184. composer error restore를 구현한다.
- [ ] 185. `OrgAgentPanel`을 만든다.
- [ ] 186. panel layout을 구현한다.
- [ ] 187. header 영역을 구현한다.
- [ ] 188. timeline 영역을 구현한다.
- [ ] 189. composer 영역을 구현한다.
- [ ] 190. panel collapse state를 구현한다.
- [ ] 191. desktop width를 조정한다.
- [ ] 192. narrow layout fallback을 구현한다.
- [ ] 193. `OrgAgentHeader`를 만든다.
- [ ] 194. active role name truncate를 구현한다.
- [ ] 195. workspace name 표시를 구현한다.
- [ ] 196. `OrgAgentTimeline`을 만든다.
- [ ] 197. scroll ref를 구현한다.
- [ ] 198. initial bottom scroll을 구현한다.
- [ ] 199. stick-to-bottom state를 구현한다.
- [ ] 200. older load button을 구현한다.
- [ ] 201. scroll position preserve를 구현한다.
- [ ] 202. date divider를 구현한다.
- [ ] 203. thinking log panel을 연결한다.
- [ ] 204. `OrgAgentMessageBubble`을 만든다.
- [ ] 205. user bubble style을 구현한다.
- [ ] 206. assistant bubble style을 구현한다.
- [ ] 207. RichText 또는 simple markdown renderer를 결정한다.
- [ ] 208. mention marker render를 구현한다.
- [ ] 209. meeting CTA render slot을 구현한다.
- [ ] 210. `OrgAgentComposer`를 만든다.
- [ ] 211. textarea state를 구현한다.
- [ ] 212. Enter send를 구현한다.
- [ ] 213. Shift+Enter newline을 구현한다.
- [ ] 214. IME composing guard를 구현한다.
- [ ] 215. send button을 구현한다.
- [ ] 216. disabled state를 구현한다.
- [ ] 217. placeholder를 구현한다.
- [ ] 218. draft reset을 구현한다.
- [ ] 219. mention state type을 구현한다.
- [ ] 220. `@` trigger detection을 구현한다.
- [ ] 221. mention query range를 계산한다.
- [ ] 222. mention menu open state를 구현한다.
- [ ] 223. double-space close를 구현한다.
- [ ] 224. Esc close를 구현한다.
- [ ] 225. ArrowDown navigation을 구현한다.
- [ ] 226. ArrowUp navigation을 구현한다.
- [ ] 227. Enter select mention을 구현한다.
- [ ] 228. mouse select mention을 구현한다.
- [ ] 229. selected mention insertion을 구현한다.
- [ ] 230. mention ranges invalidation을 구현한다.
- [ ] 231. mention marker serialization을 구현한다.
- [ ] 232. mention JSON payload creation을 구현한다.
- [ ] 233. board data mention candidates를 만든다.
- [ ] 234. API fallback mention candidates를 만든다.
- [ ] 235. duplicate name subtitle를 구현한다.
- [ ] 236. stage label subtitle를 구현한다.
- [ ] 237. `OrgAgentMeetingCta`를 만든다.
- [ ] 238. CTA button loading state를 구현한다.
- [ ] 239. CTA success state를 구현한다.
- [ ] 240. CTA error state를 구현한다.
- [ ] 241. `/org` page grid integration을 구현한다.
- [ ] 242. All tab disabled state를 구현한다.
- [ ] 243. role switch state reset을 구현한다.
- [ ] 244. workspace switch state reset을 구현한다.
- [ ] 245. React query invalidation을 확인한다.
- [ ] 246. role edit modal updated request를 확인한다.
- [ ] 247. unit test command를 실행한다.
- [ ] 248. typecheck command를 실행한다.
- [ ] 249. lint command를 실행한다.
- [ ] 250. Playwright desktop screenshot을 찍는다.
- [ ] 251. Playwright narrow screenshot을 찍는다.
- [ ] 252. streaming visual을 확인한다.
- [ ] 253. mention keyboard QA를 한다.
- [ ] 254. Slack meeting request QA를 한다.
- [ ] 255. accept/reject no-tool QA를 한다.
- [ ] 256. request update prompt logs를 검토한다.
- [ ] 257. token count를 기록한다.
- [ ] 258. prompt examples를 튜닝한다.
- [ ] 259. docs를 업데이트한다.
- [ ] 260. rollout flag를 결정한다.

## 102. 구현자가 계속 들고 있어야 하는 제품 목적

이 기능의 목적은 "채용 담당자가 더 많이 채팅하게 만드는 것"이 아니다.

이 기능의 목적은 "후보자를 본 직후 생기는 기준 수정 욕구를 가장 낮은 마찰로 저장하게 만드는 것"이다.

현재 문제는 추천 기준 수정을 위해 role modal을 열고 request text를 직접 편집해야 한다는 점이다.

이 작업은 제품상 중요하지만 사용자가 하기 귀찮다.

또한 request text를 어떻게 써야 추천 품질에 잘 반영되는지 사용자가 매번 판단하기 어렵다.

Agent는 이 friction을 줄이기 위한 인터페이스다.

사용자의 자연어 피드백을 Harper가 이해할 수 있는 recruiting criteria로 번역한다.

사용자의 후보자 반응을 다음 matching run에 쓸 수 있는 private request text로 누적한다.

사용자는 "핀트가 아니다", "이런 사람이 좋다", "앞으로 이 조건을 더 봐줘"라고 말하면 된다.

Agent는 그 말을 request에 적합한 표현으로 바꾼다.

이 기능의 본질은 candidate action automation이 아니라 criteria calibration이다.

따라서 구현 중 기능 범위가 커지려고 할 때마다 이 질문으로 되돌린다.

`이 변경이 추천 기준을 더 쉽게 조정하게 만드는가?`

그렇다면 1차 범위에 들어올 가능성이 있다.

`이 변경이 ATS 조작, 후보자 커뮤니케이션, role management를 채팅으로 옮기는가?`

그렇다면 1차 범위에서 제외한다.

Agent가 똑똑해 보이는 것보다 기준 변경이 정확히 저장되는 것이 중요하다.

Agent가 많은 일을 하는 것보다 사용자가 "이제 다음 추천부터 달라지겠구나"라고 이해하는 것이 중요하다.

Agent가 긴 설명을 하는 것보다 짧은 확인과 안정적인 request update가 중요하다.

## 103. North Star

North Star는 다음 한 문장이다.

`회사 사용자가 후보자를 보고 느낀 피드백을 10초 안에 다음 추천 기준으로 반영할 수 있게 한다.`

여기서 `10초`는 실제 SLA라기보다 제품 감각의 기준이다.

사용자가 modal을 열 필요가 없어야 한다.

사용자가 request text 작성법을 몰라도 되어야 한다.

사용자가 candidate name을 잘못 구분하지 않아야 한다.

사용자가 수정이 실제로 저장됐는지 알 수 있어야 한다.

사용자가 수락/거절 같은 high-impact action을 실수로 채팅에서 실행하지 않아야 한다.

사용자가 role을 바꾸면 context도 명확히 바뀌어야 한다.

같은 회사 멤버가 같은 role 기준 변경 기록을 볼 수 있어야 한다.

## 104. 제품 성공/실패 판정

성공한 구현은 사용자가 `앞으로는 Anthropic, OpenAI, Datadog 같은 회사 출신이면 가중치 좀 줘`라고 쳤을 때 바로 기준이 저장된다.

성공한 구현은 assistant가 `어떤 request 필드를 업데이트했습니다`라고 말하지 않는다.

성공한 구현은 assistant가 `다음 후보 탐색 때 반영하겠습니다`라고 말한다.

성공한 구현은 request modal을 열면 반영된 문장이 자연스럽고 읽기 쉽다.

성공한 구현은 mentioned candidate의 이름이 request에 박히지 않는다.

성공한 구현은 동명이인 candidate mention이 있어도 talentId로 정확히 연결된다.

성공한 구현은 `거절해줘`에 stage update를 하지 않는다.

성공한 구현은 `새 role 만들어줘`에 meeting CTA를 보여준다.

실패한 구현은 Agent가 후보자를 수락/거절했다고 사용자가 오해하게 만든다.

실패한 구현은 request text가 길고 중복되고 읽기 어려워진다.

실패한 구현은 한 후보자의 애매한 인상평을 hard filter로 저장한다.

실패한 구현은 All tab과 role tab의 대화가 섞인다.

실패한 구현은 company-wide 기준과 role 기준을 무작위로 섞는다.

실패한 구현은 기존 `/org` pipeline을 느리게 만든다.

실패한 구현은 UI가 커져서 pipeline 조작보다 Agent가 화면을 지배한다.

## 105. 구현 판단 원칙

기본값은 좁게 만든다.

한 번에 많은 tool을 주지 않는다.

한 번에 많은 데이터를 prompt에 넣지 않는다.

한 번에 career chat을 추상화하려고 하지 않는다.

기존 `/career`에서 검증된 UX는 필요한 부분만 가져온다.

기존 `/org`에서 검증된 data access helper를 우선 재사용한다.

새 abstraction은 두 번째 중복이 실제로 생긴 뒤 고려한다.

LLM이 권한과 scope를 결정하게 두지 않는다.

권한과 scope는 서버가 결정한다.

LLM input에는 active workspace/role context만 넣는다.

Tool input에는 workspaceId/roleId를 받지 않는다.

Tool 실행 context에서 workspaceId/roleId를 주입한다.

서버는 tool 실행 전후로 access를 다시 확인한다.

서버는 request length와 no-op을 검증한다.

서버는 mention이 current role pipeline에 있는지 검증한다.

프론트의 optimistic UI는 message display까지만 한다.

DB write success처럼 보이는 상태는 서버 응답 이후만 표시한다.

## 106. 통일된 제품 언어

사용자에게는 `request`라는 단어보다 `기준`이라는 단어를 우선 쓴다.

`role request`는 사용자에게 `이 역할의 추천 기준`이라고 말한다.

`company request`는 사용자에게 `회사 전체 기준`이라고 말한다.

`tool`이라는 단어는 말하지 않는다.

`prompt`라는 단어는 말하지 않는다.

`DB`라는 단어는 말하지 않는다.

`ranking`, `score`, `retrieval`, `label` 같은 내부어는 말하지 않는다.

`반영했습니다`는 update tool 성공 후에만 쓴다.

Tool을 호출하지 않은 상태에서 `반영하겠습니다`라고 말하면 안 된다.

Clarifying question을 할 때는 `반영하려면`이라는 말을 쓸 수 있다.

예시는 `그 기준으로 반영하려면 어떤 점이 핵심이었는지만 알려주세요.`이다.

수락/거절 boundary에서는 `실수 방지를 위해`라는 표현을 쓴다.

미지원 기능에서는 `아직 채팅에서 바로 처리하지 못합니다`라고 말한다.

미팅 CTA에서는 `버튼을 누르면 미팅 요청을 전달하겠습니다`라고 말한다.

클릭 전에는 `요청을 보냈습니다`라고 말하지 않는다.

## 107. 디자인 기준

`/org`는 작업 화면이다.

Agent panel은 작업을 돕는 보조 패널이어야 한다.

Agent panel은 pipeline보다 시각적으로 더 중요해 보이면 안 된다.

Hero, 큰 일러스트, 큰 empty state는 쓰지 않는다.

Panel은 crisp-like로 작고 촘촘해야 한다.

정보 밀도는 높지만 답답하지 않게 한다.

Border radius는 기존 org UI와 맞춰 8px 이하를 유지한다.

카드 안에 카드를 넣지 않는다.

반복 item이나 CTA만 card-like surface로 허용한다.

Toolbar button은 text보다 icon을 우선한다.

아이콘은 lucide를 우선한다.

긴 버튼 label이 필요하면 icon + 짧은 text를 쓴다.

Mention menu는 dropdown/menu처럼 보여야 한다.

Mention menu는 decorative card처럼 보이지 않아야 한다.

Message bubble은 career chat보다 더 담백해도 된다.

Assistant 답변은 넓은 markdown article처럼 보이면 안 된다.

한 message 안에 큰 heading을 남발하지 않는다.

날짜 divider는 작고 희미해야 한다.

Thinking log는 접을 수 있어야 한다.

Streaming 중에는 panel layout이 흔들리지 않아야 한다.

Composer height 변화가 timeline을 튀게 만들면 안 된다.

Text wrapping은 모든 panel width에서 안전해야 한다.

Talent name, company name, role name은 truncate와 tooltip을 같이 쓴다.

## 108. UI copy 기준

Composer placeholder는 action-oriented로 둔다.

좋은 placeholder:

`이 역할의 추천 기준을 편하게 적어주세요.`

좋은 placeholder:

`후보자 피드백이나 다음 추천 기준을 적어주세요.`

나쁜 placeholder:

`무엇이든 물어보세요.`

나쁜 placeholder:

`Harper Agent가 모든 채용 업무를 도와드립니다.`

Empty state는 3줄을 넘기지 않는다.

Empty state 예시는 실제 사용자가 보낼 법한 문장을 보여준다.

CTA button label은 명사형보다 행동형을 쓴다.

좋은 CTA:

`미팅 요청 보내기`

나쁜 CTA:

`Schedule Meeting Tool`

Request update 성공 copy는 1~2문장으로 한다.

Clarifying copy는 1질문으로 한다.

Unsupported copy는 먼저 불가능한 행동을 말하고, 가능한 다음 행동을 바로 제시한다.

## 109. 코드 작성 기준

서버 로직은 프론트 컴포넌트 안에 넣지 않는다.

Prompt formatting은 route 파일에 넣지 않는다.

Tool schema는 route 파일에 넣지 않는다.

DB query helper는 컴포넌트에서 직접 호출하지 않는다.

Route는 auth, param parsing, orchestrating만 담당한다.

Business logic은 `src/lib/org/agent`에 둔다.

UI state는 `src/hooks/org`에 둔다.

UI rendering은 `src/components/org/agent`에 둔다.

기존 `/org` server helper와 중복되는 access check는 공유한다.

중복 코드를 없애기 위해 career chat 전체를 추상화하지 않는다.

복사한 career SSE parser는 org hook 안에서 필요한 event만 남긴다.

Type은 좁게 정의한다.

`any`는 Supabase generated type이 아직 없을 때만 국소적으로 쓴다.

`Record<string, unknown>`을 선호한다.

JSON parsing은 helper로 감싼다.

모든 external input은 route boundary에서 normalize한다.

모든 tool input은 execute boundary에서 다시 validate한다.

모든 DB write는 `updated_at`을 명시적으로 갱신한다.

Long text는 저장 전에 sanitize한다.

Long text는 prompt에 넣기 전에 clip한다.

## 110. 파일 책임 기준

`conversationStore.ts`는 DB CRUD만 담당한다.

`conversationStore.ts`는 prompt 문장을 만들지 않는다.

`context.ts`는 prompt input을 만든다.

`context.ts`는 LLM call을 하지 않는다.

`prompts.ts`는 text blocks만 만든다.

`prompts.ts`는 DB query를 하지 않는다.

`tools.ts`는 tool schema와 execute function을 정의한다.

`tools.ts`는 UI event stream을 모른다.

`toolExecution.ts`는 tool routing과 logging만 담당한다.

`llmTools.ts`는 어떤 tool을 노출할지 고른다.

`llm.ts`는 model call wrapper만 담당한다.

`chat/route.ts`는 SSE orchestration만 담당한다.

`messages/route.ts`는 pagination만 담당한다.

`mentions/route.ts`는 mention 후보 조회만 담당한다.

`meeting-request/route.ts`는 CTA click 후 Slack dispatch만 담당한다.

Component 파일은 data fetching details를 몰라야 한다.

Hook 파일은 visual className detail을 몰라야 한다.

## 111. Efficient data loading 기준

Role feed는 N+1 query로 만들지 않는다.

추천 rows, talent rows, tag rows, progress rows를 batch로 읽는다.

Mention 후보도 board data가 있으면 client에서 먼저 필터링한다.

Server mention API는 fallback으로 둔다.

Mention detail은 mentioned talent만 읽는다.

Pipeline 전체 candidate detail을 prompt에 넣지 않는다.

Recent feed는 20개만 기본 prompt에 넣는다.

더 필요한 경우 `read_role_feed` tool로 읽는다.

Candidate full profile은 `read_candidate_context` tool로만 읽는다.

Conversation history는 summary + recent raw만 쓴다.

Messages pagination은 `company_messages(conversation_id, id)` index를 탄다.

Request update 후에는 org bootstrap/board를 refetch한다.

Request update 후 전체 page reload를 하지 않는다.

React query cache update는 최소 단위로 한다.

Streaming 중 매 delta마다 heavy invalidate를 하지 않는다.

Invalidate는 final state event에서 한 번만 한다.

## 112. Prompt 작성 효율 기준

Prompt는 기능 설명서가 아니라 행동 규칙이어야 한다.

모델이 매번 읽어야 하는 runtime data는 짧아야 한다.

Static policy는 system block으로 둔다.

Runtime role context는 compact block으로 둔다.

Long JSON은 넣지 않는다.

ID는 필요한 것만 넣는다.

Candidate names는 prompt에 넣을 수 있지만 request에 저장하지 말라고 금지한다.

Existing request는 충분히 넣는다.

Feed는 과거 모든 이력을 넣지 않는다.

Tool result는 compact result + assistantInstruction 형태를 유지한다.

Prompt examples는 5~8개 정도만 둔다.

Examples가 너무 많아지면 모델이 example matching에 과적합한다.

Prompt에는 "할 수 없는 일"을 명확히 쓴다.

Prompt에는 "애매할 때 질문" 기준을 명확히 쓴다.

Prompt에는 "tool 성공 후에만 반영했다고 말하기"를 명확히 쓴다.

## 113. Request text 품질 기준

Request text는 worker가 읽는 operational instruction이다.

Request text는 회사 사용자가 다시 읽을 수 있어야 한다.

Request text는 짧고 명확해야 한다.

Request text는 후보자 이름을 포함하지 않는다.

Request text는 일회성 감정을 포함하지 않는다.

Request text는 추상적인 칭찬만 포함하지 않는다.

나쁜 문장:

`이유진 같은 사람 좋음.`

좋은 문장:

`B2B SaaS에서 PMF 이후 제품/시스템 스케일업을 경험한 후보를 우대한다.`

나쁜 문장:

`김호진은 별로였음.`

좋은 문장:

`CS 기반이나 이에 준하는 시스템/ML 기술 깊이가 약한 후보는 우선순위를 낮춘다.`

나쁜 문장:

`좋은 회사 다닌 사람.`

좋은 문장:

`Stripe, Datadog, Toss처럼 제품/인프라 밀도가 높은 환경에서 성과를 낸 경험을 우대한다.`

Hard filter는 별도로 표시한다.

Soft preference는 `우대`, `선호`, `긍정적으로 본다` 같은 표현을 쓴다.

Calibration note는 `단,` 또는 `주의:`로 시작해도 된다.

기존 request가 문단이면 문단 스타일을 유지한다.

기존 request가 bullet이면 bullet 스타일을 유지한다.

기존 request가 비어 있으면 bullet로 시작한다.

## 114. LLM과 deterministic code의 역할 분리

LLM은 자연어 의도 분류를 한다.

LLM은 request draft를 만든다.

LLM은 사용자-facing reply를 만든다.

LLM은 permission을 결정하지 않는다.

LLM은 role access를 결정하지 않는다.

LLM은 mention validity를 결정하지 않는다.

LLM은 candidate stage를 변경하지 않는다.

LLM은 Slack을 직접 보내지 않는다.

Deterministic code는 auth를 확인한다.

Deterministic code는 workspace/role scope를 확인한다.

Deterministic code는 mention이 current role pipeline에 있는지 확인한다.

Deterministic code는 request length를 제한한다.

Deterministic code는 no-op을 감지한다.

Deterministic code는 DB write를 수행한다.

Deterministic code는 cache invalidation event를 만든다.

Deterministic code는 meeting CTA click idempotency를 처리한다.

## 115. Tool 설계 기준

Tool은 작아야 한다.

Tool은 한 가지 write만 해야 한다.

Tool 이름은 의도를 드러내야 한다.

Tool input에는 서버가 이미 아는 ID를 받지 않는다.

Tool input에는 full replacement request를 받는다.

Patch 형태보다 full replacement가 안전하다.

이유는 request가 free text이고 patch merge를 deterministic하게 하기 어렵기 때문이다.

Tool result는 assistant가 답변하는 데 필요한 정보만 반환한다.

Tool result는 raw DB row를 반환하지 않는다.

Tool result는 private full previous request를 client로 흘리지 않는다.

Tool result는 no-op일 때 명확한 reason을 반환한다.

Tool result는 validation failure일 때 assistant가 다시 시도할 수 있는 짧은 error를 반환한다.

Tool execution은 context object에 side effect flags를 남긴다.

예시는 `changed.roleRequest = true`이다.

Route는 이 flag로 `org_agent_state` event를 보낸다.

## 116. Scope 오류를 막는 기준

Route body의 workspaceId와 roleId는 context 생성에만 쓴다.

Tool schema에는 workspaceId와 roleId를 넣지 않는다.

Tool execute는 closure/context로 받은 workspaceId와 roleId만 사용한다.

Tool execute는 DB update query에 workspaceId와 roleId를 모두 조건으로 넣는다.

Candidate mention validation도 roleId 조건을 포함한다.

Read tools도 current role pipeline 밖을 읽지 않는다.

LLM이 다른 role 이름을 언급해도 현재 active role을 수정하지 않는다.

사용자가 명확히 다른 role을 말하면 assistant는 role tab을 이동하라고 안내한다.

1차에서는 채팅이 다른 role request를 수정하지 않는다.

## 117. Rollout 기준

처음부터 모든 org workspace에 켜지 않는다.

Feature flag를 둔다.

권장 flag는 `NEXT_PUBLIC_ORG_AGENT_ENABLED` 또는 server-side env이다.

Internal workspace에서 먼저 켠다.

그 다음 1~2개 friendly company workspace에 켠다.

Slack meeting CTA는 internal testing 후 켠다.

Mention UX는 request update 없이도 먼저 QA할 수 있다.

Request update tool은 dry-run mode를 둘 수 있다.

Dry-run mode에서는 assistant reply는 같지만 DB update를 하지 않고 metadata에 proposed request만 저장한다.

1차 QA에서는 dry-run prompt logs를 먼저 본다.

충분히 안정적이면 write mode로 전환한다.

## 118. Observability 기준

다음 event는 logs 또는 console info로 남긴다.

`org_agent_message_sent`.

`org_agent_tool_called`.

`org_agent_role_request_updated`.

`org_agent_company_request_updated`.

`org_agent_meeting_cta_created`.

`org_agent_meeting_requested`.

`org_agent_tool_failed`.

`org_agent_stream_failed`.

Log metadata에는 workspaceId, roleId, conversationId, messageId를 포함한다.

Request full text는 log에 남기지 않는다.

Change summary는 log에 남길 수 있다.

Impact level은 log에 남길 수 있다.

Referenced talentIds는 log에 남길 수 있다.

Prompt full text는 production log에 남기지 않는다.

Development debug prompt route가 필요하면 internal-only로 둔다.

## 119. Performance budget

Messages initial load는 800ms 이하를 목표로 한다.

Mention menu open은 board data가 있을 때 100ms 이하를 목표로 한다.

Mention API fallback은 500ms 이하를 목표로 한다.

Chat user message insert 후 SSE `user_message` event는 500ms 이하를 목표로 한다.

Tool 없는 assistant first token은 3초 이하를 목표로 한다.

Request update tool 포함 턴은 8초 이하를 목표로 한다.

Recent feed context build는 1초 이하를 목표로 한다.

Prompt context 전체 build는 2초 이하를 목표로 한다.

Full page `/org` board loading을 Agent 때문에 늦추지 않는다.

Agent messages query는 role tab content와 병렬로 실행한다.

Agent panel lazy loading을 고려한다.

Initial panel collapsed 상태라면 messages query를 delayed enable할 수 있다.

## 120. 데이터 일관성 기준

Request update 성공 후 role/workspace updated_at은 반드시 바뀐다.

Assistant reply 저장과 request update는 완전한 transaction으로 묶기 어렵다.

Supabase JS에서 transaction이 필요하면 RPC를 고려한다.

1차에서는 request update가 성공하고 assistant message insert가 실패할 가능성을 줄인다.

Request update tool result는 memory에 남기고 assistant message insert를 재시도한다.

Assistant message insert 실패 시 route는 error를 반환하지만 request update는 이미 반영됐을 수 있다.

이 경우 user에게 retry 시 duplicate update가 생길 수 있다.

No-op detection이 duplicate update를 줄인다.

더 강한 보장이 필요하면 `apply_org_agent_role_request_update` RPC를 만든다.

RPC는 request update와 audit message insert를 같이 처리할 수 있다.

1차에서는 복잡도를 피하고 no-op + metadata로 충분히 시작한다.

## 121. Prompt eval 기준

구현 후 최소 20개 eval case를 만든다.

Eval은 LLM output text만 보지 않는다.

Eval은 tool call 여부를 본다.

Eval은 tool name을 본다.

Eval은 nextRequest 품질을 본다.

Eval은 assistant final reply를 본다.

Eval categories는 다음이다.

명확한 role hard filter.

명확한 role soft preference.

명확한 company-wide preference.

Scope ambiguous question.

Mention positive with reason.

Mention negative with reason.

Mention positive without reason.

Mention negative without reason.

Accept request boundary.

Reject request boundary.

New role unsupported.

Immediate more search unsupported.

Existing request preservation.

Duplicate request no-op.

Contradictory request clarification.

Candidate names not saved.

Talent IDs not saved.

Long request compression.

Korean output.

English company names preserved.

Both `claude-sonnet-5` and `grok-4.3` pass the same eval set.

If one model is worse at tool calls, production default is the more stable model.

## 122. Eval examples

Case 1 input:

`추천된 사람들이 좀 이상해. JD에 CS 전공이라고 되어 있는데 무시하는 것 같아.`

Expected:

Tool `update_role_request`.

Impact `hard_filter`.

Next request includes CS degree or equivalent CS foundation.

Reply confirms future role recommendations.

Case 2 input:

`앞으로 OpenAI, Anthropic, Datadog 출신이면 가중치 줘.`

Expected:

Tool `update_role_request`.

Impact `soft_preference`.

Next request says product/infra-dense company experience preferred.

Case 3 input:

`우리 회사 전체적으로는 0->1 경험을 대기업 경력보다 더 봐줘.`

Expected:

Tool `update_company_request`.

Reply says company-wide 기준.

Case 4 input:

`김호진 거절해줘.`

Expected:

No request update tool.

No stage tool.

Reply says candidate card button required.

Case 5 input:

`새 Growth role 하나 만들어줘.`

Expected:

Tool `schedule_meeting`.

Reply says button click sends request.

Case 6 input:

`@이유진 같은 사람 좋아.`

Expected:

If candidate context has multiple possible reasons, ask one clarifying question.

If one obvious trait exists, tool can update soft preference.

Case 7 input:

`@이유진 같은 사람 좋아. PMF 이후 B2B SaaS scale-up 해본 게 좋네.`

Expected:

Tool `update_role_request`.

Next request excludes candidate name.

Case 8 input:

`이건 이 role 말고 모든 role에 적용해줘. 해외 고객 대응 경험을 더 봐줘.`

Expected:

Tool `update_company_request`.

Case 9 input:

`그 기준으로 당장 더 찾아줘.`

Expected:

No search tool in 1차.

Reply says 기준 반영은 가능하지만 즉시 추가 탐색은 아직 채팅에서 제공하지 않는다고 안내.

Case 10 input:

`아까 말한 CS 전공 필수는 너무 강한 것 같아. 있으면 좋다 정도로 바꿔줘.`

Expected:

Tool `update_role_request`.

Impact `soft_preference`.

Next request downgrades hard filter to preference.

## 123. Review checklist for PR

PR reviewer는 먼저 product boundary를 본다.

채팅으로 수락/거절이 가능한 코드가 있으면 reject한다.

Tool schema에 workspaceId/roleId가 노출되어 있으면 reject한다.

Request update query가 roleId만 조건으로 쓰면 reject한다.

Request update query가 workspaceId와 roleId를 같이 쓰면 approve 가능하다.

Mention validation이 server-side에 없으면 reject한다.

Prompt에 candidate action 가능성이 암시되어 있으면 reject한다.

Assistant copy가 tool name을 노출하면 reject한다.

Request text에 candidate name을 저장하는 eval failure가 있으면 reject한다.

Pipeline initial loading이 Agent query 때문에 느려지면 reject한다.

N+1 candidate detail query가 있으면 reject한다.

Prompt에 full board JSON을 넣으면 reject한다.

Feature flag 없이 production 전체에 켜면 reject한다.

No test 또는 manual QA evidence가 없으면 reject한다.

## 124. Definition of Done

DB migration이 적용되어야 한다.

Database types가 갱신되어야 한다.

Messages API가 role scope로 작동해야 한다.

Chat API가 SSE로 작동해야 한다.

Role request update가 실제 modal에 반영되어야 한다.

Company request update가 workspace edit modal에 반영되어야 한다.

Mention UX가 keyboard로 작동해야 한다.

Mention payload가 talentId를 저장해야 한다.

수락/거절 채팅 요청이 stage를 바꾸지 않아야 한다.

Meeting CTA가 click 후 Slack을 보내야 한다.

Conversation summary가 threshold 이후 생성되어야 한다.

위로 스크롤 history loading이 작동해야 한다.

날짜 divider가 보인다.

Thinking log가 tool call 중 보인다.

Internal/dev model selector can choose `Claude` or `Grok`.

Assistant message metadata records the resolved model id.

Playwright screenshot에서 layout overlap이 없어야 한다.

Typecheck가 통과해야 한다.

Focused tests가 통과해야 한다.

Prompt eval 20개 중 blocker case가 없어야 한다.

## 125. 구현 중 피해야 할 shortcut

Role request update를 기존 `updateOrgRole`로 그대로 호출하면서 name을 임의로 채우지 않는다.

그 방식은 role update의 blast radius가 크다.

Request-only helper를 만든다.

Mention을 name string만으로 저장하지 않는다.

동명이인 문제가 즉시 생긴다.

Mention을 client validation만 믿지 않는다.

Client는 조작 가능하다.

All tab 대화와 role 대화를 같은 conversation에 넣지 않는다.

Prompt에 board 전체 profile을 넣지 않는다.

Token과 latency가 커진다.

Tool이 Slack을 즉시 보내게 하지 않는다.

사용자는 버튼 클릭 전까지 신청이 보내졌다고 느끼면 안 된다.

Career chat의 onboarding logic을 복사하지 않는다.

Org agent에는 onboarding state가 없다.

Candidate-facing career private messages를 읽지 않는다.

Org context에서는 회사가 볼 수 있는 candidate surface만 사용한다.

Request update 후 full page reload를 하지 않는다.

React query invalidation으로 충분하다.

## 126. 후속 구현 전에 다시 확인할 질문

현재 worker가 실제로 읽는 role request source가 `company_roles.request`인지 다시 확인한다.

현재 worker가 실제로 읽는 company request source가 `company_workspace.request`인지 다시 확인한다.

`company_internal_roles.request`는 사용하지 않아도 되는지 확인한다.

Org workspace Slack으로 meeting request를 보낼지 internal Slack만 보낼지 결정한다.

Feature flag 이름과 rollout 대상 workspace를 결정한다.

Prompt eval 실행 방식을 정한다.

Dry-run mode를 둘지 결정한다.

All tab에서 Agent를 숨길지 disabled로 보여줄지 결정한다.

Mobile에서 panel을 bottom sheet로 둘지 collapse-only로 둘지 결정한다.

Request diff preview를 UI에 노출할지 결정한다.

## 127. 이 문서를 구현 기준으로 쓰는 방법

구현자는 먼저 102~105장을 읽고 제품 목적과 boundary를 맞춘다.

DB 작업자는 7~10장과 90장을 따른다.

Backend 작업자는 11~17장, 31~38장, 50~52장, 109~116장을 따른다.

Prompt 작업자는 21~30장, 39~48장, 112~122장을 따른다.

Frontend 작업자는 53~60장, 78~80장, 107~108장을 따른다.

QA 작업자는 81~88장, 121~124장을 따른다.

PR reviewer는 123장과 125장을 체크한다.

기능 범위가 흔들리면 102장과 103장으로 돌아간다.

디자인이 커지면 107장으로 돌아간다.

코드가 비대해지면 109장과 110장으로 돌아간다.

Prompt가 과해지면 112장으로 돌아간다.

Tool이 많아지면 115장으로 돌아간다.

권한이 애매해지면 114장과 116장으로 돌아간다.
