-- Execution receipts and exact provider transcripts, never inferred model plans.
create table public.talent_agent_work_runtime (
 work_id uuid primary key references public.talent_external_operations(id) on delete cascade,
 user_id uuid not null references public.talent_users(user_id) on delete cascade,
 state jsonb not null default '{}'
);
alter table public.talent_agent_work_runtime enable row level security;
revoke all on public.talent_agent_work_runtime from public,anon,authenticated;
grant all on public.talent_agent_work_runtime to service_role;

create function public.queue_career_invocation(p_user uuid,p_conversation uuid,p_source bigint,p_work uuid default null,p_event text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item uuid; identity text;
begin
 perform 1 from public.talent_conversations where id=p_conversation and user_id=p_user;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_work is not null then
   perform 1 from public.talent_external_operations where id=p_work and user_id=p_user and conversation_id=p_conversation and kind='delegated_work';
   if not found then raise exception 'Work unavailable'; end if;
 end if;
 identity:=coalesce(p_event,'message:'||p_source::text)||':'||coalesce(p_work::text,'conversation');
 insert into public.talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,status,request)
 values(p_user,p_conversation,'career_invocation',p_work,identity,'ready',jsonb_build_object('source_message_id',p_source,'work_id',p_work))
 on conflict(user_id,kind,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into item;
 return item;
end $$;

-- Source and wakeup share the same commit, including form responses from old clients.
create function public.admit_career_message() returns trigger language plpgsql security invoker set search_path='' as $$
declare ref jsonb; linked boolean:=false; work uuid;
begin
 if new.role<>'user' or new.conversation_id is null then return new; end if;
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
create trigger career_message_admission after insert on public.talent_messages for each row execute function public.admit_career_message();

-- Stable request identity also covers a lost HTTP response; no content heuristic.
create function public.admit_career_request(p_user_id uuid,p_conversation_id uuid,p_content text,p_message_type text,p_payload jsonb,p_is_mobile boolean default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.talent_messages; key text;
begin
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 key:=p_payload->>'clientRequestId';
 if key is null or key='' then raise exception 'Request identity required'; end if;
 select * into row from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and role='user' and payload->>'clientRequestId'=key order by id limit 1;
 if found then return to_jsonb(row); end if;
 insert into public.talent_messages(user_id,conversation_id,role,content,message_type,payload,is_mobile)
 values(p_user_id,p_conversation_id,'user',p_content,p_message_type,coalesce(p_payload,'{}')||'{"careerDurable":true}',p_is_mobile) returning * into row;
 return to_jsonb(row);
end $$;

create function public.manage_career_work(p_user_id uuid,p_conversation_id uuid,p_action text,p_input jsonb)
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

-- A short publication lease; completion remains authoritative in the runtime.
create function public.claim_career_invocations(p_limit integer default 20,p_user uuid default null,p_conversation uuid default null)
returns setof public.talent_external_operations language plpgsql security invoker set search_path='' as $$
begin
 return query with candidates as (
   select o.id from public.talent_external_operations o
   where o.kind='career_invocation' and o.status<>'completed' and o.conversation_id is not null
     and (p_user is null or o.user_id=p_user) and (p_conversation is null or o.conversation_id=p_conversation)
     and coalesce((o.provider_refs->>'dispatch_after')::timestamptz,'-infinity')<=now()
   order by o.updated_at,o.id limit p_limit for update skip locked
 ) update public.talent_external_operations o set provider_refs=o.provider_refs||jsonb_build_object('dispatch_after',now()+interval '1 minute'),updated_at=now()
   from candidates c where o.id=c.id returning o.*;
end $$;

create function public.career_work_runtime(p_user_id uuid,p_conversation_id uuid,p_work_id uuid,p_reply_id text,p_claim_id text,p_action text,p_value jsonb default '{}')
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
   if found then
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

-- A source marker is transport metadata, not a synthetic user message.
create index career_invocation_recovery on public.talent_external_operations(updated_at) where kind='career_invocation' and status<>'completed';
revoke all on function public.queue_career_invocation(uuid,uuid,bigint,uuid,text),public.admit_career_message(),public.admit_career_request(uuid,uuid,text,text,jsonb,boolean),public.manage_career_work(uuid,uuid,text,jsonb),public.claim_career_invocations(integer,uuid,uuid),public.career_work_runtime(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_career_invocation(uuid,uuid,bigint,uuid,text),public.admit_career_message(),public.admit_career_request(uuid,uuid,text,text,jsonb,boolean),public.manage_career_work(uuid,uuid,text,jsonb),public.claim_career_invocations(integer,uuid,uuid),public.career_work_runtime(uuid,uuid,uuid,text,text,text,jsonb) to service_role;

-- Validate current revisions in the same lock as response persistence.
create or replace function public.write_career_form(
 p_user_id uuid,p_conversation_id uuid,p_action text,p_form_id bigint default null,p_revision integer default null,
 p_expected_revision integer default null,p_payload jsonb default null,p_content text default '',p_request_id text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_messages; root public.talent_messages; snapshot public.talent_messages; next_revision integer; kind text; body jsonb; linked jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 kind:=case when p_action in ('create','update') then 'career_form' when p_action='present' then 'career_form_presentation' when p_action='respond' then 'career_form_response' when p_action='resolve' then 'career_form_resolution' end;
 if p_request_id is not null and kind is not null then
   select * into item from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type=kind and payload->>'requestId'=p_request_id;
   if found then return to_jsonb(item); end if;
 end if;
 if p_action in ('create','update') then
   for linked in select value from jsonb_array_elements(coalesce(p_payload->'relatedRefs','[]')) loop
     if linked->>'type'='work' then
       perform 1 from public.talent_external_operations w where w.id::text=linked->>'id' and w.user_id=p_user_id and w.conversation_id=p_conversation_id and w.kind='delegated_work';
       if not found then raise exception 'Linked work unavailable'; end if;
     end if;
   end loop;
 end if;
 if p_action='create' then
   insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
   values(p_user_id,p_conversation_id,'assistant',kind,'',coalesce(p_payload,'{}')||jsonb_build_object('revision',1,'requestId',p_request_id)) returning * into item;
   update public.talent_messages set payload=payload||jsonb_build_object('formId',item.id) where id=item.id returning * into item;
   return to_jsonb(item);
 end if;
 select * into root from public.talent_messages where id=p_form_id and user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'revision'='1' for update;
 if not found then raise exception 'Form unavailable'; end if;
 if p_action='hide' then
   update public.talent_messages set payload=payload||'{"hidden":true}'::jsonb where user_id=p_user_id and conversation_id=p_conversation_id and message_type in ('career_form','career_form_presentation','career_form_response') and payload->>'formId'=p_form_id::text;
   select * into item from public.talent_messages where id=p_form_id;
   return to_jsonb(item);
 end if;
 if coalesce((root.payload->>'hidden')::boolean,false) then raise exception 'Form unavailable'; end if;
 if p_action in ('respond','resolve') then
   select max((payload->>'revision')::integer) into next_revision from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text;
   if p_revision is distinct from next_revision then raise exception 'Form revision conflict'; end if;
   if exists(select 1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form_resolution' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text) then raise exception 'Form already resolved'; end if;
 end if;
 if p_action='update' then
   select max((payload->>'revision')::integer)+1 into next_revision from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text;
   if p_expected_revision is distinct from next_revision-1 then raise exception 'Form revision conflict'; end if;
   body:=coalesce(p_payload,'{}')||jsonb_build_object('formId',p_form_id,'revision',next_revision,'requestId',p_request_id);
 elsif p_action in ('present','respond','resolve') then
   select * into snapshot from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text;
   if not found then raise exception 'Form revision unavailable'; end if;
   if p_action='respond' and exists(select 1 from jsonb_array_elements(coalesce(snapshot.payload->'relatedRefs','[]')) ref where ref->>'type'='work') and not exists(
     select 1 from jsonb_array_elements(coalesce(snapshot.payload->'relatedRefs','[]')) ref
     join public.talent_external_operations w on w.id::text=ref->>'id' and w.user_id=p_user_id
     where ref->>'type'='work' and w.kind='delegated_work' and w.status not in ('completed','cancelled')
   ) then raise exception 'Work is closed; this form no longer accepts a response'; end if;
   body:=case when p_action='present' then snapshot.payload else coalesce(p_payload,'{}')||jsonb_build_object('formSnapshot',snapshot.payload) end;
   if p_action='resolve' then body:=body||'{"hidden":true}'::jsonb; end if;
   body:=body||jsonb_build_object('formId',p_form_id,'revision',p_revision,'requestId',p_request_id);
 else raise exception 'Unknown form operation'; end if;
 insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
 values(p_user_id,p_conversation_id,case when p_action='respond' then 'user' else 'assistant' end,kind,coalesce(p_content,''),body) returning * into item;
 return to_jsonb(item);
end $$;

create function public.read_open_career_forms(p_user_id uuid,p_conversation_id uuid)
returns setof public.talent_messages language sql stable security invoker set search_path='' as $$
 with latest as (
   select distinct on (payload->>'formId') m.* from public.talent_messages m
   where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form'
   order by payload->>'formId',id desc
 ) select f.* from latest f
 where coalesce(f.payload->>'hidden','false')<>'true'
 and (not exists(select 1 from jsonb_array_elements(coalesce(f.payload->'relatedRefs','[]')) ref where ref->>'type'='work') or exists(select 1 from jsonb_array_elements(coalesce(f.payload->'relatedRefs','[]')) ref
   join public.talent_external_operations w on w.id::text=ref->>'id' and w.user_id=p_user_id
   where ref->>'type'='work' and w.kind='delegated_work' and w.status not in ('completed','cancelled')))
 and not exists(select 1 from public.talent_messages r where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   and r.message_type='career_form_resolution' and r.payload->>'formId'=f.payload->>'formId' and r.payload->>'revision'=f.payload->>'revision')
 and not exists(select 1 from public.talent_messages r where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   and r.message_type='career_form_response' and r.payload->>'formId'=f.payload->>'formId' and r.payload->>'revision'=f.payload->>'revision'
   and f.payload->>'kind'='form' and r.payload->>'itemId' is null)
 and (f.payload->>'kind'<>'suggestion' or exists(
   select 1 from jsonb_array_elements(f.payload->'items') item where not exists(
     select 1 from public.talent_messages r where r.user_id=p_user_id and r.conversation_id=p_conversation_id and r.message_type='career_form_response'
       and r.payload->>'formId'=f.payload->>'formId' and r.payload->>'revision'=f.payload->>'revision'
       and (r.payload->>'itemId'=item->>'id' or exists(select 1 from jsonb_array_elements(coalesce(r.payload->'answers','[]')) a where a->>'itemId'=item->>'id'))
   )
 )) order by f.id;
$$;
revoke all on function public.read_open_career_forms(uuid,uuid) from public,anon,authenticated;
grant execute on function public.read_open_career_forms(uuid,uuid) to service_role;

-- This lock serializes admission of a new instruction with effect dispatch.
create function public.pending_career_work_input(p_user_id uuid,p_conversation_id uuid,p_work_id uuid)
returns uuid language sql stable security invoker set search_path='' as $$
 select i.id from public.talent_external_operations i
 join public.talent_external_operations w on w.id=p_work_id and w.user_id=p_user_id and w.conversation_id=p_conversation_id and w.kind='delegated_work'
 where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind='career_invocation'
   and i.parent_id is null and i.status<>'completed'
   and (i.request->>'source_message_id')::bigint > (select max(value::text::bigint) from jsonb_array_elements(coalesce(w.request->'source_refs','[]')))
 order by i.created_at limit 1;
$$;
revoke all on function public.pending_career_work_input(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.pending_career_work_input(uuid,uuid,uuid) to service_role;

create function public.bind_career_work_effect(p_user_id uuid,p_conversation_id uuid,p_work_id uuid,p_effect_id uuid,p_effect_revision bigint,p_operation_id uuid,p_work_revision bigint,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.talent_external_operations; pending uuid;
begin
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into w from public.talent_external_operations where id=p_work_id and user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work' for update;
 if not found or w.status in ('cancelled','completed') or w.revision is distinct from p_work_revision then raise exception 'Work changed before external action'; end if;
 perform 1 from public.talent_agent_work_runtime where work_id=p_work_id and user_id=p_user_id
   and state#>>'{activeReply,claimId}'=p_claim_id and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
 if not found then raise exception 'Execution claim unavailable'; end if;
 pending:=public.pending_career_work_input(p_user_id,p_conversation_id,p_work_id);
 if pending is not null then return jsonb_build_object('waiting',pending); end if;
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id and request->>'work_id'=p_work_id::text;
 if not found then raise exception 'External operation unavailable'; end if;
 update public.talent_external_operations set status='dispatching',revision=revision+1,updated_at=now(),result=jsonb_build_object('operation_id',p_operation_id)
 where id=p_effect_id and parent_id=p_work_id and user_id=p_user_id and kind='work_effect' and revision=p_effect_revision and status='reserved';
 if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
 return '{"accepted":true}';
end $$;
revoke all on function public.bind_career_work_effect(uuid,uuid,uuid,uuid,bigint,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.bind_career_work_effect(uuid,uuid,uuid,uuid,bigint,uuid,bigint,text) to service_role;

-- Only a documented pre-dispatch rejection can reopen an effect reservation.
create function public.release_rejected_career_effect(p_user_id uuid,p_effect_id uuid,p_operation_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id
   and kind='browser_run' and status='capacity_wait' and result->>'dispatch_rejected_http'='429' for update;
 if not found then raise exception 'Provider rejection evidence unavailable'; end if;
 update public.talent_external_operations set status='reserved',result='{}',revision=revision+1,updated_at=now()
   where id=p_effect_id and user_id=p_user_id and kind='work_effect' and status='dispatching' and result->>'operation_id'=p_operation_id::text;
end $$;
revoke all on function public.release_rejected_career_effect(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_rejected_career_effect(uuid,uuid,uuid) to service_role;

-- Existing account deletion is a soft delete. Preserve its retention policy,
-- while fencing further effects and durably cleaning up every live browser.
create function public.stop_deleted_career_account() returns trigger
language plpgsql security invoker set search_path='' as $$
declare session record; cleanup uuid;
begin
 if old.deleted_at is null and new.deleted_at is not null then
   update public.talent_external_operations set status='cancelled',revision=revision+1,updated_at=now(),result=result||'{"note":"Account closed"}'
     where user_id=new.user_id and kind='delegated_work' and status not in ('completed','cancelled');
   update public.talent_external_operations set status='completed',updated_at=now()
     where user_id=new.user_id and kind='career_invocation';
   for session in select id,conversation_id from public.talent_external_operations
     where user_id=new.user_id and kind='browser_session' and status<>'closed' and conversation_id is not null loop
     cleanup:=public.queue_career_invocation(new.user_id,session.conversation_id,null,null,'account-browser-cleanup:'||session.id);
     update public.talent_external_operations set status='ready',request=request||jsonb_build_object('cleanup_browser_session',session.id),provider_refs='{}' where id=cleanup;
   end loop;
 end if;
 return new;
end $$;
create trigger career_account_work_cleanup after update of deleted_at on public.talent_users for each row execute function public.stop_deleted_career_account();
revoke all on function public.stop_deleted_career_account() from public,anon,authenticated;
grant execute on function public.stop_deleted_career_account() to service_role;

-- Removing a conversation row is a display action, not withdrawal of work.
-- Preserve source evidence while durable receipts still refer to it, just as
-- form history preserves its revision when hidden from the conversation.
create function public.hide_career_work_source(p_user_id uuid,p_conversation_id uuid,p_message_id bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform 1 from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
   and ((kind='delegated_work' and request->'source_refs' @> jsonb_build_array(p_message_id))
     or (kind='career_invocation' and request->>'source_message_id'=p_message_id::text));
 if not found then return false; end if;
 update public.talent_messages set payload=coalesce(payload,'{}')||'{"hidden":true}'
   where id=p_message_id and user_id=p_user_id and conversation_id=p_conversation_id;
 return found;
end $$;
revoke all on function public.hide_career_work_source(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.hide_career_work_source(uuid,uuid,bigint) to service_role;
