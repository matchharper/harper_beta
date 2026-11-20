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
 if not found or p_kind not in ('delegated_result','dependency','browser_control','work_update','mail_event') then raise exception 'Execution event unavailable'; end if;
 if (p_kind='delegated_result' and (ref.kind<>'career_invocation' or ref.parent_id is null))
   or (p_kind='dependency' and ref.kind<>'career_dependency')
   or (p_kind='work_update' and ref.kind<>'delegated_work')
   or (p_kind='mail_event' and ref.kind<>'mail_event')
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
create or replace function public.manage_career_work(p_user_id uuid,p_conversation_id uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.talent_external_operations; source bigint; refs jsonb; work uuid; cleanup uuid; origin uuid; current_mode boolean; runtime jsonb; origin_source bigint; ref jsonb;
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
 for ref in select value from jsonb_array_elements(coalesce(p_input->'resource_refs','[]')||coalesce(p_input->'context_refs','[]')) loop
  if not public.career_resource_available_v1(p_user_id,ref) then raise exception 'Work resource unavailable'; end if;
 end loop;
 if p_action='start' then
   if coalesce(p_input->>'mode','independent') not in ('current','independent') then raise exception 'Unknown work execution mode'; end if;
   current_mode:=p_input->>'mode'='current';
   if current_mode then
    select state into runtime from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id for update;
    if runtime#>>'{activeReply,claimId}' is distinct from p_input->>'claim_id' or runtime#>>'{activeReply,replyId}' is distinct from p_input->>'origin_reply_id'
      or not coalesce((runtime#>>'{activeReply,expiresAt}')::timestamptz>now(),false) then raise exception 'Origin execution claim unavailable'; end if;
   end if;
   if coalesce(p_input->>'identity','')='' or coalesce(p_input->>'instruction','')='' or jsonb_array_length(refs)=0 then raise exception 'Work identity, purpose and user source required'; end if;
   select * into row from public.talent_external_operations where user_id=p_user_id and kind='delegated_work' and idempotency_key=p_input->>'identity';
   if found then return to_jsonb(row); end if;
   insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
   values(p_user_id,p_conversation_id,'delegated_work',p_input->>'identity',case when current_mode then 'running' else 'ready' end,jsonb_build_object('instruction',p_input->>'instruction','target',p_input->>'target','source_refs',refs,'origin_reply_id',p_input->>'origin_reply_id','execution_route',case when current_mode then 'origin' else 'independent' end,'resource_refs',coalesce(p_input->'resource_refs','[]'),'context_refs',coalesce(p_input->'context_refs','[]'))) returning * into row;
 else
   work:=(p_input->>'work_id')::uuid;
   select * into row from public.talent_external_operations where id=work and user_id=p_user_id and kind='delegated_work' for update;
   if not found then raise exception 'Work unavailable'; end if;
   if row.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Work revision conflict; read current work'; end if;
   if p_action not in ('update','wait','finish','cancel') then raise exception 'Unknown work action'; end if;
   if p_action in ('update','cancel') and jsonb_array_length(refs)=0 then raise exception 'User source required'; end if;
   current_mode:=row.request->>'execution_route'='origin';
   if p_action in ('wait','finish') then
    if current_mode then
     select state into runtime from public.talent_agent_runtime where conversation_id=row.conversation_id and user_id=p_user_id for update;
     if p_conversation_id<>row.conversation_id or runtime#>>'{activeReply,claimId}' is distinct from p_input->>'claim_id'
       or runtime#>>'{activeReply,replyId}' is distinct from p_input->>'origin_reply_id'
       or not coalesce((runtime#>>'{activeReply,expiresAt}')::timestamptz>now(),false) then raise exception 'Origin execution claim unavailable'; end if;
    elsif p_input->>'caller_work_id' is distinct from row.id::text or p_conversation_id<>row.conversation_id then
     raise exception 'Only the executing work may report its outcome';
    end if;
   end if;
   if row.status in ('completed','cancelled') then raise exception 'Work is closed; read its outcome before a new request'; end if;
   update public.talent_external_operations set
     status=case p_action when 'update' then 'ready' when 'wait' then 'waiting' when 'finish' then 'completed' else 'cancelled' end,
     request=(case when p_action='update' then request||jsonb_build_object('change',p_input->>'instruction','source_refs',coalesce(request->'source_refs','[]')||refs,
       'change_conversation_id',p_conversation_id) else request end)
       ||case when p_input ? 'waiting_on' then jsonb_build_object('waiting_on',p_input->'waiting_on') else '{}'::jsonb end
       ||case when p_input ? 'context_refs' then jsonb_build_object('context_refs',p_input->'context_refs') else '{}'::jsonb end
       ||case when p_input ? 'resource_refs' then jsonb_build_object('resource_refs',p_input->'resource_refs') else '{}'::jsonb end,
     result=result||jsonb_build_object('note',p_input->>'note','refs',coalesce(p_input->'refs','[]')),
     revision=revision+1,updated_at=now()
     where id=row.id returning * into row;
 end if;
 origin:=row.conversation_id;
 origin_source:=(row.request->'source_refs'->>0)::bigint;
 if current_mode then
  -- Current execution already owns start. Later changes return to that origin's
  -- inbox; they never silently turn into an independent delegate.
  if p_action in ('update','cancel') then
   perform public.queue_career_event(p_user_id,origin,origin_source,'work_update',row.id,row.revision);
  end if;
 elsif p_action in ('start','update') then
   perform public.queue_career_invocation(p_user_id,origin,origin_source,row.id,'work:'||row.id||':'||row.revision);
 elsif p_action in ('wait','finish','cancel') then
   cleanup:=public.queue_career_invocation(p_user_id,origin,origin_source,row.id,'cleanup:'||row.id||':'||row.revision);
   update public.talent_external_operations set request=request||'{"cleanup":true}' where id=cleanup;
 end if;
 return to_jsonb(row);
end $$;

-- Completion and recovery of the origin happen in one transaction. Waiting and
-- closed work have no new invocation; only unfinished current execution does.
create function public.career_recover_origin_work_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare w talent_external_operations;
begin
 if new.kind='career_invocation' and new.parent_id is null and new.status='completed' and old.status<>'completed' then
  for w in select * from talent_external_operations where user_id=new.user_id and conversation_id=new.conversation_id
    and kind='delegated_work' and request->>'execution_route'='origin' and status in ('running','ready')
    and coalesce(request->>'execution_environment','production')=public.career_execution_environment() for update loop
   update talent_external_operations set revision=revision+1,updated_at=now() where id=w.id returning * into w;
   perform queue_career_event(w.user_id,w.conversation_id,(w.request->'source_refs'->>0)::bigint,'work_update',w.id,w.revision);
  end loop;
 end if;
 return new;
end $$;
create trigger career_recover_origin_work after update of status on public.talent_external_operations for each row execute function public.career_recover_origin_work_v1();
revoke all on function public.career_recover_origin_work_v1() from public,anon,authenticated;

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
    where id=p_effect_id and parent_id is null and user_id=p_user_id and (conversation_id=p_conversation_id or request->>'opportunity_id' is not null)
    and kind='work_effect' and revision=p_effect_revision and status='reserved';
  if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
  return '{"accepted":true}';
end $$;


create function public.career_resource_version_current_v1(p_user uuid,p_ref jsonb) returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare revision text;
begin
 if not career_resource_available_v1(p_user,p_ref) then return false; end if;
 if p_ref->>'revision' is null then return true; end if;
 case p_ref->>'kind'
 when 'document' then select d.revision::text into revision from talent_documents d where id::text=p_ref->>'id' and talent_id=p_user and not is_deleted;
 when 'memory' then select c.revision::text into revision from talent_contexts c where id::text=p_ref->>'id' and talent_id=p_user and deleted_at is null;
 when 'profile' then select p.current_revision::text into revision from talent_profiles p where id::text=p_ref->>'id' and talent_id=p_user;
 when 'company' then select c.public_facts_revision::text into revision from company_db c where id::text=p_ref->>'id';
 when 'web_resource' then select d.current_observation_id::text into revision from documents d where id::text=p_ref->>'id' and source_scope='public';
 else return true;
 end case;
 return revision is not distinct from p_ref->>'revision';
end $$;

create function public.career_find_opportunity_effect_v1(p_user uuid,p_opportunity uuid,p_key text) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive aliases as (
  select id from career_opportunities where id=p_opportunity and talent_id=p_user and merged_into_id is null and deleted_at is null
  union select o.id from career_opportunities o join aliases a on o.merged_into_id=a.id where o.talent_id=p_user
 ) select e.id from talent_external_operations e where e.user_id=p_user and e.kind='work_effect' and e.request->>'effect_key'=p_key
  and e.request->>'opportunity_id' in (select id::text from aliases) order by e.created_at,e.id limit 1
$$;
create function public.bind_career_origin_effect_v1(p_user_id uuid,p_conversation_id uuid,p_work_id uuid,p_work_revision bigint,p_effect_id uuid,p_effect_revision bigint,p_operation_id uuid,p_reply_id text,p_source_message_id bigint,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare pending uuid; w public.talent_external_operations; ref jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into w from public.talent_external_operations where id=p_work_id and user_id=p_user_id and conversation_id=p_conversation_id
  and kind='delegated_work' and request->>'execution_route'='origin' for update;
 if not found or w.status in ('completed','cancelled') or w.revision<>p_work_revision then raise exception 'Responsibility changed before external action'; end if;
 for ref in select value from jsonb_array_elements(coalesce(w.request->'context_refs','[]')) loop
  if not public.career_resource_version_current_v1(p_user_id,ref) then raise exception 'Work material changed; read current sources before dispatch'; end if;
 end loop;
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
   and conversation_id=p_conversation_id and request->>'responsibility_id'=p_work_id::text;
 if not found then raise exception 'External operation unavailable'; end if;
 update public.talent_external_operations set status='dispatching',revision=revision+1,updated_at=now(),result=jsonb_build_object('operation_id',p_operation_id)
 where id=p_effect_id and parent_id=p_work_id and user_id=p_user_id
   and kind='work_effect' and revision=p_effect_revision and status='reserved';
 if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
 return '{"accepted":true}';
end $$;
revoke all on function public.career_resource_version_current_v1(uuid,jsonb),public.career_find_opportunity_effect_v1(uuid,uuid,text),
 public.bind_career_origin_effect_v1(uuid,uuid,uuid,bigint,uuid,bigint,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.career_resource_version_current_v1(uuid,jsonb),public.career_find_opportunity_effect_v1(uuid,uuid,text),
 public.bind_career_origin_effect_v1(uuid,uuid,uuid,bigint,uuid,bigint,uuid,text,bigint,text) to service_role;

create or replace function public.bind_career_work_effect(p_user_id uuid,p_conversation_id uuid,p_work_id uuid,p_effect_id uuid,p_effect_revision bigint,p_operation_id uuid,p_work_revision bigint,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.talent_external_operations; pending uuid; ref jsonb;
begin
 if exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is not null) then raise exception 'Account is closed'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into w from public.talent_external_operations where id=p_work_id and user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work' for update;
 if not found or w.status in ('cancelled','completed') or w.revision is distinct from p_work_revision then raise exception 'Work changed before external action'; end if;
 perform 1 from public.talent_agent_work_runtime where work_id=p_work_id and user_id=p_user_id
   and state#>>'{activeReply,claimId}'=p_claim_id and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
 if not found then raise exception 'Execution claim unavailable'; end if;
 for ref in select value from jsonb_array_elements(coalesce(w.request->'context_refs','[]')) loop
  if not public.career_resource_version_current_v1(p_user_id,ref) then raise exception 'Work material changed; read current sources before dispatch'; end if;
 end loop;
 pending:=public.pending_career_work_input(p_user_id,p_conversation_id,p_work_id);
 if pending is not null then return jsonb_build_object('waiting',pending); end if;
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id and request->>'work_id'=p_work_id::text;
 if not found then raise exception 'External operation unavailable'; end if;
 update public.talent_external_operations set status='dispatching',revision=revision+1,updated_at=now(),result=jsonb_build_object('operation_id',p_operation_id)
 where id=p_effect_id and parent_id=p_work_id and user_id=p_user_id and kind='work_effect' and revision=p_effect_revision and status='reserved';
 if not found then raise exception 'Effect already dispatched; read its receipt'; end if;
 return '{"accepted":true}';
end $$;
