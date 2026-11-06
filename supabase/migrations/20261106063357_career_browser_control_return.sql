-- Human control is an execution lock, including provider-expired pages.
create or replace function public.create_talent_external_operation(
 p_user_id uuid,p_conversation_id uuid,p_kind text,p_parent_id uuid,p_idempotency_key text,p_request jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations; parent public.talent_external_operations;
begin
 -- Use the same lock order as Stop. A browser reserved after Stop would
 -- otherwise escape its durable cleanup snapshot.
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if exists(select 1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id
   and id=(p_request->>'source_message_id')::bigint and payload->>'careerTurnStopped'='true')
   or exists(select 1 from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
     and id=(p_request->>'work_id')::uuid and kind='delegated_work' and status='cancelled') then
   raise exception 'User stopped this request';
 end if;
 -- Same idempotency key must never dispatch a second external effect.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_kind||':'||p_idempotency_key,0));
 select * into item from public.talent_external_operations where user_id=p_user_id and kind=p_kind and idempotency_key=p_idempotency_key;
 if found then return to_jsonb(item); end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_parent_id is not null then
   select * into parent from public.talent_external_operations where id=p_parent_id and user_id=p_user_id for update;
   if not found then raise exception 'Parent operation unavailable'; end if;
 end if;
 if p_kind='browser_run' then
   if p_parent_id is null or parent.kind <> 'browser_session' then raise exception 'Browser session required'; end if;
   -- The provider only accepts one run controlling a session at a time.
   if parent.status <> 'idle' then raise exception 'Browser session is not ready for another run'; end if;
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,request)
 values(p_user_id,p_conversation_id,p_kind,p_parent_id,p_idempotency_key,coalesce(p_request,'{}')) returning * into item;
 if p_kind='browser_run' then
   update public.talent_external_operations set status='running',revision=revision+1,updated_at=now(),
     provider_refs=provider_refs||jsonb_build_object('current_execution_id',item.id) where id=parent.id;
 end if;
 return to_jsonb(item);
end $$;

-- Commit control return and its durable wakeup together. No user chat is inserted.
create function public.return_career_browser_control(p_user_id uuid,p_conversation_id uuid,p_session_id uuid,p_revision bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare session public.talent_external_operations; run public.talent_external_operations;
  invocation public.talent_external_operations; work public.talent_external_operations;
  source bigint; owning_work uuid; reply text; target uuid; event jsonb; runtime jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into session from public.talent_external_operations where id=p_session_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='browser_session' for update;
 if not found then raise exception 'Browser session unavailable'; end if;
 if session.status<>'human' and session.provider_refs#>>'{control_return,revision}'=p_revision::text then
   return to_jsonb(session);
 end if;
 if session.status<>'human' or session.revision<>p_revision then raise exception 'Browser control changed; refresh before returning control'; end if;
 select * into run from public.talent_external_operations where id=(session.provider_refs->>'current_execution_id')::uuid
   and parent_id=session.id and user_id=p_user_id and kind='browser_run';
 if found and run.status not in ('completed','cancelled','failed') then raise exception 'Automatic browser execution has not stopped'; end if;
 source:=coalesce((run.request->>'source_message_id')::bigint,(session.request->>'source_message_id')::bigint);
 owning_work:=coalesce((run.request->>'work_id')::uuid,(session.request->>'work_id')::uuid);
 if owning_work is not null then
   select * into work from public.talent_external_operations where id=owning_work and user_id=p_user_id
     and conversation_id=p_conversation_id and kind='delegated_work' for update;
   if not found or work.status in ('cancelled','completed') then raise exception 'Work is closed'; end if;
   source:=coalesce(source,(work.request->'source_refs'->>0)::bigint);
 end if;
 perform 1 from public.talent_messages where id=source and user_id=p_user_id and conversation_id=p_conversation_id
   and role='user' and coalesce(payload->>'careerTurnStopped','false')<>'true';
 if not found then raise exception 'Original browser request unavailable or stopped'; end if;
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 reply:=run.request->>'reply_id';
 -- Also recover sessions made before reply_id was retained on browser runs.
 if reply is null then
   select payload->>'artifactReplyId' into reply from public.talent_messages where user_id=p_user_id
     and conversation_id=p_conversation_id and message_type='browser_session' and payload->>'session_id'=session.id::text
     order by id desc limit 1;
 end if;
 if reply like 'invocation:%' then
   select * into invocation from public.talent_external_operations where id=substring(reply from 12)::uuid
     and user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation'
     and parent_id is not distinct from owning_work and status<>'completed' for update;
   if found then
     if owning_work is null then
       select state into runtime from public.talent_agent_runtime where user_id=p_user_id and conversation_id=p_conversation_id;
     else
       select state into runtime from public.talent_agent_work_runtime where user_id=p_user_id and work_id=owning_work;
     end if;
     if not coalesce(runtime->'completedReplyIds','{}') ? reply then target:=invocation.id; end if;
   end if;
 end if;
 event:=jsonb_build_object('session_id',session.id,'revision',p_revision);
 if target is null then
   target:=public.queue_career_invocation(p_user_id,p_conversation_id,source,owning_work,'browser-return:'||session.id||':'||p_revision);
 end if;
 if target is null then raise exception 'Original browser request was stopped'; end if;
 update public.talent_external_operations set request=request||jsonb_build_object('browser_control_returns',coalesce(request->'browser_control_returns','[]')||jsonb_build_array(event)),
   provider_refs=provider_refs-'dispatch_after',updated_at=now() where id=target;
 if owning_work is not null then
   update public.talent_external_operations set status=case when status='waiting' then 'ready' else status end,updated_at=now()
     where id=owning_work;
 end if;
 update public.talent_external_operations set status='idle',revision=revision+1,updated_at=now(),
   provider_refs=provider_refs||jsonb_build_object('control_return',event||jsonb_build_object('invocation_id',target)),
   result=result||jsonb_build_object('requested_action','resume','control_source','user',
     'summary','The user returned browser control. The current page and external outcome have not yet been checked.')
   where id=session.id returning * into session;
 return to_jsonb(session);
end $$;

-- A Done click racing the final model call must not disappear when that call
-- completes. Under the same admission lock, route unobserved events to a successor.
create function public.finish_career_invocation(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_cancelled boolean default false,p_observed_browser_returns jsonb default '[]')
returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations; event jsonb; next_id uuid; event_id uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into item from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_invocation' for update;
 if not found or item.status='completed' then return null; end if;
 if item.parent_id is null and item.request ? 'input_message_ids' then
   next_id:=public.finish_career_inbox(p_user_id,p_conversation_id,p_invocation_id,p_cancelled);
 else
   update public.talent_external_operations set status='completed',result='{}',updated_at=now() where id=item.id;
 end if;
 if not p_cancelled then
   for event in select value from jsonb_array_elements(coalesce(item.request->'browser_control_returns','[]')) loop
     if coalesce(p_observed_browser_returns,item.result#>'{activity,browserControlReturns}','[]') @> jsonb_build_array(event) then continue; end if;
     event_id:=public.queue_career_invocation(p_user_id,p_conversation_id,(item.request->>'source_message_id')::bigint,
       item.parent_id,'browser-return:'||(event->>'session_id')||':'||(event->>'revision'));
     if event_id is not null and event_id<>item.id then
       update public.talent_external_operations set request=request||jsonb_build_object('browser_control_returns',jsonb_build_array(event)) where id=event_id;
       next_id:=coalesce(next_id,event_id);
     end if;
   end loop;
 end if;
 return next_id;
end $$;
revoke all on function public.return_career_browser_control(uuid,uuid,uuid,bigint),public.finish_career_invocation(uuid,uuid,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.return_career_browser_control(uuid,uuid,uuid,bigint),public.finish_career_invocation(uuid,uuid,uuid,boolean,jsonb) to service_role;
