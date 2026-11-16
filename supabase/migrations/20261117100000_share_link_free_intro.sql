-- 후보자 링크 (#1): a free, already-accepted Intro for a candidate who came through their own link.
--
-- The candidate applied to the company's posting through Harper and, approving the application with
-- "Harper 후보 요약 링크 넣기", agreed that the company may see their summary and connect with them
-- (talent_share_links.consented_at). When the company signs up from the link the candidate is put on the Role as "연결을 요청할 후보"
-- (attach_shared_candidate_v1, 20261116090000). For that card only:
--   - "연결 요청" uses no Intro: no credit event, so the free monthly allowance is untouched.
--   - The candidate is not asked again. In the request's own transaction their acceptance is recorded through the
--     decision function their own answer uses, with the channel candidate_link_consent, and the Career run that
--     would ask them is cancelled before a Worker can claim it. From there everything runs as for an accepted
--     intro: connecting, the intro email to both sides, connected (requestOrgCompanyIntro, as after an acceptance;
--     connect-pending retries a card left connecting), talent_progress, the company update, decision events and
--     the internal notice (its actor "Harper 시스템(후보자 링크 동의)").
-- Which card: made by the link (role_fingerprint and talent_fingerprint 'share-link:<link id>', selection run
-- trigger_reason 'candidate_link'), for the same candidate, claimed by this workspace, and the link still active
-- with consent. Anything else (no consent, a revoked link, any other card) keeps the normal flow: a credit, and
-- Harper asks the candidate. Nothing else changes for other cards.
--
-- Apply after 20261116090000_talent_share_links.sql. Sections 2-4 replace three live functions with copies; the
-- guard below stops the migration when one of them is neither the definition checked on production on 2026-11-16
-- (md5 of pg_get_functiondef) nor one that already has this migration's lines (a re-run), so a later production
-- change is never silently reverted. If it stops, re-copy the current definition, keep the added lines, and update
-- the md5 here.

begin;

do $$
begin
  if to_regclass('public.talent_share_links') is null then
    raise exception 'apply 20261116090000_talent_share_links.sql first';
  end if;
end;
$$;

do $$
declare
  copied record;
  definition text;
begin
  for copied in
    select * from (values
      ('public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text)',
        '3c7a7610fd236d237088f4e1dcd6e6e6'),
      ('public.request_company_intro_for_career_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint)',
        'b940a7627008799cd3274a7bff977917'),
      ('public.capture_internal_hiring_notification()',
        '10b6a85198d401289efb93e3538acb06')
    ) as copied(signature, copied_md5)
  loop
    if to_regprocedure(copied.signature) is null then
      raise exception 'share_link_free_intro: % does not exist', copied.signature;
    end if;
    definition := pg_get_functiondef(to_regprocedure(copied.signature));
    if md5(definition) <> copied.copied_md5 and position('company_intro_share_link_consent_v1' in definition) = 0
      and position('candidate_link_consent' in definition) = 0 then
      raise exception 'share_link_free_intro: % is not the definition checked on 2026-11-16 (md5 % <> %); re-copy it, keep the added lines, and update the md5 here',
        copied.signature, md5(definition), copied.copied_md5;
    end if;
  end loop;
end;
$$;

-- 1. The cards a candidate's own link made, with that candidate's consent still standing. One reader for the
--    billing wrapper, the request and the company screens (the free line, the Harper agent's fact).
create or replace function public.company_intro_share_link_consent_v1(p_intro_candidate_ids uuid[])
returns table(intro_candidate_id uuid, share_link_id uuid, consented_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select intro.id, link.id, link.consented_at
  from public.company_intro_candidates intro
  join public.company_first_search_runs run
    on run.id = intro.selection_run_id
   and run.company_workspace_id = intro.company_workspace_id
   and run.trigger_reason = 'candidate_link'
  join public.talent_share_links link
    on intro.role_fingerprint = 'share-link:' || link.id::text
   and intro.talent_fingerprint = 'share-link:' || link.id::text
  where intro.id = any(p_intro_candidate_ids)
    and intro.role_fingerprint like 'share-link:%'
    and link.talent_id = intro.talent_id
    and link.claimed_workspace_id = intro.company_workspace_id
    and link.status = 'active'
    and link.consented_at is not null;
$$;

revoke all on function public.company_intro_share_link_consent_v1(uuid[]) from public, anon, authenticated;
grant execute on function public.company_intro_share_link_consent_v1(uuid[]) to service_role;

-- 2. Free: the billing wrapper, copied from 20261007052736_workspace_agent_subscriptions.sql:273-287 (production
--    definition checked on 2026-11-16) with the share-link condition added to its debit.
create or replace function public.request_company_intro_v1(p_intro_candidate_id uuid,p_company_workspace_id uuid,p_company_user_id uuid,p_next_stage_id uuid,p_intro_recipient_emails text[],p_company_appeal text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_intro record;
begin
  if not exists(select 1 from public.company_workspace where company_workspace_id=p_company_workspace_id and billing_started_at is not null) then
    return public.request_company_intro_without_billing_v1(p_intro_candidate_id,p_company_workspace_id,p_company_user_id,p_next_stage_id,p_intro_recipient_emails,p_company_appeal);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-billing:'||p_company_workspace_id::text,0));
  v_result:=public.request_company_intro_without_billing_v1(p_intro_candidate_id,p_company_workspace_id,p_company_user_id,p_next_stage_id,p_intro_recipient_emails,p_company_appeal);
  -- 후보자 링크 (#1, added 20261117100000): a card the candidate's own link made, with their consent, costs no
  -- Intro (no credit event, so the free monthly allowance is untouched). Every other card is charged as before.
  if v_result->>'status'='requested'
    and not exists(select 1 from public.company_intro_share_link_consent_v1(array[p_intro_candidate_id])) then
    select role_id,talent_id into strict v_intro from public.company_intro_candidates where id=p_intro_candidate_id;
    perform public.workspace_billing_debit_v1(p_company_workspace_id,'intro_request',p_intro_candidate_id::text,v_intro.role_id,v_intro.talent_id,p_company_user_id,'{}',true);
  end if;
  return v_result;
end; $$;
revoke all on function public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) from public,anon,authenticated;
grant execute on function public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) to service_role;

-- 3. Accepted at once: the Career request, copied from 20261106084304_career_company_intro_agent.sql:5-30 with the
--    share-link branch added before its return. request_company_intro_for_career_with_presentation_v1 (mail button)
--    calls it, so every channel (web, chat, Slack, mail) goes through this branch.
create or replace function public.request_company_intro_for_career_v1(
 p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
 p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text,
 p_channel text, p_source_message_id bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; intro public.company_intro_candidates; accepted jsonb;
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
 -- 후보자 링크 (#1, added 20261117100000). The candidate applied to this posting and, approving the application,
 -- agreed to the link (talent_share_links.consented_at), so they are not asked again: their acceptance is recorded
 -- now, on their behalf, through the same decision function their own answer uses (decide_company_intro_request_v1,
 -- then the material pin as in decide_company_intro_request_with_material_v1). Everything after acceptance runs as
 -- for any accepted intro: connecting, talent_progress, the company update, decision events and notices here; the
 -- intro email and connected from the caller (requestOrgCompanyIntro, or connect-pending if that fails).
 -- The channel candidate_link_consent marks it as automatic (talent_decision_events.channel, the internal notice's
 -- actor "Harper 시스템(후보자 링크 동의)"). The Career run that would ask the candidate is cancelled in this same
 -- transaction, before a Worker can claim it. No consent, a revoked link or any other card: nothing here runs.
 if exists(select 1 from public.company_intro_share_link_consent_v1(array[intro.id])) then
  perform set_config('harper.feedback_source','candidate_link_consent',true);
  accepted:=public.decide_company_intro_request_v1(intro.talent_id,intro.recommendation_id,'accept',null,null);
  if accepted->>'status'='accepted' then
   perform public.pin_talent_role_material_v1(intro.talent_id,intro.recommendation_id,null,null,
     jsonb_build_object('channel','candidate_link_consent'));
   update public.opportunity_discovery_run set status='cancelled',completed_at=now(),updated_at=now(),
     error_message='candidate_link_consent: accepted from the candidate link consent; the candidate is not asked'
   where id=intro.delivery_run_id and talent_id=intro.talent_id and status='queued';
   result:=result||jsonb_build_object('candidateLinkConsent',true,'talentId',intro.talent_id,
     'candidateAcceptedAt',(select i.talent_decision_at from public.company_intro_candidates i where i.id=intro.id));
  end if;
  perform set_config('harper.feedback_source','',true);
 end if;
 return result;
end $$;
revoke all on function public.request_company_intro_for_career_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint) from public,anon,authenticated;
grant execute on function public.request_company_intro_for_career_v1(uuid,uuid,uuid,uuid,text[],text,text,bigint) to service_role;

-- 4. The internal notice for that acceptance names the link consent, not the candidate: copied from
--    20261111113000_internal_hiring_notifications.sql:42-123 with the actor line added. Triggers stay as they are.
create or replace function public.capture_internal_hiring_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare action text; actor_label text; organizer_label text; details jsonb:='{}'; previous jsonb:='{}';
begin
  if tg_op='UPDATE' then previous:=to_jsonb(old); end if;
  if tg_table_name='talent_progress' then
    if new.kind='org_stage_change' and new.metadata->>'stage' is distinct from new.metadata->>'previousStage' then
      if new.metadata->>'stage'='process_stopped' then
        action:=case when new.metadata->>'previousStage'='pending_connection' then 'company_connection_declined' else 'company_process_ended' end;
      elsif new.metadata->>'previousStage'='pending_connection' and new.metadata->>'stage' not in ('archived','pending_connection') then
        action:='company_connection_accepted';
        -- The accepted company-first Intro is connected automatically, under the
        -- original requester's account. Do not mislabel that as another human decision.
        if exists(select 1 from public.company_intro_candidates i where i.recommendation_id=new.recommendation_id
          and i.talent_decision_at is not null and i.status in ('connecting','connected')) then
          action:='intro_connected'; actor_label:='Harper 시스템';
        end if;
      end if;
      details:=jsonb_build_object('notifyCandidate',new.metadata->'notifyCandidateOnClosure','channel',new.metadata->>'decisionChannel');
    elsif new.kind='candidate_role_recommendation_accepted' then
      action:='candidate_recommendation_accepted';
      select coalesce(nullif(name,''),email)||'(후보자)' into actor_label from public.talent_users where user_id=new.talent_id;
    end if;
    if action is not null then
      perform public.record_internal_hiring_notification('progress:'||new.id,new.role_id,new.talent_id,action,
        new.company_user_id,actor_label,details,new.created_at);
    end if;
  elsif tg_table_name='company_decision_events' then
    if new.action='pass' and new.subject_kind='member_candidate' and new.intro_candidate_id is not null then
      perform public.record_internal_hiring_notification('company-pass:'||new.id,new.role_id,new.subject_id,
        'company_intro_passed',new.actor_user_id,null,jsonb_build_object('channel',new.channel),new.created_at);
    end if;
  elsif tg_table_name='company_intro_candidates' then
    if new.requested_at is not null and previous->>'requested_at' is distinct from to_jsonb(new)->>'requested_at' then
      perform public.record_internal_hiring_notification('intro-request:'||new.id||':'||new.requested_at,new.role_id,new.talent_id,
        'intro_requested',new.requested_by_company_user_id,null,'{}',new.requested_at);
    end if;
    if new.candidate_sent_at is not null and previous->>'candidate_sent_at' is distinct from to_jsonb(new)->>'candidate_sent_at' then
      perform public.record_internal_hiring_notification('intro-sent:'||new.id||':'||new.candidate_sent_at,new.role_id,new.talent_id,
        'intro_sent',null,'Harper 시스템','{}',new.candidate_sent_at);
    end if;
    if new.talent_decision_at is not null and previous->>'talent_decision_at' is distinct from to_jsonb(new)->>'talent_decision_at' then
      action:=case when new.close_reason='talent_declined' then 'candidate_intro_declined'
        when new.status in ('connecting','connected') then 'candidate_intro_accepted' end;
      if action is not null then
        select coalesce(nullif(name,''),email)||'(후보자)' into actor_label from public.talent_users where user_id=new.talent_id;
        -- 후보자 링크 (#1, added 20261117100000): accepted from the link consent, not by the candidate just now.
        if action='candidate_intro_accepted' and current_setting('harper.feedback_source',true)='candidate_link_consent' then
          actor_label:='Harper 시스템(후보자 링크 동의)';
        end if;
        perform public.record_internal_hiring_notification('intro-decision:'||new.id||':'||new.talent_decision_at,new.role_id,new.talent_id,
          action,null,actor_label,'{}',new.talent_decision_at);
      end if;
    end if;
  elsif tg_table_name='career_email_messages' then
    if new.direction='outbound' and new.status='sent' and previous->>'status' is distinct from 'sent'
      and (new.mail_type='org_intro' or new.metadata->>'emailKind'='orgIntro')
      and nullif(new.metadata->>'resendEmailId','') is not null then
      perform public.record_internal_hiring_notification('connection-email:'||new.id,(new.metadata->>'roleId')::uuid,new.talent_id,
        'connection_email_sent',null,'Harper 시스템',jsonb_build_object('requester',new.metadata->>'companyUserName'),new.occurred_at);
    end if;
  elsif tg_table_name='meeting_schedules' then
    if new.status='confirmed' and previous->>'status' is distinct from 'confirmed' then action:='meeting_confirmed';
    elsif new.status='confirmed' and (previous->>'confirmed_start_at' is distinct from to_jsonb(new)->>'confirmed_start_at'
      or previous->>'confirmed_end_at' is distinct from to_jsonb(new)->>'confirmed_end_at') then action:='meeting_rescheduled';
    elsif new.status='cancelled' and previous->>'status'='confirmed' then action:='meeting_cancelled'; end if;
    if action is not null then
      -- Organizer is a separate fact, never assumed to be the person who changed it.
      select coalesce(nullif(name,''),email) into organizer_label from public.company_users where user_id=new.organizer_company_user_id;
      if previous#>>'{source_refs,calendarMutation,operationKey}' is distinct from new.source_refs#>>'{calendarMutation,operationKey}' then
        actor_label:=new.source_refs#>>'{calendarMutation,actorLabel}';
      elsif action='meeting_confirmed' and previous->>'status'='awaiting_talent' and exists(
        select 1 from public.meeting_schedule_rounds r where r.id=new.active_round_id and r.status='confirmed'
          and r.submitted_at=new.updated_at and jsonb_array_length(coalesce(r.candidate_options,'[]'))>0
      ) then
        select coalesce(nullif(name,''),email)||'(후보자·예약 링크 제출)' into actor_label from public.talent_users where user_id=new.talent_id;
      end if;
      perform public.record_internal_hiring_notification('meeting:'||new.id||':'||new.version||':'||action,new.role_id,new.talent_id,
        action,null,coalesce(actor_label,'Harper 시스템(일정 기록·변경자 미기록)'),
        jsonb_build_object('startsAt',new.confirmed_start_at,'endsAt',new.confirmed_end_at,'timezone',new.timezone,
          'previousStartsAt',previous->>'confirmed_start_at','previousEndsAt',previous->>'confirmed_end_at','organizer',organizer_label),new.updated_at);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.capture_internal_hiring_notification() from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
