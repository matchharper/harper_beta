-- Gmail inbox review after a connection waits its turn instead of holding the person's other Career work,
-- and an application waiting for an emailed code hears about the connection in its own chat.

create or replace function public.confirm_career_gmail_connection_v1(
  p_user uuid, p_account text, p_conversation uuid, p_read_granted boolean, p_previous_connection text default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  connection talent_integrations;
  run opportunity_discovery_run;
  conversation uuid := p_conversation;
  generation text;
  connection_changed boolean;
  review talent_external_operations;
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
  select * into review from talent_external_operations where user_id=p_user and kind='gmail_review' and idempotency_key='gmail-connected:'||generation;
  if found then return jsonb_build_object('conversationId',coalesce(review.conversation_id,conversation)); end if;
  if conversation is null then
    select id into conversation from talent_conversations where user_id=p_user order by updated_at desc,id limit 1;
    if not found then
      insert into talent_conversations(user_id,stage) values(p_user,'chat') returning id into conversation;
    end if;
  end if;
  -- The inbox review is only recorded here. career_start_gmail_review_v1 starts it once the person has no other
  -- Career job, so a waiting review never holds a schedule, the daily batch or discovery back.
  insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
    values(p_user,conversation,'gmail_review','gmail-connected:'||generation,'ready',jsonb_build_object('generation',generation))
    on conflict(user_id,kind,idempotency_key) do nothing returning * into review;
  return jsonb_build_object('conversationId',conversation,'connectionChanged',connection_changed,'review',to_jsonb(review));
end $$;
-- Starts a recorded inbox review when the person has no other Career job. Without one it returns null and the
-- review stays ready for the next scan; a disconnected or replaced Gmail cancels it.
create function public.career_start_gmail_review_v1(p_review uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  review talent_external_operations;
  connection talent_integrations;
  conversation uuid;
  message_cursor bigint;
  run opportunity_discovery_run;
  run_id uuid := gen_random_uuid();
begin
  select * into review from talent_external_operations where id=p_review and kind='gmail_review';
  if not found then return null; end if;
  -- The lock scheduled and daily work take before they enqueue, so the two never start side by side.
  perform pg_advisory_xact_lock(hashtextextended(review.user_id::text||':career_processing',0));
  select * into review from talent_external_operations where id=p_review for update;
  if review.status<>'ready' or coalesce(review.request->>'execution_environment','production')<>career_execution_environment() then return null; end if;
  select * into connection from talent_integrations where talent_id=review.user_id and provider='gmail';
  if not found or connection.status<>'active' or connection.career_mail_sync->>'generation' is distinct from review.request->>'generation'
    or exists(select 1 from talent_users where user_id=review.user_id and deleted_at is not null) then
    update talent_external_operations set status='cancelled',updated_at=now() where id=review.id;
    return null;
  end if;
  if exists(select 1 from opportunity_discovery_run where talent_id=review.user_id and status in ('queued','running','handed_off')
    and trigger_payload->>'runContract'='career_agent_v1') then return null; end if;
  conversation := review.conversation_id;
  if conversation is null or not exists(select 1 from talent_conversations where id=conversation and user_id=review.user_id) then
    select id into conversation from talent_conversations where user_id=review.user_id order by updated_at desc,id limit 1;
    if not found then
      insert into talent_conversations(user_id,stage) values(review.user_id,'chat') returning id into conversation;
    end if;
  end if;
  -- Messages answered before the review starts are history, not new input for it.
  select coalesce(max(id),0) into message_cursor from talent_messages
    where user_id=review.user_id and conversation_id=conversation and role='user';
  insert into opportunity_discovery_run(id,talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
    values(run_id,review.user_id,conversation,'gmail_connected','immediate','handed_off','gmail-connected:'||(review.request->>'generation'),0,
      jsonb_build_object('runContract','career_agent_v1','gmailConnectionGeneration',review.request->>'generation',
        'agentInvocation',jsonb_build_object('replyId','background:'||run_id,'sourceMessageCursor',message_cursor,'acceptedAt',now())))
    on conflict do nothing returning * into run;
  update talent_external_operations set status='completed',result=jsonb_build_object('run_id',run.id),updated_at=now() where id=review.id;
  if run.id is null then return null; end if;
  return to_jsonb(run);
end $$;

create or replace function public.queue_career_event(p_user_id uuid,p_conversation_id uuid,p_source bigint,p_kind text,p_reference uuid,p_revision bigint default 0)
returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.talent_external_operations; target uuid; ref public.talent_external_operations;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform 1 from public.talent_messages where id=p_source and user_id=p_user_id and conversation_id=p_conversation_id and role='user'
   and coalesce(payload->>'careerTurnStopped','false')<>'true';
 if not found then return null; end if;
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then return null; end if;
 select * into ref from public.talent_external_operations where id=p_reference and user_id=p_user_id and conversation_id=p_conversation_id;
 if not found or p_kind not in ('delegated_result','dependency','browser_control','work_update','mail_event','gmail_connected') then raise exception 'Execution event unavailable'; end if;
 if (p_kind='delegated_result' and (ref.kind<>'career_invocation' or ref.parent_id is null))
   or (p_kind='dependency' and ref.kind<>'career_dependency')
   or (p_kind='work_update' and ref.kind<>'delegated_work')
   or (p_kind='mail_event' and ref.kind<>'mail_event')
   or (p_kind='browser_control' and ref.kind<>'browser_session')
   or (p_kind='gmail_connected' and ref.kind<>'browser_run') then raise exception 'Invalid execution event reference'; end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
 values(p_user_id,p_conversation_id,'career_event',p_kind||':'||p_reference||':'||p_revision,'ready',
   jsonb_build_object('source_message_id',p_source,'kind',p_kind,'reference',p_reference,'revision',p_revision))
 on conflict(user_id,kind,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into e;
 if e.status='completed' then return null; end if;
 if coalesce(ref.request->>'execution_environment','production')<>public.career_execution_environment() then raise exception 'Execution environment mismatch'; end if;
 select id into target from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
   and coalesce(request->>'execution_environment','production')=public.career_execution_environment()
   and kind='career_invocation' and parent_id is null and status<>'completed' and request ? 'input_message_ids'
   order by (request->>'source_message_id')::bigint,id limit 1 for update;
 if target is null then
   insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
   values(p_user_id,p_conversation_id,'career_invocation','inbox:'||gen_random_uuid(),'ready',
     jsonb_build_object('source_message_id',p_source,'input_message_ids','[]'::jsonb)) returning id into target;
 end if;
 update public.talent_external_operations set request=jsonb_set(request,'{event_ids}',
   case when coalesce(request->'event_ids','[]') @> jsonb_build_array(e.id) then request->'event_ids'
   else coalesce(request->'event_ids','[]')||jsonb_build_array(e.id) end), provider_refs=provider_refs-'dispatch_after',updated_at=now() where id=target;
 return target;
end $$;
revoke all on function public.confirm_career_gmail_connection_v1(uuid,text,uuid,boolean,text),public.career_start_gmail_review_v1(uuid) from public,anon,authenticated;
grant execute on function public.confirm_career_gmail_connection_v1(uuid,text,uuid,boolean,text),public.career_start_gmail_review_v1(uuid) to service_role;
