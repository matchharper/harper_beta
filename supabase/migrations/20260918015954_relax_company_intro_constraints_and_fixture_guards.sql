-- Keep Company-first persistence extensible and allow production-isolated E2E
-- roles only for their explicitly allowlisted fixture Talent accounts.
begin;

-- These tables are service-only and all state transitions already go through
-- fenced workers/RPCs. Keep relational constraints and active-route uniqueness,
-- but do not make product vocabulary or counters part of the physical schema.
alter table public.company_first_search_runs
  drop constraint if exists company_first_search_runs_status_check,
  drop constraint if exists company_first_search_runs_trigger_check,
  drop constraint if exists company_first_search_runs_attempt_check,
  drop constraint if exists company_first_search_runs_lease_check;

alter table public.company_intro_candidates
  drop constraint if exists company_intro_candidates_status_check,
  drop constraint if exists company_intro_candidates_close_reason_check,
  drop constraint if exists company_intro_candidates_revision_check,
  drop constraint if exists company_intro_candidates_ready_shape_check,
  drop constraint if exists company_intro_candidates_request_shape_check;

alter table public.company_first_slack_outbox
  drop constraint if exists company_first_slack_outbox_status_check,
  drop constraint if exists company_first_slack_outbox_chunk_check,
  drop constraint if exists company_first_slack_outbox_attempt_check,
  drop constraint if exists company_first_slack_outbox_message_check;

create or replace function public.company_intro_role_allows_talent_v1(
  p_information jsonb,
  p_talent_id uuid
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    coalesce(lower(btrim(p_information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on')
    or exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(p_information->'testTalentIds') = 'array'
            then p_information->'testTalentIds'
          else '[]'::jsonb
        end
      ) allowed(talent_id)
      where btrim(allowed.talent_id) = p_talent_id::text
    );
$$;

comment on function public.company_intro_role_allows_talent_v1(jsonb, uuid) is
  'Allows ordinary roles and permits a testOnly role only for an exact information.testTalentIds fixture account.';

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
  v_emails text[];
  v_appeal text := nullif(btrim(coalesce(p_company_appeal, '')), '');
begin
  if p_intro_candidate_id is null
    or p_company_workspace_id is null
    or p_company_user_id is null
    or p_next_stage_id is null then
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

  perform pg_advisory_xact_lock(
    hashtextextended('company_intro_request:' || p_intro_candidate_id::text, 0)
  );

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
  if v_intro.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'company_intro_not_requestable';
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
        and internal_role.is_company_first_search is true
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

  return jsonb_build_object(
    'status', 'requested',
    'introCandidateId', v_intro.id,
    'deliveryRunId', v_run_id,
    'nextStageId', p_next_stage_id,
    'requestedAt', v_now
  );
end;
$$;

create or replace function public.decide_company_intro_request_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_decision text,
  p_feedback_reason text default null,
  p_email_acceptance_confirmation jsonb default null
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
    if v_intro.status in ('passed', 'closed') then
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
    if v_intro.status not in ('awaiting_talent', 'connecting') then
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
    if v_intro.status not in ('awaiting_talent', 'connecting') then
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
          and internal_role.is_company_first_search is true
      )
      and public.company_intro_role_allows_talent_v1(
        v_role.information,
        p_talent_id
      );

    if v_setting.user_id is null
      or v_setting.is_onboarding_done is not true
      or lower(btrim(coalesce(v_setting.profile_visibility, ''))) <> 'open_to_matches'
      or v_setting.get_internal_recommendation is false
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
    if v_intro.status = 'awaiting_talent' then
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
$$;

create or replace function public.close_company_intro_on_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_generally_available boolean;
begin
  v_role_generally_available :=
    old.company_workspace_id is not distinct from new.company_workspace_id
    and lower(btrim(coalesce(new.source_type, ''))) = 'internal'
    and lower(btrim(coalesce(new.status, ''))) in ('active', 'paused', 'top_priority')
    and coalesce(new.is_expired, false) is false
    and (new.expires_at is null or new.expires_at > timezone('utc', now()));

  if v_role_generally_available
    and coalesce(lower(btrim(new.information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on') then
    return new;
  end if;

  update public.company_intro_candidates intro
  set status = 'closed', close_reason = 'role_closed',
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  where intro.role_id = new.role_id
    and intro.status in ('ready', 'awaiting_talent', 'connecting')
    and (
      not v_role_generally_available
      or not public.company_intro_role_allows_talent_v1(
        new.information,
        intro.talent_id
      )
    );

  update public.talent_opportunity_recommendation recommendation
  set saved_stage = 'closed',
      dismissed_at = coalesce(dismissed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where recommendation.opportunity_type = 'intro_request'
    and exists (
      select 1 from public.company_intro_candidates intro
      where intro.recommendation_id = recommendation.id
        and intro.role_id = new.role_id
        and intro.close_reason = 'role_closed'
    );
  return new;
end;
$$;

revoke all on function public.company_intro_role_allows_talent_v1(jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.request_company_intro_v1(uuid, uuid, uuid, uuid, text[], text)
  from public, anon, authenticated;
revoke all on function public.decide_company_intro_request_v1(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.close_company_intro_on_role_change_v1()
  from public, anon, authenticated;

grant execute on function public.company_intro_role_allows_talent_v1(jsonb, uuid)
  to service_role;
grant execute on function public.request_company_intro_v1(uuid, uuid, uuid, uuid, text[], text)
  to service_role;
grant execute on function public.decide_company_intro_request_v1(uuid, uuid, text, text, jsonb)
  to service_role;

commit;
