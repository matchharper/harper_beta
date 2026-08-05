-- This table stores per-role Slack channel exclusions: no row means that the
-- channel receives notifications by default.
create table if not exists public.company_role_notification_channels (
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  channel_id uuid not null
    references public.company_slack_channels(id) on delete cascade,
  primary key (role_id, channel_id)
);

alter table public.company_role_notification_channels
  enable row level security;

revoke all on public.company_role_notification_channels
  from anon, authenticated;
grant all on public.company_role_notification_channels to service_role;

comment on table public.company_role_notification_channels is
  'Slack channels excluded from notifications for each company role.';
