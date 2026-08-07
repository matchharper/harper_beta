begin;

alter table public.slack_reply_jobs
  add column if not exists choice_source_job_id uuid
    references public.slack_reply_jobs(id) on delete set null,
  add column if not exists selected_choice_index integer,
  add column if not exists selected_choice_label text,
  add column if not exists selected_choice_message text,
  add column if not exists selected_choice_by_slack_user_id text,
  add column if not exists selected_choice_at timestamptz;

alter table public.slack_reply_jobs
  drop constraint if exists slack_reply_jobs_trigger_kind_check;
alter table public.slack_reply_jobs
  add constraint slack_reply_jobs_trigger_kind_check
  check (trigger_kind in ('mention', 'thread_reply', 'button_choice'));

create index if not exists slack_reply_jobs_choice_source_idx
  on public.slack_reply_jobs(choice_source_job_id)
  where choice_source_job_id is not null;

comment on column public.slack_reply_jobs.choice_source_job_id is
  'Completed company-side LLM Slack reply whose button created this synthetic user turn.';
comment on column public.slack_reply_jobs.selected_choice_message is
  'Exact user-language message injected after a signed Slack button interaction.';

-- Keep coalescing a clicked button with a newer typed thread reply, while
-- preserving the button turn's guaranteed-response behavior.
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
    batched_prompt
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

create or replace function public.enqueue_slack_button_choice_v1(
  p_source_job_id uuid,
  p_choice_index integer,
  p_choice_label text,
  p_choice_message text,
  p_slack_team_id text,
  p_slack_channel_id text,
  p_source_message_ts text,
  p_slack_user_id text,
  p_action_ts text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source record;
  v_previous public.slack_reply_jobs%rowtype;
  v_job public.slack_reply_jobs%rowtype;
  v_now timestamptz := transaction_timestamp();
  v_choice_label text := btrim(coalesce(p_choice_label, ''));
  v_choice_message text := btrim(coalesce(p_choice_message, ''));
  v_slack_team_id text := btrim(coalesce(p_slack_team_id, ''));
  v_slack_channel_id text := btrim(coalesce(p_slack_channel_id, ''));
  v_source_message_ts text := btrim(coalesce(p_source_message_ts, ''));
  v_slack_user_id text := btrim(coalesce(p_slack_user_id, ''));
  v_action_ts text := btrim(coalesce(p_action_ts, ''));
begin
  if p_source_job_id is null
     or p_choice_index is null
     or p_choice_index < 0
     or v_choice_label = ''
     or v_choice_message = ''
     or v_slack_team_id = ''
     or v_slack_channel_id = ''
     or v_source_message_ts = ''
     or v_slack_user_id = ''
     or v_action_ts = '' then
    raise exception using
      errcode = '22023',
      message = 'Slack button choice payload is invalid';
  end if;

  select
    job.id,
    job.thread_id,
    job.status,
    job.response_text,
    job.slack_response_ts,
    job.selected_choice_index,
    job.selected_choice_label,
    job.selected_choice_by_slack_user_id,
    channel.company_workspace_id
  into v_source
  from public.slack_reply_jobs job
  join public.company_slack_threads thread on thread.id = job.thread_id
  join public.company_slack_channels channel on channel.id = thread.channel_id
  join public.company_slack_integrations integration
    on integration.company_workspace_id = channel.company_workspace_id
   and integration.slack_team_id = channel.slack_team_id
   and integration.status = 'active'
  where job.id = p_source_job_id
    and channel.is_enabled = true
    and channel.slack_team_id = v_slack_team_id
    and channel.slack_channel_id = v_slack_channel_id
  for update of job;

  if not found then
    return jsonb_build_object('status', 'ignored');
  end if;

  if v_source.status <> 'completed'
     or nullif(btrim(coalesce(v_source.response_text, '')), '') is null
     or v_source.slack_response_ts is distinct from v_source_message_ts then
    return jsonb_build_object('status', 'ignored');
  end if;

  if v_source.selected_choice_index is not null then
    return jsonb_build_object(
      'status', 'already_selected',
      'choice_index', v_source.selected_choice_index,
      'choice_label', v_source.selected_choice_label,
      'selected_by_slack_user_id', v_source.selected_choice_by_slack_user_id
    );
  end if;

  perform 1
  from public.company_slack_threads thread
  where thread.id = v_source.thread_id
  for update;

  select job.*
  into v_previous
  from public.slack_reply_jobs job
  where job.thread_id = v_source.thread_id
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
  where job.thread_id = v_source.thread_id
    and job.status in ('queued', 'processing', 'retry')
    and job.response_text is null;

  update public.slack_reply_jobs job
  set
    selected_choice_index = p_choice_index,
    selected_choice_label = v_choice_label,
    selected_choice_message = v_choice_message,
    selected_choice_by_slack_user_id = v_slack_user_id,
    selected_choice_at = v_now,
    updated_at = v_now
  where job.id = p_source_job_id
    and job.selected_choice_index is null;

  insert into public.slack_reply_jobs(
    slack_event_id,
    thread_id,
    trigger_kind,
    slack_message_ts,
    slack_user_id,
    prompt,
    batched_prompt,
    choice_source_job_id
  ) values (
    'button_choice:' || p_source_job_id::text,
    v_source.thread_id,
    'button_choice',
    v_action_ts,
    v_slack_user_id,
    v_choice_message,
    concat_ws(
      E'\n\n',
      nullif(btrim(coalesce(v_previous.batched_prompt, v_previous.prompt)), ''),
      v_choice_message
    ),
    p_source_job_id
  )
  returning * into v_job;

  return jsonb_build_object(
    'status', 'queued',
    'job_id', v_job.id,
    'workspace_id', v_source.company_workspace_id,
    'superseded_job_id', v_previous.id
  );
end;
$$;

revoke all on function public.enqueue_slack_button_choice_v1(
  uuid, integer, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.enqueue_slack_button_choice_v1(
  uuid, integer, text, text, text, text, text, text, text
) to service_role;

commit;
