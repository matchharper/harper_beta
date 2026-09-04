begin;

-- Test-only internal Roles are fixtures, never matching inventory. Keep the
-- guard in every queue entry/claim path so a trigger ordering change or a
-- direct service-role write cannot make them talent-facing.
create or replace function public.enqueue_company_context_run_v1(
  p_role_id uuid,
  p_trigger_reason text,
  p_available_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  ) then
    raise exception 'company context run requires an internal role: %', p_role_id;
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.role_id = p_role_id
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        in ('true', '1', 'yes', 'on')
  ) then
    return null;
  end if;

  if p_trigger_reason <> 'manual' and not exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and coalesce(role.is_expired, false) = false
      and coalesce(internal_role.is_auto, false) = true
  ) then
    raise exception
      'automatic company context run requires an active, unexpired internal role with is_auto=true: %',
      p_role_id;
  end if;

  insert into public.company_context_runs (
    role_id,
    status,
    trigger_reason,
    available_at,
    result
  ) values (
    p_role_id,
    'queued',
    p_trigger_reason,
    p_available_at,
    jsonb_build_object('queuedAt', timezone('utc', now()))
  )
  on conflict (role_id) where status in ('queued', 'running')
  do nothing
  returning id into v_id;

  if v_id is null then
    select run.id
    into v_id
    from public.company_context_runs run
    where run.role_id = p_role_id
      and run.status in ('queued', 'running')
    order by run.available_at, run.id
    limit 1;
  end if;

  return v_id;
end;
$$;

create or replace function public.enqueue_due_company_context_runs_v1(
  p_now timestamptz default timezone('utc', now())
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.company_context_runs (
    role_id,
    status,
    trigger_reason,
    available_at,
    result
  )
  select
    role.role_id,
    'queued',
    case
      when last_success.finished_at is null then 'role_created'
      else 'weekly'
    end,
    p_now,
    jsonb_build_object('queuedAt', p_now)
  from public.company_roles role
  join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  left join lateral (
    select max((run.result->>'finishedAt')::timestamptz) as finished_at
    from public.company_context_runs run
    where run.role_id = role.role_id
      and run.status = 'succeeded'
      and run.result ? 'finishedAt'
  ) last_success on true
  where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and lower(btrim(coalesce(role.status, ''))) = 'active'
    and coalesce(role.is_expired, false) = false
    and coalesce(internal_role.is_auto, false) = true
    and coalesce(lower(btrim(role.information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on')
    and (
      last_success.finished_at is null
      or last_success.finished_at <= p_now - interval '7 days'
    )
  on conflict (role_id) where status in ('queued', 'running')
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.claim_company_context_run_v1(
  p_runner text,
  p_role_id uuid default null
)
returns setof public.company_context_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select run.id
    from public.company_context_runs run
    join public.company_internal_roles internal_role
      on internal_role.role_id = run.role_id
    join public.company_roles role
      on role.role_id = run.role_id
    where run.status = 'queued'
      and run.available_at <= timezone('utc', now())
      and (p_role_id is null or run.role_id = p_role_id)
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
      and (
        run.trigger_reason = 'manual'
        or coalesce(internal_role.is_auto, false) = true
      )
    order by run.available_at, run.id
    for update of run skip locked
    limit 1
  )
  update public.company_context_runs run
  set
    status = 'running',
    result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
      'runner', nullif(btrim(coalesce(p_runner, '')), ''),
      'startedAt', timezone('utc', now())
    )
  from claimable
  where run.id = claimable.id
  returning run.*;
end;
$$;

update public.company_context_runs run
set
  status = 'canceled',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'resultReason', 'test_only_role',
    'summary', '테스트 전용 Role은 자동 매칭 대상이 아니어서 대기열에서 제거됨',
    'finishedAt', timezone('utc', now())
  )
from public.company_roles role
where role.role_id = run.role_id
  and run.status = 'queued'
  and coalesce(lower(btrim(role.information->>'testOnly')), '')
    in ('true', '1', 'yes', 'on');

create or replace function public.guard_test_only_company_context_run_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('queued', 'running')
     and exists (
       select 1
       from public.company_roles role
       where role.role_id = new.role_id
         and coalesce(lower(btrim(role.information->>'testOnly')), '')
           in ('true', '1', 'yes', 'on')
     ) then
    raise exception 'test-only internal roles cannot have company context runs';
  end if;
  return new;
end;
$$;

drop trigger if exists company_context_runs_test_only_guard_v1
  on public.company_context_runs;
create trigger company_context_runs_test_only_guard_v1
before insert or update of role_id, status on public.company_context_runs
for each row execute function public.guard_test_only_company_context_run_v1();

commit;
