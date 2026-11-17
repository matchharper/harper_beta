-- Letters of one introduction are read one run at a time (incident #107).
--
-- 20261109063047 let every company job claim its own lease, so an incoming
-- letter no longer waits behind a long Role run. It also let two letters of
-- the same introduction run at once: neither run saw the notice the other was
-- posting, and the company team got the same notice two or three times.
--
-- An agent_contact_received job now waits only while another
-- agent_contact_received job of the same introduction, in the same company
-- conversation, is running on a live lease or arrived earlier and can still be
-- claimed. Every other job, and letters of other introductions, still claim at
-- once. Lease expiry is unchanged: a job whose lease is older than
-- p_stale_after_seconds can be claimed again, and an expired lease does not
-- hold back later letters. An earlier letter with no attempts left can never
-- be claimed, so it never holds back later ones.
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
      and not (
        j.action_name = 'agent_contact_received'
        and exists (
          select 1
          from public.company_agent_web_action_jobs other
          where other.conversation_id = j.conversation_id
            and other.id <> j.id
            and other.action_name = 'agent_contact_received'
            and other.action_context ->> 'introductionRootId'
              = j.action_context ->> 'introductionRootId'
            and (
              (
                other.status = 'processing'
                and other.locked_at >= timezone('utc', now())
                  - make_interval(secs => greatest(30, p_stale_after_seconds))
              )
              or (
                other.status in ('queued', 'retry')
                and other.attempt_count < greatest(1, p_max_attempts)
                and (other.created_at, other.id) < (j.created_at, j.id)
              )
            )
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

revoke all on function public.claim_company_agent_web_action_v1(
  uuid, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.claim_company_agent_web_action_v1(
  uuid, text, integer, integer
) to service_role;
