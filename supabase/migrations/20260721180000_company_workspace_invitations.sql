create table if not exists public.company_workspace_invitations (
  invitation_id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  email text not null,
  invited_by_user_id uuid
    references public.company_users(user_id) on delete set null,
  last_sent_at timestamptz not null default timezone('utc', now()),
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_workspace_id, email),
  constraint company_workspace_invitations_email_normalized
    check (email = lower(btrim(email)))
);

create index if not exists company_workspace_invitations_pending_idx
  on public.company_workspace_invitations(company_workspace_id, last_sent_at desc)
  where accepted_at is null;

alter table public.company_workspace_invitations enable row level security;

revoke all on public.company_workspace_invitations from anon, authenticated;
grant all on public.company_workspace_invitations to service_role;

comment on table public.company_workspace_invitations is
  'Workspace email invitations, including pending acceptance and resend timestamps.';
