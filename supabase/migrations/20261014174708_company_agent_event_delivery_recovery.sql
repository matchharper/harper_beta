-- Recover work interrupted by a Function timeout without losing its persisted
-- message/tool identity. Exhausted leases must not block later conversation jobs.
create or replace function public.recover_company_agent_web_action_jobs_v1(
  p_stale_after_seconds integer default 360,
  p_max_attempts integer default 5,
  p_limit integer default 20
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  with expired as (
    select id from public.company_agent_web_action_jobs
    where status='processing'
      and coalesce(locked_at,updated_at,created_at) < now()-make_interval(secs=>greatest(30,p_stale_after_seconds))
    order by created_at,id limit greatest(1,p_limit) for update skip locked
  )
  update public.company_agent_web_action_jobs job
  set status=case when attempt_count>=greatest(1,p_max_attempts) then 'failed' else 'retry' end,
      queue_dispatch_status=case when attempt_count>=greatest(1,p_max_attempts) then 'failed' else 'pending' end,
      last_error='company_agent_worker_lease_expired',
      locked_at=null,locked_by=null,next_attempt_at=now(),queue_next_attempt_at=now(),updated_at=now()
  from expired where job.id=expired.id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
revoke all on function public.recover_company_agent_web_action_jobs_v1(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.recover_company_agent_web_action_jobs_v1(integer,integer,integer) to service_role;
