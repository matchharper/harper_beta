begin;
create unique index if not exists matching_question_sent_delivery_ref_idx
  on public.talent_progress ((metadata->>'deliveryId'),(metadata->>'ref'))
  where kind='matching_clarification_sent' and metadata->>'deliveryId' is not null;

-- The outbox's sent transition and the question record commit together.
-- Retries use the sealed questions associated with the actual email body.
create or replace function public.record_sent_matching_questions_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;
begin
  if new.status<>'sent' or new.channel<>'email'
     or jsonb_typeof(new.payload->'matchingClarifications') is distinct from 'array' then return new; end if;
  for item in select value from jsonb_array_elements(new.payload->'matchingClarifications') loop
    if nullif(btrim(item->>'question'),'') is null or nullif(item->>'ref','') is null then continue; end if;
    insert into public.talent_progress(talent_id,role_id,kind,text,metadata,open_to_talent,open_to_company,created_at)
      values(new.talent_id,(item->>'roleId')::uuid,'matching_clarification_sent',item->>'question',
        jsonb_build_object('ref',item->>'ref','question',item->>'question',
          'coveredRoleIds',item->'coveredRoleIds','inputFingerprints',item->'inputFingerprints',
          'discoveryRunId',new.discovery_run_id,'deliveryId',new.id,'sentChannel','email',
          'emailMessageId',new.payload->>'resendEmailId'),true,false,coalesce(new.sent_at,now()))
      on conflict do nothing;
  end loop;
  return new;
end $$;
revoke all on function public.record_sent_matching_questions_v1() from public,anon,authenticated;
create trigger record_sent_matching_questions
  after insert or update of status,payload on public.talent_opportunity_delivery
  for each row execute function public.record_sent_matching_questions_v1();
commit;
