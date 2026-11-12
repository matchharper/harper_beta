create or replace function public.revise_career_history_read() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_conversation uuid; new_conversation uuid;
begin
  -- This user-row trace is consumed by runtime/ops readers, not the model's
  -- history formatter. Changes to text, Stop, references or any other payload
  -- field still invalidate the snapshot.
  if TG_TABLE_NAME='talent_messages' and TG_OP='UPDATE' then
   if old.role='user' and new.role='user'
    and (to_jsonb(old)-'payload')=(to_jsonb(new)-'payload')
    and (coalesce(old.payload,'{}')-'careerCapabilityTurn')=(coalesce(new.payload,'{}')-'careerCapabilityTurn') then
    return null;
   end if;
  end if;
  if TG_OP<>'INSERT'  then old_conversation:=old.conversation_id; end if;
  if TG_OP<>'DELETE' then new_conversation:=new.conversation_id; end if;
  if TG_TABLE_NAME='talent_messages' and TG_OP='INSERT' then
    -- Serializing the watermark also catches a lower-ID transaction committing
    -- after a higher-ID insert. Such an insert requires a full refresh.
    update public.talent_conversations set
      career_history_revision=case when new.id<=career_history_max_id then gen_random_uuid() else career_history_revision end,
      career_history_max_id=greatest(career_history_max_id,new.id)
      where id=new_conversation and user_id=new.user_id;
  else
    update public.talent_conversations set career_history_revision=gen_random_uuid()
      where id in (old_conversation,new_conversation);
  end if;
  return null;
end $$;
revoke all on function public.revise_career_history_read() from public,anon,authenticated,service_role;

create or replace function public.finish_career_chat_execution(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,
 p_claim_id text,p_record jsonb,p_handbooks jsonb,p_update_conversation boolean default false,p_observed_browser_returns jsonb default '[]')
returns jsonb language plpgsql set search_path='' as $$
declare next_id uuid;
begin
 -- Match admission's lock order, before touching runtime state.
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if not public.finish_career_agent_turn(p_user_id,p_conversation_id,'invocation:'||p_invocation_id,p_claim_id,p_record,p_handbooks) then
   raise exception 'Career reply claim lost before completion';
 end if;
 if p_update_conversation then
   update public.talent_conversations set stage='chat',updated_at=now() where id=p_conversation_id;
 end if;
 -- Preserve unrelated payload fields atomically. This replaces the later
 -- client-side SELECT + compare-and-swap UPDATE of the same completion trace.
 update public.talent_messages m set payload=coalesce(m.payload,'{}')||jsonb_build_object('careerCapabilityTurn',p_record)
 from public.talent_external_operations i
 where i.id=p_invocation_id and i.user_id=p_user_id and i.conversation_id=p_conversation_id
   and m.id=(i.request->>'source_message_id')::bigint and m.user_id=p_user_id
   and m.conversation_id=p_conversation_id and m.role='user'
   and (m.payload#>>'{careerCapabilityTurn,status}' is distinct from 'completed'
     or m.payload#>>'{careerCapabilityTurn,replyId}' is distinct from ('invocation:'||p_invocation_id));
 next_id:=public.finish_career_invocation(p_user_id,p_conversation_id,p_invocation_id,false,p_observed_browser_returns);
 return jsonb_build_object('nextInvocationId',next_id);
end $$;
revoke all on function public.finish_career_chat_execution(uuid,uuid,uuid,text,jsonb,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.finish_career_chat_execution(uuid,uuid,uuid,text,jsonb,jsonb,boolean,jsonb) to service_role;
