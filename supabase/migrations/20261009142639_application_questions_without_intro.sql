-- Questions are rendered only in the composer. No introduction message is inserted.
create or replace function public.write_application_activity(
  p_user_id uuid, p_conversation_id uuid, p_operation text,
  p_message_id bigint default null, p_revision integer default null,
  p_payload jsonb default null, p_key text default null,
  p_offer_id bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  a public.talent_simulate_application;
  c public.talent_conversations;
  offer public.talent_messages;
  anchor bigint;
  next_payload jsonb;
  next_revision integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));
  select * into c from public.talent_conversations
    where id = p_conversation_id and user_id = p_user_id for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  if p_operation = 'begin' then
    if p_offer_id is null then raise exception 'Start card required'; end if;
    select * into a from public.talent_simulate_application
      where start_offer_message_id = p_offer_id and user_id = p_user_id and conversation_id = p_conversation_id;
    if found then return to_jsonb(a) || '{"created":false}'::jsonb; end if;
    if c.career_coaching_activity_message_id is not null then raise exception 'Finish coaching before starting'; end if;
    if exists(select 1 from public.talent_simulate_application where conversation_id = p_conversation_id and status = 'active') then
      raise exception 'Another application is active';
    end if;
    select * into offer from public.talent_messages where id = p_offer_id and user_id = p_user_id
      and conversation_id = p_conversation_id and message_type = 'application_start_offer' for update;
    if not found or offer.payload->>'status' <> 'ready' then raise exception 'Start card unavailable'; end if;
    if p_payload->>'roleRef' is distinct from
      (case when offer.payload->>'official_job_slug' is not null then 'job:' || (offer.payload->>'official_job_slug')
      else 'role:' || (offer.payload->>'roleId') end) then raise exception 'Role mismatch'; end if;
    if not exists(select 1 from public.talent_documents where id = (p_payload->>'documentId')::uuid
      and talent_id = p_user_id and not is_deleted and kind = 'resume' and length(trim(coalesce(extracted_text, ''))) > 0) then
      raise exception 'Readable owned resume required';
    end if;
    -- A local prototype pointer is not a second active source of truth.
    if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='talent_conversations' and column_name='simulation_session_message_id') then
      execute 'update public.talent_conversations set simulation_session_message_id=null where id=$1 and user_id=$2'
        using p_conversation_id,p_user_id;
    end if;
    insert into public.talent_messages(user_id, conversation_id, role, message_type, content, payload)
      values(p_user_id, p_conversation_id, 'assistant', 'application_activity', '',
        jsonb_build_object('activityId',p_payload->>'sessionId','view','state')) returning id into anchor;
    next_payload := p_payload || jsonb_build_object('revision',1,'status','active','mutationKeys','[]'::jsonb);
    insert into public.talent_simulate_application(id,user_id,conversation_id,role_ref,start_offer_message_id,message_id,status,payload)
      values((p_payload->>'sessionId')::uuid,p_user_id,p_conversation_id,p_payload->>'roleRef',p_offer_id,anchor,'active',next_payload)
      returning * into a;
    update public.talent_messages set payload = payload || '{"status":"started"}'::jsonb where id = p_offer_id;
    return to_jsonb(a) || '{"created":true}'::jsonb;
  end if;
  select * into a from public.talent_simulate_application where user_id = p_user_id and conversation_id = p_conversation_id
    and (case when p_message_id is null then status = 'active' else message_id = p_message_id end)
    order by created_at desc limit 1 for update;
  if not found then return null; end if;
  if p_operation = 'read' then return to_jsonb(a); end if;
  if p_key is not null and coalesce(a.payload->'mutationKeys','[]'::jsonb) ? p_key then return to_jsonb(a); end if;
  if p_operation not in ('save','resume') then raise exception 'Unknown activity operation'; end if;
  if a.revision is distinct from p_revision then raise exception 'Session revision conflict'; end if;
  if p_operation = 'resume' then
    if c.career_coaching_activity_message_id is not null or exists(select 1 from public.talent_simulate_application where conversation_id=p_conversation_id and status='active' and id<>a.id) then
      raise exception 'Another mode is active';
    end if;
  elsif a.status <> 'active' then raise exception 'Activity has ended'; end if;
  if p_payload->>'sessionId' is distinct from a.id::text or p_payload->>'roleRef' is distinct from a.role_ref
    or p_payload->>'documentId' is distinct from a.payload->>'documentId' then raise exception 'Activity identity changed'; end if;
  next_revision := a.revision + 1;
  next_payload := p_payload || jsonb_build_object('revision',next_revision,'mutationKeys',
    coalesce(a.payload->'mutationKeys','[]'::jsonb) || case when p_key is null then '[]'::jsonb else jsonb_build_array(p_key) end);
  next_payload := jsonb_set(next_payload, '{mutationKeys}', (
    select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from (
      select value, ordinality from jsonb_array_elements(next_payload->'mutationKeys') with ordinality
      order by ordinality desc limit 256
    ) recent
  ));
  if p_operation = 'resume' then next_payload := next_payload || '{"status":"active","endedAt":null,"endReason":null}'::jsonb; end if;
  update public.talent_simulate_application set payload=next_payload, revision=next_revision,
    status=next_payload->>'status', updated_at=now(), last_activity_at=(next_payload->>'lastActivityAt')::timestamptz,
    ended_at=(next_payload->>'endedAt')::timestamptz where id=a.id returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) to service_role;

