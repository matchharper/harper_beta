-- Defense in depth for the canonical information.testOnly contract.
-- Test Roles never receive fit rows; only explicitly allowlisted fixture
-- accounts may receive a directly created fixture recommendation.
begin;

create or replace function public.guard_test_only_role_fit_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.company_roles role
    where role.role_id = new.role_id
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        in ('true', '1', 'yes', 'on')
  ) then
    raise exception using errcode = '23514',
      message = 'test-only roles cannot receive talent opportunity fits';
  end if;
  return new;
end;
$$;

create or replace function public.guard_test_only_role_recommendation_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from public.company_roles role
    where role.role_id = new.role_id
      and not public.company_intro_role_allows_talent_v1(
        role.information, new.talent_id
      )
  ) then
    raise exception using errcode = '23514',
      message = 'test-only role recommendations require an allowlisted fixture talent';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_test_only_role_fit_v1() from public;
revoke all on function public.guard_test_only_role_recommendation_v1() from public;

drop trigger if exists guard_test_only_role_fit_v1 on public.talent_opportunity_fit;
create trigger guard_test_only_role_fit_v1
before insert or update on public.talent_opportunity_fit
for each row execute function public.guard_test_only_role_fit_v1();

drop trigger if exists guard_test_only_role_recommendation_v1
  on public.talent_opportunity_recommendation;
create trigger guard_test_only_role_recommendation_v1
before insert or update on public.talent_opportunity_recommendation
for each row execute function public.guard_test_only_role_recommendation_v1();

commit;
