create or replace function public.admit_career_request(p_user_id uuid,p_conversation_id uuid,p_content text,p_message_type text,p_payload jsonb,p_is_mobile boolean default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.talent_messages; key text;
begin
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 key:=p_payload->>'clientRequestId';
 if key is null or key='' then raise exception 'Request identity required'; end if;
 select * into row from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and role='user' and message_type<>'career_turn_stop' and payload->>'clientRequestId'=key order by id limit 1;
 if found then return to_jsonb(row); end if;
 insert into public.talent_messages(user_id,conversation_id,role,content,message_type,payload,is_mobile)
 values(p_user_id,p_conversation_id,'user',p_content,p_message_type,coalesce(p_payload,'{}')||'{"careerDurable":true}',p_is_mobile) returning * into row;
 return to_jsonb(row);
end $$;

create or replace function public.admit_career_message() returns trigger language plpgsql security invoker set search_path='' as $$
declare ref jsonb; linked boolean:=false; work uuid;
begin
 if new.payload->>'careerTurnStopped'='true' or new.role<>'user' or new.conversation_id is null then return new; end if;
 if new.message_type='career_form_response' then
   for ref in select value from jsonb_array_elements(coalesce(new.payload#>'{formSnapshot,relatedRefs}','[]')) loop
     if ref->>'type'='work' then
       work:=(ref->>'id')::uuid;
       perform 1 from public.talent_external_operations where id=work and user_id=new.user_id and conversation_id=new.conversation_id and kind='delegated_work' and status not in ('completed','cancelled');
       if not found then continue; end if;
       perform public.queue_career_invocation(new.user_id,new.conversation_id,new.id,work);
       update public.talent_external_operations set status=case when status='waiting' then 'ready' else status end,
         request=request||jsonb_build_object('source_refs',coalesce(request->'source_refs','[]')||to_jsonb(new.id)),
         revision=revision+1,updated_at=now()
         where id=work and user_id=new.user_id and kind='delegated_work';
       linked:=true;
     end if;
   end loop;
   if not linked then perform public.queue_career_invocation(new.user_id,new.conversation_id,new.id); end if;
 elsif new.payload->>'careerDurable'='true' then
   perform public.queue_career_invocation(new.user_id,new.conversation_id,new.id);
 end if;
 return new;
end $$;

create or replace function public.queue_career_invocation(p_user uuid,p_conversation uuid,p_source bigint,p_work uuid default null,p_event text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item uuid; identity text;
begin
 perform 1 from public.talent_conversations where id=p_conversation and user_id=p_user for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_work is not null then
   perform 1 from public.talent_external_operations where id=p_work and user_id=p_user and conversation_id=p_conversation and kind='delegated_work';
   if not found then raise exception 'Work unavailable'; end if;
 end if;
 -- Late callbacks and duplicate deliveries cannot revive stopped input. Cleanup has no source.
 if p_source is not null and exists(select 1 from public.talent_messages where id=p_source and user_id=p_user
   and conversation_id=p_conversation and payload->>'careerTurnStopped'='true') then return null; end if;
 if p_work is null and p_event is null then
   perform 1 from public.talent_messages where id=p_source and user_id=p_user and conversation_id=p_conversation and role='user';
   if not found then raise exception 'User source unavailable'; end if;
   select id into item from public.talent_external_operations
     where user_id=p_user and conversation_id=p_conversation and kind='career_invocation'
       and parent_id is null and status<>'completed' and request ? 'input_message_ids'
     order by (request->>'source_message_id')::bigint,id limit 1 for update;
   if found then
     update public.talent_external_operations set
       request=jsonb_set(request,'{input_message_ids}',case when request->'input_message_ids' @> jsonb_build_array(p_source)
         then request->'input_message_ids' else request->'input_message_ids'||to_jsonb(p_source) end),
       provider_refs=provider_refs-'dispatch_after',updated_at=now()
       where id=item;
     return item;
   end if;
   insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
   values(p_user,p_conversation,'career_invocation','inbox:'||gen_random_uuid(),'ready',
     jsonb_build_object('source_message_id',p_source,'input_message_ids',jsonb_build_array(p_source))) returning id into item;
   return item;
 end if;
 -- Independently delegated work and cleanup retain their own execution identity.
 identity:=coalesce(p_event,'message:'||p_source::text)||':'||coalesce(p_work::text,'conversation');
 insert into public.talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,status,request)
 values(p_user,p_conversation,'career_invocation',p_work,identity,'ready',jsonb_build_object('source_message_id',p_source,'work_id',p_work))
 on conflict(user_id,kind,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into item;
 return item;
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
   values(p_user_id,p_conversation_id,'delegated_work',p_input->>'identity','ready',jsonb_build_object('instruction',p_input->>'instruction','target',p_input->>'target','source_refs',refs)) returning * into row;
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

-- Stop and admission serialize on the conversation. Request identities cover
-- uploads/HTTP requests still in flight; a later new identity remains admissible.
create function public.stop_career_conversation(p_user_id uuid,p_conversation_id uuid,p_client_request_ids jsonb default '[]',p_source_message_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sources jsonb; replies jsonb; receipt public.talent_messages; item record; cleanup uuid; stopped jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_source_message_id is not null and not exists(select 1 from public.talent_messages where id=p_source_message_id
   and user_id=p_user_id and conversation_id=p_conversation_id and role='user') then raise exception 'Chat turn unavailable'; end if;
 select coalesce(jsonb_agg(distinct id),'[]') into sources from (
   select (i.request->>'source_message_id')::bigint id from public.talent_external_operations i
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind='career_invocation' and i.status<>'completed'
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
 return jsonb_build_object('userMessages',stopped);
end $$;
revoke all on function public.stop_career_conversation(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.stop_career_conversation(uuid,uuid,jsonb,bigint) to service_role;


-- The same fence covers the inline/onboarding route and delayed inserts from
-- older clients. The source still exists, but cannot create a runnable inbox.
create function public.guard_stopped_career_input() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.role='user' and new.conversation_id is not null and new.payload->>'clientRequestId' is not null and new.message_type<>'career_turn_stop' then
   perform 1 from public.talent_conversations where id=new.conversation_id and user_id=new.user_id for update;
   if exists(select 1 from public.talent_messages where user_id=new.user_id and conversation_id=new.conversation_id and message_type='career_turn_stop'
     and (payload->>'clientRequestId'=new.payload->>'clientRequestId' or coalesce(payload->'clientRequestIds','[]') ? (new.payload->>'clientRequestId'))) then
     new.payload:=new.payload||'{"careerTurnStopped":true}';
   end if;
 end if;
 return new;
end $$;
create trigger career_input_stop_guard before insert on public.talent_messages for each row execute function public.guard_stopped_career_input();
revoke all on function public.guard_stopped_career_input() from public,anon,authenticated;
grant execute on function public.guard_stopped_career_input() to service_role;

-- Stop also fences external operation reservation.
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
   if parent.status not in ('idle','human') then raise exception 'Browser session is not ready for another run'; end if;
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,request)
 values(p_user_id,p_conversation_id,p_kind,p_parent_id,p_idempotency_key,coalesce(p_request,'{}')) returning * into item;
 if p_kind='browser_run' then
   update public.talent_external_operations set status='running',revision=revision+1,updated_at=now(),
     provider_refs=provider_refs||jsonb_build_object('current_execution_id',item.id) where id=parent.id;
 end if;
 return to_jsonb(item);
end $$;
