begin;

-- Queue delivery is durable outside Postgres, but reply state remains in the
-- existing job ledger. Do not create a second application queue table.
alter table public.slack_reply_jobs
  add column if not exists queue_dispatch_status text not null default 'not_required',
  add column if not exists queue_dispatch_attempt_count integer not null default 0,
  add column if not exists queue_dispatched_at timestamptz,
  add column if not exists queue_last_error text,
  add column if not exists queue_next_attempt_at timestamptz not null default timezone('utc', now()),
  add column if not exists queue_source text;

alter table public.slack_reply_jobs
  drop constraint if exists slack_reply_jobs_queue_dispatch_status_check;
alter table public.slack_reply_jobs
  add constraint slack_reply_jobs_queue_dispatch_status_check
  check (queue_dispatch_status in ('not_required', 'pending', 'dispatched', 'retry', 'failed'));

alter table public.slack_reply_jobs
  drop constraint if exists slack_reply_jobs_queue_dispatch_attempt_count_check;
alter table public.slack_reply_jobs
  add constraint slack_reply_jobs_queue_dispatch_attempt_count_check
  check (queue_dispatch_attempt_count >= 0);

create index if not exists slack_reply_jobs_vercel_queue_dispatch_idx
  on public.slack_reply_jobs(queue_dispatch_status, queue_next_attempt_at, created_at)
  where worker_target = 'vercel_queue'
    and queue_dispatch_status in ('pending', 'retry');

comment on column public.slack_reply_jobs.queue_dispatch_status is
  'Dispatch state for Vercel Queue. Event-originated jobs are already represented by their accepted Queue event; interaction-originated jobs are republished from this same job row if needed.';
comment on column public.slack_reply_jobs.queue_source is
  'Producer that created a Vercel Queue dispatch, without storing message content or credentials.';

-- Do not bulk-switch channels in this migration. The existing
-- set_slack_agent_worker_target_v1 RPC enables a channel-by-channel canary by
-- setting its target to `vercel_queue`. That RPC refuses a channel with an
-- in-flight job and moves only queued/retry rows under a lock, so the EC2
-- worker can finish an already-processing `production` job safely.

-- Keep the historical trigger as the single authority for assigning a target.
-- It also arms the existing job row for a Queue dispatch, which closes the
-- DB-write -> Queue-publish gap without introducing another table. The update
-- case is needed because set_slack_agent_worker_target_v1 moves queued jobs
-- during a channel-by-channel canary.
create or replace function public.assign_slack_reply_job_worker_target_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_target text;
begin
  if tg_op = 'INSERT' then
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
  else
    v_worker_target := btrim(coalesce(new.worker_target, ''));
  end if;

  new.worker_target := v_worker_target;
  if v_worker_target = 'vercel_queue' then
    -- A channel can be rolled back to the legacy worker and later canaried
    -- again. That is a fresh Queue-dispatch lifecycle, not a continuation of
    -- an earlier publish outage.
    new.queue_dispatch_attempt_count := 0;
    new.queue_dispatch_status := 'pending';
    new.queue_dispatched_at := null;
    new.queue_last_error := null;
    new.queue_next_attempt_at := timezone('utc', now());
  else
    new.queue_dispatch_status := 'not_required';
  end if;
  return new;
end;
$$;

drop trigger if exists assign_slack_reply_job_worker_target_v1
  on public.slack_reply_jobs;
create trigger assign_slack_reply_job_worker_target_v1
before insert or update of worker_target on public.slack_reply_jobs
for each row execute function public.assign_slack_reply_job_worker_target_v1();

-- Queue delivery is only approximately ordered. Preserve the existing v2
-- enqueue API, but do not let an older Slack timestamp cancel an already
-- queued newer turn in the same thread. Non-Slack synthetic timestamps (such
-- as role-creation bootstrap messages) retain the historical coalescing
-- behavior because they do not have a comparable Slack ordering value.
create or replace function public.enqueue_slack_reply_job_v2(
  p_slack_event_id text,
  p_thread_id uuid,
  p_trigger_kind text,
  p_slack_message_ts text,
  p_slack_user_id text,
  p_prompt text,
  p_slack_files jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.slack_reply_jobs%rowtype;
  v_previous public.slack_reply_jobs%rowtype;
  v_job public.slack_reply_jobs%rowtype;
  v_now timestamptz := transaction_timestamp();
  v_prompt text := btrim(coalesce(p_prompt, ''));
  v_slack_files jsonb := case
    when jsonb_typeof(coalesce(p_slack_files, '[]'::jsonb)) = 'array'
      then coalesce(p_slack_files, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_incoming_is_slack_ts boolean := coalesce(p_slack_message_ts, '')
    ~ E'^[0-9]+(\\.[0-9]+)?$';
  v_has_newer_active_job boolean := false;
begin
  if nullif(btrim(coalesce(p_slack_event_id, '')), '') is null
     or p_thread_id is null
     or p_trigger_kind not in ('mention', 'thread_reply', 'button_choice')
     or nullif(btrim(coalesce(p_slack_message_ts, '')), '') is null
     or v_prompt = '' then
    raise exception using
      errcode = '22023',
      message = 'Slack reply enqueue payload is invalid';
  end if;

  perform 1
  from public.company_slack_threads thread
  where thread.id = p_thread_id
  for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'Slack reply enqueue thread was not found';
  end if;

  select job.*
  into v_existing
  from public.slack_reply_jobs job
  where job.slack_event_id = p_slack_event_id;
  if found then
    return jsonb_build_object(
      'duplicate', true,
      'job_id', v_existing.id
    );
  end if;

  if v_incoming_is_slack_ts then
    select exists(
      select 1
      from public.slack_reply_jobs job
      where job.thread_id = p_thread_id
        and job.status in ('queued', 'processing', 'retry')
        and job.response_text is null
        and case
          when job.slack_message_ts ~ E'^[0-9]+(\\.[0-9]+)?$'
            then job.slack_message_ts::numeric > p_slack_message_ts::numeric
          else false
        end
    )
    into v_has_newer_active_job;
  end if;

  if v_has_newer_active_job then
    insert into public.slack_reply_jobs(
      slack_event_id,
      thread_id,
      trigger_kind,
      slack_message_ts,
      slack_user_id,
      prompt,
      batched_prompt,
      slack_files,
      batched_slack_files,
      status,
      completed_at,
      last_error
    ) values (
      p_slack_event_id,
      p_thread_id,
      p_trigger_kind,
      p_slack_message_ts,
      nullif(btrim(coalesce(p_slack_user_id, '')), ''),
      v_prompt,
      v_prompt,
      v_slack_files,
      v_slack_files,
      'ignored',
      v_now,
      'superseded_by_newer_thread_message'
    )
    returning * into v_job;

    return jsonb_build_object(
      'duplicate', false,
      'ignored', true,
      'job_id', v_job.id
    );
  end if;

  select job.*
  into v_previous
  from public.slack_reply_jobs job
  where job.thread_id = p_thread_id
    and job.status in ('queued', 'processing', 'retry')
    and job.response_text is null
    and (
      not v_incoming_is_slack_ts
      or case
        when job.slack_message_ts ~ E'^[0-9]+(\\.[0-9]+)?$'
          then job.slack_message_ts::numeric <= p_slack_message_ts::numeric
        else true
      end
    )
  order by case
    when job.slack_message_ts ~ E'^[0-9]+(\\.[0-9]+)?$'
      then job.slack_message_ts::numeric
    else null
  end desc nulls last, job.created_at desc, job.id desc
  limit 1
  for update;

  update public.slack_reply_jobs job
  set
    completed_at = v_now,
    last_error = 'superseded_by_new_thread_message',
    locked_at = null,
    locked_by = null,
    status = 'ignored',
    updated_at = v_now
  where job.thread_id = p_thread_id
    and job.status in ('queued', 'processing', 'retry')
    and job.response_text is null
    and (
      not v_incoming_is_slack_ts
      or case
        when job.slack_message_ts ~ E'^[0-9]+(\\.[0-9]+)?$'
          then job.slack_message_ts::numeric <= p_slack_message_ts::numeric
        else true
      end
    );

  insert into public.slack_reply_jobs(
    slack_event_id,
    thread_id,
    trigger_kind,
    slack_message_ts,
    slack_user_id,
    prompt,
    batched_prompt,
    slack_files,
    batched_slack_files
  ) values (
    p_slack_event_id,
    p_thread_id,
    case
      when p_trigger_kind = 'button_choice'
        or v_previous.trigger_kind = 'button_choice'
        then 'button_choice'
      when p_trigger_kind = 'mention' or v_previous.trigger_kind = 'mention'
        then 'mention'
      else 'thread_reply'
    end,
    p_slack_message_ts,
    nullif(btrim(coalesce(p_slack_user_id, '')), ''),
    v_prompt,
    concat_ws(
      E'\n\n',
      nullif(btrim(coalesce(v_previous.batched_prompt, v_previous.prompt)), ''),
      v_prompt
    ),
    v_slack_files,
    case
      when jsonb_typeof(v_previous.batched_slack_files) = 'array'
        and jsonb_array_length(v_previous.batched_slack_files) > 0
        then v_previous.batched_slack_files
      else coalesce(v_previous.slack_files, '[]'::jsonb)
    end || v_slack_files
  )
  returning * into v_job;

  return jsonb_build_object(
    'duplicate', false,
    'job_id', v_job.id,
    'superseded_job_id', v_previous.id
  );
end;
$$;

revoke all on function public.enqueue_slack_reply_job_v2(
  text, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_slack_reply_job_v2(
  text, uuid, text, text, text, text, jsonb
) to service_role;

-- A Queue delivery is at-least-once. Claim one exact job atomically before
-- running a company-side LLM, and cap live Queue work at 20. The advisory lock
-- protects the short count-and-claim transaction; no external work occurs
-- while it is held.
create or replace function public.claim_slack_reply_job_v3(
  p_job_id uuid,
  p_worker_id text,
  p_stale_after_seconds integer default 360,
  p_max_retry_count integer default 5,
  p_max_concurrency integer default 20
)
returns setof public.slack_reply_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker_id text := btrim(coalesce(p_worker_id, ''));
  v_stale_after_seconds integer := greatest(30, least(coalesce(p_stale_after_seconds, 360), 3600));
  v_max_retry_count integer := greatest(1, least(coalesce(p_max_retry_count, 5), 20));
  v_max_concurrency integer := greatest(1, least(coalesce(p_max_concurrency, 20), 20));
  v_active_count integer;
begin
  if p_job_id is null or v_worker_id = '' or char_length(v_worker_id) > 200 then
    raise exception using
      errcode = '22023',
      message = 'Slack Vercel Queue claim payload is invalid';
  end if;

  perform pg_advisory_xact_lock(hashtext('harper:slack-vercel-queue-claim'));

  select count(*)::integer
  into v_active_count
  from public.slack_reply_jobs job
  where job.worker_target = 'vercel_queue'
    and job.status = 'processing'
    and job.locked_at >= timezone('utc', now())
      - make_interval(secs => v_stale_after_seconds);

  if v_active_count >= v_max_concurrency then
    return;
  end if;

  return query
  update public.slack_reply_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    locked_at = timezone('utc', now()),
    locked_by = v_worker_id,
    updated_at = timezone('utc', now())
  where job.id = p_job_id
    and job.worker_target = 'vercel_queue'
    and job.attempt_count < v_max_retry_count
    and (
      (
        job.status in ('queued', 'retry')
        and job.next_attempt_at <= timezone('utc', now())
      ) or (
        job.status = 'processing'
        and job.locked_at < timezone('utc', now())
          - make_interval(secs => v_stale_after_seconds)
      )
    )
  returning job.*;
end;
$$;

revoke all on function public.claim_slack_reply_job_v3(uuid, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_slack_reply_job_v3(uuid, text, integer, integer, integer)
  to service_role;

commit;
