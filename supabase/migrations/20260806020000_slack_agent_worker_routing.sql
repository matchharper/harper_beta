begin;

alter table public.company_slack_channels
  add column if not exists worker_target text not null default 'production';

alter table public.slack_reply_jobs
  add column if not exists worker_target text not null default 'production';

alter table public.company_slack_channels
  drop constraint if exists company_slack_channels_worker_target_check;
alter table public.company_slack_channels
  add constraint company_slack_channels_worker_target_check
  check (
    worker_target = btrim(worker_target)
    and char_length(worker_target) between 1 and 100
  );

alter table public.slack_reply_jobs
  drop constraint if exists slack_reply_jobs_worker_target_check;
alter table public.slack_reply_jobs
  add constraint slack_reply_jobs_worker_target_check
  check (
    worker_target = btrim(worker_target)
    and char_length(worker_target) between 1 and 100
  );

create index if not exists slack_reply_jobs_worker_target_poll_idx
  on public.slack_reply_jobs(
    worker_target,
    status,
    next_attempt_at,
    created_at
  );

comment on column public.company_slack_channels.worker_target is
  'Worker route for future company-side LLM Slack jobs. production is the default; local development uses an explicit developer-owned target.';
comment on column public.slack_reply_jobs.worker_target is
  'Immutable-at-enqueue worker route copied from the Slack channel, except for explicit pending-job rerouting through the routing RPC.';

create or replace function public.assign_slack_reply_job_worker_target_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_target text;
begin
  select channel.worker_target
  into v_worker_target
  from public.company_slack_threads thread
  join public.company_slack_channels channel on channel.id = thread.channel_id
  where thread.id = new.thread_id
  for share of channel;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Slack reply job thread has no routable channel';
  end if;

  new.worker_target := v_worker_target;
  return new;
end;
$$;

drop trigger if exists assign_slack_reply_job_worker_target_v1
  on public.slack_reply_jobs;
create trigger assign_slack_reply_job_worker_target_v1
before insert on public.slack_reply_jobs
for each row execute function public.assign_slack_reply_job_worker_target_v1();

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
  with candidates as (
    select job.id
    from public.slack_reply_jobs job
    where job.worker_target = v_worker_target
      and (
        (
          job.status in ('queued', 'retry')
          and job.next_attempt_at <= timezone('utc', now())
        ) or (
          job.status = 'processing'
          and job.locked_at < timezone('utc', now())
            - make_interval(secs => greatest(p_stale_after_seconds, 30))
        )
      )
      and job.attempt_count < greatest(p_max_retry_count, 1)
    order by job.created_at
    for update skip locked
    limit greatest(least(p_batch_size, 20), 1)
  )
  update public.slack_reply_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    locked_at = timezone('utc', now()),
    locked_by = p_worker_id,
    updated_at = timezone('utc', now())
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

-- Preserve the original production-worker contract during a rolling deploy.
-- Once this migration is applied, an old worker calling v1 can no longer
-- claim a channel that was explicitly routed to a local target.
create or replace function public.claim_slack_reply_jobs(
  p_worker_id text,
  p_batch_size integer default 5,
  p_max_retry_count integer default 5,
  p_stale_after_seconds integer default 300
)
returns setof public.slack_reply_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  select *
  from public.claim_slack_reply_jobs_v2(
    p_worker_id,
    'production',
    p_batch_size,
    p_max_retry_count,
    p_stale_after_seconds
  );
$$;

create or replace function public.set_slack_agent_worker_target_v1(
  p_worker_target text,
  p_company_workspace_id uuid default null,
  p_slack_channel_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_target text := btrim(coalesce(p_worker_target, ''));
  v_slack_channel_id text := nullif(btrim(coalesce(p_slack_channel_id, '')), '');
  v_channel_ids uuid[];
  v_channel_count integer;
  v_pending_job_count integer;
  v_processing_job_count integer;
begin
  if v_worker_target = '' or char_length(v_worker_target) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Slack agent worker target must contain 1 to 100 characters';
  end if;
  if p_company_workspace_id is null and v_slack_channel_id is null then
    raise exception using
      errcode = '22023',
      message = 'Slack agent routing requires a workspace id or Slack channel id';
  end if;

  select array_agg(channel.id order by channel.id)
  into v_channel_ids
  from public.company_slack_channels channel
  where (p_company_workspace_id is null
         or channel.company_workspace_id = p_company_workspace_id)
    and (v_slack_channel_id is null
         or channel.slack_channel_id = v_slack_channel_id);

  v_channel_count := coalesce(cardinality(v_channel_ids), 0);
  if v_channel_count = 0 then
    raise exception using
      errcode = 'P0002',
      message = 'No Slack channels matched the requested worker route';
  end if;
  if p_company_workspace_id is null
     and v_slack_channel_id is not null
     and v_channel_count > 1 then
    raise exception using
      errcode = '21000',
      message = 'Slack channel id is ambiguous; also provide the company workspace id';
  end if;

  perform 1
  from public.company_slack_channels channel
  where channel.id = any(v_channel_ids)
  order by channel.id
  for update;

  -- Serialize route changes with worker claims. Without locking the pending
  -- rows, a claim could move one job to processing after the check below and
  -- leave it owned by the previous target.
  perform 1
  from public.slack_reply_jobs job
  join public.company_slack_threads thread on thread.id = job.thread_id
  where thread.channel_id = any(v_channel_ids)
    and job.status in ('queued', 'retry', 'processing')
  order by job.id
  for update of job;

  select count(*)::integer
  into v_processing_job_count
  from public.slack_reply_jobs job
  join public.company_slack_threads thread on thread.id = job.thread_id
  where thread.channel_id = any(v_channel_ids)
    and job.status = 'processing';

  if v_processing_job_count > 0 then
    raise exception using
      errcode = '55006',
      message = 'Cannot change Slack agent worker target while matching jobs are processing';
  end if;

  update public.company_slack_channels channel
  set
    worker_target = v_worker_target,
    updated_at = timezone('utc', now())
  where channel.id = any(v_channel_ids);

  update public.slack_reply_jobs job
  set
    worker_target = v_worker_target,
    updated_at = timezone('utc', now())
  from public.company_slack_threads thread
  where thread.id = job.thread_id
    and thread.channel_id = any(v_channel_ids)
    and job.status in ('queued', 'retry');
  get diagnostics v_pending_job_count = row_count;

  return jsonb_build_object(
    'status', 'updated',
    'worker_target', v_worker_target,
    'channel_count', v_channel_count,
    'pending_job_count', v_pending_job_count
  );
end;
$$;

revoke all on function public.assign_slack_reply_job_worker_target_v1()
  from public, anon, authenticated;
revoke all on function public.claim_slack_reply_jobs_v2(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_slack_reply_jobs(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.set_slack_agent_worker_target_v1(text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_slack_reply_jobs_v2(text, text, integer, integer, integer)
  to service_role;
grant execute on function public.claim_slack_reply_jobs(text, integer, integer, integer)
  to service_role;
grant execute on function public.set_slack_agent_worker_target_v1(text, uuid, text)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant execute on function public.claim_slack_reply_jobs_v2(text, text, integer, integer, integer)
      to harper_worker;
    grant execute on function public.claim_slack_reply_jobs(text, integer, integer, integer)
      to harper_worker;
    grant execute on function public.set_slack_agent_worker_target_v1(text, uuid, text)
      to harper_worker;
  end if;
end;
$$;

commit;
