create table if not exists public.crm_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  max_sends_per_user integer not null default 1
    check (max_sends_per_user between 1 and 100),
  html_content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crm_email_campaign_deliveries (
  campaign_id uuid not null
    references public.crm_email_campaigns(id) on delete restrict,
  talent_id uuid not null
    references public.talent_users(user_id) on delete cascade,
  discovery_run_id uuid not null
    references public.opportunity_discovery_run(id) on delete restrict,
  sent_at timestamptz not null default timezone('utc', now()),
  primary key (campaign_id, talent_id, discovery_run_id)
);

create index if not exists crm_email_campaigns_active_created_idx
  on public.crm_email_campaigns (created_at, id)
  where status = 'active';

create index if not exists crm_email_campaign_deliveries_talent_count_idx
  on public.crm_email_campaign_deliveries (campaign_id, talent_id);

alter table public.crm_email_campaigns enable row level security;
alter table public.crm_email_campaign_deliveries enable row level security;

revoke all on public.crm_email_campaigns from anon, authenticated;
revoke all on public.crm_email_campaign_deliveries from anon, authenticated;

grant select, insert, update on public.crm_email_campaigns to service_role;
grant select, insert on public.crm_email_campaign_deliveries to service_role;

comment on table public.crm_email_campaigns is
  'Ops-managed HTML campaigns appended to periodic opportunity emails.';
comment on table public.crm_email_campaign_deliveries is
  'Successful per-talent delivery history used to enforce campaign send caps.';
