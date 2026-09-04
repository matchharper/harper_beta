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

  if lower(coalesce(v_role.status, '')) <> 'active'
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now)
    or lower(coalesce(v_role.information ->> 'testOnly', 'false')) = 'true' then
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
      'acceptanceMetadataSaved', true
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
      'companyShared', false
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
    'companyShared', false,
    'acceptedAt', v_now
  );
end;
$$;

comment on function public.accept_talent_internal_role_recommendation_v1(
  uuid, uuid, uuid, text, jsonb, jsonb
) is
  'Accepts any currently available internal recommendation. A source role activates the narrower same-company switch, while acceptance state and email metadata remain atomic.';

revoke all on function public.accept_talent_internal_role_recommendation_v1(
  uuid, uuid, uuid, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.accept_talent_internal_role_recommendation_v1(
  uuid, uuid, uuid, text, jsonb, jsonb
) to service_role;

create or replace function public.change_internal_talent_opportunity_decision_v2(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_action text,
  p_changed_at timestamptz default now(),
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_role public.company_roles%rowtype;
  v_result text;
begin
  if p_action = 'revert' then
    select recommendation.* into v_recommendation
    from public.talent_opportunity_recommendation recommendation
    where recommendation.id = p_recommendation_id
      and recommendation.talent_id = p_talent_id
    for update;

    if v_recommendation.id is null then
      raise exception 'internal_opportunity_not_found';
    end if;

    select role.* into v_role
    from public.company_roles role
    where role.role_id = v_recommendation.role_id
      and lower(coalesce(role.source_type, '')) = 'internal'
    for update;

    if v_role.role_id is null then
      raise exception 'internal_opportunity_not_found';
    end if;

    if lower(coalesce(v_role.status, '')) <> 'active'
      or coalesce(v_role.is_expired, false)
      or (v_role.expires_at is not null and v_role.expires_at <= v_now)
      or lower(coalesce(v_role.information ->> 'testOnly', 'false')) = 'true' then
      raise exception 'inactive_internal_role_cannot_be_reverted';
    end if;
  end if;

  select public.change_internal_talent_opportunity_decision(
    p_talent_id => p_talent_id,
    p_recommendation_id => p_recommendation_id,
    p_action => p_action,
    p_changed_at => coalesce(p_changed_at, v_now),
    p_reason => p_reason
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.change_internal_talent_opportunity_decision_v2(
  uuid, uuid, text, timestamptz, text
) is
  'Preserves the existing internal decision workflow while allowing revert only for active, non-expired, non-test roles.';

revoke all on function public.change_internal_talent_opportunity_decision_v2(
  uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.change_internal_talent_opportunity_decision_v2(
  uuid, uuid, text, timestamptz, text
) to service_role;
