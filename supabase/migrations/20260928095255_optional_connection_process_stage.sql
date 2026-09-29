-- NULL next_stage_id means the built-in connected stage. Existing explicit
-- custom destinations retain their FK and acceptance behavior.
-- Applied to production on 2026-09-28; filename matches the recorded version.
-- Apply with the matching web and Opportunity Worker changes; old workers
-- require a custom stage at delivery time. No production data is rewritten.
begin;

-- Older installations required next_stage_id as part of the request shape.
alter table public.company_intro_candidates
  drop constraint if exists company_intro_candidates_request_shape_check;

create or replace function public.request_company_intro_v1(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_next_stage_id uuid,
  p_intro_recipient_emails text[],
  p_company_appeal text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'privacy_withdrawn',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
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
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'privacy_withdrawn',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
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
$$;

create or replace function public.guard_candidate_first_against_company_intro_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = new.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal';

  if v_workspace_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_talent_route:' || v_workspace_id::text || ':' || new.talent_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status in ('ready', 'connecting')
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first route already exists for this Role and Talent';
  end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status = 'awaiting_talent'
      and not (
        intro.role_id = new.role_id
        and intro.recommendation_id is null
        and intro.requested_at is not null
        and cardinality(intro.intro_recipient_emails) > 0
        and new.opportunity_type = 'intro_request'
        and new.discovery_run_id = intro.delivery_run_id
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'another company-first route already exists for this Role and Talent';
  end if;

  return new;
end;
$$;

revoke all on function public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) from public,anon,authenticated;
revoke all on function public.guard_candidate_first_against_company_intro_v1() from public,anon,authenticated;
grant execute on function public.request_company_intro_v1(uuid,uuid,uuid,uuid,text[],text) to service_role;
grant execute on function public.guard_candidate_first_against_company_intro_v1() to service_role;
commit;
