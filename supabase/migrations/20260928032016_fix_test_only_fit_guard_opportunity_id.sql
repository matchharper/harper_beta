-- talent_opportunity_fit identifies the Role with opportunity_id.
create or replace function public.guard_test_only_role_fit_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.company_roles role
    where role.role_id = new.opportunity_id
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        in ('true', '1', 'yes', 'on')
  ) then
    raise exception using errcode = '23514',
      message = 'test-only roles cannot receive talent opportunity fits';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_test_only_role_fit_v1() from public;
