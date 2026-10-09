-- An annual payment funds monthly credit periods. Existing workspaces stay staged.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
alter table public.company_workspace_agents add column billing_interval text not null default 'month' check (billing_interval in ('month','year'));
alter table public.company_workspace_credit_periods drop constraint company_workspace_credit_periods_stripe_invoice_id_key;
create unique index company_workspace_invoice_period_key on public.company_workspace_credit_periods(stripe_invoice_id,starts_at) where stripe_invoice_id is not null;
create or replace function public.workspace_billing_summary_v1(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_agents jsonb;
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
        and p.starts_at<=v_now and p.ends_at>v_now and public.workspace_billing_agent_active_v1(a,v_now);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Agent '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.agent_id=a.id and p.starts_at<=v_now and p.ends_at>v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_agent_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.agent_id=a.id and p.starts_at<=v_now and p.ends_at>v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_agents from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_agents a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'agent' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then null else greatest(1,v_count) end,
    'balance',v_balance,'freeRenewsAt',v_free_end,'agents',v_agents,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $$;

create or replace function public.workspace_billing_sync_agent_v1(p_workspace uuid,p_subscription text,p_expected_revision bigint,p_snapshot jsonb,p_periods jsonb default '[]')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_agent public.company_workspace_agents%rowtype; v_period jsonb; v_existing public.company_workspace_credit_periods%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_agent from public.company_workspace_agents where stripe_subscription_id=p_subscription for update;
  if (v_agent.id is null and p_expected_revision<>0) or (v_agent.id is not null and v_agent.revision<>p_expected_revision) then return false; end if;
  if v_agent.id is not null and v_agent.company_workspace_id<>p_workspace then raise exception 'billing_workspace_mismatch'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and stripe_customer_id=p_snapshot->>'customer') then raise exception 'billing_customer_mismatch'; end if;
  if v_agent.id is null then
    insert into public.company_workspace_agents(company_workspace_id,stripe_subscription_id,stripe_price_id,billing_interval,status,started_at,current_period_end,cancel_at,ended_at)
      values(p_workspace,p_subscription,p_snapshot->>'price',coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',(p_snapshot->>'startedAt')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz) returning * into v_agent;
  else
    update public.company_workspace_agents set billing_interval=coalesce(p_snapshot->>'billingInterval','month'),status=p_snapshot->>'status',current_period_end=(p_snapshot->>'periodEnd')::timestamptz,
      cancel_at=(p_snapshot->>'cancelAt')::timestamptz,ended_at=(p_snapshot->>'endedAt')::timestamptz,revision=revision+1,updated_at=clock_timestamp()
      where id=v_agent.id and row(billing_interval,status,current_period_end,cancel_at,ended_at) is distinct from
        row(coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz);
  end if;
  for v_period in select value from jsonb_array_elements(p_periods) loop
    select * into v_existing from public.company_workspace_credit_periods where agent_id=v_agent.id and starts_at=(v_period->>'startsAt')::timestamptz;
    if v_existing.id is not null then
      if v_existing.ends_at<>(v_period->>'endsAt')::timestamptz or v_existing.stripe_invoice_id is distinct from v_period->>'invoiceId' then raise exception 'billing_period_conflict'; end if;
    else
      insert into public.company_workspace_credit_periods(company_workspace_id,agent_id,stripe_invoice_id,starts_at,ends_at,confirmed_at,allowance,remaining)
        values(p_workspace,v_agent.id,v_period->>'invoiceId',(v_period->>'startsAt')::timestamptz,(v_period->>'endsAt')::timestamptz,coalesce((v_period->>'confirmedAt')::timestamptz,clock_timestamp()),50,50);
    end if;
  end loop;
  if jsonb_array_length(p_periods)>0 then
    update public.company_workspace set billing_started_at=coalesce(billing_started_at,clock_timestamp()),
      billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  end if;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  return true;
end; $$;

notify pgrst, 'reload schema';
commit;
