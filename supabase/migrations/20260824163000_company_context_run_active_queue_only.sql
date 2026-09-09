begin;

-- Automatic context runs are valid only while the internal role is active,
-- unexpired, and opted into automation. Manual runs keep their explicit
-- operator-controlled contract.
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

-- Internal-role child rows are commonly created while the parent role is
-- still a draft. Do not enqueue until the parent role is actually active.
create or replace function public.enqueue_company_context_run_on_role_insert_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_auto, false) = true
     and exists (
       select 1
       from public.company_roles role
       where role.role_id = new.role_id
         and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
         and lower(btrim(coalesce(role.status, ''))) = 'active'
         and coalesce(role.is_expired, false) = false
     ) then
    perform public.enqueue_company_context_run_v1(
      new.role_id,
      'role_created',
      timezone('utc', now())
    );
  end if;
  return new;
end;
$$;

-- Enqueue a newly confirmed draft when it becomes active, preserve the
-- seven-day reactivation rule, and cancel automatic work as soon as a role
-- stops being eligible.
create or replace function public.track_company_role_status_and_enqueue_context_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_previous_status_started_at timestamptz;
  v_is_auto boolean := false;
  v_old_status text := lower(btrim(coalesce(old.status, '')));
  v_new_status text := lower(btrim(coalesce(new.status, '')));
begin
  select
    internal_role.role_status_changed_at,
    coalesce(internal_role.is_auto, false)
  into
    v_previous_status_started_at,
    v_is_auto
  from public.company_internal_roles internal_role
  where internal_role.role_id = new.role_id;

  if not found or v_is_auto is not true then
    return new;
  end if;

  if old.status is distinct from new.status
     and not (
       v_old_status in ('paused', 'ended')
       and v_new_status in ('paused', 'ended')
     ) then
    update public.company_internal_roles internal_role
    set role_status_changed_at = v_now
    where internal_role.role_id = new.role_id;
  end if;

  if v_new_status <> 'active' or coalesce(new.is_expired, false) = true then
    update public.company_context_runs run
    set
      status = 'canceled',
      result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
        'resultReason', case
          when coalesce(new.is_expired, false) = true then 'role_expired'
          else 'role_not_active'
        end,
        'summary', case
          when coalesce(new.is_expired, false) = true
            then 'role이 만료되어 자동 실행 대기열에서 제거됨'
          else 'role이 active가 아니어서 자동 실행 대기열에서 제거됨'
        end,
        'finishedAt', v_now
      )
    where run.role_id = new.role_id
      and run.status = 'queued'
      and run.trigger_reason <> 'manual';
    return new;
  end if;

  if old.status is distinct from new.status
     and v_old_status = 'draft'
     and v_new_status = 'active' then
    perform public.enqueue_company_context_run_v1(
      new.role_id,
      'role_created',
      v_now
    );
  elsif old.status is distinct from new.status
        and v_old_status in ('paused', 'ended')
        and v_new_status = 'active'
        and v_previous_status_started_at is not null
        and v_previous_status_started_at <= v_now - interval '7 days' then
    perform public.enqueue_company_context_run_v1(
      new.role_id,
      'reactivated_after_7d',
      v_now
    );
  end if;

  return new;
end;
$$;

drop trigger if exists company_roles_track_status_and_enqueue_context_v1
  on public.company_roles;
create trigger company_roles_track_status_and_enqueue_context_v1
after update of status, is_expired on public.company_roles
for each row
when (
  old.status is distinct from new.status
  or old.is_expired is distinct from new.is_expired
)
execute function public.track_company_role_status_and_enqueue_context_v1();

-- Close invalid automatic rows left behind by the previous insert trigger.
-- A later draft -> active transition will create a fresh role_created row.
update public.company_context_runs run
set
  status = 'canceled',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'resultReason', case
      when coalesce(internal_role.is_auto, false) = false then 'auto_disabled'
      when lower(btrim(coalesce(role.source_type, ''))) <> 'internal' then 'role_not_internal'
      when coalesce(role.is_expired, false) = true then 'role_expired'
      else 'role_not_active'
    end,
    'summary', '현재 자동 실행 조건을 충족하지 않아 대기열에서 제거됨',
    'finishedAt', timezone('utc', now())
  )
from public.company_roles role
join public.company_internal_roles internal_role
  on internal_role.role_id = role.role_id
where role.role_id = run.role_id
  and run.status = 'queued'
  and run.trigger_reason <> 'manual'
  and (
    lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(role.status, ''))) <> 'active'
    or coalesce(role.is_expired, false) = true
    or coalesce(internal_role.is_auto, false) = false
  );

commit;
