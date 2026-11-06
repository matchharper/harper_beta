-- Repeated resolution returns its existing receipt under the conversation lock.
-- New answers to a resolved form and stale revisions remain rejected.
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
   select * into item from public.talent_messages
     where user_id=p_user_id and conversation_id=p_conversation_id
       and message_type='career_form_resolution' and payload->>'formId'=p_form_id::text
       and payload->>'revision'=p_revision::text order by id limit 1;
   if found then
     -- Resolution closes a question; replaying it neither adds an answer nor grants consent.
     if p_action='resolve' then return to_jsonb(item); end if;
     raise exception 'Form already resolved';
   end if;
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
