begin;

-- Do not let a busy production table turn this safety migration into a long
-- application write outage. A lock timeout aborts and rolls back the migration;
-- it can be retried in a quieter deployment window.
set local lock_timeout = '5s';
set local statement_timeout = '5min';

-- Fail the deployment without changing production state if legacy workers have
-- already left more than one running row for a talent. Operators should inspect
-- and resolve those rows before retrying this migration; silently choosing a
-- winner here could invalidate a delivery that is already in progress.
do $$
begin
  if exists (
    select 1
    from public.opportunity_discovery_run
    where talent_id is not null
      and status = 'running'
    group by talent_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'opportunity_discovery_run_duplicate_running_preflight_failed';
  end if;
end;
$$;

-- The worker advisory lock is the coordination mechanism. This partial unique
-- index is the database safety net for rolling deploys, old producers, and
-- accidental direct updates that do not participate in that lock namespace.
create unique index if not exists opportunity_discovery_run_one_running_per_talent_idx
  on public.opportunity_discovery_run (talent_id)
  where talent_id is not null
    and status = 'running';

commit;
