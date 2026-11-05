-- Company decisions as an append-only record.
--
-- company_decision_events: one row per company decision about a candidate,
--   a To-do suggestion or a proposal. Rows are only inserted. The current
--   state (card status, ...) stays where it is today; a decision row and the
--   state change it causes are written in the same transaction.
--   subject_kind/subject_id: what the decision is about. For member_candidate
--     subject_id is the Talent (talent_users.user_id); intro_candidate_id is
--     the company-first card the decision was made on, when there is one.
--   channel: where the decision was made (web, todo, chat, slack, email,
--     role_start, system). unknown is only for rows backfilled later.
--   reason_text: optional, in the company's words. For request_intro it is
--     the company's appeal (why they want to meet the candidate).
--   brief_version, memory_fingerprint: the Role's search Brief and company
--     Memory at the moment of the decision, filled by
--     record_company_decision_v1 from the same functions search runs use.
--   presentation_id, operation_id: filled once company_presentations and
--     company_agent_operations exist; their FKs are added then.
--   Career (candidate-side) code does not read this table.
--
-- pass_company_intro_v2 / request_company_intro_v2 call the v1 functions and,
-- when the card actually changed (passed / requested), record the decision in
-- the same transaction. v1 is unchanged for its other callers.

create table if not exists public.company_decision_events (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  subject_kind text not null check (subject_kind in (
    'member_candidate', 'external_candidate', 'todo_suggestion',
    'suggestion_kind', 'proposal'
  )),
  subject_id uuid,
  intro_candidate_id uuid
    references public.company_intro_candidates(id) on delete set null,
  action text not null check (action in (
    'request_intro', 'pass', 'save', 'unsave', 'stage_change', 'stop', 'rate',
    'view', 'note', 'accept', 'reject', 'mute', 'unmute'
  )),
  detail jsonb not null default '{}'::jsonb
    check (jsonb_typeof(detail) = 'object'),
  reason_text text
    check (reason_text is null or char_length(reason_text) between 1 and 2000),
  reason_tags text[] not null default '{}',
  channel text not null check (channel in (
    'web', 'todo', 'chat', 'slack', 'email', 'role_start', 'system', 'unknown'
  )),
  actor_user_id uuid,
  operation_id uuid,
  presentation_id uuid,
  source_message_id bigint
    references public.company_messages(id) on delete set null,
  brief_version text,
  memory_fingerprint text,
  idempotency_key text not null
    check (char_length(idempotency_key) between 1 and 300),
  created_at timestamptz not null default now(),
  constraint company_decision_events_role_idempotency_key
    unique (role_id, idempotency_key)
);

create index if not exists company_decision_events_subject_idx
  on public.company_decision_events (role_id, subject_kind, subject_id, created_at desc);
create index if not exists company_decision_events_intro_candidate_idx
  on public.company_decision_events (intro_candidate_id)
  where intro_candidate_id is not null;
create index if not exists company_decision_events_source_message_idx
  on public.company_decision_events (source_message_id)
  where source_message_id is not null;

alter table public.company_decision_events enable row level security;
-- The app reads this table and writes only through record_company_decision_v1,
-- so every row gets its decision-time Brief version and Memory fingerprint and
-- no row is updated or deleted. Supabase's default privileges give new tables
-- to service_role with all rights, so revoke from it before granting.
revoke all on public.company_decision_events
  from public, anon, authenticated, service_role;
grant select on public.company_decision_events to service_role;

create or replace function public.record_company_decision_v1(
  p_company_workspace_id uuid,
  p_role_id uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_action text,
  p_channel text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_intro_candidate_id uuid default null,
  p_reason_text text default null,
  p_reason_tags text[] default '{}',
  p_detail jsonb default '{}'::jsonb,
  p_source_message_id bigint default null,
  p_presentation_id uuid default null,
  p_operation_id uuid default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not exists (
    select 1 from public.company_roles role
    where role.role_id = p_role_id
      and role.company_workspace_id = p_company_workspace_id
  ) then
    raise exception using errcode = 'P0002', message = 'company_decision_role_not_found';
  end if;

  insert into public.company_decision_events (
    company_workspace_id, role_id, subject_kind, subject_id, intro_candidate_id,
    action, detail, reason_text, reason_tags, channel, actor_user_id,
    operation_id, presentation_id, source_message_id,
    brief_version, memory_fingerprint, idempotency_key
  ) values (
    p_company_workspace_id, p_role_id, p_subject_kind, p_subject_id,
    p_intro_candidate_id, p_action, coalesce(p_detail, '{}'::jsonb),
    left(nullif(btrim(coalesce(p_reason_text, '')), ''), 2000),
    coalesce(p_reason_tags, '{}'), p_channel, p_actor_user_id,
    p_operation_id, p_presentation_id,
    -- A pointer to a message that is not stored in this workspace (e.g. the
    -- Ops tool debugger's synthetic id) is dropped instead of failing the
    -- decision.
    (select message.id from public.company_messages message
      where message.id = p_source_message_id
        and message.company_workspace_id = p_company_workspace_id),
    public.company_role_search_brief_version_v1(p_role_id),
    public.scheduled_company_memory_fingerprint_v1(p_role_id),
    p_idempotency_key
  )
  on conflict on constraint company_decision_events_role_idempotency_key do nothing
  returning id into v_id;

  if v_id is null then
    select event.id into v_id
    from public.company_decision_events event
    where event.role_id = p_role_id
      and event.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

create or replace function public.pass_company_intro_v2(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_channel text,
  p_reason_text text default null,
  p_source_message_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_intro record;
begin
  v_result := public.pass_company_intro_v1(
    p_intro_candidate_id, p_company_workspace_id, p_company_user_id
  );
  if v_result->>'status' = 'passed' then
    select intro.role_id, intro.talent_id, intro.revision into strict v_intro
    from public.company_intro_candidates intro
    where intro.id = p_intro_candidate_id;
    v_result := v_result || jsonb_build_object(
      'decisionId',
      public.record_company_decision_v1(
        p_company_workspace_id, v_intro.role_id, 'member_candidate',
        v_intro.talent_id, 'pass', p_channel, p_company_user_id,
        'company_intro:' || p_intro_candidate_id::text || ':pass:r' || v_intro.revision::text,
        p_intro_candidate_id, p_reason_text, '{}', '{}'::jsonb,
        p_source_message_id
      )
    );
  end if;
  return v_result;
end;
$$;

create or replace function public.request_company_intro_v2(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_next_stage_id uuid,
  p_intro_recipient_emails text[],
  p_company_appeal text,
  p_channel text,
  p_source_message_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_intro record;
begin
  v_result := public.request_company_intro_v1(
    p_intro_candidate_id, p_company_workspace_id, p_company_user_id,
    p_next_stage_id, p_intro_recipient_emails, p_company_appeal
  );
  if v_result->>'status' = 'requested' then
    select intro.role_id, intro.talent_id, intro.revision, intro.company_appeal
    into strict v_intro
    from public.company_intro_candidates intro
    where intro.id = p_intro_candidate_id;
    v_result := v_result || jsonb_build_object(
      'decisionId',
      public.record_company_decision_v1(
        p_company_workspace_id, v_intro.role_id, 'member_candidate',
        v_intro.talent_id, 'request_intro', p_channel, p_company_user_id,
        'company_intro:' || p_intro_candidate_id::text || ':request_intro:r' || v_intro.revision::text,
        p_intro_candidate_id, v_intro.company_appeal, '{}',
        jsonb_strip_nulls(jsonb_build_object('nextStageId', p_next_stage_id)),
        p_source_message_id
      )
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.record_company_decision_v1(
  uuid, uuid, text, uuid, text, text, uuid, text, uuid, text, text[], jsonb, bigint, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.pass_company_intro_v2(uuid, uuid, uuid, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.request_company_intro_v2(uuid, uuid, uuid, uuid, text[], text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_company_decision_v1(
  uuid, uuid, text, uuid, text, text, uuid, text, uuid, text, text[], jsonb, bigint, uuid, uuid
) to service_role;
grant execute on function public.pass_company_intro_v2(uuid, uuid, uuid, text, text, bigint)
  to service_role;
grant execute on function public.request_company_intro_v2(uuid, uuid, uuid, uuid, text[], text, text, bigint)
  to service_role;

-- Ops reads company intro decisions from the decision record. Until now each
-- Pass/request was also copied into talent_progress (org_company_intro_passed /
-- org_company_intro_requested, visible to nobody but Ops). That copy is no
-- longer written; this view gives Ops screens the same row shape from both
-- sources, so their kind lists and presentation stay unchanged. Other
-- talent_progress kinds pass through untouched.
create or replace view public.ops_company_progress_activity_v1
with (security_invoker = true) as
select progress.id::text as id, progress.talent_id, progress.role_id,
  progress.company_user_id, progress.kind, progress.metadata, progress.text,
  progress.created_at, progress.recommendation_id, progress.user_id
from public.talent_progress progress
where progress.kind not in ('org_company_intro_passed', 'org_company_intro_requested')
union all
select 'company_decision:' || event.id::text, event.subject_id, event.role_id,
  event.actor_user_id,
  case event.action when 'pass' then 'org_company_intro_passed'
    else 'org_company_intro_requested' end,
  jsonb_strip_nulls(jsonb_build_object(
    'workspaceId', event.company_workspace_id,
    'introCandidateId', event.intro_candidate_id,
    'decisionId', event.id,
    'channel', event.channel
  )),
  case event.action when 'pass' then '회사가 후보자 제안을 패스했습니다.'
    else '회사가 Intro를 요청했습니다.' end,
  event.created_at, null::uuid, null::text
from public.company_decision_events event
where event.subject_kind = 'member_candidate'
  and event.action in ('pass', 'request_intro');

revoke all on public.ops_company_progress_activity_v1 from public, anon, authenticated;
grant select on public.ops_company_progress_activity_v1 to service_role;

-- Copies earlier Pass/request rows from talent_progress into the decision
-- record. Idempotent (one row per talent_progress id). Run once by this
-- migration and once more right after the web deploy, to pick up decisions
-- the previous web version wrote in between. The talent_progress rows stay
-- until the later clean-up of company records in talent_progress.
-- The Brief version and Memory fingerprint of those moments are unknown and
-- stay null. channel is web when a reason was saved (only the web Pass button
-- saved one), otherwise unknown. A request keeps the card's appeal as its
-- reason, as live requests do.
create or replace function public.backfill_company_intro_decisions_from_progress_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.company_decision_events (
    company_workspace_id, role_id, subject_kind, subject_id, intro_candidate_id,
    action, reason_text, channel, actor_user_id, idempotency_key, created_at
  )
  select role.company_workspace_id, progress.role_id, 'member_candidate',
    progress.talent_id, intro.id,
    case progress.kind when 'org_company_intro_passed' then 'pass' else 'request_intro' end,
    left(coalesce(nullif(btrim(progress.metadata->>'reason'), ''),
      case when progress.kind = 'org_company_intro_requested'
        then nullif(btrim(intro.company_appeal), '') end), 2000),
    case when nullif(btrim(progress.metadata->>'reason'), '') is not null
      then 'web' else 'unknown' end,
    progress.company_user_id,
    'legacy_progress:' || progress.id::text,
    progress.created_at
  from public.talent_progress progress
  join public.company_roles role on role.role_id = progress.role_id
  left join public.company_intro_candidates intro
    on intro.id::text = progress.metadata->>'introCandidateId'
  where progress.kind in ('org_company_intro_passed', 'org_company_intro_requested')
  on conflict on constraint company_decision_events_role_idempotency_key do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.backfill_company_intro_decisions_from_progress_v1()
  from public, anon, authenticated, service_role;

select public.backfill_company_intro_decisions_from_progress_v1();
