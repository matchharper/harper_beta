begin;

-- prompt는 최신 Slack 원문으로 유지하고, company-side LLM에 한 번에 넣을
-- 미응답 메시지 묶음만 별도 보관한다. 기존 row는 null이어도 정상이다.
alter table public.slack_reply_jobs
  add column if not exists batched_prompt text;

comment on column public.slack_reply_jobs.batched_prompt is
  'Unanswered messages coalesced for one company-side LLM turn. Null falls back to prompt.';

-- 같은 Slack thread의 enqueue만 직렬화한다. 새 메시지가 들어오면 아직 응답이
-- 만들어지지 않은 기존 job을 기존 ignored 상태로 닫고, 그 입력을 새 job으로
-- 넘긴다. debounce나 예약 시간은 추가하지 않으므로 새 job은 즉시 claim 가능하다.
create or replace function public.enqueue_slack_reply_job_v1(
  p_slack_event_id text,
  p_thread_id uuid,
  p_trigger_kind text,
  p_slack_message_ts text,
  p_slack_user_id text,
  p_prompt text
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
begin
  if nullif(btrim(coalesce(p_slack_event_id, '')), '') is null
     or p_thread_id is null
     or p_trigger_kind not in ('mention', 'thread_reply')
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
    batched_prompt
  ) values (
    p_slack_event_id,
    p_thread_id,
    case
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
    )
  )
  returning * into v_job;

  return jsonb_build_object(
    'duplicate', false,
    'job_id', v_job.id,
    'superseded_job_id', v_previous.id
  );
end;
$$;

revoke all on function public.enqueue_slack_reply_job_v1(
  text, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.enqueue_slack_reply_job_v1(
  text, uuid, text, text, text, text
) to service_role;

commit;
