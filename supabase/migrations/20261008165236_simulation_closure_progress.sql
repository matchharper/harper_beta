-- Keep user-written memos separate from application-preparation summaries.
-- Extend the existing audience classifier without changing its other rules.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.set_talent_progress_audiences_v1()'::regprocedure);
  if position('application_preparation_summary' in definition) = 0 then
    if position('(''memo'', ''saved_stage_changed'')' in definition) = 0 then
      raise exception 'Progress audience classifier changed; review before migrating';
    end if;
    execute replace(definition, '(''memo'', ''saved_stage_changed'')',
      '(''memo'', ''saved_stage_changed'', ''application_preparation_summary'')');
  end if;
end $$;

create unique index if not exists talent_progress_application_summary_session_unique
on public.talent_progress (talent_id, (metadata->>'sessionId'))
where kind = 'application_preparation_summary';

-- Also used by the development-only in-memory session adapter. Service role only.
create or replace function public.record_application_preparation_progress(
 p_user_id uuid, p_conversation_id uuid, p_payload jsonb, p_message_id bigint
) returns void language plpgsql security definer set search_path = '' as $$
declare
 v_role_id uuid; v_text text; v_actions jsonb; v_facts jsonb;
 v_item jsonb; v_label text; v_en boolean := coalesce(p_payload->>'locale','ko') like 'en%';
begin
 if not exists(select 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id) then
   raise exception 'Conversation unavailable';
 end if;
 if p_payload->>'status' is distinct from 'ended' or nullif(p_payload->>'sessionId','') is null then
   raise exception 'Ended application preparation required';
 end if;
 if p_payload->>'roleRef' like 'role:%' then
   select role_id into v_role_id from public.company_roles
   where role_id::text=substring(p_payload->>'roleRef' from 6);
 elsif p_payload->>'roleRef' like 'job:%' then
   select role_id into v_role_id from public.official_jobs
   where slug=substring(p_payload->>'roleRef' from 5);
 end if;
 if v_role_id is null then raise exception 'Cannot archive preparation without a linked role'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', a->>'id', 'title', a->>'title', 'status', a->>'status',
   'resolution', a->>'resolution', 'evidenceMessageId', a->'evidenceMessageId'
 )), '[]'::jsonb) into v_actions from jsonb_array_elements(coalesce(p_payload->'actions','[]'::jsonb)) a;
 v_facts := coalesce(p_payload->'facts','[]'::jsonb);
 v_text := coalesce(nullif(btrim(p_payload->>'closingSummary'),''),
   case when v_en then 'Application preparation progress' else '함께 지원 준비 기록' end);
 for v_item in select * from jsonb_array_elements(v_actions) loop
   v_label := case v_item->>'status'
     when 'completed' then case when v_en then 'Completed' else '완료' end
     when 'skipped' then case when v_en then 'Skipped' else '건너뜀' end
     when 'needs_confirmation' then case when v_en then 'Needs confirmation' else '확인 필요' end
     when 'in_progress' then case when v_en then 'In progress' else '진행 중' end
     else case when v_en then 'Remaining' else '남은 일' end end;
   v_text := v_text || E'\n' || v_label || ': ' || coalesce(v_item->>'title','')
     || case when nullif(v_item->>'resolution','') is not null then ' — ' || (v_item->>'resolution') else '' end;
 end loop;
 for v_item in select * from jsonb_array_elements(v_facts) loop
   v_text := v_text || E'\n' || case when v_en then 'Confirmed context: ' else '확인한 맥락: ' end || coalesce(v_item->>'text','');
 end loop;
 insert into public.talent_progress(talent_id,role_id,kind,text,metadata,open_to_talent,open_to_company)
 values(p_user_id,v_role_id,'application_preparation_summary',v_text,
   jsonb_build_object('sessionId',p_payload->>'sessionId','sessionMessageId',p_message_id,
     'conversationId',p_conversation_id,'analysisMessageId',p_payload->'analysisMessageId',
     'documentId',p_payload->'documentId','documentName',p_payload->'documentName',
     'analysisStatus',p_payload->>'analysisStatus','endReason',p_payload->>'endReason',
     'endedAt',p_payload->'endedAt','actions',v_actions,'facts',v_facts),true,false)
 on conflict (talent_id,(metadata->>'sessionId')) where kind='application_preparation_summary' do nothing;
end $$;
revoke all on function public.record_application_preparation_progress(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.record_application_preparation_progress(uuid,uuid,jsonb,bigint) to service_role;

-- A failed archive rolls back the state update and current-mode pointer together.
-- Includes explicit end, completed/skipped actions, empty results and idle expiry.
create or replace function public.archive_ended_application_preparation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.message_type='simulation_session' and new.payload->>'archiveProgress'='true' and new.payload->>'status'='ended'
    and old.payload->>'status'='active' then
   perform public.record_application_preparation_progress(new.user_id,new.conversation_id,new.payload,new.id);
 end if;
 return new;
end $$;
revoke all on function public.archive_ended_application_preparation() from public,anon,authenticated;
create trigger archive_ended_application_preparation after update of payload on public.talent_messages
for each row execute function public.archive_ended_application_preparation();
