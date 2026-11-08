-- Pass reasons sharpen the criteria (S2 G).
--
-- Harper reads the reasons a company gave when it passed on candidates for a
-- Role (Pass on a card, a stop, an archive). When most recent reasons name the
-- same criterion, it suggests making that criterion one level stricter, in the
-- Role's To-do. Nothing changes the Brief until a company user accepts; the
-- web then saves the change through the Brief's one write path (role start for
-- role start roles, otherwise the criteria save), which records the new Brief
-- version. The counting itself is done by the web (criteriaProposals.ts).
--
-- 1. company_internal_roles.last_consumed_decision_id: the newest decision the
--    consolidation has read for the Role. Bookkeeping, not a Role setting, so
--    Role setting versions leave it out. It starts at each Role's newest
--    decision: decisions so far carry no reason tags and are not read as new.
-- 2. enqueue_due_company_decision_consolidations_v1 (run by the 5-minute
--    dispatcher): a Role is due after p_every new pass decisions, or
--    p_wait_days after the oldest one not read yet. It queues one
--    consolidate_decisions job in the Role conversation
--    (company_agent_web_action_jobs); the job reads
--    company_decision_consolidation_input_v1 and moves the cursor with
--    consume_company_decisions_v1.
-- 3. company_agent_update_proposals: kind, base_brief_revision, content_key.
--    Existing rows are company_data (chat and Slack confirmations, unchanged).
--    A criteria_refinement row has scope_key brief:<roleId> (one pending at a
--    time per Role) and is answered in the To-do, not in chat, so it has no
--    presented chat message.
-- 4. create_company_brief_proposal_v1 / resolve_company_brief_proposal_v1 add
--    and answer such a proposal. An answer is a company decision (subject_kind
--    proposal, accept or reject, channel todo); a change the company accepted
--    or dismissed once is never suggested again.
--
-- Company-side only: nothing here reaches candidates.

-- 1. The cursor ------------------------------------------------------------

-- Same as 20261105090100, with the cursor left out of the settings snapshot.
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
      'last_consumed_decision_id'
    ])
  from public.company_roles role
  join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
  where role.role_id = p_role_id;
$$;

alter table public.company_internal_roles
  add column if not exists last_consumed_decision_id bigint;

update public.company_internal_roles internal_role
set last_consumed_decision_id = latest.id
from (
  select event.role_id, max(event.id) as id
  from public.company_decision_events event
  group by event.role_id
) latest
where latest.role_id = internal_role.role_id
  and internal_role.last_consumed_decision_id is null;

-- Pass decisions of a Role, newest first: what the consolidation reads.
create index if not exists company_decision_events_role_pass_idx
  on public.company_decision_events (role_id, id)
  where subject_kind = 'member_candidate'
    and (action in ('pass', 'stop') or (action = 'stage_change' and detail->>'stage' = 'archived'));

-- 2. Proposal columns -------------------------------------------------------

alter table public.company_agent_update_proposals
  add column if not exists kind text not null default 'company_data',
  add column if not exists base_brief_revision integer,
  add column if not exists content_key text;

do $$
begin
  alter table public.company_agent_update_proposals
    add constraint company_agent_update_proposals_kind check (
      kind in ('company_data', 'criteria_refinement')
      and (kind = 'company_data' or char_length(coalesce(content_key, '')) between 1 and 300)
    );
exception when duplicate_object then null;
end $$;

-- The table and its chat/Slack functions exist only in the live database. Its
-- checks that a pending proposal has a presented chat message now apply to
-- company_data rows only; each such check is found by its definition and kept
-- as it is for them.
do $migration$
declare
  v_check record;
begin
  for v_check in
    select con.conname, pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    where con.conrelid = 'public.company_agent_update_proposals'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%presented_message_id IS NOT NULL%'
      and pg_get_constraintdef(con.oid) not like '%company_data%'
  loop
    execute format('alter table public.company_agent_update_proposals drop constraint %I', v_check.conname);
    execute format(
      'alter table public.company_agent_update_proposals add constraint %I check ((kind <> %L) or %s)',
      v_check.conname, 'company_data',
      regexp_replace(regexp_replace(v_check.definition, '^CHECK ', ''), ' NOT VALID$', '')
    );
  end loop;
end $migration$;

-- 3. Reading a Role for consolidation ---------------------------------------

-- The Role's criteria, cursor and current Brief version, its newest pass
-- decisions (with whether a free-text reason exists, never the text), the
-- pending suggestion and the changes the company already answered.
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
          'createdAt', recent.created_at
        ) order by recent.id desc)
      from (
        select event.id, event.subject_id, event.reason_tags, event.reason_text, event.created_at
        from public.company_decision_events event
        where event.role_id = role.role_id
          and event.subject_kind = 'member_candidate'
          and (event.action in ('pass', 'stop')
            or (event.action = 'stage_change' and event.detail->>'stage' = 'archived'))
        order by event.id desc
        limit greatest(1, least(coalesce(p_limit, 40), 200))
      ) recent
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

-- Moves the cursor forward only.
create or replace function public.consume_company_decisions_v1(
  p_role_id uuid,
  p_through_id bigint
) returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.company_internal_roles internal_role
  set last_consumed_decision_id = p_through_id
  where internal_role.role_id = p_role_id
    and p_through_id is not null
    and coalesce(internal_role.last_consumed_decision_id, 0) < p_through_id
  returning internal_role.last_consumed_decision_id;
$$;

-- Queues consolidation for the Roles that are due; returns how many it queued.
-- The job acts as the person behind the newest new decision; it changes
-- nothing on their behalf (a suggestion waits for a company answer).
create or replace function public.enqueue_due_company_decision_consolidations_v1(
  p_every integer default 3,
  p_wait_days integer default 7,
  p_limit integer default 20
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
      fresh.newest_id, fresh.actor_user_id
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
    where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and coalesce(role.status, '') not in ('draft', 'ended', 'deleted')
      and role.is_expired is not true
      and fresh.new_count > 0
      and fresh.actor_user_id is not null
      and (fresh.new_count >= greatest(1, p_every)
        or fresh.oldest_at <= now() - make_interval(days => greatest(1, p_wait_days)))
      and not exists (
        select 1 from public.company_agent_web_action_jobs job
        where job.role_id = internal_role.role_id
          and job.action_name = 'consolidate_decisions'
          and job.status in ('queued', 'processing', 'retry')
      )
    order by fresh.oldest_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    select enqueued.created into v_created
    from public.enqueue_company_agent_web_action_v1(
      v_due.company_workspace_id, v_due.conversation_id, v_due.role_id, v_due.actor_user_id,
      'consolidate_decisions',
      jsonb_build_object('roleId', v_due.role_id, 'throughDecisionId', v_due.newest_id),
      'consolidate_decisions:' || v_due.role_id::text || ':' || v_due.newest_id::text
    ) enqueued;
    if v_created then
      v_queued := v_queued + 1;
    end if;
  end loop;
  return v_queued;
end;
$$;

-- 4. Suggestions in the To-do -----------------------------------------------

-- Adds a pending suggestion for the Role unless one is pending or the company
-- already answered the same change.
create or replace function public.create_company_brief_proposal_v1(
  p_workspace_id uuid,
  p_role_id uuid,
  p_kind text,
  p_content_key text,
  p_base_brief_revision integer,
  p_summary text,
  p_preview text,
  p_payload jsonb,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := 'brief:' || p_role_id::text;
  v_id uuid;
begin
  if p_kind is distinct from 'criteria_refinement'
     or nullif(btrim(coalesce(p_content_key, '')), '') is null
     or nullif(btrim(coalesce(p_summary, '')), '') is null
     or nullif(btrim(coalesce(p_preview, '')), '') is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_expires_at is null or p_expires_at <= now() then
    raise exception using errcode = '22023', message = 'company_brief_proposal_invalid';
  end if;
  if not exists (
    select 1 from public.company_roles role
    where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
  ) then
    raise exception using errcode = 'P0002', message = 'company_brief_proposal_role_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('company_brief_proposal:' || p_role_id::text, 0));

  update public.company_agent_update_proposals proposal
  set status = 'expired', payload = null, preview = null, presentation_text = null, updated_at = now()
  where proposal.workspace_id = p_workspace_id
    and proposal.scope_key = v_scope
    and proposal.status = 'pending'
    and proposal.expires_at <= now();
  if exists (
    select 1 from public.company_agent_update_proposals proposal
    where proposal.workspace_id = p_workspace_id
      and proposal.scope_key = v_scope
      and proposal.status = 'pending'
  ) then
    return jsonb_build_object('status', 'pending_exists');
  end if;
  if exists (
    select 1 from public.company_decision_events event
    where event.role_id = p_role_id
      and event.subject_kind = 'proposal'
      and event.action in ('accept', 'reject')
      and event.detail->>'contentKey' = p_content_key
  ) then
    return jsonb_build_object('status', 'answered_before');
  end if;

  insert into public.company_agent_update_proposals (
    workspace_id, scope_key, status, source, kind, content_key, base_brief_revision,
    summary, preview, presentation_text, payload, message_type, expires_at
  ) values (
    p_workspace_id, v_scope, 'pending', 'chat', p_kind, btrim(p_content_key), p_base_brief_revision,
    left(btrim(p_summary), 160), left(btrim(p_preview), 3000), left(btrim(p_summary), 6000),
    p_payload, 'chat', p_expires_at
  ) returning id into v_id;
  return jsonb_build_object('status', 'created', 'proposalId', v_id);
end;
$$;

-- Answers a suggestion. claim: the web is about to save the change (another
-- person's answer waits for 2 minutes); release: the save failed; apply: the
-- change is saved, recorded as accept; reject: dismissed, recorded as reject;
-- stale: the criterion changed meanwhile (no decision). A claim returns the
-- payload the web saves from.
create or replace function public.resolve_company_brief_proposal_v1(
  p_proposal_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.company_agent_update_proposals%rowtype;
  v_claim jsonb;
  v_claimed_by_other boolean;
  v_action text;
  v_decision bigint;
begin
  if p_action is null or p_action not in ('claim', 'release', 'apply', 'reject', 'stale') then
    raise exception using errcode = '22023', message = 'company_brief_proposal_action_invalid';
  end if;
  if p_action in ('claim', 'release', 'apply', 'reject') and p_actor_user_id is null then
    raise exception using errcode = '22023', message = 'company_brief_proposal_actor_required';
  end if;

  select proposal.* into v_proposal
  from public.company_agent_update_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.workspace_id = p_workspace_id
    and proposal.scope_key = 'brief:' || p_role_id::text
    and proposal.kind = 'criteria_refinement'
  for update;
  if v_proposal.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_proposal.status <> 'pending' then
    return jsonb_build_object('status', v_proposal.status);
  end if;

  v_claim := v_proposal.payload->'claim';
  v_claimed_by_other := v_claim is not null
    and (v_claim->>'at')::timestamptz > now() - interval '2 minutes'
    and v_claim->>'by' is distinct from p_actor_user_id::text;

  if p_action = 'release' then
    if v_claim->>'by' = p_actor_user_id::text then
      update public.company_agent_update_proposals
      set payload = payload - 'claim', updated_at = now()
      where id = v_proposal.id;
    end if;
    return jsonb_build_object('status', 'pending');
  end if;
  -- A claimed save in progress finishes first.
  if v_claimed_by_other then
    return jsonb_build_object('status', 'busy');
  end if;
  if v_proposal.expires_at <= now() and p_action <> 'apply' then
    update public.company_agent_update_proposals
    set status = 'expired', payload = null, preview = null, presentation_text = null, updated_at = now()
    where id = v_proposal.id;
    return jsonb_build_object('status', 'expired');
  end if;

  if p_action = 'claim' then
    update public.company_agent_update_proposals
    set payload = payload || jsonb_build_object(
        'claim', jsonb_build_object('by', p_actor_user_id, 'at', now())),
      updated_at = now()
    where id = v_proposal.id;
    return jsonb_build_object(
      'status', 'claimed',
      'payload', v_proposal.payload - 'claim',
      'contentKey', v_proposal.content_key,
      'baseBriefRevision', v_proposal.base_brief_revision
    );
  end if;
  if p_action = 'stale' then
    update public.company_agent_update_proposals
    set status = 'stale', payload = null, preview = null, presentation_text = null, updated_at = now()
    where id = v_proposal.id;
    return jsonb_build_object('status', 'stale');
  end if;
  if p_action = 'apply' and v_claim->>'by' is distinct from p_actor_user_id::text then
    return jsonb_build_object('status', 'not_claimed');
  end if;

  v_action := case p_action when 'apply' then 'accept' else 'reject' end;
  update public.company_agent_update_proposals
  set status = case p_action when 'apply' then 'applied' else 'rejected' end,
      applied_at = case p_action when 'apply' then now() end,
      payload = null, preview = null, presentation_text = null, updated_at = now()
  where id = v_proposal.id;
  v_decision := public.record_company_decision_v1(
    p_workspace_id, p_role_id, 'proposal', v_proposal.id, v_action, 'todo', p_actor_user_id,
    'proposal:' || v_proposal.id::text || ':' || v_action,
    null, null, '{}',
    coalesce(p_detail, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'kind', v_proposal.kind,
      'contentKey', v_proposal.content_key,
      'baseBriefRevision', v_proposal.base_brief_revision,
      'change', v_proposal.payload->'change',
      'evidence', v_proposal.payload->'evidence'
    ))
  );
  return jsonb_build_object(
    'status', case p_action when 'apply' then 'applied' else 'rejected' end,
    'decisionId', v_decision
  );
end;
$$;

revoke all on function public.company_decision_consolidation_input_v1(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.consume_company_decisions_v1(uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.enqueue_due_company_decision_consolidations_v1(integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.create_company_brief_proposal_v1(uuid, uuid, text, text, integer, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.resolve_company_brief_proposal_v1(uuid, uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.company_decision_consolidation_input_v1(uuid, integer) to service_role;
grant execute on function public.consume_company_decisions_v1(uuid, bigint) to service_role;
grant execute on function public.enqueue_due_company_decision_consolidations_v1(integer, integer, integer) to service_role;
grant execute on function public.create_company_brief_proposal_v1(uuid, uuid, text, text, integer, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.resolve_company_brief_proposal_v1(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
