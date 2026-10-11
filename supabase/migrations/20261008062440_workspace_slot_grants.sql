-- Time-limited, non-renewing slots share the same capacity and credit ledger as
-- subscriptions. A grant is not a Stripe subscription or a synthetic invoice.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table public.company_workspace_slots
  alter column stripe_subscription_id drop not null,
  alter column stripe_price_id drop not null,
  add column source text not null default 'stripe',
  add column grant_request_id uuid,
  add column grant_metadata jsonb,
  add constraint workspace_slot_source_check check (
    (source='stripe' and stripe_subscription_id is not null and stripe_price_id is not null
      and grant_request_id is null and grant_metadata is null)
    or (source='grant' and stripe_subscription_id is null and stripe_price_id is null
      and grant_request_id is not null and grant_metadata is not null
      and jsonb_typeof(grant_metadata)='object'
      and current_period_end is not null and current_period_end>started_at
      and ended_at is not null and ended_at<=current_period_end
      and cancel_at is not null and cancel_at<=current_period_end)
  );
create index workspace_slot_grant_request_idx on public.company_workspace_slots(grant_request_id)
  where grant_request_id is not null;

-- Replace only the original Free/paid invoice check; preserve the amount,
-- balance, period and composite workspace foreign-key constraints.
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.company_workspace_credit_periods'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%stripe_invoice_id%'
  loop execute format('alter table public.company_workspace_credit_periods drop constraint %I',c.conname); end loop;
end $$;
alter table public.company_workspace_credit_periods add constraint workspace_credit_period_kind_check check (
  (slot_id is null and allowance=5 and stripe_invoice_id is null)
  or (slot_id is not null and allowance=50)
);

create function public.workspace_billing_period_source_guard_v1()
returns trigger language plpgsql set search_path='' as $$
declare s public.company_workspace_slots%rowtype;
begin
  if new.slot_id is null then return new; end if;
  select * into strict s from public.company_workspace_slots where id=new.slot_id;
  if (s.source='stripe' and new.stripe_invoice_id is null)
    or (s.source='grant' and (new.stripe_invoice_id is not null
      or new.starts_at<>s.started_at or new.ends_at<>s.current_period_end)) then
    raise exception 'billing_period_source_conflict';
  end if;
  return new;
end $$;
create trigger workspace_billing_period_source_guard
before insert or update of slot_id,stripe_invoice_id,starts_at,ends_at on public.company_workspace_credit_periods
for each row execute function public.workspace_billing_period_source_guard_v1();
revoke all on function public.workspace_billing_period_source_guard_v1() from public,anon,authenticated;

create function public.workspace_billing_grant_slots_v1(
  p_workspace uuid, p_request uuid, p_quantity integer, p_granted_by text, p_reason text
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  w public.company_workspace%rowtype;
  s public.company_workspace_slots%rowtype;
  v_now timestamptz; v_end timestamptz; v_count integer; v_slot uuid;
  v_metadata jsonb; v_slots jsonb;
begin
  if p_workspace is null or p_request is null or p_quantity is null or p_quantity<1
    or nullif(btrim(p_granted_by),'') is null or length(p_granted_by)>200
    or nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then
    raise exception 'billing_grant_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  perform pg_advisory_xact_lock(hashtextextended('workspace-slot-grant:'||p_request::text,0));
  v_metadata:=jsonb_build_object('quantity',p_quantity,'grantedBy',btrim(p_granted_by),'reason',btrim(p_reason));
  select * into s from public.company_workspace_slots where grant_request_id=p_request limit 1;
  if found then
    select count(*),jsonb_agg(id order by id) into v_count,v_slots
      from public.company_workspace_slots where grant_request_id=p_request;
    if s.company_workspace_id<>p_workspace or s.grant_metadata<>v_metadata or v_count<>p_quantity then
      raise exception 'billing_grant_request_conflict';
    end if;
    -- Return the original expiry even after it has passed; never refill/extend.
    return jsonb_build_object('slotIds',v_slots,'startedAt',s.started_at,'endsAt',s.current_period_end,'created',false);
  end if;
  select * into w from public.company_workspace where company_workspace_id=p_workspace for update;
  if not found then raise exception 'billing_workspace_not_found'; end if;
  -- Do not silently replace an existing unlimited or unenrolled agreement.
  if w.billing_started_at is null or w.billing_model<>'standard' then
    raise exception 'billing_grant_standard_plan_required';
  end if;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  v_end:=((v_now at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul';
  for i in 1..p_quantity loop
    insert into public.company_workspace_slots(company_workspace_id,source,grant_request_id,grant_metadata,
      status,started_at,current_period_end,cancel_at,ended_at)
    values(p_workspace,'grant',p_request,v_metadata,'active',v_now,v_end,v_end,v_end) returning id into v_slot;
    insert into public.company_workspace_credit_periods(company_workspace_id,slot_id,starts_at,ends_at,confirmed_at,allowance,remaining)
      values(p_workspace,v_slot,v_now,v_end,v_now,50,50);
  end loop;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  select jsonb_agg(id order by id) into v_slots from public.company_workspace_slots where grant_request_id=p_request;
  return jsonb_build_object('slotIds',v_slots,'startedAt',v_now,'endsAt',v_end,'created',true);
end $$;
revoke all on function public.workspace_billing_grant_slots_v1(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.workspace_billing_grant_slots_v1(uuid,uuid,integer,text,text) to service_role;

-- Expired grants must not permanently block an explicit contract change.
create or replace function public.workspace_billing_enroll_v1(p_workspace uuid,p_model text,p_keep_role uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if p_model not in ('standard','scale') then raise exception 'billing_model_invalid'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace) then raise exception 'billing_workspace_not_found'; end if;
  if exists(select 1 from public.company_workspace_slots a where a.company_workspace_id=p_workspace and
      (public.workspace_billing_slot_active_v1(a,clock_timestamp()) or
        (a.source='stripe' and a.status not in ('canceled','incomplete_expired')))) then
    raise exception 'billing_active_subscription_conflict';
  end if;
  if p_model='standard' then
    select count(*) into v_count from public.company_roles where company_workspace_id=p_workspace and source_type='internal'
      and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false) and (expires_at is null or expires_at>clock_timestamp());
    if v_count>1 then
      if p_keep_role is null or not exists(select 1 from public.company_roles where role_id=p_keep_role and company_workspace_id=p_workspace and source_type='internal' and lower(status) in ('active','open','top_priority') and not coalesce(is_expired,false) and (expires_at is null or expires_at>clock_timestamp())) then raise exception 'billing_retained_role_required'; end if;
      update public.company_roles set status='paused',updated_at=clock_timestamp() where company_workspace_id=p_workspace and role_id<>p_keep_role and source_type='internal' and lower(status) in ('active','open','top_priority');
    end if;
  end if;
  update public.company_workspace set billing_model=p_model,billing_started_at=coalesce(billing_started_at,clock_timestamp()),
    billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  perform public.workspace_billing_reconcile_v1(p_workspace);
end $$;

CREATE OR REPLACE FUNCTION public.workspace_billing_summary_v2(p_workspace uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_workspace public.company_workspace%rowtype; v_now timestamptz; v_count int; v_roles int; v_balance int; v_free uuid; v_free_end timestamptz; v_slots jsonb; v_credit_slots jsonb:='[]'::jsonb; v_role uuid; v_role_name text;
begin
  perform public.workspace_billing_reconcile_v1(p_workspace);
  v_now:=clock_timestamp();
  select * into strict v_workspace from public.company_workspace where company_workspace_id=p_workspace;
  select count(*) into v_count from public.company_workspace_slots a where a.company_workspace_id=p_workspace and public.workspace_billing_slot_active_v1(a,v_now);
  select count(*) into v_roles from public.company_roles r where r.company_workspace_id=p_workspace and r.source_type='internal'
    and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>v_now);
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      v_free:=public.workspace_billing_free_period_v1(p_workspace,v_now);
      select remaining,ends_at into v_balance,v_free_end from public.company_workspace_credit_periods where id=v_free;
    else
      select coalesce(sum(p.remaining),0) into v_balance from public.company_workspace_credit_periods p
        join public.company_workspace_slots a on a.id=p.slot_id where p.company_workspace_id=p_workspace
        and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now and public.workspace_billing_slot_active_v1(a,v_now);
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label','Slot '||a.ordinal,'roleId',a.assigned_role_id,'roleName',r.name,
    'source',a.source,'status',a.status,'startedAt',a.started_at,'periodEnd',a.current_period_end,'billingInterval',a.billing_interval,'creditsRenewAt',(select min(p.ends_at) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),'cancelAt',a.cancel_at,'endedAt',a.ended_at,
    'active',public.workspace_billing_slot_active_v1(a.base,v_now),'revision',a.revision,
    'remaining',coalesce((select sum(p.remaining) from public.company_workspace_credit_periods p where p.slot_id=a.id and p.starts_at<=v_now and p.ends_at>v_now and p.confirmed_at<=v_now),0)
  ) order by a.started_at,a.id),'[]'::jsonb) into v_slots from (
    select a.*,a as base,row_number() over(order by a.started_at,a.id) ordinal from public.company_workspace_slots a where a.company_workspace_id=p_workspace
  ) a left join public.company_roles r on r.role_id=a.assigned_role_id;
  if v_workspace.billing_started_at is not null and v_workspace.billing_model='standard' then
    if v_count=0 then
      select r.role_id,r.name into v_role,v_role_name from public.company_roles r
        where r.company_workspace_id=p_workspace and r.source_type='internal'
          and lower(r.status) in ('active','open','top_priority') and not coalesce(r.is_expired,false)
          and (r.expires_at is null or r.expires_at>v_now) order by r.created_at,r.role_id limit 1;
      v_credit_slots:=jsonb_build_array(jsonb_build_object('id','free','slotId',null,'label','Free',
        'roleId',v_role,'roleName',v_role_name,'remaining',v_balance,'allowance',5,'renewsAt',v_free_end,'cancelAt',null));
    else
      select coalesce(jsonb_agg(jsonb_build_object('id',a->'id','slotId',a->'id','label',a->'label',
        'roleId',a->'roleId','roleName',a->'roleName','remaining',a->'remaining','allowance',50,
        'renewsAt',a->'creditsRenewAt','cancelAt',a->'cancelAt') order by ordinal),'[]'::jsonb)
        into v_credit_slots from jsonb_array_elements(v_slots) with ordinality as slots(a,ordinal)
        where (a->>'active')::boolean;
    end if;
  end if;
  -- balance is retained for compatibility with older diagnostic clients only.
  -- No debit or product surface may use it as a spendable workspace balance.
  return jsonb_build_object('workspaceId',p_workspace,'model',case when v_workspace.billing_started_at is null then 'legacy' when v_workspace.billing_model='scale' then 'scale' when v_count=0 then 'free' else 'slot' end,
    'activeRoles',v_roles,'capacity',case when v_workspace.billing_started_at is null or v_workspace.billing_model='scale' then null else greatest(1,v_count) end,
    'creditSlots',v_credit_slots,'balance',v_balance,'freeRenewsAt',v_free_end,'slots',v_slots,'hasCustomer',v_workspace.stripe_customer_id is not null);
end; $function$;

notify pgrst, 'reload schema';
commit;
