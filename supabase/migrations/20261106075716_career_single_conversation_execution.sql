-- A single conversation inbox consumes authenticated messages and execution events.
-- Reuse external_operations for durable event delivery; no model plans are stored.
create function public.queue_career_event(p_user_id uuid,p_conversation_id uuid,p_source bigint,p_kind text,p_reference uuid,p_revision bigint default 0)
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
 if not found or p_kind not in ('delegated_result','dependency','browser_control') then raise exception 'Execution event unavailable'; end if;
 if (p_kind='delegated_result' and (ref.kind<>'career_invocation' or ref.parent_id is null))
   or (p_kind='dependency' and ref.kind<>'career_dependency')
   or (p_kind='browser_control' and ref.kind<>'browser_session') then raise exception 'Invalid execution event reference'; end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
 values(p_user_id,p_conversation_id,'career_event',p_kind||':'||p_reference||':'||p_revision,'ready',
   jsonb_build_object('source_message_id',p_source,'kind',p_kind,'reference',p_reference,'revision',p_revision))
 on conflict(user_id,kind,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into e;
 if e.status='completed' then return null; end if;
 select id into target from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
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

create function public.observe_career_dependency(p_user_id uuid,p_conversation_id uuid,p_dependency_id uuid,p_ready boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare d public.talent_external_operations; target uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 select * into d from public.talent_external_operations where id=p_dependency_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_dependency' and status='reserved' for update;
 if not found then return null; end if;
 if p_ready then
   target:=public.queue_career_event(p_user_id,p_conversation_id,(d.request->>'source_message_id')::bigint,
     'dependency',d.id);
 end if;
 update public.talent_external_operations set updated_at=now(),status=case when p_ready then 'completed' else status end where id=d.id;
 return target;
end $$;
create or replace function public.read_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare i public.talent_external_operations; messages jsonb;
begin
 select * into i from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_invocation' and parent_id is null;
 if not found or not i.request ? 'input_message_ids' then raise exception 'Conversation inbox unavailable'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') into messages
 from public.talent_messages m where m.user_id=p_user_id and m.conversation_id=p_conversation_id and m.role='user'
   and i.request->'input_message_ids' @> jsonb_build_array(m.id)
   and not coalesce(i.provider_refs->'input_message_ids','[]') @> jsonb_build_array(m.id);
 return jsonb_build_object('messages',messages,'deliveredIds',coalesce(i.provider_refs->'input_message_ids','[]'),
   'inputIds',i.request->'input_message_ids','completed',i.status='completed',
   'historyBeforeMessageId',coalesce((select min(value::text::bigint) from jsonb_array_elements(i.request->'input_message_ids')),
     (select coalesce(max(id),0)+1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id)),
   'deliveredEventIds',coalesce(i.provider_refs->'event_ids','[]'),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.talent_external_operations e
     where e.user_id=p_user_id and e.conversation_id=p_conversation_id and e.kind='career_event'
       and coalesce(i.request->'event_ids','[]') @> jsonb_build_array(e.id)
       and not coalesce(i.provider_refs->'event_ids','[]') @> jsonb_build_array(e.id)),'[]'));
end $$;

create or replace function public.checkpoint_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text,p_checkpoint jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ids jsonb; incoming jsonb:=coalesce(p_checkpoint->'inputMessageIds','[]'); saved boolean; events jsonb; incoming_events jsonb:=coalesce(p_checkpoint->'inputEventIds','[]');
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select request->'input_message_ids' into ids from public.talent_external_operations
   where id=p_invocation_id and user_id=p_user_id and conversation_id=p_conversation_id
     and kind='career_invocation' and parent_id is null and status<>'completed' for update;
 if not found or ids is null then return false; end if;
 if not ids @> incoming or p_checkpoint->>'replyId' is distinct from 'invocation:'||p_invocation_id then
   raise exception 'Input delivery does not belong to this execution';
 end if;
 if not incoming @> coalesce((select provider_refs->'input_message_ids' from public.talent_external_operations where id=p_invocation_id),'[]') then
   raise exception 'Input delivery cannot move backwards';
 end if;
 select coalesce(request->'event_ids','[]') into events from public.talent_external_operations where id=p_invocation_id;
 if not events @> incoming_events or not incoming_events @> coalesce((select provider_refs->'event_ids' from public.talent_external_operations where id=p_invocation_id),'[]') then
   raise exception 'Event delivery does not belong to this execution or moved backwards';
 end if;
 saved:=public.checkpoint_career_agent_turn(p_user_id,p_conversation_id,'invocation:'||p_invocation_id,p_claim_id,p_checkpoint);
 if not saved then return false; end if;
 update public.talent_external_operations set provider_refs=provider_refs||jsonb_build_object('input_message_ids',incoming,'event_ids',incoming_events)
   where id=p_invocation_id;
 update public.talent_external_operations set status='completed' where user_id=p_user_id and conversation_id=p_conversation_id
   and kind='career_event' and incoming_events @> jsonb_build_array(id);
 return true;
end $$;

create or replace function public.finish_career_invocation(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_cancelled boolean default false,p_observed_browser_returns jsonb default '[]')
returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations; event jsonb; next_id uuid; event_id uuid; e public.talent_external_operations;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into item from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_invocation' for update;
 if not found or item.status='completed' then return null; end if;
 if item.parent_id is null and item.request ? 'input_message_ids' then
   next_id:=public.finish_career_inbox(p_user_id,p_conversation_id,p_invocation_id,p_cancelled);
 else
   update public.talent_external_operations set status='completed',updated_at=now() where id=item.id;
 end if;
 if not p_cancelled then
   for e in select * from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
     and kind='career_event' and status<>'completed' and coalesce(item.request->'event_ids','[]') @> jsonb_build_array(id)
   loop
     event_id:=public.queue_career_event(p_user_id,p_conversation_id,(e.request->>'source_message_id')::bigint,
       e.request->>'kind',(e.request->>'reference')::uuid,coalesce((e.request->>'revision')::bigint,0));
     next_id:=coalesce(next_id,event_id);
   end loop;
   if item.parent_id is not null and not coalesce((item.request->>'cleanup')::boolean,false) and not item.request ? 'cleanup_browser_session' then
     event_id:=public.queue_career_event(p_user_id,p_conversation_id,(item.request->>'source_message_id')::bigint,
       'delegated_result',item.id);
     next_id:=coalesce(next_id,event_id);
   end if;
   for event in select value from jsonb_array_elements(coalesce(item.request->'browser_control_returns','[]')) loop
     if coalesce(p_observed_browser_returns,item.result#>'{activity,browserControlReturns}','[]') @> jsonb_build_array(event) then continue; end if;
     if item.parent_id is null then
       event_id:=public.queue_career_event(p_user_id,p_conversation_id,(item.request->>'source_message_id')::bigint,
         'browser_control',(event->>'session_id')::uuid,(event->>'revision')::bigint);
       next_id:=coalesce(next_id,event_id);
       continue;
     end if;
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

create function public.save_career_delegated_output(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text,p_output jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 select * into item from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id and conversation_id=p_conversation_id
   and kind='career_invocation' and parent_id is not null and status<>'completed' for update;
 if not found then raise exception 'Delegated execution unavailable'; end if;
 perform 1 from public.talent_agent_work_runtime where work_id=item.parent_id and user_id=p_user_id
   and state#>>'{activeReply,claimId}'=p_claim_id and state#>>'{activeReply,replyId}'='invocation:'||item.id
   and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
 if not found then raise exception 'Execution claim unavailable'; end if;
 if p_output#>>'{agentTurn,replyId}' is distinct from 'invocation:'||item.id then raise exception 'Output belongs to another execution'; end if;
 update public.talent_external_operations set result=result||jsonb_build_object('output',p_output) where id=item.id;
 return true;
end $$;
create or replace function public.career_work_runtime(p_user_id uuid,p_conversation_id uuid,p_work_id uuid,p_reply_id text,p_claim_id text,p_action text,p_value jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s jsonb; sequence bigint; delivered jsonb;
begin
 perform 1 from public.talent_external_operations where id=p_work_id and user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work';
 if not found then raise exception 'Work unavailable'; end if;
 insert into public.talent_agent_work_runtime(work_id,user_id) values(p_work_id,p_user_id) on conflict do nothing;
 select state into s from public.talent_agent_work_runtime where work_id=p_work_id and user_id=p_user_id for update;
 if p_action='claim' then
   if coalesce(s->'completedReplyIds','{}') ? p_reply_id then return jsonb_build_object('accepted',false,'completed',true,'state',s); end if;
   select payload->'agentTurn' into delivered from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and role='assistant' and payload#>>'{agentTurn,replyId}'=p_reply_id order by id desc limit 1;
   if not found then
     select result#>'{output,agentTurn}' into delivered from public.talent_external_operations
       where user_id=p_user_id and conversation_id=p_conversation_id and parent_id=p_work_id
         and kind='career_invocation' and 'invocation:'||id=p_reply_id and result#>'{output,agentTurn}' is not null;
   end if;
   if delivered is not null then
     sequence:=coalesce((s->>'completedSequence')::bigint,0)+1;
     s:=s||jsonb_build_object('completedSequence',sequence,'previous',delivered->'record',
       'activeReply',case when s#>>'{activeReply,replyId}'=p_reply_id then null else s->'activeReply' end,
       'handbooks',public.consume_career_agent_handbooks(s->'handbooks',delivered->'record',delivered->'handbooks'),
       'completedReplyIds',coalesce(s->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,sequence),'checkpoints',coalesce(s->'checkpoints','{}')-p_reply_id);
     update public.talent_agent_work_runtime set state=s where work_id=p_work_id;
     return jsonb_build_object('accepted',false,'completed',true,'state',s);
   end if;
   if (s#>>'{activeReply,expiresAt}')::timestamptz>now() then return jsonb_build_object('accepted',false,'completed',false,'state',s); end if;
   s:=s||jsonb_build_object('version',1,'activeReply',jsonb_build_object('replyId',p_reply_id,'claimId',p_claim_id,'expiresAt',now()+interval '8 minutes'));
   update public.talent_agent_work_runtime set state=s where work_id=p_work_id;
   return jsonb_build_object('accepted',true,'state',s||jsonb_build_object('checkpoint',s#>array['checkpoints',p_reply_id]));
 end if;
 if s#>>'{activeReply,replyId}' is distinct from p_reply_id or s#>>'{activeReply,claimId}' is distinct from p_claim_id then return 'false'; end if;
 if p_action='checkpoint' then
   s:=jsonb_set(s||jsonb_build_object('checkpoints',coalesce(s->'checkpoints','{}')||jsonb_build_object(p_reply_id,p_value->'p_checkpoint')),'{activeReply,expiresAt}',to_jsonb(now()+interval '8 minutes'));
 elsif p_action='finish' then
   sequence:=coalesce((s->>'completedSequence')::bigint,0)+1;
   s:=s||jsonb_build_object('completedSequence',sequence,'completedReplyIds',coalesce(s->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,sequence),
     'handbooks',public.consume_career_agent_handbooks(s->'handbooks',p_value->'p_record',p_value->'p_handbooks'),'previous',p_value->'p_record','checkpoints',coalesce(s->'checkpoints','{}')-p_reply_id,'activeReply',null);
 elsif p_action='release' then s:=s||'{"activeReply":null}';
 else raise exception 'Unknown runtime action'; end if;
 update public.talent_agent_work_runtime set state=s where work_id=p_work_id;
 return 'true';
end $$;


revoke all on function public.queue_career_event(uuid,uuid,bigint,text,uuid,bigint),public.observe_career_dependency(uuid,uuid,uuid,boolean),public.save_career_delegated_output(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_career_event(uuid,uuid,bigint,text,uuid,bigint),public.observe_career_dependency(uuid,uuid,uuid,boolean),public.save_career_delegated_output(uuid,uuid,uuid,text,jsonb) to service_role;

create or replace function public.return_career_browser_control(p_user_id uuid,p_conversation_id uuid,p_session_id uuid,p_revision bigint)
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
 if owning_work is null then
   target:=public.queue_career_event(p_user_id,p_conversation_id,source,'browser_control',session.id,p_revision);
 elsif target is null then
   target:=public.queue_career_invocation(p_user_id,p_conversation_id,source,owning_work,'browser-return:'||session.id||':'||p_revision);
 end if;
 if target is null then raise exception 'Original browser request was stopped'; end if;
 if owning_work is not null then
 update public.talent_external_operations set request=request||jsonb_build_object('browser_control_returns',coalesce(request->'browser_control_returns','[]')||jsonb_build_array(event)),
   provider_refs=provider_refs-'dispatch_after',updated_at=now() where id=target;
 end if;
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


create or replace function public.claim_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare claim jsonb; other public.talent_external_operations; ids jsonb; first_id uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select request->'input_message_ids' into ids from public.talent_external_operations
 where id=p_invocation_id and user_id=p_user_id and conversation_id=p_conversation_id
   and kind='career_invocation' and parent_id is null and status<>'completed' for update;
 if not found then return '{"accepted":false,"completed":true}'; end if;
 if ids is null then raise exception 'Conversation inbox unavailable'; end if;
 -- Queue delivery order is not user message order. Start the oldest inbox so
 -- its history cannot already contain inputs about to be merged into it.
 select id into first_id from public.talent_external_operations
 where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation'
   and parent_id is null and status<>'completed' and request ? 'input_message_ids'
 order by (request->>'source_message_id')::bigint,id limit 1;
 if first_id<>p_invocation_id then return '{"accepted":false,"completed":false}'; end if;
 claim:=public.claim_career_agent_turn(p_user_id,p_conversation_id,'invocation:'||p_invocation_id,p_claim_id);
 if claim->>'accepted'<>'true' then return claim; end if;
 -- Drain old per-message queue deliveries that have never started. A saved
 -- legacy transcript remains independently resumable; never discard effects.
 for other in select * from public.talent_external_operations i
   where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.id<>p_invocation_id
     and i.kind='career_invocation' and i.parent_id is null and i.status<>'completed'
     and i.request ? 'input_message_ids'
     and not coalesce(claim#>'{state,checkpoints}','{}') ? ('invocation:'||i.id)
     and not exists(select 1 from public.talent_messages m where m.user_id=p_user_id
       and m.conversation_id=p_conversation_id and m.payload#>>'{agentTurn,replyId}'='invocation:'||i.id)
   for update
 loop
   select coalesce(jsonb_agg(v order by v::text::bigint),'[]') into ids
     from (select distinct value v from jsonb_array_elements(ids||(other.request->'input_message_ids'))) q;
   update public.talent_external_operations set request=jsonb_set(request,'{event_ids}',coalesce(request->'event_ids','[]')||coalesce(other.request->'event_ids','[]')) where id=p_invocation_id;
   update public.talent_external_operations set status='completed',result=jsonb_build_object('merged_into',p_invocation_id),updated_at=now() where id=other.id;
 end loop;
 update public.talent_external_operations set request=jsonb_set(request,'{input_message_ids}',ids) where id=p_invocation_id;
 return claim;
end $$;


-- The same dispatch/receipt fence applies when the conversation owns an effect.
create function public.bind_career_conversation_effect(p_user_id uuid,p_conversation_id uuid,p_effect_id uuid,p_effect_revision bigint,p_operation_id uuid,p_reply_id text,p_source_message_id bigint,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare pending uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_messages where id=p_source_message_id and user_id=p_user_id and conversation_id=p_conversation_id
   and role='user' and coalesce(payload->>'careerTurnStopped','false')<>'true';
 if not found then raise exception 'Original request unavailable or stopped'; end if;
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
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and request->>'work_id' is null;
 if not found then raise exception 'External operation unavailable'; end if;
 update public.talent_external_operations set status='dispatching',revision=revision+1,updated_at=now(),result=jsonb_build_object('operation_id',p_operation_id)
 where id=p_effect_id and parent_id is null and user_id=p_user_id and conversation_id=p_conversation_id
   and kind='work_effect' and revision=p_effect_revision and status='reserved';
 if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
 return '{"accepted":true}';
end $$;
revoke all on function public.bind_career_conversation_effect(uuid,uuid,uuid,bigint,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.bind_career_conversation_effect(uuid,uuid,uuid,bigint,uuid,text,bigint,text) to service_role;

create or replace function public.stop_career_conversation(p_user_id uuid,p_conversation_id uuid,p_client_request_ids jsonb default '[]',p_source_message_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sources jsonb; replies jsonb; receipt public.talent_messages; item record; cleanup uuid; stopped jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_source_message_id is not null and not exists(select 1 from public.talent_messages where id=p_source_message_id
   and user_id=p_user_id and conversation_id=p_conversation_id and role='user') then raise exception 'Chat turn unavailable'; end if;
 select coalesce(jsonb_agg(distinct id),'[]') into sources from (
   select (i.request->>'source_message_id')::bigint id from public.talent_external_operations i
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind in ('career_invocation','career_dependency','career_event') and i.status not in ('completed','cancelled')
   union select coalesce((r.request->>'source_message_id')::bigint,(i.request->>'source_message_id')::bigint)
     from public.talent_external_operations i left join public.talent_external_operations r
       on r.id=(i.provider_refs->>'current_execution_id')::uuid and r.parent_id=i.id
       and r.user_id=i.user_id and r.conversation_id=i.conversation_id and r.kind='browser_run'
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind='browser_session' and i.status='human'
   union select value::text::bigint from public.talent_external_operations i,
     jsonb_array_elements(coalesce(i.request->'input_message_ids',i.request->'source_refs','[]'))
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind in ('career_invocation','delegated_work') and i.status not in ('completed','cancelled')
   union select m.id from public.talent_messages m where m.user_id=p_user_id and m.conversation_id=p_conversation_id
     and m.role='user' and m.message_type<>'career_turn_stop' and p_client_request_ids ? (m.payload->>'clientRequestId')
   union select (c.value#>>'{continuation,sourceMessageId}')::bigint from public.talent_agent_runtime r,jsonb_each(coalesce(r.state->'checkpoints','{}')) c
     where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select substring(r.state#>>'{activeReply,replyId}' from '^message:([0-9]+)$')::bigint from public.talent_agent_runtime r
     where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select p_source_message_id
 ) s where id is not null;
 select coalesce(jsonb_agg(distinct reply),'[]') into replies from (
   select 'invocation:'||id reply from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation' and status<>'completed'
   union select 'message:'||value::text from jsonb_array_elements(sources)
   union select c.key from public.talent_agent_runtime r,jsonb_each(coalesce(r.state->'checkpoints','{}')) c where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select r.state#>>'{activeReply,replyId}' from public.talent_agent_runtime r where r.user_id=p_user_id and r.conversation_id=p_conversation_id
 ) r where reply is not null;
 insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
 values(p_user_id,p_conversation_id,'user','career_turn_stop','',jsonb_build_object('hidden',true,'clientRequestIds',p_client_request_ids,'sourceMessageIds',sources)) returning * into receipt;
 update public.talent_messages set payload=coalesce(payload,'{}')||'{"careerTurnStopped":true}'
   where user_id=p_user_id and conversation_id=p_conversation_id and role='user' and sources @> jsonb_build_array(id);
 -- Resolve visible questions before closing their owning work. Old approvals
 -- then fail the existing resolved-form/revision checks instead of restarting it.
 for item in select * from public.read_open_career_forms(p_user_id,p_conversation_id) loop
   perform public.write_career_form(p_user_id,p_conversation_id,'resolve',(item.payload->>'formId')::bigint,
     (item.payload->>'revision')::integer,null,'{"reason":"User stopped the conversation work"}','', 'stop:'||receipt.id||':'||item.id);
 end loop;
 update public.talent_external_operations set status='cancelled',revision=revision+1,updated_at=now(),result=result||'{"note":"User stopped the conversation work"}'
   where user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work' and status not in ('completed','cancelled');
 update public.talent_external_operations set status='completed',updated_at=now(),result=result||'{"cancelled":true}'
   where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation' and status<>'completed'
     and coalesce(request->>'cleanup','false')<>'true' and not request ? 'cleanup_browser_session';
 -- Release leases immediately, retaining guide state and completed effects.
 update public.talent_agent_runtime set state=(state-'checkpoint')||jsonb_build_object('activeReply',null,'checkpoints','{}'::jsonb,
   'completedReplyIds',coalesce(state->'completedReplyIds','{}')||coalesce((select jsonb_object_agg(value,coalesce((state->>'completedSequence')::bigint,0)) from jsonb_array_elements_text(replies)),'{}'))
   where user_id=p_user_id and conversation_id=p_conversation_id;
 update public.talent_agent_work_runtime r set state=(r.state-'checkpoint')||'{"activeReply":null,"checkpoints":{}}'
   where r.user_id=p_user_id and exists(select 1 from public.talent_external_operations w where w.id=r.work_id and w.conversation_id=p_conversation_id and w.status='cancelled');
 -- Persist remote cleanup with the Stop, so a disconnected tab cannot lose it.
 if jsonb_array_length(replies)>0 then
   cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,null,null,'stop-cleanup:'||receipt.id);
   update public.talent_external_operations set request=request||jsonb_build_object('cleanup',true,'cancel_reply_ids',replies) where id=cleanup;
 end if;
 for item in select id from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id and kind='browser_session' and status<>'closed' loop
   cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,null,null,'stop-browser-cleanup:'||receipt.id||':'||item.id);
   update public.talent_external_operations set request=request||jsonb_build_object('cleanup_browser_session',item.id) where id=cleanup;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') into stopped from public.talent_messages m
   where user_id=p_user_id and conversation_id=p_conversation_id and sources @> jsonb_build_array(id);
 update public.talent_external_operations set status='cancelled',updated_at=now() where user_id=p_user_id and conversation_id=p_conversation_id
   and kind in ('career_dependency','career_event') and status not in ('completed','cancelled');
 return jsonb_build_object('userMessages',stopped);
end $$;

create or replace function public.manage_career_work(p_user_id uuid,p_conversation_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.talent_external_operations; source bigint; refs jsonb; work uuid; cleanup uuid;
begin
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 refs:=coalesce(p_input->'source_refs','[]');
 for source in select value::text::bigint from jsonb_array_elements(refs) loop
   perform 1 from public.talent_messages where id=source and user_id=p_user_id and conversation_id=p_conversation_id and role='user';
   if not found then raise exception 'User source unavailable'; end if;
   if p_action in ('start','update') and exists(select 1 from public.talent_messages where id=source and payload->>'careerTurnStopped'='true') then
     raise exception 'User stopped this request';
   end if;
 end loop;
 if p_action='start' then
   if coalesce(p_input->>'identity','')='' or coalesce(p_input->>'instruction','')='' or jsonb_array_length(refs)=0 then raise exception 'Work identity, purpose and user source required'; end if;
   select * into row from public.talent_external_operations where user_id=p_user_id and kind='delegated_work' and idempotency_key=p_input->>'identity';
   if found then return to_jsonb(row); end if;
   insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
   values(p_user_id,p_conversation_id,'delegated_work',p_input->>'identity','ready',jsonb_build_object('instruction',p_input->>'instruction','target',p_input->>'target','source_refs',refs,'origin_reply_id',p_input->>'origin_reply_id')) returning * into row;
 else
   work:=(p_input->>'work_id')::uuid;
   select * into row from public.talent_external_operations where id=work and user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work' for update;
   if not found then raise exception 'Work unavailable'; end if;
   if row.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Work revision conflict; read current work'; end if;
   if p_action not in ('update','wait','finish','cancel') then raise exception 'Unknown work action'; end if;
   if p_action in ('update','cancel') and jsonb_array_length(refs)=0 then raise exception 'User source required'; end if;
   if p_action in ('wait','finish') and p_input->>'caller_work_id' is distinct from row.id::text then raise exception 'Only the executing work may report its outcome'; end if;
   if row.status in ('completed','cancelled') then raise exception 'Work is closed; read its outcome before a new request'; end if;
   update public.talent_external_operations set
     status=case p_action when 'update' then 'ready' when 'wait' then 'waiting' when 'finish' then 'completed' else 'cancelled' end,
     request=case when p_action='update' then request||jsonb_build_object('change',p_input->>'instruction','source_refs',coalesce(request->'source_refs','[]')||refs) else request end,
     result=result||jsonb_build_object('note',p_input->>'note','refs',coalesce(p_input->'refs','[]')),
     revision=revision+1,updated_at=now()
     where id=row.id returning * into row;
 end if;
 if p_action in ('start','update') then
   perform public.queue_career_invocation(p_user_id,p_conversation_id,source,row.id,'work:'||row.id||':'||row.revision);
 elsif p_action in ('wait','finish','cancel') then
   cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,source,row.id,'cleanup:'||row.id||':'||row.revision);
   update public.talent_external_operations set request=request||'{"cleanup":true}' where id=cleanup;
 end if;
 return to_jsonb(row);
end $$;


create function public.record_career_invocation_progress(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text,p_patch jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations; runtime jsonb;
begin
 select * into item from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_invocation' and status<>'completed' for update;
 if not found then return false; end if;
 if item.parent_id is null then
   select state into runtime from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id;
 else
   select state into runtime from public.talent_agent_work_runtime where work_id=item.parent_id and user_id=p_user_id;
 end if;
 if runtime#>>'{activeReply,replyId}' is distinct from 'invocation:'||item.id
   or runtime#>>'{activeReply,claimId}' is distinct from p_claim_id then return false; end if;
 update public.talent_external_operations set result=(result-'last_error'-'failed_at')||p_patch where id=item.id;
 return true;
end $$;
revoke all on function public.record_career_invocation_progress(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_career_invocation_progress(uuid,uuid,uuid,text,jsonb) to service_role;
