-- Test/QA internal roles may exercise company-side workflows, but they must never
-- enter talent fit computation or reach a non-fixture talent recommendation.

create or replace function public.enforce_test_internal_role_talent_isolation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_information jsonb;
  v_is_test_only boolean := false;
  v_role_id uuid;
  v_source_job_id text;
  v_source_provider text;
  v_source_type text;
  v_name text;
begin
  if tg_table_name = 'talent_opportunity_fit' then
    v_role_id := new.opportunity_id;
  else
    v_role_id := new.role_id;
  end if;

  if v_role_id is null then
    return new;
  end if;

  select
    role.information,
    role.name,
    role.source_job_id,
    role.source_provider,
    role.source_type
  into
    v_information,
    v_name,
    v_source_job_id,
    v_source_provider,
    v_source_type
  from public.company_roles role
  where role.role_id = v_role_id;

  if not found or lower(btrim(coalesce(v_source_type, ''))) <> 'internal' then
    return new;
  end if;

  v_is_test_only :=
    coalesce(lower(btrim(v_information->>'testOnly')), '') in ('true', '1', 'yes', 'on')
    or coalesce(lower(btrim(v_information->>'test_only')), '') in ('true', '1', 'yes', 'on')
    or coalesce(lower(btrim(v_information->>'isTest')), '') in ('true', '1', 'yes', 'on')
    or lower(btrim(coalesce(v_source_provider, ''))) in ('test', 'e2e', 'codex_e2e', 'qa_test')
    or lower(btrim(coalesce(v_source_job_id, ''))) ~ '^(test|e2e|codex[-_]?e2e)(:|/|-)'
    or lower(btrim(coalesce(v_name, ''))) ~
      '^\[(e2e|codex[[:space:]]+e2e|qa[[:space:]]+test|test)([^[:alnum:]]|$)';

  if not v_is_test_only then
    return new;
  end if;

  if tg_table_name = 'talent_opportunity_fit' then
    raise exception using
      errcode = '23514',
      message = 'test-only internal roles cannot have talent opportunity fit rows';
  end if;

  if
    coalesce(lower(btrim(v_information->>'testOnly')), '') in ('true', '1', 'yes', 'on')
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_information->'testTalentIds') = 'array'
            then v_information->'testTalentIds'
          else '[]'::jsonb
        end
      ) allowed_talent_id
      where allowed_talent_id = new.talent_id::text
    )
  then
    return new;
  end if;

  raise exception using
    errcode = '23514',
    message = 'test-only internal roles cannot be recommended to non-fixture talents';
end;
$$;

revoke all on function public.enforce_test_internal_role_talent_isolation_v1()
  from public, anon, authenticated;

drop trigger if exists enforce_test_internal_role_fit_isolation_v1
  on public.talent_opportunity_fit;
create trigger enforce_test_internal_role_fit_isolation_v1
before insert or update
on public.talent_opportunity_fit
for each row
execute function public.enforce_test_internal_role_talent_isolation_v1();

drop trigger if exists enforce_test_internal_role_recommendation_isolation_v1
  on public.talent_opportunity_recommendation;
create trigger enforce_test_internal_role_recommendation_isolation_v1
before insert or update
on public.talent_opportunity_recommendation
for each row
execute function public.enforce_test_internal_role_talent_isolation_v1();

comment on function public.enforce_test_internal_role_talent_isolation_v1() is
  'Blocks test-only internal roles from talent fit and limits direct fixture recommendations to information.testTalentIds.';
