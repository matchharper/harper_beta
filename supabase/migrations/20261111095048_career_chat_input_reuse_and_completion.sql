-- Source revisions validate server-owned snapshots; they never contain model judgments.
alter table public.talent_setting add column career_read_revision uuid not null default gen_random_uuid();
alter table public.talent_integrations add column career_read_revision uuid not null default gen_random_uuid();
alter table public.talent_conversations
  add column career_history_revision uuid not null default gen_random_uuid(),
  add column career_history_max_id bigint not null default 0;

create function public.revise_career_account_read() returns trigger
language plpgsql set search_path='' as $$
begin new.career_read_revision := gen_random_uuid(); return new; end $$;
revoke all on function public.revise_career_account_read() from public,anon,authenticated,service_role;
create trigger career_setting_read_revision before update on public.talent_setting
for each row execute function public.revise_career_account_read();
create trigger career_gmail_read_revision before update on public.talent_integrations
for each row execute function public.revise_career_account_read();

create function public.revise_career_history_read() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_conversation uuid; new_conversation uuid;
begin
  if TG_OP<>'INSERT' then old_conversation:=old.conversation_id; end if;
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
create trigger career_message_history_revision after insert or update or delete on public.talent_messages
for each row execute function public.revise_career_history_read();
create trigger career_summary_history_revision after insert or update or delete on public.talent_conversation_summaries
for each row execute function public.revise_career_history_read();

create function public.read_career_chat_inputs(
 p_user_id uuid,p_conversation_id uuid,p_cached jsonb default '{}',
 p_before bigint default null,p_history boolean default true
) returns jsonb language plpgsql stable set search_path='' as $$
declare c public.talent_conversations; s_revision text; g_revision text;
 result jsonb; summary jsonb; summary_id text; reset_history boolean; rows jsonb; after_id bigint;
begin
 select * into c from public.talent_conversations where id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 select career_read_revision::text into s_revision from public.talent_setting where user_id=p_user_id;
 select career_read_revision::text into g_revision from public.talent_integrations where talent_id=p_user_id and provider='gmail';
 s_revision:=coalesce(s_revision,'absent'); g_revision:=coalesce(g_revision,'absent');
 result:=jsonb_build_object('conversation',to_jsonb(c),'settingRevision',s_revision,'gmailRevision',g_revision);
 if p_cached->>'settingRevision' is distinct from s_revision then
   result:=result||jsonb_build_object('setting',(select to_jsonb(s)-'career_read_revision' from public.talent_setting s where user_id=p_user_id));
 end if;
 if p_cached->>'gmailRevision' is distinct from g_revision then
   result:=result||jsonb_build_object('gmail',(select to_jsonb(g)-'career_read_revision' from public.talent_integrations g where talent_id=p_user_id and provider='gmail' and status='active'));
 end if;
 if not p_history then return result; end if;
 -- A different inbox boundary can require an earlier summary. Its identity is
 -- part of the cache key even when no source row has changed.
 select jsonb_build_object('id',s.id,'to_message_id',s.to_message_id) into summary from public.talent_conversation_summaries s
 where talent_id=p_user_id and conversation_id=p_conversation_id and btrim(segment_summary)<>''
   and (p_before is null or to_message_id<p_before)
 order by to_message_id desc,created_at desc limit 1;
 summary_id:=coalesce(summary->>'id','absent');
 reset_history:=p_cached->>'historyRevision' is distinct from c.career_history_revision::text
   or p_cached->>'summaryId' is distinct from summary_id;
 if reset_history and summary_id<>'absent' then
   select to_jsonb(s) into summary from public.talent_conversation_summaries s where id=(summary_id)::uuid;
 end if;
 after_id:=case when reset_history then coalesce((summary->>'to_message_id')::bigint,0)
   else coalesce((p_cached->>'cursor')::bigint,0) end;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]') into rows from public.talent_messages m
 where user_id=p_user_id and conversation_id=p_conversation_id and id>after_id;
 return result||jsonb_build_object('historyRevision',c.career_history_revision,'summaryId',summary_id,
   'resetHistory',reset_history,'summary',case when reset_history then summary else null end,'messages',rows);
end $$;
revoke all on function public.read_career_chat_inputs(uuid,uuid,jsonb,bigint,boolean) from public,anon,authenticated;
grant execute on function public.read_career_chat_inputs(uuid,uuid,jsonb,bigint,boolean) to service_role;

create function public.read_career_inbox_context(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,p_cached jsonb default '{}')
returns jsonb language plpgsql set search_path='' as $$
declare inbox jsonb;
begin
 inbox:=public.read_career_inbox(p_user_id,p_conversation_id,p_invocation_id);
 return jsonb_build_object('inbox',inbox,'context',public.read_career_chat_inputs(p_user_id,p_conversation_id,p_cached,
   (inbox->>'historyBeforeMessageId')::bigint,true));
end $$;
revoke all on function public.read_career_inbox_context(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_career_inbox_context(uuid,uuid,uuid,jsonb) to service_role;

-- Complete both durable records, release ownership, update the conversation and
-- hand off concurrent input in one transaction. Existing queue/stop contracts stay intact.
create function public.finish_career_chat_execution(p_user_id uuid,p_conversation_id uuid,p_invocation_id uuid,
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
 next_id:=public.finish_career_invocation(p_user_id,p_conversation_id,p_invocation_id,false,p_observed_browser_returns);
 return jsonb_build_object('nextInvocationId',next_id);
end $$;
revoke all on function public.finish_career_chat_execution(uuid,uuid,uuid,text,jsonb,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.finish_career_chat_execution(uuid,uuid,uuid,text,jsonb,jsonb,boolean,jsonb) to service_role;
