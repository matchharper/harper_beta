-- The sent-email history that Career reads back (email replies, scheduled runs) holds what Harper
-- wrote, not the footer the transport appends to every email. The footer named a team member's
-- address as the way to reach a human, and Harper passed it on as if it were its own answer.
-- The delivered email itself is unchanged; emailPayload keeps the exact text that was sent.

create or replace function public.finish_career_agent_email(p_delivery_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare d public.talent_opportunity_delivery; m bigint; e jsonb; c uuid; target jsonb;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1' for update;
 if not found or d.payload->>'resendEmailId' is null then raise exception 'Provider receipt required'; end if;
 e:=d.payload->'emailPayload'; c:=(d.payload->>'conversationId')::uuid;
 select talent_message_id into m from public.career_email_messages where id=d.id;
 if not found then
  perform 1 from public.talent_conversations where id=c and user_id=d.talent_id;
  if found then
   insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
   values(d.talent_id,c,'assistant','mail',d.payload->>'bodyMarkdown',jsonb_build_object('deliveryId',d.id,'discoveryRunId',d.discovery_run_id,'subject',e->>'subject','sentAt',coalesce(d.sent_at,now()))) returning id into m;
  end if;
  insert into public.career_email_messages(id,talent_id,talent_message_id,direction,mail_type,status,from_email,to_email,subject,body_text,occurred_at,metadata)
  values(d.id,d.talent_id,m,'outbound','career_agent','sent',e->>'from',e->>'to',e->>'subject',d.payload->>'bodyMarkdown',coalesce(d.sent_at,now()),
   jsonb_build_object('discoveryRunId',d.discovery_run_id,'replyTo',e->>'replyTo','resendEmailId',d.payload->>'resendEmailId'));
 end if;
 for target in select value from jsonb_array_elements(coalesce((select trigger_payload->'companyRequestFollowups' from public.opportunity_discovery_run where id=d.discovery_run_id),'[]')) source_target(value) where not exists(
    select 1 from public.opportunity_discovery_run run, jsonb_array_elements(run.trigger_payload->'sourceEvents') source
    where run.id=d.discovery_run_id and source->>'sourceKind'='company_followup'
      and source->>'sourceId'=source_target.value->>'followupId' and source ? 'dailySourceId'
      and not coalesce(d.payload->'sourceIds','[]') ? (source->>'dailySourceId')) loop
  if not exists(select 1 from public.talent_progress where metadata->>'followupId'=target->>'followupId'
    and metadata->>'eventType'='email_sent' and metadata->>'discoveryRunId'=d.discovery_run_id::text) then
   perform public.record_company_followup_event_v1((target->>'followupId')::uuid,'email_sent',jsonb_build_object('discoveryRunId',d.discovery_run_id));
  end if;
  update public.company_talent_followups set status='delivered',updated_at=now()
   where id=(target->>'followupId')::uuid and delivery_run_id=d.discovery_run_id and status='pending';
 end loop;
 update public.talent_opportunity_delivery set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now(),error_message=null,
  payload=payload||jsonb_build_object('auditCompletedAt',now()) where id=d.id returning * into d;
 update public.opportunity_discovery_run set coverage=coalesce(coverage,'{}')||jsonb_build_object('agentOutcome','sent') where id=d.discovery_run_id;
 if d.payload ? 'sourceIds' then perform public.record_career_daily_contact(d.discovery_run_id,d.payload->'sourceIds','email',d.id::text); end if;
 return to_jsonb(d);
end $function$;

-- Emails already recorded with a footer. Scheduled Career emails take the body Harper wrote for the
-- same delivery. Reading the footer back, Harper also copied it into 276 of those bodies (sent with
-- the footer twice, 2026-11-08~23) and paraphrased it into more; older mail types used earlier footer
-- wordings. Every footer wording starts a line with one of the two sentences matched below, so those
-- lines are removed from the stored history. Sent emails are not changed.
update public.career_email_messages m
set body_text = d.payload->>'bodyMarkdown'
from public.talent_opportunity_delivery d
where d.id = m.id
  and m.mail_type = 'career_agent'
  and m.direction = 'outbound'
  and coalesce(d.payload->>'bodyMarkdown', '') <> ''
  and m.body_text is distinct from d.payload->>'bodyMarkdown';

update public.career_email_messages
set body_text = btrim(regexp_replace(
  body_text,
  '(^|\n)[ \t>*_]*If you (have any issues(,? feedback)?,? or want (to talk to a human|someone on the team to take a look)|would like to change how often Harper emails you or stop receiving emails)[^\n]*',
  '', 'gi'))
where direction = 'outbound'
  and body_text ~* 'If you (have any issues(,? feedback)?,? or want (to talk to a human|someone on the team to take a look)|would like to change how often Harper emails you or stop receiving emails)';
