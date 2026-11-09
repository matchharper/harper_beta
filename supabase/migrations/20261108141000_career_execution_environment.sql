-- Keep local, preview and production executors from consuming each other's work.
-- The service client supplies this header; model arguments never choose it.
create function public.career_execution_environment() returns text
language sql stable security invoker set search_path='' as $$
 select coalesce(nullif(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-harper-career-runtime',''),'production');
$$;
create function public.stamp_career_execution_environment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare environment text;
begin
 if tg_table_name='talent_messages' then
   if new.role='user' then new.payload:=coalesce(new.payload,'{}')||jsonb_build_object('careerExecutionEnvironment',public.career_execution_environment()); end if;
 else
   if new.request->>'source_message_id' is not null then
     select coalesce(payload->>'careerExecutionEnvironment','production') into environment from public.talent_messages
       where id=(new.request->>'source_message_id')::bigint and user_id=new.user_id;
   end if;
   if environment is null and new.parent_id is not null then
     select coalesce(request->>'execution_environment','production') into environment from public.talent_external_operations
       where id=new.parent_id and user_id=new.user_id;
   end if;
   new.request:=coalesce(new.request,'{}')||jsonb_build_object('execution_environment',coalesce(environment,public.career_execution_environment()));
 end if;
 return new;
end $$;
create trigger career_message_environment before insert on public.talent_messages
 for each row execute function public.stamp_career_execution_environment();
create trigger career_operation_environment before insert on public.talent_external_operations
 for each row execute function public.stamp_career_execution_environment();
-- Legacy rows already read as production via COALESCE in every execution reader.
-- Do not rewrite their receipts while live executors may hold row locks.

create or replace function public.queue_career_invocation(p_user uuid,p_conversation uuid,p_source bigint,p_work uuid default null,p_event text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item uuid; identity text;
begin
 perform 1 from public.talent_conversations where id=p_conversation and user_id=p_user for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_work is not null then
   perform 1 from public.talent_external_operations where id=p_work and user_id=p_user and conversation_id=p_conversation and kind='delegated_work'
     and coalesce(request->>'execution_environment','production')=public.career_execution_environment();
   if not found then raise exception 'Work unavailable'; end if;
 end if;
 if p_source is not null then
   perform 1 from public.talent_messages where id=p_source and user_id=p_user and conversation_id=p_conversation
     and coalesce(payload->>'careerExecutionEnvironment','production')=public.career_execution_environment();
   if not found then raise exception 'Input execution environment mismatch'; end if;
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
       and coalesce(request->>'execution_environment','production')=public.career_execution_environment()
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

create or replace function public.claim_career_invocations(p_limit integer default 20,p_user uuid default null,p_conversation uuid default null)
returns setof public.talent_external_operations language plpgsql security invoker set search_path='' as $$
begin
 return query with candidates as (
   select o.id from public.talent_external_operations o
   where coalesce(o.request->>'execution_environment','production')=public.career_execution_environment() and o.kind='career_invocation' and o.status<>'completed' and o.conversation_id is not null
     and (p_user is null or o.user_id=p_user) and (p_conversation is null or o.conversation_id=p_conversation)
     and coalesce((o.provider_refs->>'dispatch_after')::timestamptz,'-infinity')<=now()
   order by o.updated_at,o.id limit p_limit for update skip locked
 ) update public.talent_external_operations o set provider_refs=o.provider_refs||jsonb_build_object('dispatch_after',now()+interval '1 minute'),updated_at=now()
   from candidates c where o.id=c.id returning o.*;
end $$;

create or replace function public.claim_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare claim jsonb; other public.talent_external_operations; ids jsonb; first_id uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select request->'input_message_ids' into ids from public.talent_external_operations
 where id=p_invocation_id and user_id=p_user_id and conversation_id=p_conversation_id
   and coalesce(request->>'execution_environment','production')=public.career_execution_environment()
   and kind='career_invocation' and parent_id is null and status<>'completed' for update;
 if not found then return '{"accepted":false,"completed":true}'; end if;
 if ids is null then raise exception 'Conversation inbox unavailable'; end if;
 -- Queue delivery order is not user message order. Start the oldest inbox so
 -- its history cannot already contain inputs about to be merged into it.
 select id into first_id from public.talent_external_operations
 where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation'
   and coalesce(request->>'execution_environment','production')=public.career_execution_environment()
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
     and coalesce(i.request->>'execution_environment','production')=public.career_execution_environment()
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
 if not found or p_kind not in ('delegated_result','dependency','browser_control') then raise exception 'Execution event unavailable'; end if;
 if (p_kind='delegated_result' and (ref.kind<>'career_invocation' or ref.parent_id is null))
   or (p_kind='dependency' and ref.kind<>'career_dependency')
   or (p_kind='browser_control' and ref.kind<>'browser_session') then raise exception 'Invalid execution event reference'; end if;
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

create or replace function public.claim_career_agent_checkpoint_recovery(p_limit integer default 20)
returns table ("userId" uuid,"conversationId" uuid,checkpoint jsonb)
language plpgsql security invoker set search_path='' as $$
declare runtime_row record; item record; next_state jsonb; claimed integer:=0;
begin
 for runtime_row in select r.* from public.talent_agent_runtime r
  where coalesce((r.state#>>'{activeReply,expiresAt}')::timestamptz,'-infinity'::timestamptz)<=now()
   and exists(select 1 from jsonb_each(coalesce(r.state->'checkpoints','{}')) c
    where coalesce(c.value->>'executionEnvironment','production')=public.career_execution_environment()
    and coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
     and public.career_checkpoint_work_ready(r.user_id,c.value)
     and (c.value#>>'{continuation,channel}' in ('career','background') or c.value#>>'{continuation,emailReplyJobId}' is not null)
     and not (coalesce(r.state->'completedReplyIds','{}') ? c.key))
  order by r.conversation_id limit p_limit for update skip locked
 loop
  next_state:=runtime_row.state;
  for item in select c.key,c.value from jsonb_each(coalesce(next_state->'checkpoints','{}')) c
   where coalesce(c.value->>'executionEnvironment','production')=public.career_execution_environment()
    and coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
    and public.career_checkpoint_work_ready(runtime_row.user_id,c.value)
    and not (coalesce(next_state->'completedReplyIds','{}') ? c.key)
    and (c.value#>>'{continuation,channel}' in ('career','background') or c.value#>>'{continuation,emailReplyJobId}' is not null)
   order by c.key limit p_limit-claimed
  loop
   next_state:=jsonb_set(next_state,array['checkpoints',item.key,'recoveryAfter'],to_jsonb(now()+interval '2 minutes'));
   "userId":=runtime_row.user_id; "conversationId":=runtime_row.conversation_id; checkpoint:=item.value;
   claimed:=claimed+1; return next;
  end loop;
  update public.talent_agent_runtime set state=next_state where conversation_id=runtime_row.conversation_id;
  exit when claimed>=p_limit;
 end loop;
end $$;

revoke all on function public.career_execution_environment(),public.stamp_career_execution_environment() from public,anon,authenticated;
grant execute on function public.career_execution_environment(),public.stamp_career_execution_environment() to service_role;

-- Message inserts may also use the authenticated client; this helper only reads its transport context.
grant execute on function public.career_execution_environment() to authenticated;

-- The existing direct-Postgres Worker also inserts talent_messages. Its trigger
-- needs this read-only helper; no queue or form-write privileges are added.
do $$ begin
 if exists(select 1 from pg_roles where rolname='harper_worker') then
  grant execute on function public.career_execution_environment() to harper_worker;
 end if;
end $$;
