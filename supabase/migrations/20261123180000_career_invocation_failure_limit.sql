-- A Career invocation that keeps failing without progress stops after a few
-- spaced attempts instead of being re-run forever. The error kind is not
-- classified: any failure counts. Progress (a changed checkpoint for this
-- reply) starts the count again. 2026-11-22~23 a context-window failure was
-- retried ~5,240 times over 23 hours because the minute recovery republished
-- the unfinished invocation with a fresh queue message each time.
--
-- Count and wait live on the invocation row (provider_refs.failures), so every
-- queue message and the recovery dispatcher see the same state.
-- dispatch_after is moved to the next attempt; claim_career_invocations
-- already skips rows whose dispatch_after is in the future.
create or replace function public.record_career_invocation_failure(
  p_user_id uuid,
  p_conversation_id uuid,
  p_invocation_id uuid,
  p_error text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  item public.talent_external_operations;
  runtime jsonb;
  reply_id text := 'invocation:' || p_invocation_id;
  progress text;
  previous jsonb;
  failures integer;
  -- Waits after the 1st..4th failure; the 5th consecutive failure ends it.
  waits integer[] := array[15, 60, 240, 900];
  next_at timestamptz;
  error_text text := left(coalesce(nullif(btrim(p_error), ''), 'Execution failed'), 2000);
begin
  perform 1 from public.talent_conversations where id = p_conversation_id and user_id = p_user_id for update;
  if not found then return jsonb_build_object('state', 'gone'); end if;
  select * into item from public.talent_external_operations
    where id = p_invocation_id and user_id = p_user_id and conversation_id = p_conversation_id
      and kind = 'career_invocation' and status <> 'completed'
    for update;
  if not found then return jsonb_build_object('state', 'gone'); end if;

  if item.parent_id is null then
    select state into runtime from public.talent_agent_runtime
      where conversation_id = p_conversation_id and user_id = p_user_id;
  else
    select state into runtime from public.talent_agent_work_runtime
      where work_id = item.parent_id and user_id = p_user_id;
  end if;
  progress := md5(coalesce(runtime #> array['checkpoints', reply_id], 'null'::jsonb)::text);
  previous := item.provider_refs -> 'failures';
  failures := case
    when previous is not null and previous ->> 'progress' = progress
      then coalesce((previous ->> 'count')::integer, 0) + 1
    else 1
  end;

  if failures <= array_length(waits, 1) then
    next_at := now() + make_interval(secs => waits[failures]);
    update public.talent_external_operations
      set provider_refs = provider_refs
        || jsonb_build_object(
          'failures', jsonb_build_object(
            'count', failures, 'progress', progress, 'lastError', error_text,
            'lastFailedAt', now(), 'nextAttemptAt', next_at),
          'dispatch_after', next_at),
        updated_at = now()
      where id = item.id;
    return jsonb_build_object('state', 'retry', 'count', failures,
      'retryAfterSeconds', waits[failures]);
  end if;

  -- Give up: the invocation is finished as failed and its inputs are marked,
  -- so the conversation shows the failure and accepts the next input.
  update public.talent_external_operations
    set status = 'completed',
      provider_refs = provider_refs || jsonb_build_object('failures', jsonb_build_object(
        'count', failures, 'progress', progress, 'lastError', error_text, 'lastFailedAt', now())),
      result = result || jsonb_build_object('failed', true, 'lastError', error_text),
      updated_at = now()
    where id = item.id;
  update public.talent_messages
    set payload = coalesce(payload, '{}') || '{"careerTurnFailed":true}'
    where user_id = p_user_id and conversation_id = p_conversation_id and role = 'user'
      and coalesce(item.request -> 'input_message_ids', '[]') @> jsonb_build_array(id);
  if item.parent_id is null then
    update public.talent_agent_runtime
      set state = state
        || jsonb_build_object('checkpoints', coalesce(state -> 'checkpoints', '{}') - reply_id)
        || case when state #>> '{activeReply,replyId}' = reply_id
             then jsonb_build_object('activeReply', null) else '{}'::jsonb end
      where conversation_id = p_conversation_id and user_id = p_user_id;
  else
    update public.talent_agent_work_runtime
      set state = state
        || jsonb_build_object('checkpoints', coalesce(state -> 'checkpoints', '{}') - reply_id)
        || case when state #>> '{activeReply,replyId}' = reply_id
             then jsonb_build_object('activeReply', null) else '{}'::jsonb end
      where work_id = item.parent_id and user_id = p_user_id;
  end if;
  return jsonb_build_object('state', 'failed', 'count', failures);
end;
$function$;

revoke all on function public.record_career_invocation_failure(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_career_invocation_failure(uuid, uuid, uuid, text) to service_role;
