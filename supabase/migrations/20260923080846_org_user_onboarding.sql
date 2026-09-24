-- Completion belongs to the company account, not a browser or workspace.
alter table public.company_users
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.company_users.onboarding_completed_at is
  'First completion of the company onboarding experience, across workspaces.';
