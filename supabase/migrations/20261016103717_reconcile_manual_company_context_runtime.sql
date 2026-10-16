-- Reconcile the manual-only Context Run contract after profile calibration retirement.
-- The original migration requires a calibration function already deliberately removed.
-- Keep is_auto as inert compatibility data; do not delete columns or history here.
begin;
set local lock_timeout = '5s';

-- The recurring Codex Company Run is retired. Keep completed history and the
-- explicitly requested manual path, but do not create or claim automatic work.
drop trigger if exists company_internal_roles_cancel_context_run_v1
  on public.company_internal_roles;
drop trigger if exists company_internal_roles_enqueue_context_run_v1
  on public.company_internal_roles;
drop trigger if exists company_roles_track_status_and_enqueue_context_v1
  on public.company_roles;

drop function if exists public.cancel_company_context_run_when_auto_disabled_v1();
drop function if exists public.enqueue_company_context_run_on_role_insert_v1();
drop function if exists public.enqueue_due_company_context_runs_v1(timestamptz);
drop function if exists public.retry_post_calibration_company_context_run_v1(uuid, timestamptz);
drop function if exists public.claim_scheduled_company_run_v1(text, uuid);
drop function if exists public.enqueue_scheduled_company_runs_v1(uuid, timestamptz);

update public.company_context_runs
set status = 'canceled',
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
      'resultReason', 'automatic_company_context_run_retired',
      'finishedAt', timezone('utc', now())
    )
where status = 'queued' and trigger_reason <> 'manual';

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
  if p_trigger_reason is distinct from 'manual' then
    raise exception 'automatic Company Context Runs are retired';
  end if;
  if not exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
  ) then
    raise exception 'company context run requires an internal role: %', p_role_id;
  end if;

  insert into public.company_context_runs (
    role_id, status, trigger_reason, available_at, result
  ) values (
    p_role_id, 'queued', 'manual', p_available_at,
    jsonb_build_object('queuedAt', timezone('utc', now()))
  )
  on conflict (role_id) where status in ('queued', 'running') do nothing
  returning id into v_id;

  if v_id is null then
    select run.id into v_id
    from public.company_context_runs run
    where run.role_id = p_role_id and run.status in ('queued', 'running')
    order by run.available_at, run.id
    limit 1;
  end if;
  return v_id;
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
    join public.company_roles role on role.role_id = run.role_id
    where run.status = 'queued'
      and run.trigger_reason = 'manual'
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
      and run.available_at <= timezone('utc', now())
      and (p_role_id is null or run.role_id = p_role_id)
    order by run.available_at, run.id
    for update of run skip locked
    limit 1
  )
  update public.company_context_runs run
  set status = 'running',
      result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
        'runner', nullif(btrim(coalesce(p_runner, '')), ''),
        'startedAt', timezone('utc', now())
      )
  from claimable
  where run.id = claimable.id
  returning run.*;
end;
$$;

-- Role status timestamps still serve operational statistics. Retain that
-- tracking without scheduling another context or fit run.
create or replace function public.track_company_role_status_and_enqueue_context_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_status text := lower(btrim(coalesce(old.status, '')));
  v_new_status text := lower(btrim(coalesce(new.status, '')));
begin
  if old.status is distinct from new.status
     and not (
       v_old_status in ('paused', 'ended')
       and v_new_status in ('paused', 'ended')
     ) then
    update public.company_internal_roles
    set role_status_changed_at = timezone('utc', now())
    where role_id = new.role_id;
  end if;
  return new;
end;
$$;

create trigger company_roles_track_status_and_enqueue_context_v1
after update of status on public.company_roles
for each row execute function public.track_company_role_status_and_enqueue_context_v1();

revoke all on function public.enqueue_company_context_run_v1(uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.claim_company_context_run_v1(text,uuid) from public, anon, authenticated;
grant execute on function public.enqueue_company_context_run_v1(uuid,text,timestamptz) to service_role;
grant execute on function public.claim_company_context_run_v1(text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
