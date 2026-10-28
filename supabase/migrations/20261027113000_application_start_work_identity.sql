-- One inbound email can name more than one preparation. Retry identity is the
-- source message + role + original resume, not the whole email. The existing
-- conversation lock and one-active-application index still protect the reader
-- that addresses the current preparation without an explicit message ID.
alter table public.talent_simulate_application
  drop constraint talent_simulate_application_start_offer_message_id_key;
create unique index talent_simulate_application_start_work
  on public.talent_simulate_application
    (start_offer_message_id, role_ref, (payload->>'documentId'));

-- Preserve ownership, source authorization, immutable identity, revision/CAS,
-- replay protection, coaching exclusion, and the installed question history.
do $migration$
declare
  definition text := pg_get_functiondef('public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint)'::regprocedure);
  old_lookup text := $old$    select * into a from public.talent_simulate_application
      where start_offer_message_id = p_offer_id and user_id = p_user_id and conversation_id = p_conversation_id;$old$;
begin
  if strpos(definition, old_lookup) = 0 then
    raise exception 'Application start baseline changed; inspect before applying';
  end if;
  definition := replace(definition, old_lookup, $new$    select * into a from public.talent_simulate_application
      where start_offer_message_id = p_offer_id and user_id = p_user_id and conversation_id = p_conversation_id
        and role_ref = p_payload->>'roleRef'
        and payload->>'documentId' is not distinct from p_payload->>'documentId';$new$);
  execute definition;
end;
$migration$;
revoke all on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.write_application_activity(uuid,uuid,text,bigint,integer,jsonb,text,bigint) to service_role;
