-- A confirmed web move reuses the existing transactional pipeline move.
-- Ready proposals stay company-only; their old Role-specific assessment is not reused.
-- No production data is changed by defining this service-role-only entry point.
create or replace function public.move_org_candidate_role_web_v1(
  p_workspace_id uuid, p_talent_id uuid, p_source_role_id uuid, p_target_role_id uuid,
  p_recommendation_id text, p_expected_stage text, p_target_stage text,
  p_request_id uuid, p_actor_id uuid, p_conversation_id uuid,
  p_method text default 'direct', p_confirmed_directly boolean default false,
  p_subject text default null, p_body text default null, p_context text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.company_roles%rowtype;
  v_target public.company_roles%rowtype;
  v_intro public.company_intro_candidates%rowtype;
  v_new_intro_id uuid;
  v_message_id bigint;
  v_result jsonb;
  v_stage text;
  v_plan jsonb;
  v_source_updated_at timestamptz;
  v_contact jsonb;
  v_recommendation_id uuid;
  v_key text := 'org-web-role-move:' || p_actor_id::text || ':' || p_request_id::text;
begin
  if p_method not in ('direct','ask_candidate') then raise exception 'Invalid move method'; end if;
  if p_expected_stage not in ('company_intro','intro_requested') and p_method='direct' and p_confirmed_directly is not true then
    return jsonb_build_object('status','direct_confirmation_required');
  end if;
  -- Same lock order as Intro requests and candidate responses.
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('company_talent_route:' || p_workspace_id::text || ':' || p_talent_id::text, 0));
  if not exists(select 1 from public.company_conversations where id=p_conversation_id
    and company_workspace_id=p_workspace_id and role_id=p_source_role_id) then
    raise exception 'Invalid move conversation' using errcode='42501';
  end if;
  select metadata->'roleMoveResult' into v_result from public.company_messages
    where company_workspace_id=p_workspace_id and company_user_id=p_actor_id
      and metadata->>'roleMoveRequestKey'=v_key and role_id=p_source_role_id
      and metadata->>'targetRoleId'=p_target_role_id::text
      and metadata->>'talentId'=p_talent_id::text
    order by id desc limit 1;
  if v_result is not null then return v_result; end if;

  -- Ordered row locks also serialize with the existing pipeline mover.
  perform 1 from public.company_roles where role_id in(p_source_role_id,p_target_role_id)
    order by role_id for update;
  select * into v_source from public.company_roles where role_id=p_source_role_id
    and company_workspace_id=p_workspace_id and source_type='internal';
  select * into v_target from public.company_roles where role_id=p_target_role_id
    and company_workspace_id=p_workspace_id and source_type='internal';
  if v_source.role_id is null or v_target.role_id is null or p_source_role_id=p_target_role_id
    or coalesce(v_target.status,'') not in ('active','open','top_priority','paused')
    or coalesce(v_target.is_expired,false) or v_target.expires_at <= now()
    or public.company_intro_role_allows_talent_v1(v_target.information,p_talent_id) is not true then
    return jsonb_build_object('status','target_role_unavailable');
  end if;
  if not exists(select 1 from public.talent_users where user_id=p_talent_id and deleted_at is null) then
    return jsonb_build_object('status','state_changed');
  end if;
  if exists(select 1 from public.company_intro_candidates where role_id=p_target_role_id
    and talent_id=p_talent_id and status in ('ready','awaiting_talent','connecting')) then
    return jsonb_build_object('status','target_has_intro');
  end if;
  if exists(select 1 from public.talent_opportunity_tag where opportunity_id=p_target_role_id
    and talent_id=p_talent_id and (tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag like '내부단계:%')) then
    return jsonb_build_object('status','already_in_target_pipeline');
  end if;

  if p_method='ask_candidate' and exists (
    select 1 from public.company_talent_requests request join public.company_messages message
      on message.id=request.source_company_message_id
    where request.company_workspace_id=p_workspace_id and request.talent_id=p_talent_id
      and request.workflow_status in ('draft','queued','awaiting_talent','relay_queued','review_required','failed')
      and message.metadata->'approvedRoleMove' is not null
      and message.metadata->'roleMoveOutcome' is null
      -- Ordinary candidate contacts belong to the connection, not necessarily
      -- one request. A received reply allows the company to make a new request.
      and not exists (
        select 1 from public.company_talent_relays relay
        join public.talent_messages reply on reply.id=relay.source_talent_message_id
        join public.contact_queue delivery on delivery.company_talent_relay_id=relay.id
        where relay.recommendation_id=request.recommendation_id
          and reply.user_id=p_talent_id and reply.role='user' and reply.created_at>=request.created_at
          and delivery.type='company_contact_company_delivery'
          and delivery.status in ('queued','processing','failed','sent')
      )
  ) then return jsonb_build_object('status','request_pending'); end if;

  if p_recommendation_id like 'company-intro:%' then
    select * into v_intro from public.company_intro_candidates
      where id=substring(p_recommendation_id from 15)::uuid and company_workspace_id=p_workspace_id
        and role_id=p_source_role_id and talent_id=p_talent_id for update;
    if v_intro.status in ('awaiting_talent','connecting') then
      return jsonb_build_object('status','intro_pending');
    end if;
    if v_intro.id is null or v_intro.status<>'ready' or p_expected_stage<>'company_intro'
      or p_target_stage<>'company_intro' or p_method<>'direct' then
      return jsonb_build_object('status','state_changed');
    end if;
    update public.company_intro_candidates set status='closed',close_reason='role_moved',
      revision=revision+1,updated_at=now() where id=v_intro.id;
    insert into public.company_intro_candidates(company_workspace_id,role_id,talent_id,status,
      selection_run_id,selection_reason,role_fingerprint,talent_fingerprint,presentation)
    values(p_workspace_id,p_target_role_id,p_talent_id,'ready',v_intro.selection_run_id,
      '회사 요청으로 다른 Role의 제안 목록에서 이동한 후보입니다.',
      'company-role-move:'||p_request_id::text,v_intro.talent_fingerprint,
      jsonb_build_object('roleMove',jsonb_build_object('sourceIntroCandidateId',v_intro.id,
        'sourceRoleId',p_source_role_id,'actorId',p_actor_id,'requestId',p_request_id)))
    returning id into v_new_intro_id;
    v_result := jsonb_build_object('status','moved','targetRoleId',p_target_role_id,
      'targetRecommendationId','company-intro:'||v_new_intro_id::text);
  else
    select id into v_recommendation_id from public.talent_opportunity_recommendation
      where id=p_recommendation_id::uuid and role_id=p_source_role_id and talent_id=p_talent_id for update;
    select case tag
      when '내부:연결대기' then 'pending_connection' when '내부:연결됨' then 'connected'
      when '내부:최종오퍼' then 'final_offer' when '내부:프로세스중단' then 'process_stopped'
      when '내부:아카이브' then 'archived'
      else (select 'custom:'||id::text from public.ops_matching_role_stages
        where role_id=p_source_role_id and replace(id::text,'-','')=substring(tag from 6) limit 1) end
      into v_stage from public.talent_opportunity_tag
      where talent_id=p_talent_id and opportunity_id=p_source_role_id
        and (tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:아카이브') or tag like '내부단계:%')
      order by updated_at desc,created_at desc,id desc limit 1 for update;
    if v_recommendation_id is null or v_recommendation_id is distinct from (
      select id from public.talent_opportunity_recommendation where talent_id=p_talent_id and role_id=p_source_role_id
      order by updated_at desc,created_at desc,id desc limit 1
    ) or v_stage is distinct from p_expected_stage
      or (v_stage='pending_connection' and p_target_stage<>'pending_connection') then
      return jsonb_build_object('status','state_changed');
    end if;
    if p_target_stage not in ('pending_connection','connected','final_offer') and not exists(
      select 1 from public.ops_matching_role_stages where role_id=p_target_role_id and 'custom:'||id::text=p_target_stage
    ) then return jsonb_build_object('status','target_stage_not_found'); end if;
    select greatest(
      (select updated_at from public.talent_opportunity_recommendation where id=v_recommendation_id),
      (select max(updated_at) from public.talent_opportunity_tag where talent_id=p_talent_id and opportunity_id=p_source_role_id)
    ) into v_source_updated_at;
  end if;

  v_plan := jsonb_build_object('workspaceId',p_workspace_id,'talentId',p_talent_id,
    'sourceRoleId',p_source_role_id,'sourceRoleName',v_source.name,'targetRoleId',p_target_role_id,
    'targetRoleName',v_target.name,'recommendationId',p_recommendation_id,
    'expectedStage',p_expected_stage,'targetStageId',p_target_stage,
    'sourceUpdatedAt',v_source_updated_at,'executionRequestId',gen_random_uuid());
  -- The confirmation is a user action, recorded atomically with its result.
  insert into public.company_messages(company_workspace_id,company_user_id,conversation_id,role_id,
    role,content,message_type,status,metadata)
  values(p_workspace_id,p_actor_id,p_conversation_id,p_source_role_id,'user',
    case when p_method='ask_candidate' then format('Ask the candidate about moving from %s to %s; move only if they accept.',v_source.name,v_target.name) else format('Move the candidate from %s to %s as authorized.',v_source.name,v_target.name) end,
    'web_action','completed',jsonb_build_object('roleMoveRequestKey',v_key,'targetRoleId',p_target_role_id,'talentId',p_talent_id) || case when p_method='ask_candidate' then jsonb_build_object('approvedRoleMove',v_plan) else '{}'::jsonb end)
  returning id into v_message_id;
  if p_method='ask_candidate' then
    if nullif(btrim(p_subject),'') is null or nullif(btrim(p_body),'') is null or nullif(btrim(p_context),'') is null then
      raise exception 'Missing candidate contact';
    end if;
    v_contact := public.send_company_talent_contact_v2(p_request_id,p_workspace_id,p_source_role_id,
      p_talent_id,v_recommendation_id,v_message_id,p_subject,p_body,p_context,'request');
    v_result := jsonb_build_object('status','requested','requestId',p_request_id,'targetRoleId',p_target_role_id);
  elsif v_result is null then
    v_result := public.move_company_candidate_to_role_v1(p_workspace_id,p_talent_id,p_source_role_id,
      p_target_role_id,p_target_stage,v_message_id,p_actor_id);
  end if;
  update public.company_messages set metadata=metadata||jsonb_build_object('roleMoveResult',v_result)
    where id=v_message_id;
  return v_result;
end;
$$;
revoke all on function public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text) to service_role;


-- Called by the existing company-side move tool when the candidate's original
-- reply supplies the consent the company delegated. Meaning is judged by that
-- original conversational LLM; this function checks identity, freshness and scope.
create or replace function public.complete_org_candidate_role_move_v1(
  p_relay_id uuid,p_actor_id uuid,p_workspace_id uuid,p_talent_id uuid,
  p_source_role_id uuid,p_target_role_id uuid,p_target_stage text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_message public.company_messages%rowtype;
  v_plan jsonb;
  v_recommendation_id uuid;
  v_reply_id bigint;
  v_reply_at timestamptz;
  v_result jsonb;
  v_latest_update timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('company_talent_route:'||p_workspace_id::text||':'||p_talent_id::text,0));
  select relay.recommendation_id,reply.id,reply.created_at
    into v_recommendation_id,v_reply_id,v_reply_at
    from public.company_talent_relays relay
    join public.talent_messages reply on reply.id=relay.source_talent_message_id
    join public.talent_opportunity_recommendation recommendation on recommendation.id=relay.recommendation_id
    where relay.id=p_relay_id and recommendation.talent_id=p_talent_id and recommendation.role_id=p_source_role_id
      and reply.user_id=p_talent_id and reply.role='user';
  if v_recommendation_id is null then return jsonb_build_object('status','consent_not_found'); end if;
  -- contact_company normally has no requestId. The original company-side LLM
  -- interprets the reply against the delivered contacts; keep that contract.
  -- Resolve the latest explicit UI authorization on this exact connection.
  select request.* into v_request from public.company_talent_requests request
    join public.company_messages message on message.id=request.source_company_message_id
    where request.recommendation_id=v_recommendation_id and request.talent_id=p_talent_id
      and request.role_id=p_source_role_id and request.company_workspace_id=p_workspace_id
      and message.company_workspace_id=p_workspace_id
      and message.metadata->'approvedRoleMove' is not null
    order by request.created_at desc,request.id desc limit 1 for update of request;
  if v_request.id is null then return jsonb_build_object('status','consent_not_found'); end if;
  select * into v_message from public.company_messages where id=v_request.source_company_message_id
    and company_workspace_id=p_workspace_id and company_user_id=p_actor_id for update;
  v_plan := v_message.metadata->'approvedRoleMove';
  if v_plan is null or v_plan->>'targetRoleId'<>p_target_role_id::text
    or v_plan->>'targetStageId'<>p_target_stage or v_plan->>'sourceRoleId'<>p_source_role_id::text
    or v_plan->>'talentId'<>p_talent_id::text then return jsonb_build_object('status','consent_not_found'); end if;
  if v_message.metadata->'roleMoveOutcome'->>'status'='moved' then return v_message.metadata->'roleMoveOutcome'; end if;
  if v_request.workflow_status='cancelled' or v_request.expires_at<=now()
    or v_reply_at<v_request.created_at then
    return jsonb_build_object('status','state_changed');
  end if;
  -- The real cancellation path closes the request and cancels its delivery.
  -- A queued, cancelled or not-yet-delivered question cannot supply consent.
  if not exists(select 1 from public.contact_queue where company_talent_request_id=v_request.id
    and type='company_request_candidate_delivery' and status='sent' and sent_at<=v_reply_at) then
    return jsonb_build_object('status','consent_not_found');
  end if;
  if exists(select 1 from public.company_talent_relays where recommendation_id=v_request.recommendation_id
    and source_talent_message_id>v_reply_id) then return jsonb_build_object('status','state_changed'); end if;
  if not exists(select 1 from public.contact_queue where company_talent_relay_id=p_relay_id
    and type='company_contact_company_delivery' and status in ('queued','processing','failed','sent')) then
    return jsonb_build_object('status','consent_not_found');
  end if;
  select greatest(
    (select updated_at from public.talent_opportunity_recommendation where id=v_request.recommendation_id),
    (select max(updated_at) from public.talent_opportunity_tag where talent_id=p_talent_id and opportunity_id=p_source_role_id)
  ) into v_latest_update;
  if v_latest_update is distinct from (v_plan->>'sourceUpdatedAt')::timestamptz then
    return jsonb_build_object('status','state_changed');
  end if;
  v_result := public.move_org_candidate_role_web_v1(p_workspace_id,p_talent_id,p_source_role_id,p_target_role_id,
    v_request.recommendation_id::text,v_plan->>'expectedStage',p_target_stage,
    (v_plan->>'executionRequestId')::uuid,p_actor_id,v_message.conversation_id,'direct',true);
  update public.company_messages set metadata=metadata||jsonb_build_object('roleMoveOutcome',v_result,
    'roleMoveConsentRelayId',p_relay_id) where id=v_message.id;
  return v_result;
end;
$$;
revoke all on function public.complete_org_candidate_role_move_v1(uuid,uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_org_candidate_role_move_v1(uuid,uuid,uuid,uuid,uuid,uuid,text) to service_role;
