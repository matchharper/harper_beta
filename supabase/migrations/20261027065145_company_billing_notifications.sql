-- Durable internal payment alerts: the webhook and billing reconciler consume
-- this receipt. The primary key prevents duplicate alerts for the same invoice
-- across invoice.paid/payment_succeeded/checkout events. No customer access.
create table public.company_billing_notifications (
  id text primary key,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  event_type text not null,
  facts jsonb not null,
  created_at timestamptz not null default now(),
  attempt_after timestamptz not null default now(),
  sent_at timestamptz,
  slack_ts text,
  last_error text
);
alter table public.company_billing_notifications enable row level security;
revoke all on public.company_billing_notifications from public, anon, authenticated;
grant select, insert, update, delete on public.company_billing_notifications to service_role;
create index company_billing_notifications_pending on public.company_billing_notifications(attempt_after) where sent_at is null;

-- Mirror verified payment facts into the existing Ops company activity feed in
-- the same transaction, once per notification key. Delivery has its own receipt.
create function public.log_company_billing_notification_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.logs(type, meta_data)
  values ('org_billing_payment_' || new.event_type,
    new.facts || jsonb_build_object('source', 'stripe_webhook'));
  return new;
end;
$$;
revoke all on function public.log_company_billing_notification_v1() from public, anon, authenticated;
grant execute on function public.log_company_billing_notification_v1() to service_role;
create trigger company_billing_notification_log after insert on public.company_billing_notifications
for each row execute function public.log_company_billing_notification_v1();
