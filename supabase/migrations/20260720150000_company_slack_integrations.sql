create table if not exists public.company_slack_integrations (
  company_workspace_id uuid primary key
    references public.company_workspace(company_workspace_id) on delete cascade,
  slack_team_id text not null,
  slack_team_name text,
  slack_channel_id text not null,
  slack_channel_name text,
  webhook_url_ciphertext text not null,
  installed_by_user_id uuid references public.company_users(user_id) on delete set null,
  connected_at timestamptz not null default timezone('utc', now()),
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.company_slack_integrations enable row level security;

revoke all on public.company_slack_integrations from anon, authenticated;
grant all on public.company_slack_integrations to service_role;

comment on table public.company_slack_integrations is
  'Workspace-scoped Slack Incoming Webhooks installed through OAuth.';
comment on column public.company_slack_integrations.webhook_url_ciphertext is
  'AES-256-GCM ciphertext. Never expose this value to clients.';
