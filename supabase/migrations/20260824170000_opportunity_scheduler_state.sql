-- Minimal current state for the per-talent opportunity scheduler.
-- Detailed decisions remain in opportunity_scheduler_checks; this table only
-- makes the next due scan indexed, fair, and cheap.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

create table if not exists public.opportunity_scheduler_state (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  next_check_at timestamptz not null
);

create index if not exists opportunity_scheduler_state_next_check_idx
  on public.opportunity_scheduler_state (next_check_at, talent_id);

comment on table public.opportunity_scheduler_state is
  'Minimal current state for the 3-day opportunity scheduler. Audit details live in opportunity_scheduler_checks.';
comment on column public.opportunity_scheduler_state.next_check_at is
  'Earliest time when the scheduler should evaluate all opportunity trigger criteria for this talent again.';

alter table public.opportunity_scheduler_state enable row level security;
revoke all on table public.opportunity_scheduler_state
  from public, anon, authenticated;
grant select, insert, update on table public.opportunity_scheduler_state
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant select, insert, update on table public.opportunity_scheduler_state
      to harper_worker;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'opportunity_scheduler_state'
        and policyname = 'opportunity_scheduler_state_worker_all'
    ) then
      create policy opportunity_scheduler_state_worker_all
        on public.opportunity_scheduler_state
        for all
        to harper_worker
        using (true)
        with check (true);
    end if;
  end if;
end;
$$;

create or replace function public.ensure_opportunity_scheduler_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.opportunity_scheduler_state (talent_id, next_check_at)
  values (new.user_id, timezone('utc', now()))
  on conflict (talent_id) do nothing;
  return new;
end;
$$;

drop trigger if exists talent_setting_ensure_opportunity_scheduler_state
  on public.talent_setting;
create trigger talent_setting_ensure_opportunity_scheduler_state
after insert on public.talent_setting
for each row execute function public.ensure_opportunity_scheduler_state();

-- A completed non-periodic run counts as the user's latest base check. This
-- keeps an on-demand run from being immediately followed by a periodic run.
create or replace function public.advance_opportunity_scheduler_after_run()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.talent_id is not null
     and new.status in ('completed', 'partial')
     and old.status is distinct from new.status
     and new.trigger <> 'periodic_refresh_due'
     and coalesce(
       lower(new.trigger_payload #>> '{cadencePolicy,affectsBaseCadence}'),
       'true'
     ) = 'true'
  then
    insert into public.opportunity_scheduler_state (talent_id, next_check_at)
    values (
      new.talent_id,
      coalesce(new.completed_at, timezone('utc', now())) + interval '3 days'
    )
    on conflict (talent_id) do update
    set next_check_at = greatest(
          public.opportunity_scheduler_state.next_check_at,
          excluded.next_check_at
        );
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_run_advance_scheduler_state
  on public.opportunity_discovery_run;
create trigger opportunity_run_advance_scheduler_state
after update of status, completed_at on public.opportunity_discovery_run
for each row execute function public.advance_opportunity_scheduler_after_run();

-- Preserve the effective historical cadence during rollout. A talent with no
-- scheduler/run history is due immediately.
do $$
begin
  if to_regclass('public.opportunity_scheduler_checks') is not null then
    execute $seed$
      insert into public.opportunity_scheduler_state (
        talent_id,
        next_check_at
      )
      select
        ts.user_id,
        coalesce(anchors.latest_check_at + interval '3 days', timezone('utc', now()))
      from public.talent_setting ts
      left join lateral (
        select max(anchor_at) as latest_check_at
        from (
          select max(checks.checked_at) as anchor_at
          from public.opportunity_scheduler_checks checks
          where checks.talent_id = ts.user_id::text
            and checks.check_kind = 'periodic_refresh'
            and checks.status in ('queued', 'skipped', 'failed')
          union all
          select max(coalesce(run.completed_at, run.started_at, run.created_at))
          from public.opportunity_discovery_run run
          where run.talent_id = ts.user_id
            and (
              run.trigger = 'periodic_refresh_due'
              or (
                run.trigger <> 'periodic_refresh_due'
                and run.status in ('completed', 'partial')
                and coalesce(
                  lower(run.trigger_payload #>> '{cadencePolicy,affectsBaseCadence}'),
                  'true'
                ) = 'true'
              )
            )
        ) history
      ) anchors on true
      on conflict (talent_id) do nothing
    $seed$;
  else
    insert into public.opportunity_scheduler_state (
      talent_id,
      next_check_at
    )
    select
      ts.user_id,
      coalesce(anchors.latest_check_at + interval '3 days', timezone('utc', now()))
    from public.talent_setting ts
    left join lateral (
      select max(coalesce(run.completed_at, run.started_at, run.created_at))
        as latest_check_at
      from public.opportunity_discovery_run run
      where run.talent_id = ts.user_id
        and (
          run.trigger = 'periodic_refresh_due'
          or (
            run.trigger <> 'periodic_refresh_due'
            and run.status in ('completed', 'partial')
            and coalesce(
              lower(run.trigger_payload #>> '{cadencePolicy,affectsBaseCadence}'),
              'true'
            ) = 'true'
          )
        )
    ) anchors on true
    on conflict (talent_id) do nothing;
  end if;
end;
$$;

commit;
