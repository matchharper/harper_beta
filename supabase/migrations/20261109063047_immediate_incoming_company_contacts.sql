-- Company jobs claim their own lease independently of other jobs in the conversation.
create or replace function public.claim_company_agent_web_action_v1(
  p_job_id uuid,
  p_worker_id text,
  p_max_attempts integer default 5,
  p_stale_after_seconds integer default 360
)
returns setof public.company_agent_web_action_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.company_agent_web_action_jobs j
    where j.id = p_job_id
      and j.attempt_count < greatest(1, p_max_attempts)
      and (
        (j.status in ('queued', 'retry') and j.next_attempt_at <= timezone('utc', now()))
        or (
          j.status = 'processing'
          and j.locked_at < timezone('utc', now())
            - make_interval(secs => greatest(30, p_stale_after_seconds))
        )
      )
    for update skip locked
  )
  update public.company_agent_web_action_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      locked_at = timezone('utc', now()),
      locked_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 300),
      last_error = null,
      updated_at = timezone('utc', now())
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

