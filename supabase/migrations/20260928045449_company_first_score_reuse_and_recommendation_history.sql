-- Reuse successful pair scoring; preserve raw recommendation history and make
-- the candidate/company handoff atomic. No production data backfill.
begin;

create table public.company_first_talent_scores (
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  score integer not null check (score between 0 and 100),
  role_fit text not null check (role_fit in ('fit','hold','ambiguous','unfit')),
  candidate_fit text not null check (candidate_fit in ('fit','middle','unfit')),
  company_fit text not null check (company_fit in ('fit','ambiguous','unfit')),
  reason text not null,
  criteria_evaluations jsonb not null default '[]'::jsonb,
  scored_at timestamptz not null,
  evaluation_as_of timestamptz not null,
  source_run_id uuid not null references public.company_first_search_runs(id) on delete cascade,
  primary key (talent_id, role_id)
);
create index company_first_talent_scores_role_idx on public.company_first_talent_scores(role_id, talent_id);
create index company_first_talent_scores_run_idx on public.company_first_talent_scores(source_run_id);
alter table public.company_first_talent_scores enable row level security;
revoke all on public.company_first_talent_scores from public, anon, authenticated;
grant select, insert, update, delete on public.company_first_talent_scores to service_role;

-- Pair availability is independent of scoring and recommendation exposure.
create or replace function public.company_first_pair_is_available_v1(p_talent_id uuid, p_role_id uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.company_intro_candidates intro
    where intro.talent_id = p_talent_id and intro.role_id = p_role_id
  ) and not exists (
    select 1 from public.talent_opportunity_recommendation recommendation
    where recommendation.talent_id = p_talent_id and recommendation.role_id = p_role_id
      and recommendation.feedback = 'like'
  ) and not exists (
    select 1 from public.talent_progress progress
    where progress.talent_id = p_talent_id and progress.role_id = p_role_id
      and progress.kind = 'candidate_requested_connection'
  ) and not exists (
    select 1 from public.talent_opportunity_tag tag
    where tag.talent_id = p_talent_id and tag.opportunity_id = p_role_id
      and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%')
  );
$$;
revoke all on function public.company_first_pair_is_available_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_first_pair_is_available_v1(uuid,uuid) to service_role;

create or replace function public.current_talent_recommendation_id_v1(p_recommendation_id uuid)
returns uuid language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce((
    select target.id
    from public.talent_opportunity_recommendation original
    join public.company_intro_candidates intro
      on intro.talent_id = original.talent_id and intro.role_id = original.role_id
    join public.talent_opportunity_recommendation target
      on target.id = intro.recommendation_id
      and target.talent_id = original.talent_id and target.role_id = original.role_id
      and target.opportunity_type = 'intro_request'
    where original.id = p_recommendation_id
      and coalesce(original.opportunity_type, '') <> 'intro_request'
      and target.created_at >= original.created_at
    order by target.created_at desc, target.id desc limit 1
  ), p_recommendation_id);
$$;
revoke all on function public.current_talent_recommendation_id_v1(uuid) from public,anon,authenticated;
grant execute on function public.current_talent_recommendation_id_v1(uuid) to service_role;

create or replace view public.talent_effective_opportunity_recommendations_v1
with (security_invoker = true) as
select recommendation.* from public.talent_opportunity_recommendation recommendation
where recommendation.id = public.current_talent_recommendation_id_v1(recommendation.id);
revoke all on public.talent_effective_opportunity_recommendations_v1 from public,anon,authenticated;
grant select on public.talent_effective_opportunity_recommendations_v1 to service_role;

-- Writers cannot act on an old Harper card after an Intro superseded it.
create or replace function public.guard_superseded_recommendation_feedback_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || new.talent_id::text, 0));
  if public.current_talent_recommendation_id_v1(new.id) <> new.id then
    raise exception using errcode = 'P0001', message = 'internal_recommendation_superseded';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_superseded_recommendation_feedback_v1() from public,anon,authenticated;
create trigger guard_superseded_recommendation_feedback_v1
before update of feedback, feedback_reason, saved_stage on public.talent_opportunity_recommendation
for each row when (old.feedback is distinct from new.feedback or old.feedback_reason is distinct from new.feedback_reason or old.saved_stage is distinct from new.saved_stage)
execute function public.guard_superseded_recommendation_feedback_v1();

-- This runs in the canonical acceptance transaction, including its role-switch
-- path. A prior company ready card is the only exception to human confirmation.
create or replace function public.handoff_ready_company_candidate_on_acceptance_v1()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_intro public.company_intro_candidates%rowtype;
  v_workspace uuid;
begin
  if new.feedback is distinct from 'like' or new.saved_stage is distinct from 'connected'
     or new.opportunity_type = 'intro_request' then return new; end if;
  select role.company_workspace_id into v_workspace from public.company_roles role
  where role.role_id = new.role_id and role.source_type = 'internal';
  if v_workspace is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || new.talent_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('company_talent_route:' || v_workspace::text || ':' || new.talent_id::text, 0));
  select * into v_intro from public.company_intro_candidates
  where talent_id = new.talent_id and role_id = new.role_id and status = 'ready' for update;
  if v_intro.id is null then return new; end if;
  if not exists (
    select 1 from public.talent_setting setting
    join public.talent_users talent on talent.user_id = setting.user_id
    join public.company_workspace workspace on workspace.company_workspace_id = v_workspace
    where setting.user_id = new.talent_id and talent.deleted_at is null
      and setting.is_onboarding_done is true and setting.profile_visibility = 'open_to_matches'
      and setting.get_internal_recommendation is not false
      and not exists (
        select 1 from unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,''))))
      )
  ) then
    update public.company_intro_candidates set status = 'closed', close_reason = 'privacy_withdrawn',
      revision = revision + 1, updated_at = now() where id = v_intro.id;
    return new;
  end if;
  update public.company_intro_candidates set status = 'closed', close_reason = 'route_replaced',
    talent_decision_at = coalesce(new.feedback_at, now()), revision = revision + 1, updated_at = now()
  where id = v_intro.id;
  delete from public.talent_opportunity_tag where talent_id = new.talent_id and opportunity_id = new.role_id
    and (tag like '내부:%' or tag like '내부단계:%');
  insert into public.talent_opportunity_tag(talent_id,opportunity_id,tag)
    values(new.talent_id,new.role_id,'내부:연결대기');
  update public.talent_opportunity_recommendation set processed_stage = 'pending_connection', updated_at = now()
    where id = new.id;
  insert into public.talent_progress(talent_id,role_id,recommendation_id,user_id,kind,text,metadata)
    values(new.talent_id,new.role_id,new.id,new.talent_id,'candidate_role_recommendation_accepted','후보자가 기존 Harper 추천을 수락해 연결 대기로 이동했습니다.',
      jsonb_build_object('source','existing_company_proposal','companyIntroCandidateId',v_intro.id,
        'stage','pending_connection','acceptedAt',new.feedback_at));
  return new;
end;
$$;
revoke all on function public.handoff_ready_company_candidate_on_acceptance_v1() from public,anon,authenticated;
create trigger handoff_ready_company_candidate_on_acceptance_v1
  after update of feedback,saved_stage on public.talent_opportunity_recommendation
  for each row when (old.feedback is distinct from new.feedback or old.saved_stage is distinct from new.saved_stage)
  execute function public.handoff_ready_company_candidate_on_acceptance_v1();

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
  if not exists (
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

create or replace function public.accept_talent_internal_role_recommendation_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_source_role_id uuid default null,
  p_feedback_reason text default null,
  p_email_acceptance_confirmation jsonb default null,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_role public.company_roles%rowtype;
  v_setting public.talent_setting%rowtype;
  v_result jsonb;
  v_target_recommendation_id uuid;
  v_updated_count integer := 0;
begin
  if p_talent_id is null or p_recommendation_id is null then
    raise exception 'internal_role_acceptance_missing_input'
      using errcode = '22023';
  end if;

  if p_email_acceptance_confirmation is not null
    and jsonb_typeof(p_email_acceptance_confirmation) <> 'object' then
    raise exception 'internal_role_acceptance_confirmation_invalid'
      using errcode = '22023';
  end if;

  if p_email_acceptance_confirmation is not null
    and octet_length(p_email_acceptance_confirmation::text) > 4000 then
    raise exception 'internal_role_acceptance_confirmation_too_large'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talent-role-recommendation-change:' || p_talent_id::text, 0)
  );

  if exists (select 1 from public.talent_opportunity_recommendation
      where id = p_recommendation_id and talent_id = p_talent_id)
    and public.current_talent_recommendation_id_v1(p_recommendation_id) <> p_recommendation_id then
    return jsonb_build_object('status','superseded','reason','internal_recommendation_superseded',
      'recommendationId',p_recommendation_id,
      'currentRecommendationId',public.current_talent_recommendation_id_v1(p_recommendation_id));
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'company_talent_route:' || role.company_workspace_id::text || ':' || p_talent_id::text,0))
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role on role.role_id = recommendation.role_id
  where recommendation.id = p_recommendation_id and recommendation.talent_id = p_talent_id;

  select recommendation.* into v_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if v_recommendation.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'internal_opportunity_not_found',
      'recommendationId', p_recommendation_id,
      'companyShared', false
    );
  end if;

  select role.* into v_role
  from public.company_roles role
  where role.role_id = v_recommendation.role_id
  for update;

  if v_role.role_id is null
    or lower(coalesce(v_role.source_type, '')) <> 'internal' then
    return jsonb_build_object(
      'status', 'not_internal',
      'reason', 'not_internal_role',
      'recommendationId', p_recommendation_id,
      'companyShared', false
    );
  end if;

  select setting.* into v_setting
  from public.talent_setting setting
  where setting.user_id = p_talent_id
  for update;

  if v_setting.user_id is null
    or not coalesce(v_setting.is_onboarding_done, false) then
    return jsonb_build_object(
      'status', 'required_next_step',
      'reason', 'onboarding_required',
      'recommendationId', p_recommendation_id,
      'roleId', v_role.role_id,
      'companyShared', false
    );
  end if;

  if lower(coalesce(v_setting.profile_visibility, '')) = 'dont_share' then
    return jsonb_build_object(
      'status', 'required_next_step',
      'reason', 'profile_sharing_disabled',
      'recommendationId', p_recommendation_id,
      'roleId', v_role.role_id,
      'companyShared', false
    );
  end if;

  if lower(coalesce(v_role.status, '')) not in ('active', 'paused', 'top_priority')
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now)
    or not public.company_intro_role_allows_talent_v1(v_role.information, p_talent_id) then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'target_role_unavailable',
      'recommendationId', p_recommendation_id,
      'roleId', v_role.role_id,
      'companyShared', false
    );
  end if;

  if p_source_role_id is not null and p_source_role_id <> v_role.role_id then
    v_result := public.set_talent_internal_role_recommendation_before_company_share_v1(
      p_talent_id => p_talent_id,
      p_source_role_id => p_source_role_id,
      p_target_role_id => v_role.role_id,
      p_context => coalesce(p_context, '{}'::jsonb),
      p_accept => true
    );

    if coalesce(v_result ->> 'status', '') not in ('accepted', 'no_change')
      or (
        v_result ->> 'status' = 'no_change'
        and coalesce((v_result ->> 'targetAccepted')::boolean, false) = false
      ) then
      return v_result;
    end if;

    v_target_recommendation_id := coalesce(
      nullif(v_result ->> 'targetRecommendationId', '')::uuid,
      p_recommendation_id
    );

    update public.talent_opportunity_recommendation
    set feedback_reason = nullif(left(btrim(coalesce(p_feedback_reason, '')), 1000), ''),
        email_acceptance_confirmation = case
          when p_email_acceptance_confirmation is null
            then email_acceptance_confirmation
          else p_email_acceptance_confirmation
        end,
        updated_at = v_now
    where id = v_target_recommendation_id
      and talent_id = p_talent_id;
    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception 'internal_role_acceptance_metadata_target_not_found';
    end if;

    return v_result || jsonb_build_object(
      'recommendationId', v_target_recommendation_id,
      'acceptanceMetadataSaved', true,
      'companyShared', exists (select 1 from public.talent_opportunity_tag tag where tag.talent_id = p_talent_id and tag.opportunity_id = v_role.role_id and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%'))
    );
  end if;

  if v_recommendation.feedback = 'like'
    and v_recommendation.saved_stage = 'connected' then
    update public.talent_opportunity_recommendation
    set feedback_reason = nullif(left(btrim(coalesce(p_feedback_reason, '')), 1000), ''),
        email_acceptance_confirmation = case
          when p_email_acceptance_confirmation is null
            then email_acceptance_confirmation
          else p_email_acceptance_confirmation
        end,
        updated_at = v_now
    where id = p_recommendation_id
      and talent_id = p_talent_id;

    return jsonb_build_object(
      'status', 'no_change',
      'reason', 'already_accepted',
      'recommendationId', p_recommendation_id,
      'roleId', v_role.role_id,
      'targetAccepted', true,
      'acceptanceMetadataSaved', true,
      'companyShared', exists (select 1 from public.talent_opportunity_tag tag where tag.talent_id = p_talent_id and tag.opportunity_id = v_role.role_id and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%'))
    );
  end if;

  perform public.update_talent_role_feedback_v1(
    p_talent_id => p_talent_id,
    p_recommendation_id => p_recommendation_id,
    p_feedback => 'like',
    p_feedback_reason => nullif(left(btrim(coalesce(p_feedback_reason, '')), 1000), ''),
    p_saved_stage => 'connected',
    p_feedback_at => v_now
  );

  if p_email_acceptance_confirmation is not null then
    update public.talent_opportunity_recommendation
    set email_acceptance_confirmation = p_email_acceptance_confirmation,
        updated_at = v_now
    where id = p_recommendation_id
      and talent_id = p_talent_id;
    get diagnostics v_updated_count = row_count;

    if v_updated_count <> 1 then
      raise exception 'internal_role_acceptance_metadata_target_not_found';
    end if;
  end if;

  return jsonb_build_object(
    'status', 'accepted',
    'recommendationId', p_recommendation_id,
    'roleId', v_role.role_id,
    'targetAccepted', true,
    'acceptanceMetadataSaved', true,
    'companyShared', exists (select 1 from public.talent_opportunity_tag tag where tag.talent_id = p_talent_id and tag.opportunity_id = v_role.role_id and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%')),
    'acceptedAt', v_now
  );
end;
$$;


create or replace function public.current_talent_recommendation_for_talent_v1(p_talent_id uuid, p_recommendation_id uuid)
returns uuid language sql stable security invoker set search_path = public, pg_temp
as $$
  select public.current_talent_recommendation_id_v1(recommendation.id)
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id and recommendation.talent_id = p_talent_id;
$$;
revoke all on function public.current_talent_recommendation_for_talent_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.current_talent_recommendation_for_talent_v1(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.update_talent_role_feedback_v1(p_talent_id uuid, p_recommendation_id uuid, p_feedback text, p_feedback_reason text, p_saved_stage text, p_feedback_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activity_id uuid;
  v_next_stage text;
  v_previous_stage text;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text,0));
  if exists (select 1 from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id)
    and public.current_talent_recommendation_id_v1(p_recommendation_id) <> p_recommendation_id then
    raise exception using errcode='P0001', message='internal_recommendation_superseded';
  end if;
  if p_feedback is not null and p_feedback not in ('like', 'dislike') then
    raise exception 'talent_role_activity_feedback_invalid'
      using errcode = '22023';
  end if;
  if p_saved_stage is not null
     and p_saved_stage not in ('saved', 'applied', 'connected', 'closed', 'hidden') then
    raise exception 'talent_role_activity_saved_stage_invalid'
      using errcode = '22023';
  end if;

  select recommendation.saved_stage
  into v_previous_stage
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  v_next_stage := case when p_feedback = 'like' then p_saved_stage else null end;

  update public.talent_opportunity_recommendation
  set feedback = p_feedback,
      feedback_at = case when p_feedback is null then null else p_feedback_at end,
      feedback_reason = case
        when p_feedback is null then null
        else nullif(btrim(coalesce(p_feedback_reason, '')), '')
      end,
      saved_stage = v_next_stage,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  if v_next_stage is not null
     and v_previous_stage is distinct from v_next_stage then
    insert into public.talent_role_activity (
      recommendation_id,
      kind,
      metadata
    ) values (
      p_recommendation_id,
      'saved_stage_changed',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_previous_stage,
          'savedStage', v_next_stage
        )
      )
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'activityId', v_activity_id,
    'previousStage', v_previous_stage,
    'savedStage', v_next_stage
  );
end;
$function$;

revoke all on function public.update_talent_role_feedback_v1(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_talent_role_feedback_v1(uuid,uuid,text,text,text,timestamptz) to service_role;
CREATE OR REPLACE FUNCTION public.move_talent_role_saved_stage_v1(p_talent_id uuid, p_recommendation_id uuid, p_saved_stage text, p_record_activity boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activity_id uuid;
  v_previous_stage text;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text,0));
  if exists (select 1 from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id)
    and public.current_talent_recommendation_id_v1(p_recommendation_id) <> p_recommendation_id then
    raise exception using errcode='P0001', message='internal_recommendation_superseded';
  end if;
  if p_saved_stage not in ('saved', 'applied', 'connected', 'closed', 'hidden') then
    raise exception 'talent_role_activity_saved_stage_invalid'
      using errcode = '22023';
  end if;

  select recommendation.saved_stage
  into v_previous_stage
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  if v_previous_stage is not distinct from p_saved_stage then
    return jsonb_build_object(
      'activityId', null,
      'previousStage', v_previous_stage,
      'savedStage', p_saved_stage
    );
  end if;

  update public.talent_opportunity_recommendation
  set saved_stage = p_saved_stage,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  if coalesce(p_record_activity, true) then
    insert into public.talent_role_activity (
      recommendation_id,
      kind,
      metadata
    ) values (
      p_recommendation_id,
      'saved_stage_changed',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_previous_stage,
          'savedStage', p_saved_stage
        )
      )
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'activityId', v_activity_id,
    'previousStage', v_previous_stage,
    'savedStage', p_saved_stage
  );
end;
$function$;

revoke all on function public.move_talent_role_saved_stage_v1(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.move_talent_role_saved_stage_v1(uuid,uuid,text,boolean) to service_role;
CREATE OR REPLACE FUNCTION public.archive_ended_internal_opportunities_for_talent(p_talent_id uuid, p_locale text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  archived_count integer := 0;
  archived_row record;
  normalized_locale text;
  now_ts timestamptz := timezone('utc', now());
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text,0));
  if p_talent_id is null then
    return 0;
  end if;

  select lower(
    coalesce(
      nullif(trim(p_locale), ''),
      nullif(trim(setting.preferred_locale), ''),
      'ko'
    )
  )
    into normalized_locale
    from (select 1) seed
    left join public.talent_setting setting
      on setting.user_id = p_talent_id;

  for archived_row in
    update public.talent_opportunity_recommendation recommendation
       set saved_stage = 'hidden',
           updated_at = now_ts
      from public.company_roles role
      join public.company_workspace workspace
        on workspace.company_workspace_id = role.company_workspace_id
     where recommendation.talent_id = p_talent_id
       and recommendation.id = public.current_talent_recommendation_id_v1(recommendation.id)
       and recommendation.role_id = role.role_id
       and recommendation.feedback is null
       and coalesce(recommendation.saved_stage, '') <> 'hidden'
       and lower(trim(coalesce(role.source_type, ''))) = 'internal'
       and lower(trim(coalesce(role.status, ''))) = 'ended'
    returning
      recommendation.id,
      coalesce(
        nullif(trim(workspace.company_name), ''),
        nullif(trim(workspace.published_name), ''),
        'Company'
      ) as company_name,
      coalesce(nullif(trim(role.name), ''), 'Role') as role_name
  loop
    insert into public.talent_activity_events (
      talent_id,
      source,
      event_type,
      summary,
      impact_level,
      changed_domains,
      created_at
    )
    values (
      p_talent_id,
      'career_opportunity_lifecycle',
      'internal_opportunity_filled',
      case
        when normalized_locale like 'ko%'
          then format(
            '%s의 %s 포지션은 채용이 완료되어 보관함으로 이동했습니다.',
            archived_row.company_name,
            archived_row.role_name
          )
        else format(
          'The %s position at %s has been filled and moved to the archive.',
          archived_row.role_name,
          archived_row.company_name
        )
      end,
      'low',
      array['opportunity_status', 'recommendation_history']::text[],
      now_ts
    );

    archived_count := archived_count + 1;
  end loop;

  return archived_count;
end;
$function$;

revoke all on function public.archive_ended_internal_opportunities_for_talent(uuid,text) from public,anon,authenticated;
grant execute on function public.archive_ended_internal_opportunities_for_talent(uuid,text) to service_role;
commit;
