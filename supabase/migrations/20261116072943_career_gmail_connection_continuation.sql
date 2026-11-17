-- Persist a verified connection and admit its first conversational turn together.
create or replace function public.confirm_career_gmail_connection_v1(
  p_user uuid, p_account text, p_conversation uuid, p_read_granted boolean, p_previous_connection text default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  connection talent_integrations;
  run opportunity_discovery_run;
  conversation uuid := p_conversation;
  generation text;
  connection_changed boolean;
  message_cursor bigint;
  run_id uuid := gen_random_uuid();
begin
  perform 1 from talent_users where user_id=p_user and deleted_at is null for update;
  if not found then raise exception 'Account unavailable'; end if;
  if conversation is not null then
    perform 1 from talent_conversations where id=conversation and user_id=p_user;
    if not found then raise exception 'Conversation unavailable'; end if;
  end if;
  select * into connection from talent_integrations where talent_id=p_user and provider='gmail' for update;
  if p_previous_connection is not null and p_previous_connection is distinct from
      coalesce((connection.career_mail_sync->>'generation')||'/'||connection.status,'absent')
    and not coalesce(connection.status='active' and connection.composio_connected_account_id=p_account,false) then
    raise exception using errcode='40001',message='Gmail connection changed during authorization';
  end if;
  insert into talent_integrations(talent_id, provider, status, composio_connected_account_id)
    values(p_user,'gmail','active',p_account)
    on conflict(talent_id,provider) do update set
      status='active',composio_connected_account_id=excluded.composio_connected_account_id,updated_at=now()
    where talent_integrations.status is distinct from 'active'
      or talent_integrations.composio_connected_account_id is distinct from excluded.composio_connected_account_id;
  connection_changed := found;
  if not p_read_granted then return jsonb_build_object('conversationId',conversation,'connectionChanged',connection_changed); end if;
  select * into strict connection from talent_integrations where talent_id=p_user and provider='gmail';
  generation := connection.career_mail_sync->>'generation';
  if generation is null then raise exception 'Connection generation unavailable'; end if;
  select * into run from opportunity_discovery_run where talent_id=p_user and dedupe_key='gmail-connected:'||generation;
  if found then return jsonb_build_object('conversationId',run.conversation_id); end if;
  if conversation is null then
    select id into conversation from talent_conversations where user_id=p_user order by updated_at desc,id limit 1;
    if not found then
      insert into talent_conversations(user_id,stage) values(p_user,'chat') returning id into conversation;
    end if;
  end if;
  select coalesce(max(id),0) into message_cursor from talent_messages
    where user_id=p_user and conversation_id=conversation and role='user';
  insert into opportunity_discovery_run(id,talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
    values(run_id,p_user,conversation,'gmail_connected','immediate','handed_off','gmail-connected:'||generation,0,
      jsonb_build_object('runContract','career_agent_v1','gmailConnectionGeneration',generation,
        'agentInvocation',jsonb_build_object('replyId','background:'||run_id,'sourceMessageCursor',message_cursor,'acceptedAt',now())))
    returning * into run;
  return jsonb_build_object('conversationId',conversation,'connectionChanged',connection_changed,'run',to_jsonb(run));
end $$;
revoke all on function public.confirm_career_gmail_connection_v1(uuid,text,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.confirm_career_gmail_connection_v1(uuid,text,uuid,boolean,text) to service_role;
