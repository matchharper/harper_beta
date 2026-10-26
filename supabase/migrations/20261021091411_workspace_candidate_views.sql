-- Profile opening belongs to the existing Role x talent row. Evaluation upserts
-- deliberately do not write this field. The existing usage ledger is the receipt
-- and recovery source, not a new recommendation/judgment table.
alter table public.talent_opportunity_fit add column if not exists is_opened boolean not null default false;
-- Actions evolve; retain existing ownership, balance and idempotency constraints.
alter table public.company_workspace_credit_events drop constraint if exists company_workspace_credit_events_action_code_check;

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
    values(p_workspace,v_start,v_end,10,10) on conflict do nothing;
  select id into v_id from public.company_workspace_credit_periods where company_workspace_id=p_workspace and slot_id is null and starts_at=v_start;
  update public.company_workspace_credit_periods
    set remaining=greatest(0,10-(select count(*) from public.company_workspace_credit_events e
      where e.period_id=v_id and e.action_code='candidate_view' and e.delta=-1)),allowance=10
    where id=v_id;
  return v_id;
end; $function$
;


create or replace function public.workspace_candidate_access_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_period uuid; v_workspace public.company_workspace%rowtype; v_remaining int; v_end timestamptz;
begin
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    v_period:=public.workspace_billing_free_period_v1(p_workspace,clock_timestamp());
    select remaining,ends_at into v_remaining,v_end from public.company_workspace_credit_periods where id=v_period;
  end if;
  return jsonb_build_object(
    'paidRoleIds',coalesce((select jsonb_agg(r.role_id) from public.company_roles r
      where r.company_workspace_id=p_workspace and public.role_matching_slot_type_v1(r.role_id,clock_timestamp())='paid'),'[]'::jsonb),
    'openedPairs',coalesce((select jsonb_agg(pair) from (
      select f.opportunity_id::text||':'||f.talent_id::text pair from public.talent_opportunity_fit f
        join public.company_roles r on r.role_id=f.opportunity_id where r.company_workspace_id=p_workspace and f.is_opened
      union select e.role_id::text||':'||e.talent_id::text from public.company_workspace_credit_events e
        where e.company_workspace_id=p_workspace and e.action_code in ('candidate_view','intro_request','connect')
      union select i.role_id::text||':'||i.talent_id::text from public.company_intro_candidates i
        where i.company_workspace_id=p_workspace and i.requested_at is not null
    ) opened),'[]'::jsonb),
    'remaining',v_remaining,'allowance',case when v_period is not null then 10 else null end,'renewsAt',v_end);
end; $$;

-- Server verifies the caller's exact Role permission and company-visible pair
-- before calling. The transaction rechecks ownership and serializes all spending.
create or replace function public.workspace_open_candidate_v1(p_workspace uuid,p_role uuid,p_talent uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_period uuid; v_opened boolean; v_paid boolean; v_now timestamptz; v_key text:=p_role::text||':'||p_talent::text;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace)
    or not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then
    raise exception 'billing_role_mismatch';
  end if;
  if not exists(select 1 from public.company_intro_candidates where company_workspace_id=p_workspace and role_id=p_role and talent_id=p_talent)
    and not exists(select 1 from public.talent_opportunity_recommendation where role_id=p_role and talent_id=p_talent) then
    raise exception 'billing_candidate_not_found';
  end if;
  v_paid:=public.role_matching_slot_type_v1(p_role,v_now)='paid';
  v_opened:=exists(select 1 from public.talent_opportunity_fit where opportunity_id=p_role and talent_id=p_talent and is_opened)
    or exists(select 1 from public.company_workspace_credit_events where company_workspace_id=p_workspace
      and role_id=p_role and talent_id=p_talent and action_code in ('candidate_view','intro_request','connect'))
    or exists(select 1 from public.company_intro_candidates where company_workspace_id=p_workspace and role_id=p_role and talent_id=p_talent and requested_at is not null);
  if not v_opened then
    if not v_paid then
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period and remaining>0;
      if not found then raise exception 'workspace_views_exhausted'; end if;
    end if;
    insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,completed_at)
      values(p_workspace,v_period,'candidate_view',v_key,p_role,p_talent,p_actor,case when v_period is null then 0 else -1 end,v_now);
  end if;
  insert into public.talent_opportunity_fit(talent_id,opportunity_id,is_opened)
    values(p_talent,p_role,true) on conflict(talent_id,opportunity_id) do update set is_opened=true;
  return public.workspace_candidate_access_v1(p_workspace)||jsonb_build_object('alreadyOpened',v_opened,'charged',not v_opened and not v_paid);
end; $$;
revoke all on function public.workspace_candidate_access_v1(uuid) from public,anon,authenticated;
revoke all on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.workspace_candidate_access_v1(uuid) to service_role;
grant execute on function public.workspace_open_candidate_v1(uuid,uuid,uuid,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.workspace_billing_debit_v1(p_workspace uuid, p_action text, p_key text, p_role uuid, p_talent uuid, p_actor uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_complete boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_slot uuid; v_delta int:=0; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_now:=clock_timestamp();
  select * into v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  if v_workspace.company_workspace_id is null then raise exception 'billing_workspace_not_found'; end if;
  if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace) then raise exception 'billing_role_mismatch'; end if;
  select * into v_event from public.company_workspace_credit_events where company_workspace_id=p_workspace and action_code=p_action and business_key=p_key;
  if v_event.id is not null then
    if v_event.role_id<>p_role or v_event.talent_id<>p_talent or v_event.action_payload<>p_payload then raise exception 'billing_action_conflict'; end if;
    return v_event.id;
  end if;
  if p_action not in ('intro_request','connect') then raise exception 'billing_action_invalid'; end if;
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
    -- A shared allowance never grants paid-only connection access.
    if p_action='connect' and public.role_matching_slot_type_v1(p_role,v_now)<>'paid' then raise exception 'workspace_feature_unavailable'; end if;
    if not exists(select 1 from public.company_roles r where r.role_id=p_role
      and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
      and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
      raise exception 'workspace_role_slot_required';
    end if;
    if p_action='intro_request' and public.role_matching_slot_type_v1(p_role,v_now)<>'paid'
      and not exists(select 1 from public.talent_opportunity_fit f where f.opportunity_id=p_role and f.talent_id=p_talent and f.is_opened)
      and not exists(select 1 from public.company_workspace_credit_events e where e.company_workspace_id=p_workspace
        and e.role_id=p_role and e.talent_id=p_talent and e.action_code in ('candidate_view','intro_request','connect')) then
      raise exception 'workspace_candidate_view_required';
    end if;
    -- Free Roles have unlimited Intro requests after viewing. Contract Roles
    -- without a subscription slot retain their existing contract access.
    if v_slot is not null then
    -- Paid Intro allowances are separate from the shared profile views.
    select p.id into v_period from public.company_workspace_credit_periods p
      where p.company_workspace_id=p_workspace and p.slot_id=v_slot
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
      order by p.ends_at,p.starts_at,p.id limit 1 for update;
    if v_period is null then raise exception 'workspace_credits_exhausted'; end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
    end if;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $function$;


alter table public.company_first_slack_outbox add column if not exists profile_access jsonb;

notify pgrst, 'reload schema';
