-- Credits belong to each Agent slot, and follow the slot when Roles are swapped.
-- Existing periods and historical debits stay intact; no balances are reset.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function public.workspace_billing_debit_v1(p_workspace uuid,p_action text,p_key text,p_role uuid,p_talent uuid,p_actor uuid,p_payload jsonb default '{}',p_complete boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_event public.company_workspace_credit_events%rowtype; v_now timestamptz; v_period uuid; v_count int; v_agent uuid; v_delta int:=0; v_id uuid;
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
  -- Legacy contracts are deliberately opt-in. No retroactive debits.
  if v_workspace.billing_started_at is null then return null; end if;
  if v_workspace.billing_model='standard' then
    -- Role assignment and spending share the same workspace lock. Retries above
    -- retain their original event/period even after a Role moves or pauses.
    perform public.workspace_billing_reconcile_v1(p_workspace);
    v_now:=clock_timestamp();
    select count(*) into v_count from public.company_workspace_agents a where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,v_now);
    if v_count=0 then
      if p_action='connect' then raise exception 'workspace_feature_unavailable'; end if;
      if not exists(select 1 from public.company_roles r where r.role_id=p_role
        and r.source_type='internal' and lower(r.status) in ('active','open','top_priority')
        and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now)) then
        raise exception 'workspace_role_slot_required';
      end if;
      v_period:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      if (select remaining from public.company_workspace_credit_periods where id=v_period)<1 then raise exception 'workspace_credits_exhausted'; end if;
    else
      select a.id into v_agent from public.company_workspace_agents a
        where a.company_workspace_id=p_workspace and a.assigned_role_id=p_role
          and public.workspace_billing_agent_active_v1(a,v_now) for update;
      if v_agent is null then raise exception 'workspace_role_slot_required'; end if;
      -- Never fall back to another Agent or the Free allowance.
      select p.id into v_period from public.company_workspace_credit_periods p
        where p.company_workspace_id=p_workspace and p.agent_id=v_agent
          and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and p.remaining>=1
        order by p.ends_at,p.starts_at,p.id limit 1 for update;
      if v_period is null then raise exception 'workspace_credits_exhausted'; end if;
    end if;
    update public.company_workspace_credit_periods set remaining=remaining-1 where id=v_period;
    v_delta:=-1;
  end if;
  insert into public.company_workspace_credit_events(company_workspace_id,period_id,action_code,business_key,role_id,talent_id,actor_id,delta,action_payload,completed_at)
    values(p_workspace,v_period,p_action,p_key,p_role,p_talent,p_actor,v_delta,p_payload,case when p_complete then v_now end) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.workspace_billing_summary_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_agents jsonb; v_slots jsonb:='[]'::jsonb; v_role uuid; v_role_name text;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_agents a where a.company_workspace_id=p_workspace and public.workspace_billing_agent_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
    else
      select coalesce(sum(p.remaining),0) into v_balance from public.company_workspace_credit_periods p
        join public.company_workspace_agents a on a.id=p.agent_id where p.company_workspace_id=p_workspace
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and public.workspace_billing_agent_active_v1(a,v_now);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Agent '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.agent_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_agent_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.agent_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_agents from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_agents a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      select r.role_id,r.name into v_role,v_role_name from public.company_roles r
        where r.company_workspace_id=p_workspace and r.source_type='internal'
          and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
          and (r.expires_at is null or r.expires_at>v_now) order by r.created_at,r.role_id limit 1;
      v_slots:=jsonb_build_array(jsonb_build_object('id','free','agentId',null,'label','Free',
        'roleId',v_role,'roleName',v_role_name,'remaining',v_balance,'allowance',5,'renewsAt',v_free_end,'cancelAt',null));
    else
      select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','agentId',a->'id','label',a->'label',
        'roleId',a->'roleId','roleName',a->'roleName','remaining',a->'remaining','allowance',50,
        'renewsAt',a->'creditsRenewAt','cancelAt',a->'cancelAt') order by ordinal),'[]'::jsonb)
        into v_slots from jsonb_array_elements(v_agents) with ordinality as agents(a,ordinal)
        where (a->>'active')::boolean;
    end if;
  end if;
  -- balance is retained for compatibility with older diagnostic clients only.
  -- No debit or product surface may use it as a spendable workspace balance.
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'agent' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then null else greatest(1,v_count) end,
    'creditSlots',v_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'agents',v_agents,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $$;

notify pgrst, 'reload schema';
commit;
