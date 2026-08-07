begin;

-- A worker can disappear after claiming its final allowed attempt. Previously
-- those rows stayed in `processing` forever because they were no longer
-- eligible to be claimed, but no worker remained to mark them failed.
create or replace function public.claim_contact_queue_jobs(
  worker_id text,
  batch_size integer default 10,
  max_attempts integer default 3,
  stale_after_seconds integer default 600
)
returns setof public.contact_queue
language sql
security definer
set search_path = public, pg_temp
as $$
  with exhausted as (
    update public.contact_queue job
    set status = 'failed',
        locked_at = null,
        locked_by = null,
        last_error = coalesce(
          nullif(job.last_error, ''),
          'worker_stale_after_max_attempts'
        ),
        updated_at = timezone('utc', now())
    where job.status = 'processing'
      and job.attempts >= greatest(1, max_attempts)
      and coalesce(job.locked_at, job.updated_at, job.created_at)
        < timezone('utc', now())
          - make_interval(secs => greatest(60, stale_after_seconds))
    returning job.id
  ),
  picked as (
    select job.id
    from public.contact_queue job
    where job.attempts < greatest(1, max_attempts)
      and job.scheduled_at <= timezone('utc', now())
      and (
        job.status = 'queued'
        or (
          job.status = 'processing'
          and coalesce(job.locked_at, job.updated_at, job.created_at)
            < timezone('utc', now())
              - make_interval(secs => greatest(60, stale_after_seconds))
        )
      )
      and not exists (
        select 1 from exhausted where exhausted.id = job.id
      )
    order by job.scheduled_at asc, job.created_at asc
    for update of job skip locked
    limit greatest(1, least(batch_size, 50))
  )
  update public.contact_queue job
  set status = 'processing',
      attempts = job.attempts + 1,
      locked_at = timezone('utc', now()),
      locked_by = nullif(btrim(worker_id), ''),
      last_error = null,
      updated_at = timezone('utc', now())
  from picked
  where job.id = picked.id
  returning job.*;
$$;

-- Slack reply jobs use the same retry/lock contract and need the same terminal
-- transition when a process dies during its last attempt.
create or replace function public.claim_slack_reply_jobs_v2(
  p_worker_id text,
  p_worker_target text,
  p_batch_size integer default 5,
  p_max_retry_count integer default 5,
  p_stale_after_seconds integer default 300
)
returns setof public.slack_reply_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_target text := btrim(coalesce(p_worker_target, ''));
begin
  if v_worker_target = '' or char_length(v_worker_target) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Slack agent worker target must contain 1 to 100 characters';
  end if;

  return query
  with exhausted as (
    update public.slack_reply_jobs job
    set status = 'failed',
        locked_at = null,
        locked_by = null,
        last_error = coalesce(
          nullif(job.last_error, ''),
          'worker_stale_after_max_attempts'
        ),
        updated_at = timezone('utc', now())
    where job.worker_target = v_worker_target
      and job.status = 'processing'
      and job.attempt_count >= greatest(p_max_retry_count, 1)
      and coalesce(job.locked_at, job.updated_at, job.created_at)
        < timezone('utc', now())
          - make_interval(secs => greatest(p_stale_after_seconds, 30))
    returning job.id
  ),
  candidates as (
    select job.id
    from public.slack_reply_jobs job
    where job.worker_target = v_worker_target
      and (
        (
          job.status in ('queued', 'retry')
          and job.next_attempt_at <= timezone('utc', now())
        ) or (
          job.status = 'processing'
          and coalesce(job.locked_at, job.updated_at, job.created_at)
            < timezone('utc', now())
              - make_interval(secs => greatest(p_stale_after_seconds, 30))
        )
      )
      and job.attempt_count < greatest(p_max_retry_count, 1)
      and not exists (
        select 1 from exhausted where exhausted.id = job.id
      )
    order by job.created_at
    for update of job skip locked
    limit greatest(least(p_batch_size, 20), 1)
  )
  update public.slack_reply_jobs job
  set status = 'processing',
      attempt_count = job.attempt_count + 1,
      locked_at = timezone('utc', now()),
      locked_by = p_worker_id,
      updated_at = timezone('utc', now())
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_contact_queue_jobs(
  text, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.claim_slack_reply_jobs_v2(
  text, text, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.claim_contact_queue_jobs(
  text, integer, integer, integer
) to service_role;
grant execute on function public.claim_slack_reply_jobs_v2(
  text, text, integer, integer, integer
) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant execute on function public.claim_contact_queue_jobs(
      text, integer, integer, integer
    ) to harper_worker;
    grant execute on function public.claim_slack_reply_jobs_v2(
      text, text, integer, integer, integer
    ) to harper_worker;
  end if;
end;
$$;

commit;
