-- Preserve the installed question-history implementation; change only start origin.
do $migration$
declare
  definition text := pg_get_functiondef('public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint)'::regprocedure);
  old_start text := $old$    select * into offer from public.talent_messages where id = p_offer_id and user_id = p_user_id
      and conversation_id = p_conversation_id and message_type = 'application_start_offer' for update;
    if not found or offer.payload->>'status' <> 'ready' then raise exception 'Start card unavailable'; end if;
    if p_payload->>'roleRef' is distinct from
      (case when offer.payload->>'official_job_slug' is not null then 'job:' || (offer.payload->>'official_job_slug')
      else 'role:' || (offer.payload->>'roleId') end) then raise exception 'Role mismatch'; end if;$old$;
  old_update text := $old$    update public.talent_messages set payload = payload || '{"status":"started"}'::jsonb where id = p_offer_id;$old$;
begin
  if strpos(definition, old_start) = 0 or strpos(definition, old_update) = 0 then
    raise exception 'Application start baseline changed; inspect before applying';
  end if;
  definition := replace(definition, old_start, $new$    select * into offer from public.talent_messages where id = p_offer_id and user_id = p_user_id
      and conversation_id = p_conversation_id for update;
    if p_payload->'activity'->>'channel' = 'email' then
      if not found or offer.role is distinct from 'user' or (p_payload->'activity'->>'sourceMessageId')::bigint is distinct from p_offer_id then
        raise exception 'Owned inbound message required';
      end if;
    else
      if not found or offer.message_type is distinct from 'application_start_offer' or offer.payload->>'status' <> 'ready' then raise exception 'Start card unavailable'; end if;
      if p_payload->>'roleRef' is distinct from
        (case when offer.payload->>'official_job_slug' is not null then 'job:' || (offer.payload->>'official_job_slug')
        else 'role:' || (offer.payload->>'roleId') end) then raise exception 'Role mismatch'; end if;
    end if;$new$);
  definition := replace(definition, old_update, $new$    if offer.message_type = 'application_start_offer' then
      update public.talent_messages set payload = payload || '{"status":"started"}'::jsonb where id = p_offer_id;
    end if;$new$);
  definition := replace(definition, 'Start card required', 'Start source required');
  execute definition;
end;
$migration$;
revoke all on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) to service_role;
