-- One conversation execution owns an inbox of immutable message references.
-- Input delivery and the exact provider transcript commit together. Neither
-- receiving an input nor saving its transcript means delegated work succeeded.
update public.talent_external_operations i
set request=i.request||jsonb_build_object('input_message_ids',jsonb_build_array((i.request->>'source_message_id')::bigint)),
    provider_refs=i.provider_refs||jsonb_build_object('input_message_ids',case
      when exists(select 1 from public.talent_agent_runtime r where r.conversation_id=i.conversation_id
        and r.state#>array['checkpoints','invocation:'||i.id] is not null)
      then jsonb_build_array((i.request->>'source_message_id')::bigint) else '[]'::jsonb end)
where i.kind='career_invocation' and i.parent_id is null and i.status<>'completed'
  and i.request->>'source_message_id' is not null
  and not i.request ? 'cleanup_browser_session' and not i.request ? 'input_message_ids';

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

create function public.claim_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text)
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
   update public.talent_external_operations set status='completed',result=jsonb_build_object('merged_into',p_invocation_id),updated_at=now() where id=other.id;
 end loop;
 update public.talent_external_operations set request=jsonb_set(request,'{input_message_ids}',ids) where id=p_invocation_id;
 return claim;
end $$;

create function public.read_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid)
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
   'inputIds',i.request->'input_message_ids','completed',i.status='completed');
end $$;

create function public.checkpoint_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_claim_id text,p_checkpoint jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare ids jsonb; incoming jsonb:=coalesce(p_checkpoint->'inputMessageIds','[]'); saved boolean;
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
 saved:=public.checkpoint_career_agent_turn(p_user_id,p_conversation_id,'invocation:'||p_invocation_id,p_claim_id,p_checkpoint);
 if not saved then return false; end if;
 update public.talent_external_operations set provider_refs=provider_refs||jsonb_build_object('input_message_ids',incoming)
   where id=p_invocation_id;
 return true;
end $$;

create function public.finish_career_inbox(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_cancelled boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare i public.talent_external_operations; pending bigint; next_id uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into i from public.talent_external_operations where id=p_invocation_id and user_id=p_user_id
   and conversation_id=p_conversation_id and kind='career_invocation' and parent_id is null for update;
 if not found or i.status='completed' then return null; end if;
 if not p_cancelled and not exists(select 1 from public.talent_agent_runtime r where r.user_id=p_user_id
   and r.conversation_id=p_conversation_id and coalesce(r.state->'completedReplyIds','{}') ? ('invocation:'||p_invocation_id)) then
   raise exception 'Conversation execution has not completed';
 end if;
 update public.talent_external_operations set status='completed',result='{}',updated_at=now() where id=p_invocation_id;
 -- Admission takes the same conversation lock: inputs racing with completion
 -- are either handed off here or admitted into a fresh inbox afterwards.
 for pending in select m.id from public.talent_messages m
   where m.user_id=p_user_id and m.conversation_id=p_conversation_id and m.role='user'
     and i.request->'input_message_ids' @> jsonb_build_array(m.id)
     and not coalesce(i.provider_refs->'input_message_ids','[]') @> jsonb_build_array(m.id)
     and coalesce(m.payload->>'careerTurnStopped','false')<>'true'
   order by m.id
 loop
   next_id:=public.queue_career_invocation(p_user_id,p_conversation_id,pending);
 end loop;
 return next_id;
end $$;

create or replace function public.pending_career_work_input(p_user_id uuid,p_conversation_id uuid,p_work_id uuid)
returns uuid language sql stable security invoker set search_path='' as $$
 select i.id from public.talent_external_operations i
 join public.talent_external_operations w on w.id=p_work_id and w.user_id=p_user_id and w.conversation_id=p_conversation_id and w.kind='delegated_work'
 where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind='career_invocation'
   and i.parent_id is null and i.status<>'completed'
   and exists(select 1 from jsonb_array_elements(coalesce(i.request->'input_message_ids',jsonb_build_array(i.request->'source_message_id'))) v
     where v::text::bigint > (select max(value::text::bigint) from jsonb_array_elements(coalesce(w.request->'source_refs','[]'))))
 order by i.created_at limit 1;
$$;

create or replace function public.hide_career_work_source(p_user_id uuid,p_conversation_id uuid,p_message_id bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform 1 from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id
   and ((kind='delegated_work' and request->'source_refs' @> jsonb_build_array(p_message_id))
     or (kind='career_invocation' and (request->>'source_message_id'=p_message_id::text or request->'input_message_ids' @> jsonb_build_array(p_message_id))));
 if not found then return false; end if;
 update public.talent_messages set payload=coalesce(payload,'{}')||'{"hidden":true}'
   where id=p_message_id and user_id=p_user_id and conversation_id=p_conversation_id;
 return found;
end $$;

revoke all on function public.claim_career_inbox(uuid,uuid,uuid,text),public.read_career_inbox(uuid,uuid,uuid),public.checkpoint_career_inbox(uuid,uuid,uuid,text,jsonb),public.finish_career_inbox(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_career_inbox(uuid,uuid,uuid,text),public.read_career_inbox(uuid,uuid,uuid),public.checkpoint_career_inbox(uuid,uuid,uuid,text,jsonb),public.finish_career_inbox(uuid,uuid,uuid,boolean) to service_role;
