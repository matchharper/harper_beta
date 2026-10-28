begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

-- Free and assigned Roles share recruiting capabilities. Only capacity and
-- Intro allowances differ. Preserve ownership, consent and idempotent receipts.
-- BILLING POLICY START
-- Amount enumeration is pricing policy, not data integrity. The existing
-- non-null amounts, 0 <= remaining <= allowance, FKs and unique periods remain.
alter table public.company_workspace_credit_periods
  drop constraint company_workspace_credit_periods_allowance_check,
  drop constraint workspace_credit_period_kind_check;

CREATE OR REPLACE FUNCTION public.workspace_billing_free_period_v1(p_workspace uuid, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_anchor timestamp; v_local timestamp:=p_at at time zone 'Asia/Seoul'; v_n int; v_start timestamptz; v_end timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select coalesce(billing_free_anchor_at,billing_started_at,created_at) at time zone 'Asia/Seoul' into v_anchor
    from public.company_workspace where company_workspace_id=p_workspace;
  v_n:=(extract(year from v_local)::int-extract(year from v_anchor)::int)*12+extract(month from v_local)::int-extract(month from v_anchor)::int;
  if v_anchor+make_interval(months=>v_n)>v_local then v_n:=v_n-1; end if;
  v_start:=(v_anchor+make_interval(months=>v_n)) at time zone 'Asia/Seoul';
  v_end:=(v_anchor+make_interval(months=>v_n+1)) at time zone 'Asia/Seoul';
  insert into public.company_workspace_credit_periods(company_workspace_id,starts_at,ends_at,allowance,remaining)
    values(p_workspace,v_start,v_end,3,3) on conflict do nothing;
  select id into v_id from public.company_workspace_credit_periods where company_workspace_id=p_workspace and slot_id is null and starts_at=v_start;
  update public.company_workspace_credit_periods
    set remaining=greatest(0,3+coalesce((select sum(e.delta)
      from public.company_workspace_credit_events e where e.period_id=v_id
        and e.action_code in ('intro_request','connect')),0)),allowance=3
    where id=v_id and allowance<>3;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_slot uuid; v_paid_access boolean; v_delta int:=0; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_action not in ('intro_request','connect') or p_action is null then raise exception 'billing_action_invalid'; end if;
  v_now:=clock_timestamp();
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.company_workspace_id is null then raise exception 'billing_workspace_not_found'; end if;
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace) then raise exception 'billing_role_mismatch'; end if;
  select * into v_event from public.company_workspace_credit_events where company_workspace_id=p_workspace and action_code=p_action and business_key=p_key;
  if v_event.id is not null then
    if v_event.role_id<>p_role or v_event.talent_id<>p_talent or v_event.action_payload<>p_payload then raise exception 'billing_action_conflict'; end if;
    return v_event.id;
  end if;
  -- Legacy contracts are deliberately opt-in. No retroactive debits.
  if v_workspace.billing_started_at is null then return null; end if;
  if v_workspace.billing_model='standard' then
    -- Role assignment and spending share the same workspace lock. Retries above
    -- retain their original event/period even after a Role moves or pauses.
    perform public.workspace_billing_reconcile_v1(p_workspace);
    v_now:=clock_timestamp();
    select a.id into v_slot from public.company_workspace_slots a
      where a.company_workspace_id=p_workspace and a.assigned_role_id=p_role
        and public.workspace_billing_slot_active_v1(a,v_now) for update;
    v_paid_access:=public.role_matching_slot_type_v1(p_role,v_now)='paid';
    if not exists(select 1 from public.company_roles r where r.role_id=p_role
      and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
      and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
      raise exception 'workspace_role_slot_required';
    end if;
    -- Preserve existing no-slot contract access. Ordinary Free Roles use the
    -- shared allowance; assigned Roles prefer their own paid credits first.
    if v_slot is not null or not v_paid_access then
      select p.id into v_period from public.company_workspace_credit_periods p
        where p.company_workspace_id=p_workspace and p.slot_id=v_slot
          and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
        order by p.ends_at,p.starts_at,p.id limit 1 for update;
      if v_period is null then
        v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
        if (select remaining from public.company_workspace_credit_periods where id=v_period)<1 then
          raise exception 'workspace_credits_exhausted';
        end if;
      end if;
      update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
      v_delta:=-1;
    end if;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.workspace_billing_summary_v2(p_workspace uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_slots jsonb; v_credit_slots jsonb:='[]'::jsonb;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
    select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Slot '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'source',a.source,'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_slot_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_slots from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_slots a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','slotId',a->'id','label',a->'label',
      'roleId',a->'roleId','roleName',a->'roleName','remaining',a->'remaining','allowance',50,
      'renewsAt',a->'creditsRenewAt','cancelAt',a->'cancelAt') order by ordinal),'[]'::jsonb)
      into v_credit_slots from jsonb_array_elements(v_slots) with ordinality as slots(a,ordinal)
      where (a->>'active')::boolean;
    v_credit_slots:=jsonb_build_array(jsonb_build_object('id','free','slotId',null,'label','Shared credits',
      'roleId',null,'roleName',null,'remaining',v_balance,'allowance',3,'renewsAt',v_free_end,'cancelAt',null))||v_credit_slots;
    select sum((s->>'remaining')::int) into v_balance from jsonb_array_elements(v_credit_slots) s;
  end if;
  -- balance is retained for compatibility with older diagnostic clients only.
  -- No debit or product surface may use it as a spendable workspace balance.
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'slot' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then v_count+1+(select count(*) from public.company_roles r join public.company_internal_roles i using(role_id) where r.company_workspace_id=p_workspace and i.is_harper_tailored_role and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now) and not exists(select 1 from public.company_workspace_slots a where a.assigned_role_id=r.role_id and public.workspace_billing_slot_active_v1(a,v_now))) else null end,
    'creditSlots',v_credit_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'slots',v_slots,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $function$;

-- Rebase current and pre-created future standard shared periods using actual
-- Intro usage. Keep paid pools, expired periods and separate agreements unchanged.
do $$ declare w record; v_now timestamptz; begin
  for w in select company_workspace_id from public.company_workspace
    where billing_started_at is not null and billing_model='standard'
    order by company_workspace_id loop
    perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||w.company_workspace_id::text,0));
    v_now:=clock_timestamp();
    update public.company_workspace_credit_periods p
      set allowance=3,remaining=greatest(0,3+coalesce((select sum(e.delta)
        from public.company_workspace_credit_events e where e.period_id=p.id
          and e.action_code in ('intro_request','connect')),0))
      where p.company_workspace_id=w.company_workspace_id and p.slot_id is null
        and p.ends_at>v_now and p.allowance<>3;
  end loop;
end $$;
revoke all on function public.workspace_billing_free_period_v1(uuid,timestamptz),public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean),public.workspace_billing_summary_v2(uuid) from public,anon,authenticated;
grant execute on function public.workspace_billing_free_period_v1(uuid,timestamptz),public.workspace_billing_debit_v1(uuid,text,text,uuid,uuid,uuid,jsonb,boolean),public.workspace_billing_summary_v2(uuid) to service_role;
-- BILLING POLICY END

create or replace function public.enqueue_talent_first_search_v1(
  p_company_workspace_id uuid, p_role_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_run public.company_first_search_runs; v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'company_matching_enqueue:' || p_company_workspace_id::text, 0));
  if not exists (
    select 1 from public.company_roles r
    join public.company_internal_roles i on i.role_id=r.role_id
    where r.role_id=p_role_id and r.company_workspace_id=p_company_workspace_id
      and lower(btrim(coalesce(r.source_type,'')))='internal'
      and lower(btrim(coalesce(r.status,'')))='active'
      and not coalesce(r.is_expired,false)
      and (r.expires_at is null or r.expires_at>v_now)
      and coalesce(lower(btrim(r.information->>'testOnly')),'') not in ('true','1','yes','on')
      and nullif(btrim(i.request),'') is not null
      and public.role_matching_slot_type_v1(r.role_id,v_now) in ('free','paid')
  ) then
    return jsonb_build_object('status','not_queued','reason','role_unavailable');
  end if;
  select * into v_run from public.company_first_search_runs r
    where r.company_workspace_id=p_company_workspace_id
      and r.status in ('queued','running')
      and (r.role_id=p_role_id or p_role_id=any(r.scheduled_role_ids)
           or p_role_id=any(r.requested_role_ids))
    order by r.created_at desc, r.id desc limit 1;
  if found then
    return jsonb_build_object('status',v_run.status,'runId',v_run.id);
  end if;
  insert into public.company_first_search_runs (
    company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,available_at,scheduled_role_ids
  ) values (p_company_workspace_id,p_role_id,v_now,'talent_first_requested',
    'unified_role_matching_v6','queued',v_now,array[p_role_id]) returning * into v_run;
  return jsonb_build_object('status',v_run.status,'runId',v_run.id);
end $$;

revoke all on function public.enqueue_talent_first_search_v1(uuid,uuid) from public,anon,authenticated;

grant execute on function public.enqueue_talent_first_search_v1(uuid,uuid) to service_role;

create or replace function public.guard_talent_first_matching_selection_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_run public.company_first_search_runs;
begin
  if new.decision not in ('candidate_first','both') then return new; end if;
  if coalesce(public.role_matching_slot_type_v1(new.opportunity_id,clock_timestamp()),'unavailable') not in ('free','paid') then
    raise exception 'talent_first_role_unavailable';
  end if;
  if new.run_id is not null then
    select * into v_run from public.company_first_search_runs where id=new.run_id;
    if v_run.id is null or v_run.trigger_reason='company_requested' then
      raise exception 'talent_first_role_run_schedule_required';
    end if;
    if v_run.trigger_reason='talent_first_requested' then
      if v_run.role_id is distinct from new.opportunity_id or new.decision='both' then
        raise exception 'talent_first_requested_role_required';
      end if;
    -- First activation is authorized by its durable receipt, not the periodic
    -- calendar. Scheduled child searches retain that same receipt in options.
    elsif public.company_matching_activation_is_valid_v1(
      case when v_run.trigger_reason='role_activated' then v_run.id
        when v_run.trigger_reason='scheduled' and v_run.contract_version='scheduled_agentic_role_search_v1'
          then nullif(v_run.request_options->>'activationRunId','')::uuid end,
      v_run.company_workspace_id,new.opportunity_id) then
      return new;
    elsif extract(isodow from clock_timestamp() at time zone 'Asia/Seoul') not in (1,3,5)
       or extract(isodow from v_run.scheduled_slot at time zone 'Asia/Seoul') not in (1,3,5)
       or (v_run.scheduled_slot at time zone 'Asia/Seoul')::date
          <> (clock_timestamp() at time zone 'Asia/Seoul')::date then
      raise exception 'talent_first_role_run_schedule_required';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.guard_talent_first_matching_selection_v1() from public,anon,authenticated;

create or replace function public.talent_internal_role_priority_review_is_recommendable_v1(
  p_fit public.talent_opportunity_fit
)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select case
    when p_fit.id is null or coalesce(public.role_matching_slot_type_v1(p_fit.opportunity_id,now()),'unavailable') not in ('free','paid') then false
    when p_fit.fit_contract_version='talent_role_fit_v2' then
      p_fit.evaluated_stage=2 and p_fit.input_fingerprint is not null
      and coalesce(lower(nullif(btrim(p_fit.human_label),'')),'fit')='fit'
      and (
        p_fit.decisions_assessment is not null
        or (p_fit.role_fit not in ('bad','unfit')
            and p_fit.candidate_fit not in ('bad','unfit')
            and p_fit.company_fit not in ('bad','unfit'))
      )
      and (
        (p_fit.decisions_assessment is null
          and p_fit.role_fit='perfect' and p_fit.company_fit='perfect')
        or exists (
          select 1 from public.talent_opportunity_matching_review selected
          where selected.talent_id=p_fit.talent_id and selected.opportunity_id=p_fit.opportunity_id
            and selected.input_fingerprint=p_fit.input_fingerprint
            and selected.decision in ('candidate_first','both') and selected.closed_at is null
        )
      )
    else public.talent_internal_role_is_candidate_visible_v1(p_fit)
  end;
$$;

revoke all on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit) from public,anon,authenticated;

grant execute on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit) to service_role;

create or replace function public.enqueue_company_scheduled_matching_v1(
  p_workspace uuid,p_role uuid,p_slot timestamptz,p_actor uuid,p_conversation uuid,p_activation_run uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare key text; prior record; role_row record; kind text; local_slot timestamp; weekday text; job record;
begin
  if p_slot is null or (p_activation_run is null and p_slot<>date_trunc('hour',p_slot)) then raise exception 'invalid_scheduled_slot'; end if;
  if p_activation_run is not null and not public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)
    then raise exception 'invalid_role_activation'; end if;
  if p_activation_run is not null then
    select scheduled_slot into p_slot from public.company_first_search_runs where id=p_activation_run;
  end if;
  key:=case when p_activation_run is null then public.company_scheduled_matching_key_v1(p_workspace,p_role,p_slot)
    else 'role-activation-matching:'||p_activation_run::text end;
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||p_workspace::text,0));
  select id into prior from public.company_agent_web_action_jobs where idempotency_key=key;
  if found then return jsonb_build_object('status','already_queued','jobId',prior.id); end if;
  select id,status into prior from public.company_first_search_runs
    where company_workspace_id=p_workspace and role_id=p_role and scheduled_slot=p_slot
      and trigger_reason='scheduled' and p_activation_run is null order by created_at limit 1;
  if found then return jsonb_build_object('status','existing_legacy_run','runId',prior.id,'runStatus',prior.status); end if;
  if not exists(select 1 from public.company_user_workspace where company_workspace_id=p_workspace
      and company_user_id=p_actor and authority in ('owner','admin'))
    or not public.company_memory_scope_allowed_v1(p_workspace,p_actor,'role',null,p_role)
    then raise exception 'scheduled_actor_forbidden' using errcode='42501'; end if;
  select r.*,i.request,i.is_company_first_search,i.intro_search_date,i.intro_search_time,
    i.email_notifications_enabled into role_row
    from public.company_roles r join public.company_internal_roles i using(role_id)
    where r.role_id=p_role and r.company_workspace_id=p_workspace;
  if not found or role_row.source_type<>'internal' or role_row.status<>'active' or coalesce(role_row.is_expired,false)
    or role_row.expires_at<=now() or nullif(btrim(role_row.request),'') is null
    or lower(coalesce(role_row.information->>'testOnly','false')) in ('true','1','yes','on')
    then raise exception 'scheduled_role_unavailable'; end if;
  local_slot:=p_slot at time zone 'Asia/Seoul'; weekday:=to_char(local_slot,'Dy');
  kind:=public.role_matching_slot_type_v1(p_role,now());
  if kind not in ('free','paid') then raise exception 'scheduled_role_unavailable'; end if;
  if p_activation_run is null and (local_slot::date<>(now() at time zone 'Asia/Seoul')::date or p_slot>now()
    or not ((kind in ('free','paid') and weekday in ('Mon','Wed','Fri') and extract(hour from local_slot)=9)
      or (kind in ('free','paid') and role_row.is_company_first_search
        and weekday=any(coalesce(role_row.intro_search_date,array['Mon','Wed','Fri']))
        and extract(hour from local_slot)=coalesce(role_row.intro_search_time,9)
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))))
   ) then raise exception 'scheduled_slot_not_due'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(p_workspace,p_conversation,p_role,p_actor,
    'scheduled_matching_review',jsonb_build_object('roleId',p_role,'scheduledSlot',p_slot,'activationRunId',p_activation_run),key);
  return jsonb_build_object('status','queued','jobId',job.job_id,'created',job.created);
end $$;

revoke all on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid) to service_role;

create or replace function public.company_scheduled_accepted_inventory_v1(p_workspace uuid,p_role uuid,p_activation_run uuid default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('acceptedUnintroduced',(select count(*) from public.talent_opportunity_recommendation rec
      where rec.role_id=p_role and public.accepted_role_pair_is_available_v1(rec.id)),
    'readyCompanyWide',(select count(distinct talent_id) from public.company_intro_candidates
      where company_workspace_id=p_workspace and status='ready'),
    'pendingForRole',(select count(*) from (select distinct on(talent_id) tag
      from public.talent_opportunity_tag where opportunity_id=p_role
      order by talent_id,updated_at desc,created_at desc,id desc) latest where tag='내부:연결대기'),
    'newRegistrations',case when exists(select 1 from public.company_first_search_runs where role_id=p_role
      and status='succeeded' and source_cutoff is not null) then (select count(*) from public.talent_users where deleted_at is null
      and created_at>(select max(source_cutoff) from public.company_first_search_runs
        where role_id=p_role and status='succeeded')) else null end,
    'newRegistrationsDenominator','All non-deleted accounts after the last completed Role cutoff; not role-retrieved or compatible unassessed people',
    'currentRoutes',to_jsonb(array_remove(array[
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and (to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)) then 'candidate_first' end,
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and ((i.is_company_first_search and to_char(now() at time zone 'Asia/Seoul','Dy')=any(coalesce(i.intro_search_date,array['Mon','Wed','Fri'])))
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role))
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))
        then 'company_first' end],null)))
  from public.company_roles r join public.company_internal_roles i using(role_id)
  where r.role_id=p_role and r.company_workspace_id=p_workspace
$$;

revoke all on function public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) to service_role;

create or replace function public.scheduled_candidate_delivery_is_current_v1(p_talent uuid,p_role uuid,p_delivery uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
select exists(
  select 1 from public.talent_opportunity_matching_review selected
  left join public.company_first_search_runs search on search.id=selected.run_id
  left join public.opportunity_discovery_run source on source.id=selected.source_discovery_run_id
    and source.talent_id=selected.talent_id
  left join public.opportunity_discovery_run delivery on delivery.id=p_delivery and delivery.talent_id=p_talent
  join public.company_roles role on role.role_id=selected.opportunity_id
  join public.company_workspace company on company.company_workspace_id=role.company_workspace_id
  join public.talent_users talent on talent.user_id=selected.talent_id
  join public.talent_setting setting on setting.user_id=talent.user_id
  where selected.talent_id=p_talent and selected.opportunity_id=p_role
    and selected.decision in ('candidate_first','both') and selected.closed_at is null
    and (selected.recommendation_id is null or exists (
      select 1 from public.talent_opportunity_recommendation own_rec
      where own_rec.id=selected.recommendation_id and own_rec.discovery_run_id=p_delivery))
    and (selected.discovery_run_id is null or selected.discovery_run_id=p_delivery)
    and (p_delivery is null or (
      delivery.context_metrics->'internalContactSelection'->'selectedReviewIds' ? selected.id::text
      and delivery.context_metrics->'internalContactSelection'->'result'->'roleIds' ? p_role::text
    ) or (
      -- Keep already queued/sealed deliveries compatible during rollout.
      selected.discovery_run_id=p_delivery
      and delivery.trigger_payload->'manualInternalRecommendation'->>'matchingReviewId'=selected.id::text
    ))
    and selected.not_before<=now()
    and not exists (
      select 1 from public.opportunity_discovery_run contact_run
      where contact_run.talent_id=p_talent
        and (contact_run.context_metrics->'internalContactSelection'->'rejectedReviewIds' ? selected.id::text
          or (contact_run.context_metrics->'internalContactSelection'->'handledReviewIds' ? selected.id::text
        and (contact_run.context_metrics->'internalContactSelection'->'result'->'roleIds'='[]'::jsonb
          or exists (
            select 1 from public.talent_opportunity_delivery sent
            where sent.discovery_run_id=contact_run.id and sent.talent_id=p_talent
              and sent.channel='email' and sent.status='sent'
              and not exists (
                select 1 from jsonb_array_elements_text(
                  contact_run.context_metrics->'internalContactSelection'->'result'->'roleIds') chosen(id)
                where not coalesce(sent.payload->'recommendationExposures'
                  @> jsonb_build_array(jsonb_build_object('roleId',chosen.id)),false)))))))
    and (search.contract_version='scheduled_agentic_role_search_v1' or source.id is not null)
    and exists (
      select 1 from public.company_role_candidate_evaluations evaluation
      where evaluation.talent_id=p_talent and evaluation.role_id=p_role
        and evaluation.stage=2 and evaluation.input_contract_version='worker_behavior_v1'
        and evaluation.brief_version=selected.evaluation_ref->>'briefVersion'
        and evaluation.input_fingerprint=selected.input_fingerprint
        and (evaluation.id::text=selected.evaluation_ref->>'evaluationId'
          or (selected.evaluation_ref->>'evaluationId' is null
            and evaluation.run_id::text=selected.evaluation_ref->>'runId'))
    )
    and selected.evaluation_ref->>'inputContractVersion'='worker_behavior_v1'
    and selected.evaluation_ref->>'briefVersion'=public.company_role_search_brief_version_v1(p_role)
    and selected.evaluation_ref->>'talentSourceFingerprint'=public.scheduled_talent_source_fingerprint_v1(p_talent)
    and selected.evaluation_ref->>'companyMemoryFingerprint'=public.scheduled_company_memory_fingerprint_v1(p_role)
    and selected.evaluation_ref->>'inputFingerprint'=selected.input_fingerprint
    and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
    and (role.expires_at is null or role.expires_at>now())
    and lower(coalesce(role.information->>'testOnly','false')) not in ('true','1','yes','on')
    and public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
    and talent.deleted_at is null and setting.get_internal_recommendation is not false
    and setting.profile_visibility in ('open_to_matches','exceptional_only')
    and not exists(select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
      where lower(btrim(blocked.name)) in (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))
    and not exists(select 1 from public.talent_opportunity_recommendation rec
      where rec.talent_id=p_talent and rec.role_id=p_role and rec.discovery_run_id is distinct from p_delivery)
    and not exists(select 1 from public.company_intro_candidates intro
      where intro.talent_id=p_talent and intro.role_id=p_role
        and (intro.status in ('awaiting_talent','connecting','connected','passed') or intro.close_reason='company_passed'))
    and not exists(select 1 from public.talent_opportunity_tag tag
      where tag.talent_id=p_talent and tag.opportunity_id=p_role
        and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%'))
);
$$;

revoke all on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) from public,anon,authenticated;

grant execute on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) to service_role;

notify pgrst,'reload schema';
commit;
