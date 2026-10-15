-- Session state lives in the existing message payload; no additional tables.
alter table public.talent_conversations add column if not exists simulation_session_message_id bigint references public.talent_messages(id) on delete set null;

create or replace function public.write_simulation_session(
 p_user_id uuid, p_conversation_id uuid, p_operation text,
 p_message_id bigint default null, p_revision integer default null,
 p_payload jsonb default null, p_key text default null
) returns public.talent_messages
language plpgsql security definer set search_path = '' as $$
declare c public.talent_conversations%rowtype; m public.talent_messages%rowtype; v_now timestamptz := clock_timestamp();
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_conversation_id::text,0));
 select * into c from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_operation in ('begin','save') and nullif(p_key,'') is null then raise exception 'Mutation key required'; end if;
 if p_operation='begin' then
  if c.simulation_session_message_id is not null then
   select * into m from public.talent_messages where id=c.simulation_session_message_id and user_id=p_user_id and conversation_id=p_conversation_id;
   if m.payload->>'startKey'=p_key then return m; end if;
   raise exception 'An active simulation already exists';
  end if;
  if c.career_coaching_activity_message_id is not null and exists(select 1 from public.talent_messages where id=c.career_coaching_activity_message_id and payload->>'status' in ('suggested','active')) then
   raise exception 'Finish the current coaching activity before switching';
  end if;
  if p_payload->>'status' is distinct from 'active' or p_payload->>'version' is distinct from '1' then raise exception 'Invalid session'; end if;
  insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
  values(p_user_id,p_conversation_id,'assistant','simulation_session','Simulate session',p_payload || jsonb_build_object('revision',1,'startKey',p_key,'mutationKeys','[]'::jsonb)) returning * into m;
  update public.talent_conversations set simulation_session_message_id=m.id where id=c.id;
  return m;
 end if;
 select * into m from public.talent_messages where id=coalesce(p_message_id,c.simulation_session_message_id) and conversation_id=c.id and user_id=p_user_id and message_type='simulation_session' for update;
 if not found then return null; end if;
 if p_operation='read' then return m; end if;
 if p_key is not null and coalesce(m.payload->'mutationKeys','[]'::jsonb) ? p_key then return m; end if;
 if c.simulation_session_message_id is distinct from m.id or m.payload->>'status'<>'active' then raise exception 'Session is no longer active'; end if;
 if p_operation='touch' then
  -- A dead request must not leave an immortal running session. Normal runs time out at 3 minutes.
  if m.payload->>'analysisStatus'='running' and (m.payload->>'analysisStartedAt')::timestamptz < v_now-interval '10 minutes' then
   m.payload := m.payload || jsonb_build_object('analysisStatus','failed','lastActivityAt',v_now,'revision',(m.payload->>'revision')::integer+1);
  elsif m.payload->>'analysisStatus'<>'running' and (m.payload->>'lastActivityAt')::timestamptz < v_now-interval '60 minutes' then
   m.payload := m.payload || jsonb_build_object('status','ended','endReason','expired','endedAt',v_now,'proposal',null,'revision',(m.payload->>'revision')::integer+1);
  else
   m.payload := m.payload || jsonb_build_object('lastActivityAt',v_now);
  end if;
  update public.talent_messages set payload=m.payload where id=m.id returning * into m;
 elsif p_operation='save' then
  if (m.payload->>'revision')::integer is distinct from p_revision then raise exception 'Session revision conflict'; end if;
  if p_payload->>'sessionId' is distinct from m.payload->>'sessionId' or p_payload->>'status' not in ('active','ended') then raise exception 'Invalid session update'; end if;
  update public.talent_messages set payload=p_payload || jsonb_build_object('revision',p_revision+1,'startKey',m.payload->>'startKey','mutationKeys',coalesce(m.payload->'mutationKeys','[]'::jsonb) || to_jsonb(p_key)) where id=m.id returning * into m;
 else raise exception 'Unknown session operation'; end if;
 if m.payload->>'status'='ended' then update public.talent_conversations set simulation_session_message_id=null where id=c.id and simulation_session_message_id=m.id; end if;
 return m;
end $$;
revoke all on function public.write_simulation_session(uuid,uuid,text,bigint,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.write_simulation_session(uuid,uuid,text,bigint,integer,jsonb,text) to service_role;

-- The same conversation lock is used by coaching's mutation RPC.
create or replace function public.guard_career_session_modes() returns trigger
language plpgsql set search_path = '' as $$
begin
 if new.simulation_session_message_id is not null and new.career_coaching_activity_message_id is not null then
  raise exception 'Only one focused conversation mode can be active';
 end if;
 return new;
end $$;
create trigger guard_career_session_modes before insert or update of simulation_session_message_id,career_coaching_activity_message_id on public.talent_conversations for each row execute function public.guard_career_session_modes();

-- One visible proposal per session revision, including response retries.
create unique index talent_simulation_proposal_revision_unique
 on public.talent_messages (conversation_id, (payload->>'sessionMessageId'), (payload->>'revision'))
 where message_type = 'simulation_action';
