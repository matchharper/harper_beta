-- Only role start writes a registered role-start role's Brief copy (E3a).
--
-- For a role started from role start (onboarding Brief, no longer a draft),
-- company_internal_roles.request and criteria are copies of the role start
-- Brief. Any other write is refused (company_role_brief_via_role_start); role
-- start writes through write_company_role_brief_v1 (20261105180000), which
-- sets harper.company_role_brief_write.
--
-- Apply after the web deploy that writes through write_company_role_brief_v1:
-- the previous web writes these copies directly and would be refused.

create or replace function public.guard_company_role_brief_copy_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.request, old.criteria) is not distinct from (new.request, new.criteria) then
    return new;
  end if;
  -- An insert for a Role that already has its row writes nothing here: it
  -- conflicts (insert ... on conflict do nothing from the source_type sync),
  -- and an upsert's update is checked as an update.
  if tg_op = 'INSERT' and exists (
    select 1 from public.company_internal_roles existing where existing.role_id = new.role_id
  ) then
    return new;
  end if;
  if coalesce(current_setting('harper.company_role_brief_write', true), '') <> 'role_start' and exists (
    select 1
    from public.company_roles role
    join public.company_role_start_sessions session on session.role_id = role.role_id
    where role.role_id = new.role_id
      and role.status <> 'draft'
      and session.brief_source = 'onboarding'
      and session.phase <> 'superseded'
  ) then
    raise exception using errcode = 'P0001', message = 'company_role_brief_via_role_start';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_company_role_brief_copy_v1()
  from public, anon, authenticated, service_role;

create trigger company_internal_roles_brief_copy_guard
  before insert or update of request, criteria on public.company_internal_roles
  for each row execute function public.guard_company_role_brief_copy_v1();
