-- Everything a decision depended on, at the moment it was made.
--
-- Criteria and memory already have versions and every decision records them.
-- Company information (name, description, pitch and the like) did not. It now
-- has versions the same way, and a decision records that number too, so the
-- three are read back as one state of a moment (company_role_state_as_of_v1).
-- Nothing is copied or kept in step: each kind keeps its own versions and an
-- event notes the numbers current when it happened.
--
-- Harper's review of pass reasons also reads what the company said in the
-- Role's conversation (web and Slack), and may cite it. A new company message
-- makes the Role due at most once in p_message_every_hours, so the company's
-- words are read even when nobody passes on anyone.

-- 1. Company information versions.
create table public.company_info_revisions (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  revision integer not null check (revision > 0),
  snapshot jsonb not null,
  content_hash text not null,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint company_info_revisions_workspace_revision unique (company_workspace_id, revision),
  constraint company_info_revisions_workspace_transaction unique (company_workspace_id, transaction_id)
);

create index company_info_revisions_workspace_created_idx
  on public.company_info_revisions (company_workspace_id, created_at desc, revision desc);

alter table public.company_info_revisions enable row level security;
revoke all on public.company_info_revisions from public, anon, authenticated, service_role;
grant select on public.company_info_revisions to service_role;

create function public.company_info_snapshot_v1(p_workspace_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'companyName', workspace.company_name,
    'publishedName', workspace.published_name,
    'homepageUrl', workspace.homepage_url,
    'linkedinUrl', workspace.linkedin_url,
    'careerUrl', workspace.career_url,
    'description', workspace.company_description,
    'pitch', workspace.pitch,
    'brief', workspace.brief,
    'request', workspace.request
  )
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_workspace_id;
$$;

revoke all on function public.company_info_snapshot_v1(uuid) from public, anon, authenticated;
grant execute on function public.company_info_snapshot_v1(uuid) to service_role;

-- One version per transaction (its final state), none when nothing changed;
-- a later version is never older, so reads "as of a moment" see a prefix.
create function public.capture_company_info_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_hash text;
  v_previous public.company_info_revisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('company_info_revision:' || new.company_workspace_id::text, 0));
  v_snapshot := public.company_info_snapshot_v1(new.company_workspace_id);
  v_hash := md5(v_snapshot::text);
  select * into v_previous
  from public.company_info_revisions revision
  where revision.company_workspace_id = new.company_workspace_id
  order by revision.revision desc
  limit 1;
  if v_previous.transaction_id = txid_current() then
    update public.company_info_revisions
    set snapshot = v_snapshot, content_hash = v_hash
    where id = v_previous.id;
    return null;
  end if;
  if v_previous.content_hash = v_hash then
    return null;
  end if;
  insert into public.company_info_revisions (company_workspace_id, revision, snapshot, content_hash, created_at)
  values (new.company_workspace_id, coalesce(v_previous.revision, 0) + 1, v_snapshot, v_hash,
    greatest(now(), coalesce(v_previous.created_at, now())));
  return null;
end;
$$;

revoke all on function public.capture_company_info_revision_v1()
  from public, anon, authenticated, service_role;

create trigger company_workspace_info_revision_insert
  after insert on public.company_workspace
  for each row execute function public.capture_company_info_revision_v1();

create trigger company_workspace_info_revision_update
  after update of company_name, published_name, homepage_url, linkedin_url, career_url,
    company_description, pitch, brief, request
  on public.company_workspace
  for each row execute function public.capture_company_info_revision_v1();

insert into public.company_info_revisions (company_workspace_id, revision, snapshot, content_hash)
select workspace.company_workspace_id, 1,
  public.company_info_snapshot_v1(workspace.company_workspace_id),
  md5(public.company_info_snapshot_v1(workspace.company_workspace_id)::text)
from public.company_workspace workspace;

-- 2. A decision notes the company information version, like the Brief and memory ones.
alter table public.company_decision_events add column if not exists company_info_revision integer;

create function public.set_company_decision_info_revision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_info_revision is null then
    select max(revision.revision) into new.company_info_revision
    from public.company_info_revisions revision
    where revision.company_workspace_id = new.company_workspace_id;
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_decision_info_revision_v1()
  from public, anon, authenticated, service_role;

create trigger company_decision_events_info_revision
  before insert on public.company_decision_events
  for each row execute function public.set_company_decision_info_revision_v1();

-- 3. The state of a moment now includes the company information.
create or replace function public.company_role_state_as_of_v1(p_role_id uuid, p_at timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'roleId', p_role_id,
    'at', p_at,
    'brief', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'source', revision.source,
        'actorUserId', revision.actor_user_id,
        'legacyBriefVersion', revision.legacy_brief_version,
        'snapshot', revision.snapshot
      )
      from public.company_role_brief_revisions revision
      where revision.role_id = p_role_id and revision.created_at <= p_at
      order by revision.revision desc
      limit 1
    ),
    'settings', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'source', revision.source,
        'actorUserId', revision.actor_user_id,
        'snapshot', revision.snapshot
      )
      from public.company_role_setting_revisions revision
      where revision.role_id = p_role_id and revision.created_at <= p_at
      order by revision.revision desc
      limit 1
    ),
    'companyInfo', (
      select jsonb_build_object(
        'revision', revision.revision,
        'createdAt', revision.created_at,
        'snapshot', revision.snapshot
      )
      from public.company_info_revisions revision
      join public.company_roles role on role.company_workspace_id = revision.company_workspace_id
      where role.role_id = p_role_id and revision.created_at <= p_at
      order by revision.revision desc
      limit 1
    ),
    'memory', (
      with version as (
        select coalesce(max(revision.id), 0) as id
        from public.company_memory_revisions revision
        join public.company_roles role on role.company_workspace_id = revision.company_workspace_id
        where role.role_id = p_role_id and revision.created_at <= p_at
      )
      select jsonb_build_object(
        'version', version.id,
        'entries', coalesce((
          select jsonb_agg(to_jsonb(entry) order by entry.entry_id)
          from public.company_memory_for_role_v1(p_role_id, version.id) entry
        ), '[]'::jsonb)
      )
      from version
    ),
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(event) order by event.created_at, event.id)
      from public.company_decision_events event
      where event.role_id = p_role_id and event.created_at <= p_at
    ), '[]'::jsonb)
  );
$$;

-- 4. The review's place in the Role's messages. Like the decision cursor, it
-- is bookkeeping and not a Role setting, so it makes no settings version.
create or replace function public.company_role_settings_snapshot_v1(p_role_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('status', role.status, 'priority', role.priority)
    || (to_jsonb(internal_role) - array[
      'role_id', 'request', 'criteria', 'memory',
      'created_at', 'updated_at', 'role_status_changed_at',
      'last_consumed_decision_id', 'last_consumed_message_id'
    ])
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = p_role_id;
$$;

alter table public.company_internal_roles
  add column if not exists last_consumed_message_id bigint;

-- Words said before this are not read back as new.
update public.company_internal_roles internal_role
set last_consumed_message_id = latest.id
from (
  select conversation.role_id, max(message.id) as id
  from public.company_messages message
  join public.company_conversations conversation on conversation.id = message.conversation_id
  where conversation.role_id is not null
  group by conversation.role_id
) latest
where latest.role_id = internal_role.role_id
  and internal_role.last_consumed_message_id is null;

-- What the company said in a Role's conversation, newest first: its members'
-- own chat and Slack messages, without structured submissions, copies of
-- messages shown elsewhere, or Harper's own team.
create function public.company_role_member_messages_v1(
  p_role_id uuid,
  p_after_id bigint,
  p_limit integer default 30
)
returns table(id bigint, company_user_id uuid, created_at timestamptz, message_type text, content text)
language sql
stable
set search_path = ''
as $$
  select message.id, message.company_user_id, message.created_at, message.message_type, message.content
  from public.company_messages message
  join public.company_conversations conversation on conversation.id = message.conversation_id
  left join public.company_users author on author.user_id = message.company_user_id
  where conversation.role_id = p_role_id
    and message.role = 'user'
    and message.message_type in ('chat', 'slack')
    and message.id > coalesce(p_after_id, 0)
    and btrim(coalesce(message.content, '')) <> ''
    and not (coalesce(message.metadata, '{}'::jsonb) ?| array[
      'companyEventUiDuplicateOf', 'onboardingSubmissionId',
      'roleCreationConfirmation', 'slackRoleCreationBootstrap'
    ])
    and lower(coalesce(author.email, '')) not like '%@matchharper.com'
  order by message.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.company_role_member_messages_v1(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.company_role_member_messages_v1(uuid, bigint, integer) to service_role;

create function public.consume_company_messages_v1(
  p_role_id uuid,
  p_through_id bigint
) returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.company_internal_roles internal_role
  set last_consumed_message_id = p_through_id
  where internal_role.role_id = p_role_id
    and p_through_id is not null
    and coalesce(internal_role.last_consumed_message_id, 0) < p_through_id
  returning internal_role.last_consumed_message_id;
$$;

revoke all on function public.consume_company_messages_v1(uuid, bigint) from public, anon, authenticated;
grant execute on function public.consume_company_messages_v1(uuid, bigint) to service_role;

-- 5. What the review reads: also each pass's Brief version, the criteria of
-- those versions, and the company's messages since the last review.
create or replace function public.company_decision_consolidation_input_v1(
  p_role_id uuid,
  p_limit integer default 40
) returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'roleId', role.role_id,
    'workspaceId', role.company_workspace_id,
    'open', lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and coalesce(role.status, '') not in ('draft', 'ended', 'deleted')
      and role.is_expired is not true,
    'criteria', coalesce(internal_role.criteria, '[]'::jsonb),
    'cursor', internal_role.last_consumed_decision_id,
    'briefRevision', (
      select max(revision.revision) from public.company_role_brief_revisions revision
      where revision.role_id = role.role_id
    ),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', recent.id,
          'subjectId', recent.subject_id,
          'reasonTags', to_jsonb(recent.reason_tags),
          'hasReasonText', recent.reason_text is not null,
          'briefRevision', recent.brief_revision,
          'createdAt', recent.created_at
        ) order by recent.id desc)
      from (
        select event.id, event.subject_id, event.reason_tags, event.reason_text, event.brief_revision, event.created_at
        from public.company_decision_events event
        where event.role_id = role.role_id
          and event.subject_kind = 'member_candidate'
          and (event.action in ('pass', 'stop')
            or (event.action = 'stage_change' and event.detail->>'stage' = 'archived'))
        order by event.id desc
        limit greatest(1, least(coalesce(p_limit, 40), 200))
      ) recent
    ), '[]'::jsonb),
    'briefCriteriaAt', coalesce((
      select jsonb_object_agg(revision.revision::text, revision.snapshot->'search'->'criteria')
      from public.company_role_brief_revisions revision
      where revision.role_id = role.role_id
        and revision.revision in (
          select event.brief_revision
          from public.company_decision_events event
          where event.role_id = role.role_id
            and event.subject_kind = 'member_candidate'
            and event.brief_revision is not null
          order by event.id desc
          limit greatest(1, least(coalesce(p_limit, 40), 200))
        )
    ), '{}'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', said.id,
          'channel', said.message_type,
          'text', said.content,
          'createdAt', said.created_at
        ) order by said.id desc)
      from public.company_role_member_messages_v1(role.role_id, internal_role.last_consumed_message_id, 30) said
    ), '[]'::jsonb),
    'pending', (
      select jsonb_build_object(
        'id', proposal.id,
        'payload', proposal.payload,
        'contentKey', proposal.content_key,
        'baseBriefRevision', proposal.base_brief_revision,
        'expiresAt', proposal.expires_at
      )
      from public.company_agent_update_proposals proposal
      where proposal.workspace_id = role.company_workspace_id
        and proposal.scope_key = 'brief:' || role.role_id::text
        and proposal.status = 'pending'
      order by proposal.created_at desc
      limit 1
    ),
    'answeredKeys', coalesce((
      select jsonb_agg(distinct answered.detail->>'contentKey')
      from public.company_decision_events answered
      where answered.role_id = role.role_id
        and answered.subject_kind = 'proposal'
        and answered.action in ('accept', 'reject')
        and answered.detail ? 'contentKey'
    ), '[]'::jsonb)
  )
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = p_role_id;
$$;

-- 6. A Role is also due when the company said something new, once a day at most.
drop function public.enqueue_due_company_decision_consolidations_v1(integer, integer, integer);

create function public.enqueue_due_company_decision_consolidations_v1(
  p_every integer default 3,
  p_wait_days integer default 7,
  p_limit integer default 20,
  p_message_every_hours integer default 24
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_created boolean;
  v_queued integer := 0;
begin
  for v_due in
    select role.role_id, role.company_workspace_id, conversation.id as conversation_id,
      fresh.newest_id, said.newest_id as newest_message_id,
      coalesce(fresh.actor_user_id, said.actor_user_id, author.user_id) as actor_user_id
    from public.company_internal_roles internal_role
    join public.company_roles role on role.role_id = internal_role.role_id
    join public.company_conversations conversation
      on conversation.role_id = role.role_id
      and conversation.company_workspace_id = role.company_workspace_id
    cross join lateral (
      select count(*) as new_count,
        min(event.created_at) as oldest_at,
        max(event.id) as newest_id,
        (array_agg(event.actor_user_id order by event.id desc)
          filter (where event.actor_user_id is not null))[1] as actor_user_id
      from public.company_decision_events event
      where event.role_id = internal_role.role_id
        and event.id > coalesce(internal_role.last_consumed_decision_id, 0)
        and event.subject_kind = 'member_candidate'
        and (event.action in ('pass', 'stop')
          or (event.action = 'stage_change' and event.detail->>'stage' = 'archived'))
    ) fresh
    cross join lateral (
      select max(message.id) as newest_id,
        (array_agg(message.company_user_id order by message.id desc)
          filter (where message.company_user_id is not null))[1] as actor_user_id
      from public.company_role_member_messages_v1(
        role.role_id, internal_role.last_consumed_message_id, 100) message
    ) said
    -- Slack messages often have no linked member; the job still needs someone to act as.
    left join lateral (
      select message.company_user_id as user_id
      from public.company_messages message
      where message.conversation_id = conversation.id
        and message.company_user_id is not null
      order by message.id desc
      limit 1
    ) author on true
    where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and coalesce(role.status, '') not in ('draft', 'ended', 'deleted')
      and role.is_expired is not true
      and (
        (fresh.new_count > 0
          and fresh.actor_user_id is not null
          and (fresh.new_count >= greatest(1, p_every)
            or fresh.oldest_at <= now() - make_interval(days => greatest(1, p_wait_days))))
        or (said.newest_id is not null
          and coalesce(said.actor_user_id, author.user_id) is not null
          and not exists (
            select 1 from public.company_agent_web_action_jobs job
            where job.role_id = internal_role.role_id
              and job.action_name = 'consolidate_decisions'
              and job.created_at > now() - make_interval(hours => greatest(1, p_message_every_hours))
          ))
      )
      and not exists (
        select 1 from public.company_agent_web_action_jobs job
        where job.role_id = internal_role.role_id
          and job.action_name = 'consolidate_decisions'
          and job.status in ('queued', 'processing', 'retry')
      )
    order by coalesce(fresh.oldest_at, now())
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    select enqueued.created into v_created
    from public.enqueue_company_agent_web_action_v1(
      v_due.company_workspace_id, v_due.conversation_id, v_due.role_id, v_due.actor_user_id,
      'consolidate_decisions',
      jsonb_build_object('roleId', v_due.role_id, 'throughDecisionId', v_due.newest_id),
      'consolidate_decisions:' || v_due.role_id::text || ':' || coalesce(v_due.newest_id::text, '0')
        || coalesce(':message-' || v_due.newest_message_id::text, '')
    ) enqueued;
    if v_created then
      v_queued := v_queued + 1;
    end if;
  end loop;
  return v_queued;
end;
$$;

revoke all on function public.enqueue_due_company_decision_consolidations_v1(integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_company_decision_consolidations_v1(integer, integer, integer, integer)
  to service_role;
