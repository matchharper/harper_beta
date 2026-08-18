begin;

-- Deletion is distinct from ending a role. Only company-owned internal roles
-- use this lifecycle state; externally collected roles retain their existing
-- provider lifecycle contract.
alter table public.company_roles
  drop constraint if exists company_roles_status_check;
alter table public.company_roles
  add constraint company_roles_status_check
  check (
    status in ('draft', 'top_priority', 'active', 'ended', 'paused')
    or (status = 'deleted' and source_type = 'internal')
  ) not valid;

-- Migrate the legacy internal soft-delete representation without changing
-- genuine ended roles.
update public.company_roles
set status = 'deleted'
where source_type = 'internal'
  and status = 'ended'
  and is_expired is true;

alter table public.company_roles
  validate constraint company_roles_status_check;

-- Draft roles may be activated only through the guarded completion RPC, while
-- deletion remains available before activation has completed.
create or replace function public.guard_company_role_draft_activation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft'
     and new.status is distinct from 'draft'
     and new.status is distinct from 'deleted'
     and coalesce(
       current_setting('app.role_creation_completion', true),
       ''
     ) <> 'allowed'
  then
    raise exception 'draft roles must be activated through role creation confirmation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.guard_company_role_draft_activation_v1()
is 'Requires guarded confirmation before a draft becomes live while allowing draft internal roles to be soft-deleted with status deleted.';

comment on column public.company_roles.status is
  'Role lifecycle status. Internal role deletion uses deleted; ended remains a distinct non-deleted terminal state.';

commit;
