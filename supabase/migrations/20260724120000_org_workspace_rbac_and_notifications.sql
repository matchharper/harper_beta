-- Organization workspace RBAC and workspace-scoped Slack preferences.

update public.company_user_workspace
set role = case
  when lower(btrim(coalesce(role, ''))) in ('owner', 'admin', 'viewer')
    then lower(btrim(role))
  else 'admin'
end;

with ranked_members as (
  select
    membership.id,
    membership.company_workspace_id,
    row_number() over (
      partition by membership.company_workspace_id
      order by membership.created_at asc, membership.id asc
    ) as member_rank,
    bool_or(membership.role = 'owner') over (
      partition by membership.company_workspace_id
    ) as has_owner
  from public.company_user_workspace as membership
)
update public.company_user_workspace as membership
set role = 'owner',
    updated_at = timezone('utc', now())
from ranked_members
where membership.id = ranked_members.id
  and ranked_members.member_rank = 1
  and not ranked_members.has_owner;

alter table public.company_user_workspace
  alter column role set default 'viewer',
  alter column role set not null;

alter table public.company_user_workspace
  drop constraint if exists company_user_workspace_role_check;

alter table public.company_user_workspace
  add constraint company_user_workspace_role_check
  check (role in ('owner', 'admin', 'viewer'));

alter table public.company_workspace_invitations
  add column if not exists role text not null default 'admin';

update public.company_workspace_invitations
set role = case
  when lower(btrim(coalesce(role, ''))) in ('owner', 'admin', 'viewer')
    then lower(btrim(role))
  else 'admin'
end;

alter table public.company_workspace_invitations
  drop constraint if exists company_workspace_invitations_role_check;

alter table public.company_workspace_invitations
  add constraint company_workspace_invitations_role_check
  check (role in ('owner', 'admin', 'viewer'));

alter table public.company_slack_integrations
  add column if not exists notify_candidate_accepted boolean not null default true,
  add column if not exists notify_candidate_rejected boolean not null default true,
  add column if not exists notify_member_joined boolean not null default true;

comment on column public.company_user_workspace.role is
  'Organization permission: owner, admin, or viewer.';
comment on column public.company_workspace_invitations.role is
  'Membership permission granted when the invitation is accepted.';
comment on column public.company_slack_integrations.notify_candidate_accepted is
  'Send a workspace Slack notification when a candidate connection is accepted.';
comment on column public.company_slack_integrations.notify_candidate_rejected is
  'Send a workspace Slack notification when a candidate process is stopped.';
comment on column public.company_slack_integrations.notify_member_joined is
  'Send a workspace Slack notification when a member joins.';
