-- One checkout/subscription may fund several independently assigned Slots.
-- No extra table: an in-flight Stripe change is durable on its target Slot.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
alter table public.company_workspace_slots
  drop constraint company_workspace_slots_stripe_subscription_id_key,
  add column subscription_slot_number integer not null default 1 check (subscription_slot_number between 1 and 100),
  add column subscription_cancel_at timestamptz,
  add column billing_change jsonb,
  add constraint company_workspace_subscription_slot_key unique(stripe_subscription_id,subscription_slot_number);
create unique index company_workspace_pending_billing_change_key
  on public.company_workspace_slots(company_workspace_id) where billing_change is not null;
drop index public.company_workspace_invoice_period_key;
create unique index company_workspace_invoice_period_key
  on public.company_workspace_credit_periods(stripe_invoice_id,starts_at,slot_id) where stripe_invoice_id is not null;

create function public.workspace_billing_sync_slots_v1(p_workspace uuid,p_subscription text,p_expected_revisions jsonb,p_snapshot jsonb,p_periods jsonb default '[]')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_revisions jsonb; v_count int; v_quantity int; v_slot public.company_workspace_slots%rowtype;
  v_period jsonb; v_existing public.company_workspace_credit_periods%rowtype; v_covered int;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if exists(select 1 from public.company_workspace_slots where stripe_subscription_id=p_subscription and company_workspace_id<>p_workspace) then raise exception 'billing_workspace_conflict'; end if;
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_workspace and stripe_customer_id=p_snapshot->>'customer') then raise exception 'billing_customer_conflict'; end if;
  if exists(select 1 from public.company_workspace_slots where company_workspace_id=p_workspace and billing_change is not null) then return false; end if;
  select coalesce(jsonb_object_agg(id::text,revision),'{}'),count(*) into v_revisions,v_count
    from public.company_workspace_slots where stripe_subscription_id=p_subscription;
  if v_revisions is distinct from p_expected_revisions then return false; end if;
  v_quantity:=(p_snapshot->>'initialQuantity')::integer;
  if v_quantity is null or v_quantity not between 1 and 100 or p_snapshot->>'quantity' is null or (p_snapshot->>'quantity')::int not between 1 and v_quantity
    or (v_count<>0 and v_count<>v_quantity) then raise exception 'billing_quantity_conflict'; end if;
  if v_count=0 then
    insert into public.company_workspace_slots(company_workspace_id,stripe_subscription_id,subscription_slot_number,stripe_price_id,billing_interval,status,started_at,current_period_end,cancel_at,ended_at)
      select p_workspace,p_subscription,n,p_snapshot->>'price',coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',
        (p_snapshot->>'startedAt')::timestamptz,(p_snapshot->>'periodEnd')::timestamptz,(p_snapshot->>'cancelAt')::timestamptz,(p_snapshot->>'endedAt')::timestamptz
      from generate_series(1,v_quantity) n;
  else
    if exists(select 1 from public.company_workspace_slots where stripe_subscription_id=p_subscription and stripe_price_id<>p_snapshot->>'price') then raise exception 'billing_price_conflict'; end if;
    update public.company_workspace_slots set billing_interval=coalesce(p_snapshot->>'billingInterval','month'),status=p_snapshot->>'status',
      current_period_end=(p_snapshot->>'periodEnd')::timestamptz,
      cancel_at=least(subscription_cancel_at,(p_snapshot->>'cancelAt')::timestamptz),
      ended_at=(p_snapshot->>'endedAt')::timestamptz,revision=revision+1,updated_at=clock_timestamp()
      where stripe_subscription_id=p_subscription and row(billing_interval,status,current_period_end,cancel_at,ended_at) is distinct from
        row(coalesce(p_snapshot->>'billingInterval','month'),p_snapshot->>'status',(p_snapshot->>'periodEnd')::timestamptz,
          least(subscription_cancel_at,(p_snapshot->>'cancelAt')::timestamptz),(p_snapshot->>'endedAt')::timestamptz);
  end if;
  for v_period in select value from jsonb_array_elements(p_periods) loop
    -- Coverage follows the paid invoice, not the subscription's NEXT quantity.
    -- Annual invoices cover twelve monthly periods from the same paid start.
    select count(*) into v_covered from public.company_workspace_slots where stripe_subscription_id=p_subscription
      and (subscription_cancel_at is null or subscription_cancel_at>coalesce((v_period->>'invoiceStartsAt')::timestamptz,(v_period->>'startsAt')::timestamptz));
    if v_covered<>coalesce((v_period->>'quantity')::int,1) then raise exception 'billing_invoice_quantity_conflict'; end if;
    for v_slot in select * from public.company_workspace_slots where stripe_subscription_id=p_subscription
      and (subscription_cancel_at is null or subscription_cancel_at>coalesce((v_period->>'invoiceStartsAt')::timestamptz,(v_period->>'startsAt')::timestamptz)) loop
      select * into v_existing from public.company_workspace_credit_periods where slot_id=v_slot.id and starts_at=(v_period->>'startsAt')::timestamptz;
      if v_existing.id is not null then
        if v_existing.ends_at<>(v_period->>'endsAt')::timestamptz or v_existing.stripe_invoice_id is distinct from v_period->>'invoiceId' then raise exception 'billing_period_conflict'; end if;
      else
        insert into public.company_workspace_credit_periods(company_workspace_id,slot_id,stripe_invoice_id,starts_at,ends_at,confirmed_at,allowance,remaining)
          values(p_workspace,v_slot.id,v_period->>'invoiceId',(v_period->>'startsAt')::timestamptz,(v_period->>'endsAt')::timestamptz,
            coalesce((v_period->>'confirmedAt')::timestamptz,clock_timestamp()),50,50);
      end if;
    end loop;
  end loop;
  if jsonb_array_length(p_periods)>0 then
    update public.company_workspace set billing_started_at=coalesce(billing_started_at,clock_timestamp()),
      billing_free_anchor_at=coalesce(billing_free_anchor_at,clock_timestamp()) where company_workspace_id=p_workspace;
  end if;
  perform public.workspace_billing_reconcile_v1(p_workspace);
  return true;
end; $$;

-- Old deployed single-Slot callers remain valid, but cannot overwrite a group.
create or replace function public.workspace_billing_sync_slot_v1(p_workspace uuid,p_subscription text,p_expected_revision bigint,p_snapshot jsonb,p_periods jsonb default '[]')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_revisions jsonb; v_slot public.company_workspace_slots%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  if (select count(*) from public.company_workspace_slots where stripe_subscription_id=p_subscription)>1 then return false; end if;
  select * into v_slot from public.company_workspace_slots where stripe_subscription_id=p_subscription;
  if (v_slot.id is null and p_expected_revision<>0) or (v_slot.id is not null and v_slot.revision<>p_expected_revision) then return false; end if;
  v_revisions:=case when v_slot.id is null then '{}'::jsonb else jsonb_build_object(v_slot.id::text,p_expected_revision) end;
  return public.workspace_billing_sync_slots_v1(p_workspace,p_subscription,v_revisions,p_snapshot||'{"initialQuantity":1,"quantity":1}'::jsonb,p_periods);
end; $$;

create function public.workspace_billing_prepare_change_v1(p_workspace uuid,p_slot uuid,p_revision bigint,p_cancel boolean,p_item text,p_period_end timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_slot public.company_workspace_slots%rowtype; v_pending public.company_workspace_slots%rowtype;
  v_targets jsonb; v_quantity int; v_change jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_pending from public.company_workspace_slots where company_workspace_id=p_workspace and billing_change is not null;
  if v_pending.id is not null then
    if v_pending.id=p_slot and (v_pending.billing_change->>'cancel')::boolean=p_cancel and (v_pending.billing_change->>'revision')::bigint=p_revision then return v_pending.billing_change; end if;
    raise exception 'billing_change_conflict';
  end if;
  select * into v_slot from public.company_workspace_slots where id=p_slot and company_workspace_id=p_workspace;
  if v_slot.id is null or v_slot.source<>'stripe' or v_slot.revision<>p_revision or p_item is null
    or (v_slot.ended_at is not null and v_slot.ended_at<=clock_timestamp())
    or (v_slot.cancel_at is not null and v_slot.cancel_at<=clock_timestamp())
    or p_period_end<=clock_timestamp() then raise exception 'billing_change_conflict'; end if;
  if (v_slot.cancel_at is not null)=p_cancel then return null; end if;
  select jsonb_object_agg(id::text,case when id=p_slot then case when p_cancel then to_jsonb(p_period_end) else 'null'::jsonb end else coalesce(to_jsonb(cancel_at),'null'::jsonb) end),
    count(*) filter(where case when id=p_slot then not p_cancel else cancel_at is null end)
    into v_targets,v_quantity from public.company_workspace_slots where stripe_subscription_id=v_slot.stripe_subscription_id;
  v_change:=jsonb_build_object('id',gen_random_uuid(),'createdAt',clock_timestamp(),'revision',p_revision,'slotId',p_slot,'cancel',p_cancel,
    'subscriptionId',v_slot.stripe_subscription_id,'itemId',p_item,'quantity',greatest(1,v_quantity),'cancelSubscription',v_quantity=0,
    'periodEnd',p_period_end,'targets',v_targets);
  update public.company_workspace_slots set billing_change=v_change where id=p_slot;
  return v_change;
end; $$;

create function public.workspace_billing_finish_change_v1(p_workspace uuid,p_change uuid,p_period_end timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_slot public.company_workspace_slots%rowtype; v_target record; v_cancel_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  select * into v_slot from public.company_workspace_slots where company_workspace_id=p_workspace and billing_change->>'id'=p_change::text;
  if v_slot.id is null then return false; end if;
  for v_target in select key,value from jsonb_each_text(v_slot.billing_change->'targets') loop
    v_cancel_at:=v_target.value::timestamptz;
    -- If renewal won the race, retain the newly paid period too.
    if v_target.key=v_slot.id::text and (v_slot.billing_change->>'cancel')::boolean then
      v_cancel_at:=greatest(v_cancel_at,p_period_end);
    end if;
    update public.company_workspace_slots set subscription_cancel_at=v_cancel_at,cancel_at=v_cancel_at,
      revision=revision+1,updated_at=clock_timestamp() where id=v_target.key::uuid and company_workspace_id=p_workspace;
  end loop;
  update public.company_workspace_slots set billing_change=null where id=v_slot.id;
  return true;
end; $$;

-- Freeze checkout inputs before contacting Stripe, including parallel tabs.
create function public.workspace_billing_checkout_v2(p_workspace uuid,p_intent jsonb,p_customer text default null,p_key uuid default null,p_session text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_checkout jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_workspace::text,0));
  v_checkout:=public.workspace_billing_checkout_v1(p_workspace,p_customer,p_key,p_session);
  if v_checkout is not null and v_checkout->'intent' is null then
    -- A legacy session is kept until the caller expires/synchronizes it.
    if v_checkout->>'sessionId' is null then
      v_checkout:=v_checkout||jsonb_build_object('intent',p_intent);
      update public.company_workspace set billing_checkout=v_checkout where company_workspace_id=p_workspace;
    end if;
  end if;
  return v_checkout;
end; $$;
revoke all on function public.workspace_billing_sync_slots_v1(uuid,text,jsonb,jsonb,jsonb),
 public.workspace_billing_prepare_change_v1(uuid,uuid,bigint,boolean,text,timestamptz),
 public.workspace_billing_finish_change_v1(uuid,uuid,timestamptz),
 public.workspace_billing_checkout_v2(uuid,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.workspace_billing_sync_slots_v1(uuid,text,jsonb,jsonb,jsonb),
 public.workspace_billing_prepare_change_v1(uuid,uuid,bigint,boolean,text,timestamptz),
 public.workspace_billing_finish_change_v1(uuid,uuid,timestamptz),
 public.workspace_billing_checkout_v2(uuid,jsonb,text,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
