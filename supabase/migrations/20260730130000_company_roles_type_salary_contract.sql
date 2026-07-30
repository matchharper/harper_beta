-- Enforce canonical employment types and a complete VC salary-range contract.

begin;

-- Remove legacy category labels before validating the canonical type set.
update public.company_roles role
set type = coalesce(
  (
    select array_agg(value order by ordinal_position)
    from unnest(role.type) with ordinality
      as item(value, ordinal_position)
    where value = any (
      array['full_time', 'part_time', 'internship', 'contract']::text[]
    )
  ),
  '{}'::text[]
)
where exists (
  select 1
  from unnest(role.type) as item(value)
  where value <> all (
    array['full_time', 'part_time', 'internship', 'contract']::text[]
  )
);

-- VC salary text is derived only from a complete structured salary.
with desired_salary as (
select
  role_id,
  case
  when salary_min is not null
    and salary_max is not null
    and salary_min <= salary_max
    and nullif(trim(salary_currency), '') is not null
    and lower(
      regexp_replace(
        trim(salary_period),
        '[[:space:]-]+',
        '_',
        'g'
      )
    ) in (
      'hour', 'hourly',
      'day', 'daily',
      'week', 'weekly',
      'biweek', 'biweekly',
      'month', 'monthly',
      'quarter', 'quarterly',
      'year', 'yearly', 'annual', 'annually',
      'one_time', 'onetime'
    )
  then
    case
      when position('.' in salary_min::text) > 0
      then rtrim(rtrim(salary_min::text, '0'), '.')
      else salary_min::text
    end
    || ' ~ ' ||
    case
      when position('.' in salary_max::text) > 0
      then rtrim(rtrim(salary_max::text, '0'), '.')
      else salary_max::text
    end
    || ' ' || upper(trim(salary_currency))
    || ' / ' ||
    case lower(
      regexp_replace(
        trim(salary_period),
        '[[:space:]-]+',
        '_',
        'g'
      )
    )
      when 'hourly' then 'hour'
      when 'daily' then 'day'
      when 'weekly' then 'week'
      when 'biweekly' then 'biweek'
      when 'monthly' then 'month'
      when 'quarterly' then 'quarter'
      when 'yearly' then 'year'
      when 'annual' then 'year'
      when 'annually' then 'year'
      when 'onetime' then 'one_time'
      else lower(
        regexp_replace(
          trim(salary_period),
          '[[:space:]-]+',
          '_',
          'g'
        )
      )
    end
    else null
  end as salary_range
from public.company_roles
where source_provider = 'vc_portfolio'
)
update public.company_roles role
set salary_range = desired_salary.salary_range
from desired_salary
where role.role_id = desired_salary.role_id
  and role.salary_range is distinct from desired_salary.salary_range;

-- A partial structured salary is not useful to VC consumers. Keep the five
-- salary columns as one all-or-none group.
update public.company_roles
set salary_min = null,
    salary_max = null,
    salary_currency = null,
    salary_period = null
where source_provider = 'vc_portfolio'
  and salary_range is null
  and (
    salary_min is not null
    or salary_max is not null
    or salary_currency is not null
    or salary_period is not null
  );

update public.company_roles
set salary_currency = upper(trim(salary_currency)),
    salary_period = case lower(
      regexp_replace(
        trim(salary_period),
        '[[:space:]-]+',
        '_',
        'g'
      )
    )
      when 'hourly' then 'hour'
      when 'daily' then 'day'
      when 'weekly' then 'week'
      when 'biweekly' then 'biweek'
      when 'monthly' then 'month'
      when 'quarterly' then 'quarter'
      when 'yearly' then 'year'
      when 'annual' then 'year'
      when 'annually' then 'year'
      when 'onetime' then 'one_time'
      else lower(
        regexp_replace(
          trim(salary_period),
          '[[:space:]-]+',
          '_',
          'g'
        )
      )
    end
where source_provider = 'vc_portfolio'
  and salary_range is not null
  and (
    salary_currency is distinct from upper(trim(salary_currency))
    or salary_period is distinct from case lower(
      regexp_replace(
        trim(salary_period),
        '[[:space:]-]+',
        '_',
        'g'
      )
    )
      when 'hourly' then 'hour'
      when 'daily' then 'day'
      when 'weekly' then 'week'
      when 'biweekly' then 'biweek'
      when 'monthly' then 'month'
      when 'quarterly' then 'quarter'
      when 'yearly' then 'year'
      when 'annual' then 'year'
      when 'annually' then 'year'
      when 'onetime' then 'one_time'
      else lower(
        regexp_replace(
          trim(salary_period),
          '[[:space:]-]+',
          '_',
          'g'
        )
      )
    end
  );

commit;

-- Add constraints as NOT VALID in a short DDL transaction. PostgreSQL still
-- enforces them for all new writes; the final validation scan does not block
-- ordinary readers with an ACCESS EXCLUSIVE lock.
begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_roles'::regclass
      and conname = 'company_roles_type_check'
  ) then
    alter table public.company_roles
      add constraint company_roles_type_check
      check (
        type <@ array[
          'full_time',
          'part_time',
          'internship',
          'contract'
        ]::text[]
      )
      not valid;
  end if;
end;
$$;

comment on column public.company_roles.type is
  'Employment types only: full_time, part_time, internship, contract. '
  'Job functions, titles, and provider-specific labels are not allowed.';

do $$
begin
  if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.company_roles'::regclass
        and conname = 'company_roles_vc_salary_range_check'
    )
    or exists (
      select 1
      from pg_constraint
      where conrelid = 'public.company_roles'::regclass
        and conname = 'company_roles_vc_salary_range_check'
        and pg_get_constraintdef(oid) not ilike '%salary_min IS NULL%'
    )
  then
    alter table public.company_roles
      drop constraint if exists company_roles_vc_salary_range_check;
    alter table public.company_roles
      add constraint company_roles_vc_salary_range_check
      check (
        source_provider is distinct from 'vc_portfolio'
        or (
          (
            salary_range is null
            and salary_min is null
            and salary_max is null
            and salary_currency is null
            and salary_period is null
          )
          or (
            salary_range is not null
            and salary_min is not null
            and salary_max is not null
            and salary_min <= salary_max
            and nullif(trim(salary_currency), '') is not null
            and salary_currency = upper(trim(salary_currency))
            and salary_period in (
              'hour',
              'day',
              'week',
              'biweek',
              'month',
              'quarter',
              'year',
              'one_time'
            )
          )
        )
      )
      not valid;
  end if;
end;
$$;

comment on column public.company_roles.salary_range is
  'Display text formatted as "min ~ max CURRENCY / period". For '
  'vc_portfolio roles it is present only when salary_min, salary_max, '
  'salary_currency, and a recognized salary_period are all present.';

commit;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_roles'::regclass
      and conname = 'company_roles_type_check'
      and not convalidated
  ) then
    alter table public.company_roles
      validate constraint company_roles_type_check;
  end if;
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_roles'::regclass
      and conname = 'company_roles_vc_salary_range_check'
      and not convalidated
  ) then
    alter table public.company_roles
      validate constraint company_roles_vc_salary_range_check;
  end if;
end;
$$;
