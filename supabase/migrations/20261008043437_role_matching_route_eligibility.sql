-- Local implementation: shared billing entitlement, route guards and enqueue fixes.
begin;

create or replace function public.role_matching_slot_type_v1(p_role_id uuid, p_at timestamptz default now())
returns text language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select case
      when internal_role.is_harper_tailored_role or workspace.billing_started_at is null
        or workspace.billing_model = 'scale' then 'paid'
      when exists (select 1 from public.company_workspace_slots slot
        where slot.company_workspace_id = role.company_workspace_id
          and slot.assigned_role_id = role.role_id
          and public.workspace_billing_slot_active_v1(slot,p_at)) then 'paid'
      when not exists (select 1 from public.company_workspace_slots slot
        where slot.company_workspace_id = role.company_workspace_id
          and public.workspace_billing_slot_active_v1(slot,p_at)) then 'free'
      else 'unavailable'
    end
    from public.company_roles role
    join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id = role.company_workspace_id
    where role.role_id = p_role_id
  ),'unavailable');
$$;
revoke all on function public.role_matching_slot_type_v1(uuid,timestamptz) from public,anon;
grant execute on function public.role_matching_slot_type_v1(uuid,timestamptz) to authenticated,service_role;

create or replace function public.talent_first_pair_is_available_v1(p_talent_id uuid,p_role_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not exists (select 1 from public.talent_opportunity_recommendation
    where talent_id=p_talent_id and role_id=p_role_id)
  and not exists (select 1 from public.talent_opportunity_matching_review
    where talent_id=p_talent_id and opportunity_id=p_role_id
      and decision in ('candidate_first','both') and closed_at is null and recommendation_id is null)
  and not exists (select 1 from public.company_intro_candidates
    where talent_id=p_talent_id and role_id=p_role_id
      and (status in ('awaiting_talent','connecting','connected','passed') or close_reason='company_passed'))
  and not exists (select 1 from public.talent_opportunity_tag
    where talent_id=p_talent_id and opportunity_id=p_role_id
      and (tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag like '내부단계:%'));
$$;
revoke all on function public.talent_first_pair_is_available_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.talent_first_pair_is_available_v1(uuid,uuid) to service_role;

-- First activation waits for the Brief. Off-day activations wait for the next
-- allowed slot; Free without automatic company recommendations does not enqueue.
create or replace function public.enqueue_activated_role_matching_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role public.company_roles; v_internal public.company_internal_roles;
  v_now timestamptz := now(); v_local timestamp := now() at time zone 'Asia/Seoul';
  v_slot_type text; v_slot timestamptz; v_day text;
begin
  select * into v_role from public.company_roles where role_id = new.role_id;
  select * into v_internal from public.company_internal_roles where role_id = new.role_id;
  if v_internal.role_id is null or nullif(btrim(v_internal.request),'') is null
     or lower(btrim(coalesce(v_role.source_type,''))) <> 'internal'
     or lower(btrim(coalesce(v_role.status,''))) <> 'active'
     or coalesce(v_role.is_expired,false)
     or (v_role.expires_at is not null and v_role.expires_at <= v_now)
     or coalesce(lower(btrim(v_role.information->>'testOnly')),'') in ('true','1','yes','on') then
    return new;
  end if;
  v_slot_type := public.role_matching_slot_type_v1(v_role.role_id,v_now);
  v_day := to_char(v_local,'Dy');
  if v_slot_type not in ('free','paid') then return new; end if;
  if (v_slot_type='paid' and v_day in ('Mon','Wed','Fri'))
     or (v_internal.is_company_first_search and v_day=any(v_internal.intro_search_date)
         and extract(hour from v_local)>=v_internal.intro_search_time) then
    v_slot := v_now;
  else
    select min(slot_at) into v_slot from (
      select (date_trunc('day',v_local)+days*interval '1 day'+hour*interval '1 hour')
             at time zone 'Asia/Seoul' as slot_at
      from generate_series(0,7) days cross join generate_series(0,23) hour
      where (v_slot_type='paid' and hour=9
             and to_char(v_local+days*interval '1 day','Dy') in ('Mon','Wed','Fri'))
         or (v_internal.is_company_first_search and hour=v_internal.intro_search_time
             and to_char(v_local+days*interval '1 day','Dy')=any(v_internal.intro_search_date))
    ) slots where slot_at>=v_now;
  end if;
  if v_slot is null then return new; end if;
  insert into public.company_first_search_runs (
    company_workspace_id, role_id, scheduled_slot, trigger_reason, contract_version,
    status, available_at, scheduled_role_ids
  ) values (v_role.company_workspace_id,v_role.role_id,v_slot,'role_activated',
            'unified_role_matching_v6','queued',v_slot,array[v_role.role_id])
  on conflict do nothing;
  return new;
end $$;
revoke all on function public.enqueue_activated_role_matching_v1() from public,anon,authenticated;
drop trigger if exists enqueue_internal_role_matching on public.company_internal_roles;
create trigger enqueue_internal_role_matching
  after insert or update of request on public.company_internal_roles
  for each row execute function public.enqueue_activated_role_matching_v1();

-- Explicit Run Search is company-first; candidate pending capacity is irrelevant.
CREATE OR REPLACE FUNCTION public.enqueue_company_matching_search_v1(p_company_workspace_id uuid, p_company_user_id uuid, p_role_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_role record;
  v_ready_count integer := 0;
  v_ready_backlog_limit integer;
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

  if public.role_matching_slot_type_v1(p_role_id,v_now) = 'unavailable' then
    return jsonb_build_object('status','not_queued','reason','role_unavailable',
      'roleId',p_role_id,'roleName',v_role.name);
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

  select count(distinct intro.talent_id)::integer
  into v_ready_count
  from public.company_intro_candidates intro
  where intro.company_workspace_id = p_company_workspace_id
    and intro.status = 'ready';

  select (settings.company_first->>'ready_backlog_limit')::integer
  into strict v_ready_backlog_limit
  from public.worker_runtime_settings settings
  where settings.name = 'default';

  if coalesce(v_ready_count, 0) >= v_ready_backlog_limit then
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
    'unified_role_matching_v6',
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
$function$;

-- A caller cannot persist an unauthorized talent-first selection even if it
-- bypasses the worker selector. Onboarding remains user initiated; role-run
-- selections follow the M/W/F schedule and never the explicit company search.
create or replace function public.guard_talent_first_matching_selection_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_run public.company_first_search_runs;
begin
  if new.decision not in ('candidate_first','both') then return new; end if;
  if public.role_matching_slot_type_v1(new.opportunity_id,clock_timestamp()) <> 'paid' then
    raise exception 'talent_first_paid_slot_required';
  end if;
  if new.run_id is not null then
    select * into v_run from public.company_first_search_runs where id=new.run_id;
    if v_run.id is null or v_run.trigger_reason='company_requested'
       or extract(isodow from clock_timestamp() at time zone 'Asia/Seoul') not in (1,3,5)
       or extract(isodow from v_run.scheduled_slot at time zone 'Asia/Seoul') not in (1,3,5)
       or (v_run.scheduled_slot at time zone 'Asia/Seoul')::date
          <> (clock_timestamp() at time zone 'Asia/Seoul')::date then
      raise exception 'talent_first_role_run_schedule_required';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_talent_first_matching_selection_v1() from public,anon,authenticated;
create trigger guard_talent_first_matching_selection
  before insert or update of decision,opportunity_id,run_id on public.talent_opportunity_matching_review
  for each row execute function public.guard_talent_first_matching_selection_v1();

-- Immediate candidate-requested review must obey the same Free/Paid entitlement.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)'::regprocedure)
  into v_definition;
  if position('when p_fit.id is null then false' in v_definition)=0 then
    raise exception 'priority_review_recommendable_patch_anchor_missing';
  end if;
  v_definition := replace(v_definition,'when p_fit.id is null then false',
    'when p_fit.id is null or public.role_matching_slot_type_v1(p_fit.opportunity_id,now()) <> ''paid'' then false');
  execute v_definition;
end $migration$;
commit;
