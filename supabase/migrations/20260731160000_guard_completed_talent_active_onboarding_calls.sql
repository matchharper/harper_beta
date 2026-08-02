create or replace function public.guard_completed_talent_active_onboarding_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  onboarding_done boolean;
begin
  if new.kind <> 'career_onboarding' or new.status <> 'active' then
    return new;
  end if;

  -- Lock the setting row so completion and call creation cannot pass each
  -- other using stale snapshots. Whichever transaction obtains this lock
  -- first determines whether the call is inserted or immediately completed.
  select talent_setting.is_onboarding_done
    into onboarding_done
  from public.talent_setting
  where talent_setting.user_id = new.user_id
  for update;

  if coalesce(onboarding_done, false) then
    raise exception using
      errcode = '23514',
      message = 'active career onboarding call is not allowed after onboarding completion',
      detail = new.user_id::text;
  end if;

  return new;
end;
$$;

revoke all
on function public.guard_completed_talent_active_onboarding_call()
from public;

drop trigger if exists talent_calls_guard_completed_talent_active_onboarding
on public.talent_calls;

create trigger talent_calls_guard_completed_talent_active_onboarding
before insert or update of user_id, kind, status
on public.talent_calls
for each row
execute function public.guard_completed_talent_active_onboarding_call();

create or replace function public.complete_active_onboarding_calls_for_talent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completed_at_value timestamptz := clock_timestamp();
begin
  if new.is_onboarding_done is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.is_onboarding_done is true then
    return new;
  end if;

  update public.talent_calls
  set
    status = 'completed',
    completed_at = coalesce(completed_at, completed_at_value),
    last_active_at = greatest(last_active_at, completed_at_value),
    updated_at = completed_at_value
  where user_id = new.user_id
    and kind = 'career_onboarding'
    and status = 'active';

  return new;
end;
$$;

revoke all
on function public.complete_active_onboarding_calls_for_talent()
from public;

drop trigger if exists talent_setting_complete_active_onboarding_calls
on public.talent_setting;

create trigger talent_setting_complete_active_onboarding_calls
after insert or update of is_onboarding_done
on public.talent_setting
for each row
execute function public.complete_active_onboarding_calls_for_talent();

-- Reconcile ghost active rows that were recreated by stale in-flight requests
-- after their users had already completed onboarding.
with onboarding_completion as (
  select
    talent_setting.user_id,
    coalesce(
      min(talent_activity_events.created_at)
        filter (
          where talent_activity_events.event_type = 'onboarding_completed'
        ),
      talent_setting.updated_at,
      clock_timestamp()
    ) as completed_at
  from public.talent_setting
  left join public.talent_activity_events
    on talent_activity_events.talent_id = talent_setting.user_id
   and talent_activity_events.event_type = 'onboarding_completed'
  where talent_setting.is_onboarding_done is true
  group by
    talent_setting.user_id,
    talent_setting.updated_at
),
reconciliation_target as (
  select
    talent_calls.id,
    greatest(
      talent_calls.started_at,
      onboarding_completion.completed_at
    ) as completed_at
  from public.talent_calls
  join onboarding_completion
    on onboarding_completion.user_id = talent_calls.user_id
  where talent_calls.kind = 'career_onboarding'
    and talent_calls.status = 'active'
)
update public.talent_calls
set
  status = 'completed',
  completed_at = reconciliation_target.completed_at,
  last_active_at = greatest(
    talent_calls.last_active_at,
    reconciliation_target.completed_at
  ),
  updated_at = clock_timestamp()
from reconciliation_target
where talent_calls.id = reconciliation_target.id;

comment on function public.guard_completed_talent_active_onboarding_call() is
  'Serializes onboarding completion with active call creation and rejects active career onboarding calls for completed talents.';

comment on function public.complete_active_onboarding_calls_for_talent() is
  'Completes every active career onboarding call when talent onboarding becomes complete.';
