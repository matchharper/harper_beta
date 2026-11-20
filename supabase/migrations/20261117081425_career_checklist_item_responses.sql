-- Both historical single-item receipts and suggestion answer arrays identify answered rows.
create function public.career_form_answer_item_ids(p_response jsonb)
returns setof text language sql immutable security invoker set search_path='' as $$
 select p_response->>'itemId' where p_response->>'itemId' is not null
 union all
 select answer->>'itemId' from jsonb_array_elements(
   case when jsonb_typeof(p_response->'answers')='array' then p_response->'answers' else '[]'::jsonb end
 ) answer where answer->>'itemId' is not null;
$$;

-- The entry points below select the current or requested revision and share this status projection.
create function public.career_form_revision_state(f public.talent_messages)
returns text language sql stable security invoker set search_path='' as $$
 with receipts as (
   select r.payload from public.talent_messages r
   where r.user_id=f.user_id and r.conversation_id=f.conversation_id and r.message_type='career_form_response'
     and r.payload->>'formId'=f.payload->>'formId' and r.payload->>'revision'=f.payload->>'revision'
 )
 select case
   when f.payload->>'hidden'='true' or exists(
     select 1 from public.talent_messages r where r.user_id=f.user_id and r.conversation_id=f.conversation_id
       and r.message_type='career_form_resolution' and r.payload->>'formId'=f.payload->>'formId'
       and r.payload->>'revision'=f.payload->>'revision'
   ) then 'resolved'
   when exists(select 1 from receipts where payload->>'itemId' is null and payload->'answers' is null)
     then 'answered'
   when f.payload->>'kind'='suggestion' and jsonb_array_length(f.payload->'items')>0 and not exists(
     select item->>'id' from jsonb_array_elements(f.payload->'items') item
     except
     select answered.item_id from receipts r cross join lateral public.career_form_answer_item_ids(r.payload) answered(item_id)
   ) then 'answered'
   when exists(select 1 from jsonb_array_elements(f.payload->'relatedRefs') ref where ref->>'type'='work')
     and not exists(
       select 1 from jsonb_array_elements(f.payload->'relatedRefs') ref
       join public.talent_external_operations w on w.id::text=ref->>'id' and w.user_id=f.user_id
       where ref->>'type'='work' and w.kind='delegated_work' and w.status not in ('completed','cancelled')
     ) then 'resolved'
   when f.payload->>'kind'='suggestion' and jsonb_array_length(f.payload->'items')=0 then 'resolved'
   else 'open' end;
$$;

create or replace function public.read_career_form_status(p_user_id uuid,p_conversation_id uuid,p_form_id bigint,p_revision integer)
returns text language sql stable security invoker set search_path='' as $$
 select coalesce((
   select case when exists(
     select 1 from public.talent_messages newer where newer.user_id=p_user_id and newer.conversation_id=p_conversation_id
       and newer.message_type='career_form' and (newer.payload->>'formId')::bigint=p_form_id
       and (newer.payload->>'revision')::integer>p_revision
   ) then 'superseded' else public.career_form_revision_state(f) end
   from public.talent_messages f where f.user_id=p_user_id and f.conversation_id=p_conversation_id
     and f.message_type='career_form' and (f.payload->>'formId')::bigint=p_form_id and (f.payload->>'revision')::integer=p_revision
 ), 'resolved');
$$;

create or replace function public.read_open_career_forms(p_user_id uuid,p_conversation_id uuid)
returns setof public.talent_messages language sql stable security invoker set search_path='' as $$
 with latest as (
   select distinct on (m.payload->>'formId') m.* from public.talent_messages m
   where m.user_id=p_user_id and m.conversation_id=p_conversation_id and m.message_type='career_form'
   order by m.payload->>'formId',m.id desc
 ) select f.* from latest f where public.career_form_revision_state(f::public.talent_messages)='open' order by f.id;
$$;

revoke all on function public.career_form_answer_item_ids(jsonb),public.career_form_revision_state(public.talent_messages) from public,anon,authenticated;
grant execute on function public.career_form_answer_item_ids(jsonb),public.career_form_revision_state(public.talent_messages) to service_role;

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
 -- Both legacy single answers and batched answers share this locked boundary.
 -- A second request identity cannot emit another input for a completed revision.
 if p_action='respond' and exists(select 1 from public.talent_messages
   where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form_response'
     and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text
     and payload->>'itemId' is null and payload->'answers' is null) then
   raise exception 'Form already answered';
 end if;
 if p_action='update' then
   select max((payload->>'revision')::integer)+1 into next_revision from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text;
   if p_expected_revision is distinct from next_revision-1 then raise exception 'Form revision conflict'; end if;
   body:=coalesce(p_payload,'{}')||jsonb_build_object('formId',p_form_id,'revision',next_revision,'requestId',p_request_id);
 elsif p_action in ('present','respond','resolve') then
   select * into snapshot from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text;
   if not found then raise exception 'Form revision unavailable'; end if;
   -- The conversation lock serializes concurrent attempts to run the same checklist action.
   if p_action='respond' and snapshot.payload->>'kind'='suggestion'
     and snapshot.payload->'items' @> '[{"type":"action"}]' and exists(
       select 1 from public.talent_messages r
       cross join lateral public.career_form_answer_item_ids(r.payload) saved(item_id)
       where r.user_id=p_user_id and r.conversation_id=p_conversation_id
         and r.message_type='career_form_response' and r.payload->>'formId'=p_form_id::text
         and r.payload->>'revision'=p_revision::text and saved.item_id in (
           select row_item.value->>'id' from jsonb_array_elements(snapshot.payload->'items') row_item
           join public.career_form_answer_item_ids(p_payload) requested(item_id) on requested.item_id=row_item.value->>'id'
           where row_item.value->>'type'='action'
         )
     ) then raise exception 'Form item already answered'; end if;
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
