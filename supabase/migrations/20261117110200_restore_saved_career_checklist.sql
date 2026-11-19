-- This reported list predates the explicit action item type. An ordinary
-- multiselect may be an application answer, so convert only the verified record.
do $$
declare
  original public.talent_messages;
  previous_response public.talent_messages;
  field jsonb;
  tasks jsonb;
  selected jsonb;
  request_key text;
begin
  select m.* into original from public.talent_messages m
    join public.talent_conversations c on c.id=m.conversation_id and c.user_id=m.user_id
    where m.id=499648 and m.created_at=timestamptz '2026-11-17 05:59:15.940131 UTC'
      and m.message_type='career_form'
    for update of c;
  if not found then return; end if;
  if original.payload->>'kind' <> 'form' or original.payload->>'hidden'='true'
    or jsonb_array_length(original.payload->'items') <> 1
    or exists (select 1 from public.talent_messages m where m.user_id=original.user_id
      and m.conversation_id=original.conversation_id and m.payload->>'formId'=original.id::text
      and (m.message_type='career_form_resolution' or (m.message_type='career_form' and m.id<>original.id)))
    then return; end if;

  field := original.payload#>'{items,0}';
  if field->>'type' <> 'multiselect' then return; end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', opt->>'id', 'type', 'action', 'label', opt->>'label', 'description', opt->>'description',
    'content', '', 'positive', jsonb_build_object('id','start','label','진행','message',opt->>'label')
  )) order by position) into tasks
  from jsonb_array_elements(field#>'{content,options}') with ordinality as options(opt,position);
  request_key := 'restore-checklist:' || original.id;
  perform public.write_career_form(original.user_id, original.conversation_id, 'update',
    original.id, null, 1, original.payload || jsonb_build_object('kind','suggestion','items',tasks),
    '', request_key);

  -- The original receipt stays in the timeline. Copy only its actual selections
  -- to this revision as a hidden receipt. An import must not queue another turn.
  select * into previous_response from public.talent_messages
    where user_id=original.user_id and conversation_id=original.conversation_id
      and message_type='career_form_response' and payload->>'formId'=original.id::text
      and payload->>'revision'='1' order by id desc limit 1;
  if not found then return; end if;
  select jsonb_agg(jsonb_build_object('itemId', t->>'id', 'actionId','start','values','{}'::jsonb))
    into selected from jsonb_array_elements(tasks) t
    where (previous_response.payload->'values'->(field->>'id')) ? (t->>'id');
  if selected is not null then
    perform public.write_career_form(original.user_id, original.conversation_id, 'respond',
      original.id, 2, null, jsonb_build_object('answers',selected,'values','{}'::jsonb,
        'hidden',true,'formBatchId',request_key,'sourceResponseId',previous_response.id),
      '', request_key || ':selections');
  end if;
end $$;
