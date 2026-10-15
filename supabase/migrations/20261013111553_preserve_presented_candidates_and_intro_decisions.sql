-- Service-owned event queue. Facts are evidence, not new company authorization.
-- Stage safely before the new consumer is deployed. A compatible caller explicitly
-- releases its exact job; legacy consumers cannot silently discard the new action.
create or replace function public.enqueue_company_update_v1(
  p_workspace_id uuid, p_role_id uuid, p_event_key text, p_purpose text, p_facts jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $function$
declare v_job uuid; v_actor uuid; v_conversation uuid; v_anchor bigint;
begin
  if nullif(btrim(p_event_key),'') is null or jsonb_typeof(p_facts) is distinct from 'object' then
    raise exception 'invalid_company_update';
  end if;
  if not exists(select 1 from public.company_roles where role_id=p_role_id and company_workspace_id=p_workspace_id) then
    raise exception 'company_update_role_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('company-update:'||p_workspace_id::text||':'||p_event_key,0));
  select id into v_job from public.company_agent_web_action_jobs
    where idempotency_key='company-update:'||p_workspace_id::text||':'||p_event_key;
  if v_job is not null then return v_job; end if;
  select company_user_id into v_actor from public.company_user_workspace
    where company_workspace_id=p_workspace_id and authority='owner' order by id limit 1;
  insert into public.company_conversations(company_workspace_id,role_id,metadata)
    values(p_workspace_id,p_role_id,'{"phase":"completed","scope":"role_creation"}') on conflict do nothing;
  select id into strict v_conversation from public.company_conversations
    where company_workspace_id=p_workspace_id and role_id=p_role_id;
  v_job:=gen_random_uuid();
  insert into public.company_messages(company_workspace_id,conversation_id,role_id,company_user_id,role,content,message_type,status,metadata)
    values(p_workspace_id,v_conversation,p_role_id,v_actor,'user','company_update','web_action','completed',
      jsonb_build_object('source','company_update','webActionJobId',v_job)) returning id into v_anchor;
  insert into public.company_agent_web_action_jobs(id,company_workspace_id,conversation_id,role_id,actor_user_id,anchor_message_id,
    action_name,action_context,idempotency_key,status,queue_dispatch_status,last_error)
    values(v_job,p_workspace_id,v_conversation,p_role_id,v_actor,v_anchor,'company_update',
      jsonb_build_object('purpose',p_purpose,'facts',p_facts),
      'company-update:'||p_workspace_id::text||':'||p_event_key,
      'failed', 'failed',
      case when v_actor is null then 'company_update_owner_missing' else 'company_update_runtime_required' end);
  return v_job;
end;
$function$;
revoke all on function public.enqueue_company_update_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_company_update_v1(uuid,uuid,text,text,jsonb) to service_role;

-- Existing company introductions survive contact/profile preference changes.
-- No historical decision is reopened or backfilled by this migration.

CREATE OR REPLACE FUNCTION public.set_talent_progress_audiences_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_original_text text := new.text;
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.kind in ('candidate_contact_preferences_changed', 'company_intro_decision') then
    new.open_to_talent := true;
    new.open_to_company := true;
  elsif new.kind in ('memo', 'saved_stage_changed') then
    new.open_to_talent := true;
    new.open_to_company := false;
  elsif new.kind = 'candidate_requested_connection' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := '이 역할의 우선 검토를 요청했습니다.';
  elsif new.kind = 'internal_fit_question_asked' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := 'Harper가 이 역할의 적합성을 확인하는 질문을 보냈습니다.';
  elsif new.kind = 'internal_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := 'Harper가 이 역할의 진행 확인 연락을 보냈습니다.';
  elsif new.kind = 'internal_process_stopped_notified' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := case new.metadata ->> 'closureKind'
      when 'role_ended' then 'Harper가 이 역할의 채용 종료를 안내했습니다.'
      when 'company_process_stopped' then 'Harper가 회사의 결정으로 이 역할의 프로세스 종료를 안내했습니다.'
      else 'Harper가 이 역할의 프로세스 종료를 안내했습니다.' end;
  elsif new.kind = 'company_request_followup_sent' then
    new.open_to_talent := true;
    new.open_to_company := true;
    new.text := 'Harper가 이 역할에 관한 회사의 요청을 다시 안내했습니다.';
  elsif new.kind = 'candidate_role_recommendation_presented' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := 'Harper가 이 역할을 제안했습니다.';
  elsif new.kind = 'candidate_role_recommendation_accepted' then
    new.open_to_talent := true;
    new.open_to_company := false;
    new.text := '이 역할의 제안을 수락했습니다.';
  elsif new.kind = 'org_candidate_activity' then
    new.open_to_talent := coalesce(new.metadata ->> 'eventType' in
      ('candidate_contact_sent', 'candidate_message_delivered',
       'candidate_response_received'), false);
    new.open_to_company := new.open_to_talent;
    -- The same delivered message is available to both parties.
  elsif new.kind = 'org_stage_change' then
    -- A candidate's actual process stop is shared with both parties, unlike
    -- their private Career saved-stage changes.
    new.open_to_talent := coalesce(
      new.metadata ->> 'stage' = 'process_stopped'
        and new.metadata ->> 'stopReason' = 'candidate',
      false
    );
    new.open_to_company := true;
    new.text := case
      when new.metadata ->> 'stage' = 'process_stopped'
        and new.metadata ->> 'stopReason' = 'candidate'
        then '후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      when new.metadata ->> 'stage' = 'connected'
        or nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
        then '회사에서 이 역할의 진행을 수락했습니다.'
          || case when nullif(btrim(new.metadata ->> 'acceptReason'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'acceptReason') else '' end
      when new.metadata ->> 'stage' = 'process_stopped'
        or nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
        then '회사에서 이 역할의 채용 프로세스를 중단했습니다.'
          || case when nullif(btrim(new.metadata ->> 'stopNote'), '') is not null
            then E'\n이유: ' || btrim(new.metadata ->> 'stopNote') else '' end
      else new.text end;
  elsif new.kind in ('org_note', 'org_candidate_role_move') then
    new.open_to_talent := false;
    new.open_to_company := true;
  elsif new.kind = 'org_slack_profile_view' then
    new.open_to_talent := false;
    new.open_to_company := true;
    new.text := '후보자 프로필을 열람했습니다.';
  elsif new.kind = 'intro_to_company' then
    new.open_to_talent := false;
    new.open_to_company := coalesce(new.metadata ->> 'deliveryStatus' = 'sent', false);
    if new.open_to_company then
      new.text := 'Harper가 후보자 정보를 회사에 전달했습니다.';
    end if;
  else
    new.open_to_talent := false;
    new.open_to_company := false;
  end if;

  if new.text is distinct from v_original_text
      and not (new.metadata ? '_internal_original_text') then
    new.metadata := new.metadata || jsonb_build_object(
      '_internal_original_text', v_original_text
    );
  end if;
  return new;
end;
$function$
;
-- Preference changes affect future matching/contact, never an existing decision.
create or replace function public.close_company_intro_on_privacy_change_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if (old.profile_visibility, old.get_internal_recommendation, old.blocked_companies)
      is not distinct from (new.profile_visibility, new.get_internal_recommendation, new.blocked_companies) then
    return new;
  end if;
  insert into public.talent_progress(talent_id,role_id,recommendation_id,kind,text,metadata,open_to_company,open_to_talent)
  select new.user_id, pair.role_id, pair.recommendation_id,
    'candidate_contact_preferences_changed',
    '후보자가 향후 추천·연락·공개 설정을 변경했습니다. 기존 소개와 제안의 결정은 변경되지 않았습니다.',
    jsonb_build_object('profileVisibility',new.profile_visibility,
      'internalRecommendationEnabled',new.get_internal_recommendation,
      'existingIntroDecisionChanged',false),true,true
  from (
    select role_id,recommendation_id from public.company_intro_candidates where talent_id=new.user_id
    union
    select role_id,recommendation_id from public.talent_progress
      where talent_id=new.user_id and kind='intro_to_company' and open_to_company=true
  ) pair;
  return new;
end;
$function$;
revoke all on function public.close_company_intro_on_privacy_change_v1() from public, anon, authenticated;

create or replace function public.record_company_intro_decision_progress_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if new.close_reason='talent_declined' and
     (old.close_reason is distinct from new.close_reason or old.talent_decision_at is distinct from new.talent_decision_at) then
    insert into public.talent_progress(talent_id,role_id,recommendation_id,kind,text,metadata,open_to_company,open_to_talent)
    values(new.talent_id,new.role_id,new.recommendation_id,'company_intro_decision',
      '후보자가 이 회사의 제안을 거절했습니다.',
      jsonb_build_object('introCandidateId',new.id,'decision','declined','decidedAt',new.talent_decision_at),true,true);
    perform public.enqueue_company_update_v1(new.company_workspace_id,new.role_id,
      'intro-declined:'||new.id::text,
      'Tell the company about the candidate decision and what it means for their hiring conversation.',
      jsonb_build_object('candidateName',(select name from public.talent_users where user_id=new.talent_id),
        'roleName',(select name from public.company_roles where role_id=new.role_id),
        'candidateDecision','declined','decisionAt',new.talent_decision_at,
        'companyIntroWasRequestedAt',new.requested_at,'candidateReceivedIntroAt',new.candidate_sent_at,
        'privateReasonShared',false));
  end if;
  return new;
end;
$function$;
revoke all on function public.record_company_intro_decision_progress_v1() from public, anon, authenticated;
drop trigger if exists company_intro_decision_progress on public.company_intro_candidates;
create trigger company_intro_decision_progress after update of status,close_reason,talent_decision_at
on public.company_intro_candidates for each row execute function public.record_company_intro_decision_progress_v1();

CREATE OR REPLACE FUNCTION public.request_company_intro_without_billing_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid, p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_intro public.company_intro_candidates%rowtype;
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_setting public.talent_setting%rowtype;
  v_conversation_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_recommendation_id uuid := gen_random_uuid();
  v_stage text;
  v_emails text[];
  v_appeal text := nullif(btrim(coalesce(p_company_appeal, '')), '');
begin
  if p_intro_candidate_id is null
    or p_company_workspace_id is null
    or p_company_user_id is null then
    raise exception using errcode = '22023', message = 'company_intro_missing_input';
  end if;

  if not exists (
    select 1
    from public.company_user_workspace membership
    where membership.company_user_id = p_company_user_id
      and membership.company_workspace_id = p_company_workspace_id
  ) then
    raise exception using errcode = '42501', message = 'company_intro_workspace_forbidden';
  end if;

  select intro.* into v_intro from public.company_intro_candidates intro
  where intro.id = p_intro_candidate_id and intro.company_workspace_id = p_company_workspace_id;
  if v_intro.id is null then raise exception using errcode = 'P0002', message = 'company_intro_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || v_intro.talent_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('company_talent_route:' || p_company_workspace_id::text || ':' || v_intro.talent_id::text, 0));

  select intro.* into v_intro
  from public.company_intro_candidates intro
  where intro.id = p_intro_candidate_id
    and intro.company_workspace_id = p_company_workspace_id
  for update;
  if v_intro.id is null then
    raise exception using errcode = 'P0002', message = 'company_intro_not_found';
  end if;
  if v_intro.status = 'awaiting_talent' then
    return jsonb_build_object(
      'status', 'already_requested',
      'introCandidateId', v_intro.id,
      'deliveryRunId', v_intro.delivery_run_id,
      'recommendationId', v_intro.recommendation_id
    );
  end if;
  if v_intro.status = 'closed' and v_intro.close_reason = 'route_replaced' then
    select tag.tag into v_stage from public.talent_opportunity_tag tag
      where tag.talent_id = v_intro.talent_id and tag.opportunity_id = v_intro.role_id
        and (tag.tag like '내부:%' or tag.tag like '내부단계:%')
      order by tag.updated_at desc, tag.created_at desc, tag.id desc limit 1;
    return jsonb_build_object('status','already_in_pipeline','introCandidateId',v_intro.id,
      'roleId',v_intro.role_id,'talentId',v_intro.talent_id,'stageTag',v_stage,
      'candidateAcceptedAt',v_intro.talent_decision_at,'newIntroCreated',false);
  end if;
  if v_intro.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'company_intro_not_requestable';
  end if;

  v_emails := array(
    select distinct lower(btrim(email))
    from unnest(coalesce(p_intro_recipient_emails, '{}'::text[])) email
    where btrim(email) <> ''
    order by lower(btrim(email))
  );
  if cardinality(v_emails) = 0
    or exists (
      select 1 from unnest(v_emails) email
      where email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) then
    raise exception using errcode = '22023', message = 'company_intro_invalid_recipients';
  end if;
  if v_appeal is null then
    raise exception using errcode = '22023', message = 'company_intro_appeal_required';
  end if;

  select role.* into v_role
  from public.company_roles role
  where role.role_id = v_intro.role_id
    and role.company_workspace_id = p_company_workspace_id
  for share;
  if v_role.role_id is null
    or lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now)
    or not exists (
      select 1 from public.company_internal_roles internal_role
      where internal_role.role_id = v_role.role_id
    )
    or not public.company_intro_role_allows_talent_v1(
      v_role.information,
      v_intro.talent_id
    ) then
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'role_closed',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    return jsonb_build_object(
      'status', 'role_unavailable', 'introCandidateId', v_intro.id
    );
  end if;
  if p_next_stage_id is not null and not exists (
    select 1 from public.ops_matching_role_stages stage
    where stage.id = p_next_stage_id and stage.role_id = v_intro.role_id
  ) then
    raise exception using errcode = '22023', message = 'company_intro_next_stage_invalid';
  end if;

  select setting.* into v_setting
  from public.talent_setting setting
  join public.talent_users talent on talent.user_id = setting.user_id
  where setting.user_id = v_intro.talent_id
    and talent.deleted_at is null
  for share of setting;
  if v_setting.user_id is null
    or v_setting.is_onboarding_done is not true
    or lower(btrim(coalesce(v_setting.profile_visibility, ''))) <> 'open_to_matches'
    or v_setting.get_internal_recommendation is false then
    return jsonb_build_object(
      'status', 'talent_unavailable', 'introCandidateId', v_intro.id
    );
  end if;

  select workspace.* into v_workspace
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_company_workspace_id;
  if exists (
    select 1
    from unnest(coalesce(v_setting.blocked_companies, '{}'::text[])) blocked(name)
    where lower(btrim(blocked.name)) in (
      lower(btrim(v_workspace.company_name)),
      lower(btrim(coalesce(v_workspace.published_name, '')))
    )
  ) then
    return jsonb_build_object(
      'status', 'talent_unavailable', 'introCandidateId', v_intro.id
    );
  end if;

  select conversation.id into v_conversation_id
  from public.talent_conversations conversation
  where conversation.user_id = v_intro.talent_id
  order by conversation.updated_at desc, conversation.created_at desc
  limit 1;

  insert into public.opportunity_discovery_run (
    id, talent_id, conversation_id, run_mode, status, trigger,
    target_recommendation_count, settings_snapshot, trigger_payload,
    dedupe_key
  ) values (
    v_run_id, v_intro.talent_id, v_conversation_id, 'immediate', 'queued',
    'immediate_opportunity_requested', 1,
    jsonb_build_object(
      'getExternalRecommendation', false,
      'profileVisibility', v_setting.profile_visibility,
      'recommendationBatchSize', 1
    ),
    jsonb_build_object(
      'entryPoint', 'company_first_intro_request',
      'opportunityAgentVariant', 'new_harper_agent_v2',
      'source', 'company_first_intro_request',
      'companyIntroCandidateId', v_intro.id,
      'manualInternalRecommendation', jsonb_build_object(
        'allowRepeat', true,
        'companyAppeal', v_appeal,
        'companyIntroCandidateId', v_intro.id,
        'companyName', v_workspace.company_name,
        'reason', v_intro.selection_reason,
        'requestedAt', v_now,
        'requestedBy', p_company_user_id,
        'roleId', v_intro.role_id,
        'roleName', v_role.name,
        'source', 'company_first_intro_request',
        'type', 'company_first_intro_request'
      ),
      'recommendationPolicy', jsonb_build_object(
        'external', 'none', 'internal', 'forced_single_role'
      )
    ),
    'company_first_intro_request:' || v_intro.id::text || ':' || v_intro.revision::text
  );

  update public.company_intro_candidates
  set status = 'awaiting_talent', requested_by_company_user_id = p_company_user_id,
      requested_at = v_now, company_appeal = v_appeal,
      next_stage_id = p_next_stage_id, intro_recipient_emails = v_emails,
      delivery_run_id = v_run_id, close_reason = null,
      revision = revision + 1, updated_at = v_now
  where id = v_intro.id;

  insert into public.talent_opportunity_recommendation (
    id, discovery_run_id, evidence, fit_reasons, kind, opportunity_type,
    preference_fit, rank, role_id, talent_id, tradeoffs
  ) values (
    v_recommendation_id,v_run_id,jsonb_build_object('preFinalDelivery',true,'sourceType','internal'),
    '[]'::jsonb,'worker','intro_request','{}'::jsonb,1,v_intro.role_id,v_intro.talent_id,'[]'::jsonb
  );
  update public.company_intro_candidates set recommendation_id = v_recommendation_id
    where id = v_intro.id;

  return jsonb_build_object(
    'status', 'requested',
    'recommendationId', v_recommendation_id,
    'introCandidateId', v_intro.id,
    'deliveryRunId', v_run_id,
    'nextStageId', p_next_stage_id,
    'requestedAt', v_now
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.decide_company_intro_request_v1(p_talent_id uuid, p_recommendation_id uuid, p_decision text, p_feedback_reason text DEFAULT NULL::text, p_email_acceptance_confirmation jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_intro public.company_intro_candidates%rowtype;
  v_role public.company_roles%rowtype;
  v_setting public.talent_setting%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_changed boolean := false;
  v_role_available boolean := false;
begin
  if lower(btrim(coalesce(p_decision, ''))) not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'company_intro_decision_invalid';
  end if;
  if p_email_acceptance_confirmation is not null
    and jsonb_typeof(p_email_acceptance_confirmation) <> 'object' then
    raise exception using errcode = '22023', message = 'company_intro_confirmation_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talent-role-recommendation-change:' || p_talent_id::text, 0)
  );
  select intro.* into v_intro
  from public.company_intro_candidates intro
  join public.talent_opportunity_recommendation recommendation
    on recommendation.id = intro.recommendation_id
   and recommendation.talent_id = p_talent_id
   and recommendation.opportunity_type = 'intro_request'
  where intro.recommendation_id = p_recommendation_id
    and intro.talent_id = p_talent_id
  for update of intro;
  if v_intro.id is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_not_found');
  end if;

  if lower(btrim(p_decision)) = 'decline' then
    if v_intro.status in ('connecting', 'connected') then
      return jsonb_build_object(
        'status', 'unavailable', 'reason', 'already_accepted',
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id,
        'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
        'introRecipientEmails', v_intro.intro_recipient_emails
      );
    end if;
    if v_intro.status = 'passed' or (v_intro.status = 'closed' and v_intro.close_reason is distinct from 'privacy_withdrawn') then
      return jsonb_build_object(
        'status', 'no_change', 'reason', coalesce(v_intro.close_reason, 'already_closed'),
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id,
        'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
        'introRecipientEmails', v_intro.intro_recipient_emails
      );
    end if;
    if v_intro.status <> 'awaiting_talent' and not (v_intro.status = 'closed' and v_intro.close_reason = 'privacy_withdrawn') then
      return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_not_awaiting');
    end if;
    update public.talent_opportunity_recommendation
    set feedback = 'dislike', feedback_at = v_now,
        feedback_reason = nullif(btrim(coalesce(p_feedback_reason, '')), ''),
        saved_stage = null, email_acceptance_confirmation = coalesce(
          p_email_acceptance_confirmation, email_acceptance_confirmation
        ), updated_at = v_now
    where id = p_recommendation_id and talent_id = p_talent_id;
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'talent_declined',
        talent_decision_at = v_now, revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id and opportunity_id = v_intro.role_id
      and (tag like '내부:%' or tag like '내부단계:%');
    v_changed := true;
  else
    if v_intro.status = 'connected' then
      return jsonb_build_object(
        'status', 'no_change', 'reason', 'already_connected',
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id, 'nextStageId', v_intro.next_stage_id
      );
    end if;
    if v_intro.status = 'connecting' then
      return jsonb_build_object(
        'status', 'accepted', 'reason', 'acceptance_already_committed',
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id,
        'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
        'introRecipientEmails', v_intro.intro_recipient_emails
      );
    end if;
    if v_intro.status <> 'awaiting_talent' then
      return jsonb_build_object(
        'status', 'unavailable',
        'reason', coalesce(v_intro.close_reason, 'company_intro_not_awaiting'),
        'introCandidateId', v_intro.id,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id
      );
    end if;

    select setting.* into v_setting
    from public.talent_setting setting
    join public.talent_users talent on talent.user_id = setting.user_id
    where setting.user_id = p_talent_id and talent.deleted_at is null;
    select role.* into v_role
    from public.company_roles role where role.role_id = v_intro.role_id;
    select workspace.* into v_workspace
    from public.company_workspace workspace
    where workspace.company_workspace_id = v_intro.company_workspace_id;

    v_role_available :=
      v_role.role_id is not null
      and lower(btrim(coalesce(v_role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(v_role.status, ''))) in ('active', 'paused', 'top_priority')
      and coalesce(v_role.is_expired, false) is false
      and (v_role.expires_at is null or v_role.expires_at > v_now)
      and exists (
        select 1 from public.company_internal_roles internal_role
        where internal_role.role_id = v_role.role_id
      )
      and public.company_intro_role_allows_talent_v1(
        v_role.information,
        p_talent_id
      );

    if v_setting.user_id is null
      or v_setting.is_onboarding_done is not true
      or v_workspace.company_workspace_id is null
      or exists (
        select 1
        from unnest(coalesce(v_setting.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (
          lower(btrim(v_workspace.company_name)),
          lower(btrim(coalesce(v_workspace.published_name, '')))
        )
      )
      or not v_role_available then
      update public.company_intro_candidates
      set status = 'closed',
          close_reason = case when not v_role_available
            then 'role_closed' else 'privacy_withdrawn' end,
          revision = revision + 1,
          updated_at = v_now
      where id = v_intro.id;
      update public.talent_opportunity_recommendation
      set saved_stage = 'closed',
          dismissed_at = coalesce(dismissed_at, v_now),
          updated_at = v_now
      where id = p_recommendation_id and talent_id = p_talent_id;
      return jsonb_build_object(
        'status', 'unavailable',
        'reason', case when not v_role_available
          then 'role_closed' else 'privacy_withdrawn' end,
        'introCandidateId', v_intro.id,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id
      );
    end if;

    update public.talent_opportunity_recommendation
    set feedback = 'like', feedback_at = v_now,
        feedback_reason = nullif(btrim(coalesce(p_feedback_reason, '')), ''),
        saved_stage = 'connected', email_acceptance_confirmation = coalesce(
          p_email_acceptance_confirmation, email_acceptance_confirmation
        ), updated_at = v_now
    where id = p_recommendation_id and talent_id = p_talent_id;
    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id and opportunity_id = v_intro.role_id
      and (tag like '내부:%' or tag like '내부단계:%');
    insert into public.talent_opportunity_tag (talent_id, opportunity_id, tag)
    values (p_talent_id, v_intro.role_id, '내부:연결대기');
    update public.company_intro_candidates
    set status = 'connecting', close_reason = null,
        talent_decision_at = v_now, revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    v_changed := true;
  end if;

  return jsonb_build_object(
    'status', case when lower(btrim(p_decision)) = 'accept' then 'accepted' else 'declined' end,
    'introCandidateId', v_intro.id,
    'decisionChanged', v_changed,
    'companyWorkspaceId', v_intro.company_workspace_id,
    'roleId', v_intro.role_id,
    'nextStageId', v_intro.next_stage_id,
    'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
    'introRecipientEmails', v_intro.intro_recipient_emails
  );
end;
$function$
;


-- Rolling compatibility: an older Worker may still attempt preference-only closure.
-- Preserve the durable introduction; actual deletion/company block remains a boundary.
create or replace function public.preserve_company_intro_on_preference_only_closure_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if new.status='closed' and new.close_reason='privacy_withdrawn'
      and old.status in ('ready','awaiting_talent','connecting')
      and exists (
        select 1 from public.talent_users talent
        join public.talent_setting setting on setting.user_id=talent.user_id
        join public.company_workspace workspace on workspace.company_workspace_id=old.company_workspace_id
        where talent.user_id=old.talent_id and talent.deleted_at is null
          and setting.is_onboarding_done is true
          and not exists(select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
            where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      )
  then return old; end if;
  return new;
end;
$function$;
revoke all on function public.preserve_company_intro_on_preference_only_closure_v1() from public,anon,authenticated;
drop trigger if exists company_intro_preserve_preference_only_closure on public.company_intro_candidates;
create trigger company_intro_preserve_preference_only_closure before update of status,close_reason
on public.company_intro_candidates for each row execute function public.preserve_company_intro_on_preference_only_closure_v1();
