create or replace function public.bind_career_conversation_effect(
  p_user_id uuid, p_conversation_id uuid, p_effect_id uuid, p_effect_revision bigint,
  p_operation_id uuid, p_reply_id text, p_source_message_id bigint default null,
  p_claim_id text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  pending uuid;
  operation_kind text;
  browser_authorization jsonb;
begin
  perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;

  select kind, request->'authorization' into operation_kind, browser_authorization
    from public.talent_external_operations where id=p_operation_id
    and user_id=p_user_id and conversation_id=p_conversation_id and request->>'work_id' is null;
  if not found then raise exception 'External operation unavailable'; end if;

  -- The current turn and the browser's earlier authorization messages are separate sources.
  if p_source_message_id is not null or operation_kind <> 'browser_run' then
    perform 1 from public.talent_messages where id=p_source_message_id and user_id=p_user_id
      and conversation_id=p_conversation_id and role='user'
      and coalesce(payload->>'careerTurnStopped','false')<>'true';
    if not found then raise exception 'Original request unavailable or stopped'; end if;
  end if;

  if operation_kind = 'browser_run' and jsonb_typeof(browser_authorization) = 'array' then
    -- use_browser saves the resolved, owned references on the run before dispatch.
    perform 1 from jsonb_to_recordset(browser_authorization) as evidence(id bigint)
      join public.talent_messages m on m.id=evidence.id
      where m.user_id=p_user_id and m.role='user' and m.payload->>'careerTurnStopped'='true';
    if found then raise exception 'User stopped this request'; end if;
  end if;

  perform 1 from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id
    and state#>>'{activeReply,claimId}'=p_claim_id and state#>>'{activeReply,replyId}'=p_reply_id
    and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
  if not found then raise exception 'Execution claim unavailable'; end if;
  select id into pending from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
    and kind='career_invocation' and parent_id is null and status<>'completed'
    and (not coalesce(provider_refs->'input_message_ids','[]') @> coalesce(request->'input_message_ids','[]')
      or not coalesce(provider_refs->'event_ids','[]') @> coalesce(request->'event_ids','[]'))
    order by created_at,id limit 1;
  if pending is not null then return jsonb_build_object('waiting',pending); end if;

  update public.talent_external_operations set status='dispatching',revision=revision+1,updated_at=now(),result=jsonb_build_object('operation_id',p_operation_id)
    where id=p_effect_id and parent_id is null and user_id=p_user_id and conversation_id=p_conversation_id
    and kind='work_effect' and revision=p_effect_revision and status='reserved';
  if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
  return '{"accepted":true}';
end $$;

notify pgrst, 'reload schema';
