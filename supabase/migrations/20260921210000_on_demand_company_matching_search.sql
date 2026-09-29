-- Let an authorized company user request a fresh company-scoped matching run.
-- The long-lived Python worker consumes the same durable queue as scheduled runs.
begin;

alter table public.company_first_search_runs
  add column if not exists requested_role_ids uuid[] not null default '{}'::uuid[];

comment on column public.company_first_search_runs.requested_role_ids is
  'Roles explicitly named by company users for this run. Empty means the scheduled eligible-role set.';

create or replace function public.enqueue_company_matching_search_v1(
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_role_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_role record;
  v_pending_count integer := 0;
  v_ready_count integer := 0;
  v_queued public.company_first_search_runs%rowtype;
  v_running public.company_first_search_runs%rowtype;
  v_run public.company_first_search_runs%rowtype;
  v_role_version timestamptz;
begin
  if p_company_workspace_id is null
    or p_company_user_id is null
    or p_role_id is null then
    raise exception using
      errcode = '22023',
      message = 'company_matching_search_missing_input';
  end if;

  if not exists (
    select 1
    from public.company_user_workspace membership
    where membership.company_user_id = p_company_user_id
      and membership.company_workspace_id = p_company_workspace_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'company_matching_search_workspace_forbidden';
  end if;

  -- Serialize web, Slack, and scheduler enqueue decisions for this workspace.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_matching_enqueue:' || p_company_workspace_id::text,
      0
    )
  );

  select
    role.role_id,
    role.name,
    role.status,
    role.source_type,
    role.is_expired,
    role.expires_at,
    role.information,
    role.updated_at as role_updated_at,
    internal_role.request,
    internal_role.max_pending_talents,
    internal_role.updated_at as internal_updated_at
  into v_role
  from public.company_roles role
  join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  where role.role_id = p_role_id
    and role.company_workspace_id = p_company_workspace_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'company_matching_search_role_not_found';
  end if;

  if lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(v_role.status, ''))) <> 'active'
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now) then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'role_unavailable',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  if coalesce(lower(btrim(v_role.information->>'testOnly')), '')
      in ('true', '1', 'yes', 'on') then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'test_role',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  if nullif(btrim(coalesce(v_role.request, '')), '') is null then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'brief_missing',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  if not exists (
    select 1
    from public.company_slack_integrations integration
    where integration.company_workspace_id = p_company_workspace_id
      and integration.status = 'active'
      and integration.bot_token_ciphertext is not null
  ) then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'slack_not_connected',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  if not exists (
    select 1
    from public.company_slack_channels channel
    where channel.company_workspace_id = p_company_workspace_id
      and channel.is_enabled is true
      and not exists (
        select 1
        from public.company_role_notification_channels opt_out
        where opt_out.role_id = p_role_id
          and opt_out.channel_id = channel.id
      )
  ) then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'role_channel_unavailable',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  select count(distinct latest.talent_id)::integer
  into v_pending_count
  from (
    select distinct on (tag.talent_id)
      tag.talent_id,
      tag.tag
    from public.talent_opportunity_tag tag
    where tag.opportunity_id = p_role_id
    order by
      tag.talent_id,
      tag.updated_at desc,
      tag.created_at desc,
      tag.id desc
  ) latest
  where latest.tag = '내부:연결대기';

  if v_role.max_pending_talents is not null
    and coalesce(v_pending_count, 0) >= v_role.max_pending_talents then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'pending_capacity_reached',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  select count(distinct intro.talent_id)::integer
  into v_ready_count
  from public.company_intro_candidates intro
  where intro.company_workspace_id = p_company_workspace_id
    and intro.status = 'ready';

  if coalesce(v_ready_count, 0) >= 30 then
    return jsonb_build_object(
      'status', 'not_queued',
      'reason', 'ready_backlog_reached',
      'roleId', p_role_id,
      'roleName', v_role.name
    );
  end if;

  -- A queued run has not frozen its source yet, so merge this request into it
  -- and promote it to an explicit company request.
  select run.*
  into v_queued
  from public.company_first_search_runs run
  where run.company_workspace_id = p_company_workspace_id
    and run.status = 'queued'
  order by run.available_at, run.scheduled_slot, run.id
  limit 1
  for update;

  if found then
    update public.company_first_search_runs run
    set trigger_reason = 'company_requested',
        requested_role_ids = (
          select array_agg(distinct requested_role_id order by requested_role_id)
          from unnest(
            coalesce(run.requested_role_ids, '{}'::uuid[]) || array[p_role_id]
          ) as requested(requested_role_id)
        ),
        available_at = least(run.available_at, v_now),
        updated_at = v_now
    where run.id = v_queued.id
    returning run.* into v_run;

    return jsonb_build_object(
      'status', 'already_queued',
      'runId', v_run.id,
      'roleId', p_role_id,
      'roleName', v_role.name,
      'startsAfterCurrentRun', exists (
        select 1
        from public.company_first_search_runs active
        where active.company_workspace_id = p_company_workspace_id
          and active.status = 'running'
      )
    );
  end if;

  select run.*
  into v_running
  from public.company_first_search_runs run
  where run.company_workspace_id = p_company_workspace_id
    and run.status = 'running'
  order by run.started_at desc nulls last, run.id desc
  limit 1;

  v_role_version := greatest(v_role.role_updated_at, v_role.internal_updated_at);
  if found
    and v_running.source_cutoff is not null
    and v_role_version <= v_running.source_cutoff
    and p_role_id = any(coalesce(v_running.requested_role_ids, '{}'::uuid[])) then
    return jsonb_build_object(
      'status', 'already_running',
      'runId', v_running.id,
      'roleId', p_role_id,
      'roleName', v_role.name,
      'startsAfterCurrentRun', false
    );
  end if;

  insert into public.company_first_search_runs (
    company_workspace_id,
    scheduled_slot,
    trigger_reason,
    contract_version,
    status,
    available_at,
    requested_role_ids
  ) values (
    p_company_workspace_id,
    v_now,
    'company_requested',
    'company_matching_run_contract_v3',
    'queued',
    v_now,
    array[p_role_id]
  )
  returning * into v_run;

  return jsonb_build_object(
    'status', 'queued',
    'runId', v_run.id,
    'roleId', p_role_id,
    'roleName', v_role.name,
    'startsAfterCurrentRun', v_running.id is not null
  );
end;
$$;

comment on function public.enqueue_company_matching_search_v1(uuid, uuid, uuid) is
  'Queues or coalesces an explicit company request for a fresh company-scoped matching run.';

revoke all on function public.enqueue_company_matching_search_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_company_matching_search_v1(uuid, uuid, uuid)
  to service_role;

commit;
