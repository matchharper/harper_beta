-- Separate workspace permissions from a member's workspace-specific job title.

alter table public.company_user_workspace
  rename column role to authority;

alter table public.company_user_workspace
  drop constraint if exists company_user_workspace_role_check;

alter table public.company_user_workspace
  add constraint company_user_workspace_authority_check
  check (authority in ('owner', 'admin', 'viewer'));

alter table public.company_user_workspace
  add column role text;

comment on column public.company_user_workspace.authority is
  'Organization permission: owner, admin, or viewer.';
comment on column public.company_user_workspace.role is
  'Workspace-specific job title. A null or blank value means member profile setup is incomplete.';
