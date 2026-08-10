/-- Draft roles still require the guarded completion RPC to become live, but
-- ending one is a soft-delete operation and must not require activation first.
create or replace function public.guard_company_role_draft_activation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft'
     and new.status is distinct from 'draft'
     and new.status is distinct from 'ended'
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
is 'Requires guarded confirmation before a draft becomes live while allowing draft roles to be soft-deleted as ended.';
