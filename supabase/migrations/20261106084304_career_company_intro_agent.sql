-- The new app explicitly opts into Career delivery. Old deployed callers keep
-- their existing delivery path until the matching Career context is deployed.
-- Billing, decision recording, recommendation/list insertion and this handoff
-- all commit in one transaction; no Worker can observe the intermediate run.
create function public.request_company_intro_for_career_v1(
 p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
 p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text,
 p_channel text, p_source_message_id bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; intro public.company_intro_candidates;
begin
 result:=public.request_company_intro_v2(p_intro_candidate_id,p_company_workspace_id,
   p_company_user_id,p_next_stage_id,p_intro_recipient_emails,p_company_appeal,
   p_channel,p_source_message_id);
 if result->>'status' <> 'requested' then return result; end if;
 select * into strict intro from public.company_intro_candidates where id=p_intro_candidate_id;
 update public.opportunity_discovery_run set trigger_payload=jsonb_build_object(
   'runContract','career_agent_v1','contactScope','company_intro',
   'companyIntroCandidateId',intro.id,
   'sourceEvents',jsonb_build_array(jsonb_build_object('sourceKind','company_intro',
     'sourceId',intro.id,'revision',intro.revision,'occurredAt',intro.requested_at,
     'recommendationId',intro.recommendation_id,'roleId',intro.role_id)))
 where id=intro.delivery_run_id and talent_id=intro.talent_id and status='queued';
 if not found then raise exception 'Company introduction run unavailable'; end if;
 update public.talent_opportunity_recommendation set evidence=evidence-'preFinalDelivery'
 where id=intro.recommendation_id and talent_id=intro.talent_id;
 return result;
end $$;
revoke all on function public.request_company_intro_for_career_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint) from public,anon,authenticated;
grant execute on function public.request_company_intro_for_career_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint) to service_role;

-- The same consent/ownership boundary serves context loading and final sends.
-- A closed request, changed source revision, withdrawn consent or blocked company
-- must not cause a stale invitation. This never infers fit or candidate intent.
create function public.career_company_intro_is_current(p_run uuid,p_talent uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.company_intro_candidates i
  join public.opportunity_discovery_run run on run.id=i.delivery_run_id and run.talent_id=i.talent_id
  join public.talent_opportunity_recommendation rec on rec.id=i.recommendation_id
    and rec.talent_id=i.talent_id and rec.role_id=i.role_id and rec.discovery_run_id=run.id
    and rec.opportunity_type='intro_request'
  join public.company_roles r on r.role_id=i.role_id and r.company_workspace_id=i.company_workspace_id
  join public.company_workspace w on w.company_workspace_id=i.company_workspace_id
  join public.talent_users t on t.user_id=i.talent_id and t.deleted_at is null
  join public.talent_setting s on s.user_id=i.talent_id
  where run.id=p_run and i.talent_id=p_talent and i.status='awaiting_talent'
    and run.trigger_payload->>'runContract'='career_agent_v1'
    and run.trigger_payload->>'companyIntroCandidateId'=i.id::text
    and exists(select 1 from jsonb_array_elements(run.trigger_payload->'sourceEvents') e
      where e->>'sourceKind'='company_intro' and e->>'sourceId'=i.id::text and (e->>'revision')::bigint=i.revision)
    and s.is_onboarding_done is true and lower(btrim(s.profile_visibility))='open_to_matches'
    and s.get_internal_recommendation is not false
    and r.source_type='internal' and r.status in ('active','paused','top_priority')
    and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>now())
    and public.company_intro_role_allows_talent_v1(r.information,i.talent_id)
    and (i.next_stage_id is null or exists(select 1 from public.ops_matching_role_stages stage where stage.id=i.next_stage_id and stage.role_id=i.role_id))
    and not exists(select 1 from unnest(coalesce(s.blocked_companies,'{}'::text[])) blocked(name)
      where lower(btrim(blocked.name)) in (lower(btrim(w.company_name)),lower(btrim(coalesce(w.published_name,''))),i.company_workspace_id::text))
 );
$$;
revoke all on function public.career_company_intro_is_current(uuid,uuid) from public,anon,authenticated;
grant execute on function public.career_company_intro_is_current(uuid,uuid) to service_role;

-- Record actual contact, not LLM completion. The existing delivery ledger drives
-- the company timeline and its saved follow-up dates for either contact channel.
create function public.record_career_company_intro_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='sent' and new.sent_at is not null and new.payload->>'runContract'='career_agent_v1' then
  update public.company_intro_candidates i set candidate_sent_at=coalesce(i.candidate_sent_at,new.sent_at),updated_at=now()
    where i.delivery_run_id=new.discovery_run_id and i.talent_id=new.talent_id and i.candidate_sent_at is null;
 end if;
 return new;
end $$;
create trigger career_company_intro_delivery after insert or update of status,sent_at on public.talent_opportunity_delivery
 for each row execute function public.record_career_company_intro_delivery();

create function public.record_career_company_intro_chat()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run; i public.company_intro_candidates;
begin
 if new.role<>'assistant' or new.message_type<>'chat' or new.payload->>'backgroundRunId' is null then return new; end if;
 select * into r from public.opportunity_discovery_run where id=(new.payload->>'backgroundRunId')::uuid
   and trigger_payload->>'companyIntroCandidateId' is not null and trigger_payload->>'runContract'='career_agent_v1';
 if not found then return new; end if;
 if r.talent_id is distinct from new.user_id or r.conversation_id is distinct from new.conversation_id
   or r.status<>'handed_off' or not public.career_company_intro_is_current(r.id,new.user_id) then
   raise exception 'Company introduction unavailable';
 end if;
 select * into strict i from public.company_intro_candidates where delivery_run_id=r.id and talent_id=new.user_id;
 insert into public.talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,sent_at,payload)
 values(new.user_id,r.id,'chat','sent',now(),jsonb_build_object('runContract','career_agent_v1',
   'message',new.content,'messageId',new.id,'auditCompletedAt',now(),'recommendationIds',jsonb_build_array(i.recommendation_id)))
 on conflict(discovery_run_id,channel) where payload->>'runContract'='career_agent_v1' do nothing;
 return new;
end $$;
create trigger career_company_intro_chat after insert on public.talent_messages
 for each row execute function public.record_career_company_intro_chat();
revoke all on function public.record_career_company_intro_delivery(),public.record_career_company_intro_chat() from public,anon,authenticated;
grant execute on function public.record_career_company_intro_delivery(),public.record_career_company_intro_chat() to service_role;

-- Reuse the existing follow-up source reader for the Career outbox's actual
-- payload and chat-only delivery. Keep all existing source lifecycle rules.
do $patch$
declare original text; revised text;
begin
 original:=pg_get_functiondef('public.company_followup_source_v1(text,uuid)'::regprocedure);
 revised:=replace(original,$old$d.channel='email' and d.status='sent'$old$,$new$(d.channel='email' or (d.channel='chat' and d.payload->>'runContract'='career_agent_v1')) and d.status='sent'$new$);
 revised:=replace(revised,$old$'originalBody',q#>>'{payload,emailPayload,textBody}'$old$,
   $new$'originalBody',coalesce(q#>>'{payload,bodyMarkdown}',q#>>'{payload,emailPayload,textBody}',q#>>'{payload,emailPayload,text}',q#>>'{payload,message}')$new$);
 if revised=original then raise exception 'Company follow-up source definition changed'; end if;
 execute revised;
 original:=pg_get_functiondef('public.company_followup_first_delivery_v1()'::regprocedure);
 revised:=replace(original,$old$elsif new.channel='email' then$old$,$new$elsif new.channel='email' or (new.channel='chat' and new.payload->>'runContract'='career_agent_v1') then$new$);
 if revised=original then raise exception 'Company follow-up delivery definition changed'; end if;
 execute revised;
end $patch$;

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
 -- Recheck the company request immediately before the provider attempt.
 if exists(select 1 from public.opportunity_discovery_run r where r.id=d.discovery_run_id
     and r.trigger_payload->>'companyIntroCandidateId' is not null)
   and not public.career_company_intro_is_current(d.discovery_run_id,d.talent_id) then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now(),
    error_message='Company introduction changed before provider admission' where id=d.id;
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

-- A chat receipt must not hide a pending/failed email in the same invocation.
create or replace function public.finish_career_background_reply(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text,p_run_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s jsonb; outcome text; run_status text;
begin
 select status into run_status from public.opportunity_discovery_run where id=p_run_id and talent_id=p_user_id and conversation_id=p_conversation_id
  and trigger_payload#>>'{agentInvocation,replyId}'=p_reply_id for update;
 if not found then return false; end if;
 select state into s from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id for update;
 if not found then return false; end if;
 if coalesce(s->'completedReplyIds','{}') ? p_reply_id then return true; end if;
 if s#>>'{activeReply,replyId}' is distinct from p_reply_id or s#>>'{activeReply,claimId}' is distinct from p_claim_id
   or coalesce((s#>>'{activeReply,expiresAt}')::timestamptz,'-infinity')<=now() then return false; end if;
 select case when d.status in ('queued','retry','sending') then 'delivery_pending' else d.status end into outcome from public.talent_opportunity_delivery d
  where discovery_run_id=p_run_id and payload->>'runContract'='career_agent_v1'
  order by (channel='email') desc limit 1;
 if run_status='handed_off' then
  update public.opportunity_discovery_run set status='completed',completed_at=now(),updated_at=now(),
   coverage=coalesce(coverage,'{}')||jsonb_build_object('agentOutcome',coalesce(outcome,'no_send')) where id=p_run_id;
 end if;
 -- An independent background invocation does not consume chat handbook leases.
 update public.talent_agent_runtime set state=(case when s#>>'{checkpoint,replyId}'=p_reply_id then s-'checkpoint' else s end)||jsonb_build_object('activeReply',null,
  'checkpoints',coalesce(s->'checkpoints','{}')-p_reply_id,
  'completedReplyIds',coalesce(s->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,coalesce((s->>'completedSequence')::bigint,0)))
 where conversation_id=p_conversation_id;
 return true;
end $$;
