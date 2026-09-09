begin;

alter table public.slack_reply_jobs
  add column if not exists slack_files jsonb not null default '[]'::jsonb,
  add column if not exists batched_slack_files jsonb not null default '[]'::jsonb;

comment on column public.slack_reply_jobs.slack_files is
  'Non-secret Slack file identifiers and metadata for this event. File bytes and private URLs are never queued.';
comment on column public.slack_reply_jobs.batched_slack_files is
  'Slack file metadata carried across coalesced unanswered messages.';

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

  select job.*
  into v_previous
  from public.slack_reply_jobs job
  where job.thread_id = p_thread_id
    and job.status in ('queued', 'processing', 'retry')
    and job.response_text is null
  order by job.slack_message_ts desc, job.created_at desc, job.id desc
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
    and job.response_text is null;

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

create or replace function public.enqueue_slack_reply_job_v1(
  p_slack_event_id text,
  p_thread_id uuid,
  p_trigger_kind text,
  p_slack_message_ts text,
  p_slack_user_id text,
  p_prompt text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.enqueue_slack_reply_job_v2(
    p_slack_event_id,
    p_thread_id,
    p_trigger_kind,
    p_slack_message_ts,
    p_slack_user_id,
    p_prompt,
    '[]'::jsonb
  );
$$;

revoke all on function public.enqueue_slack_reply_job_v2(
  text, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.enqueue_slack_reply_job_v2(
  text, uuid, text, text, text, text, jsonb
) to service_role;

revoke all on function public.enqueue_slack_reply_job_v1(
  text, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.enqueue_slack_reply_job_v1(
  text, uuid, text, text, text, text
) to service_role;

commit;
