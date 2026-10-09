-- Reconcile verified missing/older role-matching objects in production.
-- Keep the already-live shared-free-credit role_matching_slot_type_v1 function.
-- No candidate/role/fit/recommendation/outbox rows are inserted or updated.
-- Canonical sources: 20261008043437, 20261008062900, 20261008080311.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Reconstructible numeric search cache for the role-scoring-list retriever.
-- It carries no preference, assessment, recommendation or conversation fact.
-- Exact cosine is computed on a bounded eligible SQL pool in the worker; no
-- global ANN index is introduced by this change.
create table if not exists public.talent_profile_search_embeddings (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  content_fingerprint text not null,
  embedding_model text not null,
  embedding real[] not null check (array_ndims(embedding)=1 and cardinality(embedding)=1536),
  updated_at timestamptz not null default now()
);
alter table public.talent_profile_search_embeddings enable row level security;
revoke all on public.talent_profile_search_embeddings from public,anon,authenticated;
grant select,insert,update,delete on public.talent_profile_search_embeddings to service_role;
comment on table public.talent_profile_search_embeddings is
  'Worker-only, reconstructible canonical Profile embeddings; not fit or durable user facts.';

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
drop trigger if exists guard_talent_first_matching_selection on public.talent_opportunity_matching_review;
create trigger guard_talent_first_matching_selection
  before insert or update of decision,opportunity_id,run_id on public.talent_opportunity_matching_review
  for each row execute function public.guard_talent_first_matching_selection_v1();

-- Immediate candidate-requested review must obey the same Free/Paid entitlement.
do $migration$
declare v_definition text;
begin
  select pg_get_functiondef('public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)'::regprocedure)
  into v_definition;
  if position('when p_fit.id is null or public.role_matching_slot_type_v1(p_fit.opportunity_id,now()) <> ''paid'' then false' in v_definition)>0 then
    return;
  end if;
  if position('when p_fit.id is null then false' in v_definition)=0 then
    raise exception 'priority_review_recommendable_patch_anchor_missing';
  end if;
  v_definition := replace(v_definition,'when p_fit.id is null then false',
    'when p_fit.id is null or public.role_matching_slot_type_v1(p_fit.opportunity_id,now()) <> ''paid'' then false');
  execute v_definition;
end $migration$;

alter table public.company_first_slack_outbox
  add column if not exists delivery_kind text not null default 'company_first';
drop index if exists public.company_first_slack_outbox_run_channel_chunk_idx;
create unique index company_first_slack_outbox_run_channel_chunk_idx
  on public.company_first_slack_outbox(run_id,channel_id,delivery_kind,chunk_index);

create or replace function public.accepted_role_pair_is_available_v1(p_recommendation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.talent_opportunity_recommendation rec
    join public.company_roles role on role.role_id=rec.role_id
    join public.company_internal_roles internal_role on internal_role.role_id=role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id=role.company_workspace_id
    join public.talent_users talent on talent.user_id=rec.talent_id
    join public.talent_setting setting on setting.user_id=rec.talent_id
    where rec.id=p_recommendation_id and rec.feedback='like' and rec.saved_stage='connected'
      and coalesce(rec.opportunity_type,'') <> 'intro_request'
      and public.current_talent_recommendation_id_v1(rec.id)=rec.id
      and internal_role.is_harper_tailored_role is false
      and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
      and (role.expires_at is null or role.expires_at>now())
      and coalesce(lower(btrim(role.information->>'testOnly')),'') not in ('true','1','yes','on')
      and public.role_matching_slot_type_v1(role.role_id,now()) in ('free','paid')
      and talent.deleted_at is null and setting.is_onboarding_done is true
      and setting.profile_visibility in ('open_to_matches','exceptional_only')
      and setting.get_internal_recommendation is not false
      and not exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      and not exists (select 1 from public.talent_opportunity_recommendation newer
        where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
          and (newer.created_at,newer.id)>(rec.created_at,rec.id))
      and not exists (select 1 from public.company_intro_candidates intro
        where intro.talent_id=rec.talent_id and intro.role_id=rec.role_id)
      and not exists (select 1 from public.talent_opportunity_tag tag
        where tag.talent_id=rec.talent_id and tag.opportunity_id=rec.role_id
          and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브')
            or tag.tag like '내부단계:%'))
      and not exists (select 1 from public.talent_progress progress
        where progress.talent_id=rec.talent_id and progress.role_id=rec.role_id
          and progress.kind='intro_to_company'
          and (progress.metadata->>'slackSent'='true' or progress.metadata->>'deliveryStatus' in ('pending','sent')))
      and not exists (select 1 from public.talent_opportunity_matching_review review
        join public.talent_opportunity_fit fit on fit.talent_id=review.talent_id and fit.opportunity_id=review.opportunity_id
        where review.recommendation_id=rec.id and review.decision='reject' and review.closed_at is null
          and fit.expires_at>now() and review.input_fingerprint=fit.input_fingerprint)
  );
$$;
revoke all on function public.accepted_role_pair_is_available_v1(uuid) from public,anon,authenticated;
grant execute on function public.accepted_role_pair_is_available_v1(uuid) to service_role;

-- Keep the ordinary ready-card guard; accepted connections have their own
-- permission, current acceptance, and pending-stage checks.
create or replace function public.company_first_outbox_is_deliverable_v1(p_outbox_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_first_slack_outbox outbox
    join public.company_slack_channels channel on channel.id=outbox.channel_id
      and channel.company_workspace_id=outbox.company_workspace_id and channel.is_enabled
    join public.company_slack_integrations integration on integration.company_workspace_id=outbox.company_workspace_id
      and integration.status='active' and integration.bot_token_ciphertext is not null
    where outbox.id=p_outbox_id and cardinality(outbox.candidate_ids)>0
      and outbox.delivery_kind in ('company_first','accepted_connection')
      and not exists (
        select 1 from unnest(outbox.candidate_ids) candidate(id)
        left join public.company_intro_candidates intro on intro.id=candidate.id and intro.company_workspace_id=outbox.company_workspace_id
        left join public.company_roles role on role.role_id=intro.role_id
        left join public.company_internal_roles internal_role on internal_role.role_id=intro.role_id
        left join public.company_workspace workspace on workspace.company_workspace_id=outbox.company_workspace_id
        left join public.talent_users talent on talent.user_id=intro.talent_id
        left join public.talent_setting setting on setting.user_id=intro.talent_id
        left join public.talent_opportunity_recommendation rec on rec.id=intro.recommendation_id
        where intro.id is null or talent.user_id is null or talent.deleted_at is not null
          or setting.user_id is null or setting.is_onboarding_done is not true or setting.get_internal_recommendation is false
          or setting.profile_visibility is null
          or (outbox.delivery_kind='company_first' and setting.profile_visibility<>'open_to_matches')
          or (outbox.delivery_kind='accepted_connection' and setting.profile_visibility not in ('open_to_matches','exceptional_only'))
          or exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
            where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
          or role.role_id is null or role.source_type<>'internal' or role.status<>'active' or coalesce(role.is_expired,false)
          or (role.expires_at is not null and role.expires_at<=now())
          or coalesce(lower(btrim(role.information->>'testOnly')),'') in ('true','1','yes','on')
          or public.role_matching_slot_type_v1(role.role_id,now())='unavailable'
          or exists (select 1 from public.company_role_notification_channels opt_out
            where opt_out.role_id=intro.role_id and opt_out.channel_id=outbox.channel_id)
          or (outbox.delivery_kind='company_first' and (intro.status<>'ready' or internal_role.is_company_first_search is not true))
          or (outbox.delivery_kind='accepted_connection' and (
            intro.status<>'closed' or intro.close_reason is distinct from 'route_replaced'
            or intro.presentation->>'deliveryKind' is distinct from 'accepted_connection'
            or internal_role.is_harper_tailored_role is distinct from false
            or rec.id is null or rec.feedback is distinct from 'like' or rec.saved_stage is distinct from 'connected'
            or rec.opportunity_type='intro_request'
            or public.current_talent_recommendation_id_v1(rec.id)<>rec.id
            or rec.talent_id<>intro.talent_id or rec.role_id<>intro.role_id
            or exists (select 1 from public.talent_opportunity_recommendation newer
              where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
                and (newer.created_at,newer.id)>(rec.created_at,rec.id))
            or not exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id and tag.tag='내부:연결대기')
            or exists (select 1 from public.talent_opportunity_tag tag
              where tag.talent_id=intro.talent_id and tag.opportunity_id=intro.role_id
                and (tag.tag in ('내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브') or tag.tag like '내부단계:%'))
          ))
      )
  );
$$;
revoke all on function public.company_first_outbox_is_deliverable_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_first_outbox_is_deliverable_v1(uuid) to service_role;
-- Accepted handoffs do not consume the ordinary company-first ready backlog.
do $patch$
declare v_definition text;
begin
  select pg_get_functiondef('public.enqueue_company_matching_search_v1(uuid,uuid,uuid)'::regprocedure) into v_definition;
  if position('if coalesce(v_ready_count, 0) >= v_ready_backlog_limit and not exists (' in v_definition)>0
    and position('public.accepted_role_pair_is_available_v1(rec.id)' in v_definition)>0 then
    return;
  end if;
  if position('if coalesce(v_ready_count, 0) >= v_ready_backlog_limit then' in v_definition)=0 then
    raise exception 'accepted_review_enqueue_patch_anchor_missing';
  end if;
  v_definition := replace(v_definition,
    'if coalesce(v_ready_count, 0) >= v_ready_backlog_limit then',
    'if coalesce(v_ready_count, 0) >= v_ready_backlog_limit and not exists (
       select 1 from public.talent_opportunity_recommendation rec
       where rec.role_id=p_role_id and public.accepted_role_pair_is_available_v1(rec.id)
     ) then');
  execute v_definition;
end $patch$;

commit;
