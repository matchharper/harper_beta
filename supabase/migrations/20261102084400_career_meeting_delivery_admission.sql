-- Recheck appointment revisions at the existing provider admission boundary.
create or replace function public.begin_career_agent_email_attempt(p_delivery_id uuid,p_claim_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1' for update;
 if not found or d.status<>'sending' or d.payload->>'claimId' is distinct from p_claim_id
   or coalesce((d.payload->>'claimExpiresAt')::timestamptz,'-infinity')<=now() or d.payload->>'resendEmailId' is not null then return false; end if;
 if d.payload->>'cancelRequested'='true' then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now() where id=d.id;
  return false;
 end if;
 if not exists(select 1 from public.opportunity_discovery_run r where r.id=d.discovery_run_id and r.talent_id=d.talent_id and r.status in ('handed_off','completed')) then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now() where id=d.id;
  return false;
 end if;
 if exists(select 1 from public.talent_messages m where m.user_id=d.talent_id and m.conversation_id=(d.payload->>'conversationId')::uuid and m.role='user'
   and m.id>coalesce((d.payload->>'sourceMessageCursor')::bigint,0)) then
  update public.talent_opportunity_delivery set status='context_changed',updated_at=now(),error_message='New user messages arrived before provider admission' where id=d.id;
  return false;
 end if;
 -- Serialize the final admission check with appointment updates. Earlier
 -- application reads can become stale while recipient/user context is loaded.
 perform m.id from public.meeting_schedules m
   join jsonb_each_text(coalesce(d.payload->'meetingScheduleVersions','{}'::jsonb)) expected
     on m.id=expected.key::uuid and m.talent_id=d.talent_id
   order by m.id for share of m;
 if exists(
   select 1 from jsonb_each_text(coalesce(d.payload->'meetingScheduleVersions','{}'::jsonb)) expected
   where not exists(select 1 from public.meeting_schedules m
     where m.id=expected.key::uuid and m.talent_id=d.talent_id and m.version=expected.value::bigint)
 ) then
  update public.talent_opportunity_delivery set status='context_changed',updated_at=now(),
    error_message='Appointment changed before provider admission' where id=d.id;
  return false;
 end if;
 if (d.payload->>'firstProviderAttemptAt')::timestamptz<=now()-interval '24 hours' then
  update public.talent_opportunity_delivery set status='delivery_unknown',updated_at=now() where id=d.id;
  return false;
 end if;
 update public.talent_opportunity_delivery set payload=payload||jsonb_build_object('firstProviderAttemptAt',coalesce(payload->>'firstProviderAttemptAt',now()::text)),updated_at=now() where id=d.id;
 return true;
end $$;
revoke all on function public.begin_career_agent_email_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_career_agent_email_attempt(uuid,text) to service_role;
