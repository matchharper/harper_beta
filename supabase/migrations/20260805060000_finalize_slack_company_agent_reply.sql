begin;

-- Finalize a normal (non-proposal) Slack reply after chat.postMessage returns.
-- If thread hydration wins the unique (thread, ts) race, the failed assignment
-- is caught at a savepoint and only its exact Slack-synced row is adopted as the
-- canonical message instead of storing or posting a duplicate.
create or replace function public.finalize_slack_company_agent_reply_v1(
  p_job_id uuid,
  p_slack_message_ts text,
  p_slack_bot_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.slack_reply_jobs%rowtype;
  v_thread public.company_slack_threads%rowtype;
  v_assistant public.company_messages%rowtype;
  v_delivered public.company_messages%rowtype;
  v_workspace_id uuid;
  v_thread_id uuid;
  v_canonical_message_id bigint;
  v_adopted boolean := false;
  v_now timestamptz := transaction_timestamp();
begin
  if p_job_id is null then
    raise exception using
      errcode = '22023',
      message = 'Slack reply finalization requires a job id';
  end if;
  if nullif(btrim(p_slack_message_ts), '') is null
     or nullif(btrim(p_slack_bot_user_id), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Slack reply finalization requires delivery identifiers';
  end if;

  -- Resolve immutable ownership first, then take locks in the same broad order
  -- as the company-side mutation RPCs: workspace -> thread -> job -> messages.
  select job.thread_id
  into v_thread_id
  from public.slack_reply_jobs job
  where job.id = p_job_id;
  if not found then
    return jsonb_build_object('status', 'not_found', 'job_id', p_job_id);
  end if;

  select channel.company_workspace_id
  into v_workspace_id
  from public.company_slack_threads thread
  join public.company_slack_channels channel on channel.id = thread.channel_id
  where thread.id = v_thread_id;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'Slack reply delivery conflict: job thread is unavailable';
  end if;

  perform 1
  from public.company_workspace workspace
  where workspace.company_workspace_id = v_workspace_id
  for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'Slack reply delivery conflict: job workspace is unavailable';
  end if;

  select thread.*
  into v_thread
  from public.company_slack_threads thread
  where thread.id = v_thread_id
  for update;
  if not found then
    raise exception using
      errcode = '23503',
      message = 'Slack reply delivery conflict: job thread disappeared';
  end if;

  select job.*
  into v_job
  from public.slack_reply_jobs job
  where job.id = p_job_id
  for update;
  if not found or v_job.thread_id is distinct from v_thread.id then
    raise exception using
      errcode = '23514',
      message = 'Slack reply delivery conflict: job thread changed';
  end if;

  if v_job.response_proposal_id is not null then
    raise exception using
      errcode = '23514',
      message = 'Slack reply delivery conflict: proposal replies require proposal activation';
  end if;
  if v_job.response_message_id is null
     or v_job.response_text is null then
    raise exception using
      errcode = '23514',
      message = 'Slack reply delivery conflict: job has no persisted normal response';
  end if;

  -- A completed row is the idempotency record. Validate the canonical message
  -- and return without touching timestamps again.
  if v_job.status = 'completed' then
    if v_job.slack_response_ts is distinct from p_slack_message_ts then
      raise exception using
        errcode = '23514',
        message = 'Slack reply delivery conflict: completed job has a different Slack timestamp';
    end if;

    select message.*
    into v_delivered
    from public.company_messages message
    where message.id = v_job.response_message_id
    for update;
    if not found
       or v_delivered.company_workspace_id is distinct from v_workspace_id
       or v_delivered.slack_thread_id is distinct from v_thread.id
       or v_delivered.message_type <> 'slack'
       or v_delivered.role <> 'assistant'
       or v_delivered.slack_message_ts is distinct from p_slack_message_ts
       or v_delivered.slack_user_id is distinct from p_slack_bot_user_id
       or v_delivered.content is distinct from v_job.response_text then
      raise exception using
        errcode = '23514',
        message = 'Slack reply delivery conflict: completed job canonical message does not match delivery';
    end if;

    return jsonb_build_object(
      'status', 'completed',
      'job_id', p_job_id,
      'response_message_id', v_job.response_message_id,
      'slack_response_ts', v_job.slack_response_ts,
      'adopted', coalesce(
        v_delivered.metadata ->> 'slackDeliveryAdopted' = 'true',
        false
      ),
      'idempotent', true
    );
  end if;

  if v_job.status not in ('queued', 'processing', 'retry') then
    raise exception using
      errcode = '23514',
      message = format(
        'Slack reply delivery conflict: job status %s cannot be completed',
        v_job.status
      );
  end if;

  select message.*
  into v_assistant
  from public.company_messages message
  where message.id = v_job.response_message_id
  for update;
  if not found
     or v_assistant.company_workspace_id is distinct from v_workspace_id
     or v_assistant.slack_thread_id is distinct from v_thread.id
     or v_assistant.message_type <> 'slack'
     or v_assistant.role <> 'assistant'
     or v_assistant.slack_user_id is distinct from p_slack_bot_user_id
     or v_assistant.content is distinct from v_job.response_text
     or v_assistant.metadata #>> '{slackReplyJobId}' is distinct from p_job_id::text
     or v_assistant.metadata ? 'updateProposalRef'
     or (
       v_assistant.slack_message_ts is not null
       and v_assistant.slack_message_ts is distinct from p_slack_message_ts
     ) then
    raise exception using
      errcode = '23514',
      message = 'Slack reply delivery conflict: persisted assistant does not match the job response';
  end if;

  if v_assistant.slack_message_ts = p_slack_message_ts then
    -- A previous non-atomic application version may already have assigned the
    -- timestamp without completing the job. The unique index makes A canonical.
    v_canonical_message_id := v_assistant.id;
  else
    begin
      update public.company_messages message
      set slack_message_ts = p_slack_message_ts
      where message.id = v_assistant.id;
      v_canonical_message_id := v_assistant.id;
    exception when unique_violation then
      -- Thread hydration inserted B before A acquired the unique (thread, ts)
      -- key. The failed UPDATE is rolled back to this subtransaction savepoint;
      -- now conditionally adopt only the exact Slack-synced copy.
      select message.*
      into v_delivered
      from public.company_messages message
      where message.slack_thread_id = v_thread.id
        and message.slack_message_ts = p_slack_message_ts
        and message.message_type = 'slack'
      for update;

      if not found
         or v_delivered.company_workspace_id is distinct from v_workspace_id
         or v_delivered.slack_thread_id is distinct from v_thread.id
         or v_delivered.message_type <> 'slack'
         or v_delivered.role <> 'assistant'
         or v_delivered.slack_user_id is distinct from p_slack_bot_user_id
         or v_delivered.content is distinct from v_job.response_text
         or v_delivered.metadata ->> 'source' is distinct from 'slack_thread_sync' then
        raise exception using
          errcode = '23514',
          message = 'Slack reply delivery conflict: existing Slack timestamp has different content or ownership';
      end if;

      v_canonical_message_id := v_delivered.id;
      v_adopted := v_delivered.id <> v_assistant.id;
    end;
  end if;

  if v_adopted then
    update public.company_messages message
    set
      model = v_assistant.model,
      status = v_assistant.status,
      mentions = v_assistant.mentions,
      thinking_logs = v_assistant.thinking_logs,
      metadata = message.metadata
        || v_assistant.metadata
        || jsonb_build_object(
          'source', 'company_side_llm',
          'slackReplyJobId', p_job_id,
          'slackDeliveryAdopted', true
        )
    where message.id = v_canonical_message_id;
  else
    update public.company_messages message
    set metadata = message.metadata || jsonb_build_object(
      'source', 'company_side_llm',
      'slackReplyJobId', p_job_id
    )
    where message.id = v_canonical_message_id;
  end if;

  update public.slack_reply_jobs job
  set
    status = 'completed',
    response_message_id = v_canonical_message_id,
    slack_response_ts = p_slack_message_ts,
    completed_at = v_now,
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = v_now
  where job.id = p_job_id;

  update public.company_slack_threads thread
  set created_by_harper = true, updated_at = v_now
  where thread.id = v_thread.id;

  if v_adopted then
    delete from public.company_messages message
    where message.id = v_assistant.id;
  end if;

  -- Recompute rather than blindly assigning B: a later message may already be
  -- present, and A/B can theoretically belong to different conversation rows.
  update public.company_conversations conversation
  set
    last_message_id = (
      select message.id
      from public.company_messages message
      where message.conversation_id = conversation.id
      order by message.id desc
      limit 1
    ),
    last_message_at = (
      select message.created_at
      from public.company_messages message
      where message.conversation_id = conversation.id
      order by message.id desc
      limit 1
    ),
    updated_at = v_now
  where conversation.id in (
    v_assistant.conversation_id,
    v_delivered.conversation_id
  );

  return jsonb_build_object(
    'status', 'completed',
    'job_id', p_job_id,
    'response_message_id', v_canonical_message_id,
    'slack_response_ts', p_slack_message_ts,
    'adopted', v_adopted,
    'idempotent', false
  );
end;
$$;

revoke all on function public.finalize_slack_company_agent_reply_v1(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_slack_company_agent_reply_v1(uuid, text, text)
  to service_role;

comment on function public.finalize_slack_company_agent_reply_v1(uuid, text, text) is
  'Atomically finalizes a normal Slack agent reply and adopts an exact thread-sync row if it won the delivery timestamp race.';

commit;
