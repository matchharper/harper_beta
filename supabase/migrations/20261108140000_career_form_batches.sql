-- One user submission commits all reviewed revisions and admits one conversation input.
create function public.read_career_form_status(p_user_id uuid,p_conversation_id uuid,p_form_id bigint,p_revision integer)
returns text language sql stable security invoker set search_path='' as $$
 select case
   when not exists(select 1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id
     and message_type='career_form' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text) then 'resolved'
   when exists(select 1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id
     and message_type='career_form' and payload->>'formId'=p_form_id::text and (payload->>'revision')::integer>p_revision) then 'superseded'
   when exists(select 1 from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id
     and message_type='career_form_response' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text
     and payload->>'itemId' is null and payload->'answers' is null) then 'answered'
   when exists(select 1 from public.read_open_career_forms(p_user_id,p_conversation_id) f
     where f.payload->>'formId'=p_form_id::text and f.payload->>'revision'=p_revision::text) then 'open'
   else 'resolved' end;
$$;

create function public.respond_career_forms(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_responses jsonb,p_content text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_messages; response jsonb; saved jsonb; snapshots jsonb:='[]';
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select * into item from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id
   and message_type='career_form_response' and payload->>'requestId'=p_request_id;
 if found then return to_jsonb(item); end if;
 if p_request_id is null or p_request_id='' or jsonb_typeof(p_responses)<>'array' or jsonb_array_length(p_responses)=0 then
   raise exception 'Form responses required'; end if;
 if (select count(distinct value->>'formId') from jsonb_array_elements(p_responses))<>jsonb_array_length(p_responses) then
   raise exception 'Duplicate form IDs'; end if;
 for response in select value from jsonb_array_elements(p_responses) loop
   if public.read_career_form_status(p_user_id,p_conversation_id,(response->>'formId')::bigint,(response->>'revision')::integer)<>'open' then
     raise exception 'Form changed or closed; review the current form'; end if;
   saved:=public.write_career_form(p_user_id,p_conversation_id,'respond',(response->>'formId')::bigint,
     (response->>'revision')::integer,null,response||jsonb_build_object('hidden',true,'formBatchId',p_request_id),
     '',p_request_id||':'||(response->>'formId'));
   snapshots:=snapshots||jsonb_build_array((saved->'payload')-'hidden'-'formBatchId');
 end loop;
 insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
 values(p_user_id,p_conversation_id,'user','career_form_response',p_content,
   jsonb_build_object('requestId',p_request_id,'responses',snapshots)) returning * into item;
 return to_jsonb(item);
end $$;

-- Child response rows retain the existing per-form reader contract. Only their
-- enclosing user message wakes the model; no partially committed batch is visible.
create or replace function public.admit_career_message() returns trigger language plpgsql security invoker set search_path='' as $$
declare ref jsonb; linked boolean:=false; work uuid;
begin
 if new.message_type='career_form_response' and new.payload ? 'formBatchId' then return new; end if;
 if new.payload->>'careerTurnStopped'='true' or new.role<>'user' or new.conversation_id is null then return new; end if;
 if new.message_type='career_form_response' then
   for ref in select distinct value from jsonb_array_elements(
     coalesce(new.payload#>'{formSnapshot,relatedRefs}','[]') || coalesce((
       select jsonb_agg(r.value) from jsonb_array_elements(coalesce(new.payload->'responses','[]')) response
       cross join lateral jsonb_array_elements(coalesce(response#>'{formSnapshot,relatedRefs}','[]')) r
     ),'[]')) loop
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

revoke all on function public.read_career_form_status(uuid,uuid,bigint,integer),public.respond_career_forms(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.read_career_form_status(uuid,uuid,bigint,integer),public.respond_career_forms(uuid,uuid,text,jsonb,text) to service_role;

insert into public.translation_entries(namespace,key,locale,value,status,updated_by) values
('career','career.forms.batch_failed','ko','답변 전송을 확인하지 못했어요. 최신 질문을 확인한 뒤 다시 보내 주세요. 작성 내용은 유지돼요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.batch_failed','en','We could not confirm that your answers were sent. Check the latest questions and try again. Your draft is saved.','reviewed','translation:sync:codex-direct'),
('career','career.forms.closed','ko','종료된 질문이에요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.closed','en','This question is closed.','reviewed','translation:sync:codex-direct'),
('career','career.forms.answered','ko','답변을 보냈어요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.answered','en','Answers sent.','reviewed','translation:sync:codex-direct'),
('career','career.forms.open_group','ko','질문 {count}개 보기','reviewed','translation:sync:codex-direct'),
('career','career.forms.open_group','en','View {count} forms','reviewed','translation:sync:codex-direct'),
('career','career.forms.loading','ko','질문을 불러오는 중이에요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.loading','en','Loading questions…','reviewed','translation:sync:codex-direct'),
('career','career.forms.unavailable','ko','질문을 불러오지 못했어요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.unavailable','en','Questions could not be loaded.','reviewed','translation:sync:codex-direct'),
('career','career.forms.retry','ko','다시 불러오기','reviewed','translation:sync:codex-direct'),
('career','career.forms.retry','en','Reload','reviewed','translation:sync:codex-direct'),
('career','career.forms.navigation','ko','폼 이동','reviewed','translation:sync:codex-direct'),
('career','career.forms.navigation','en','Choose a form','reviewed','translation:sync:codex-direct'),
('career','career.forms.changed','ko','질문이 변경됐어요. 최신 내용을 확인해 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.changed','en','The questions have changed. Review the latest version.','reviewed','translation:sync:codex-direct'),
('career','career.forms.load_latest','ko','최신 질문 확인','reviewed','translation:sync:codex-direct'),
('career','career.forms.load_latest','en','Review updated questions','reviewed','translation:sync:codex-direct'),
('career','career.forms.send_answers','ko','답변 보내기','reviewed','translation:sync:codex-direct'),
('career','career.forms.send_answers','en','Send answers','reviewed','translation:sync:codex-direct')
on conflict(namespace,key,locale) do update set value=excluded.value,status=excluded.status,updated_by=excluded.updated_by,updated_at=now();
