create or replace function public.present_talent_internal_role_recommendation_for_review_v1(
  p_talent_id uuid,
  p_target_role_id uuid,
  p_source_role_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_setting public.talent_setting%rowtype;
  v_target_role public.company_roles%rowtype;
  v_target_fit public.talent_opportunity_fit%rowtype;
  v_target_recommendation public.talent_opportunity_recommendation%rowtype;
  v_source_role_id uuid := p_source_role_id;
  v_target_stage_tag text;
  v_target_fit_summary text;
  v_target_fit_reasons jsonb := '[]'::jsonb;
  v_summary_language text;
  v_company_name text := 'Undisclosed internal company';
  v_company_shared boolean := false;
  v_existing_result jsonb;
  v_progress_context jsonb;
begin
  if p_talent_id is null or p_target_role_id is null then
    raise exception 'talent_internal_role_review_missing_input'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talent-role-recommendation-change:' || p_talent_id::text, 0)
  );

  select setting.* into v_setting
  from public.talent_setting setting
  where setting.user_id = p_talent_id
  for update;

  if v_setting.user_id is null or not coalesce(v_setting.is_onboarding_done, false) then
    return jsonb_build_object(
      'status', 'required_next_step',
      'reason', 'onboarding_required',
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  if lower(coalesce(v_setting.profile_visibility, '')) = 'dont_share' then
    return jsonb_build_object(
      'status', 'required_next_step',
      'reason', 'profile_sharing_disabled',
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  select role.* into v_target_role
  from public.company_roles role
  where role.role_id = p_target_role_id
    and lower(coalesce(role.source_type, '')) = 'internal'
  for update;

  if v_target_role.role_id is null
    or lower(coalesce(v_target_role.status, '')) <> 'active'
    or coalesce(v_target_role.is_expired, false)
    or (v_target_role.expires_at is not null and v_target_role.expires_at <= v_now)
    or lower(coalesce(v_target_role.information ->> 'testOnly', 'false')) = 'true' then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'target_role_unavailable',
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  v_summary_language := case
    when lower(coalesce(p_context ->> 'responseLocale', 'en')) like 'ko%'
      then 'ko'
    else 'en'
  end;
  v_target_fit_summary := nullif(
    btrim(v_target_role.summary -> v_summary_language ->> 'content'),
    ''
  );
  select coalesce(
    jsonb_agg(
      to_jsonb(left(btrim(reason.value), 500))
      order by reason.ordinality
    ),
    '[]'::jsonb
  ) into v_target_fit_reasons
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(coalesce(p_context, '{}'::jsonb) -> 'fitReasons') = 'array'
        then coalesce(p_context, '{}'::jsonb) -> 'fitReasons'
      else '[]'::jsonb
    end
  ) with ordinality as reason(value, ordinality)
  where btrim(reason.value) <> ''
    and reason.ordinality <= 3;

  select coalesce(
    nullif(btrim(workspace.published_name), ''),
    'Undisclosed internal company'
  ) into v_company_name
  from public.company_workspace workspace
  where workspace.company_workspace_id = v_target_role.company_workspace_id;

  select fit.* into v_target_fit
  from public.talent_opportunity_fit fit
  where fit.talent_id = p_talent_id
    and fit.opportunity_id = p_target_role_id
    and public.talent_internal_role_is_candidate_visible_v1(fit)
  order by fit.last_evaluated_at desc, fit.created_at desc, fit.id desc
  limit 1
  for update;

  if v_target_fit.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'target_not_current_matched_option',
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'company', v_company_name,
      'companyShared', false
    );
  end if;

  select recommendation.* into v_target_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_target_role_id
  order by recommendation.updated_at desc, recommendation.created_at desc, recommendation.id desc
  limit 1
  for update;

  select tag.tag into v_target_stage_tag
  from public.talent_opportunity_tag tag
  where tag.talent_id = p_talent_id
    and tag.opportunity_id = p_target_role_id
    and (
      tag.tag in (
        '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
        '내부:프로세스중단', '내부:아카이브'
      )
      or tag.tag like '내부단계:%'
    )
  order by tag.updated_at desc, tag.created_at desc, tag.id desc
  limit 1
  for update;

  if v_target_recommendation.id is not null then
    if coalesce(v_target_recommendation.saved_stage, '') = 'closed'
      or coalesce(v_target_recommendation.feedback, '') = 'dislike'
      or v_target_stage_tag in ('내부:프로세스중단', '내부:아카이브') then
      return jsonb_build_object(
        'status', 'action_unavailable',
        'reason', 'previous_recommendation_inactive',
        'targetRoleId', p_target_role_id,
        'targetRecommendationId', v_target_recommendation.id,
        'targetRoleName', v_target_role.name,
        'company', v_company_name,
        'companyShared', false
      );
    end if;

    select exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = p_target_role_id
        and (
          tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
          or tag.tag like '내부단계:%'
        )
    ) into v_company_shared;

    if v_target_recommendation.feedback = 'like'
      or v_company_shared
      or exists (
        select 1
        from public.talent_opportunity_tag tag
        where tag.talent_id = p_talent_id
          and tag.opportunity_id = p_target_role_id
          and tag.tag in ('내부:추천', '내부:수락')
      ) then
      return jsonb_build_object(
        'status', 'no_change',
        'reason', 'already_recommended',
        'targetRoleId', p_target_role_id,
        'targetRecommendationId', v_target_recommendation.id,
        'targetRoleName', v_target_role.name,
        'company', v_company_name,
        'targetAccepted', v_target_recommendation.feedback = 'like',
        'companyShared', v_company_shared,
        'recommendedAt', v_target_recommendation.recommended_at
      );
    end if;
  end if;

  if v_source_role_id is not null
    and not exists (
      select 1
      from public.talent_opportunity_recommendation recommendation
      join public.company_roles source_role
        on source_role.role_id = recommendation.role_id
      where recommendation.talent_id = p_talent_id
        and recommendation.role_id = v_source_role_id
        and source_role.company_workspace_id = v_target_role.company_workspace_id
        and lower(coalesce(source_role.source_type, '')) = 'internal'
        and lower(coalesce(source_role.information ->> 'testOnly', 'false')) <> 'true'
        and coalesce(recommendation.saved_stage, '') <> 'closed'
        and coalesce(recommendation.feedback, '') <> 'dislike'
        and not exists (
          select 1
          from public.talent_opportunity_tag inactive_tag
          where inactive_tag.talent_id = p_talent_id
            and inactive_tag.opportunity_id = recommendation.role_id
            and inactive_tag.tag in ('내부:프로세스중단', '내부:아카이브')
        )
    ) then
    -- The model-provided source is only a hint. Never link recommendations
    -- across companies or revive a closed source; resolve from current facts.
    v_source_role_id := null;
  end if;

  if v_source_role_id is null then
    select recommendation.role_id into v_source_role_id
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles source_role
      on source_role.role_id = recommendation.role_id
    where recommendation.talent_id = p_talent_id
      and recommendation.role_id <> p_target_role_id
      and source_role.company_workspace_id = v_target_role.company_workspace_id
      and lower(coalesce(source_role.source_type, '')) = 'internal'
      and lower(coalesce(source_role.information ->> 'testOnly', 'false')) <> 'true'
      and coalesce(recommendation.saved_stage, '') <> 'closed'
      and coalesce(recommendation.feedback, '') <> 'dislike'
      and not exists (
        select 1
        from public.talent_opportunity_tag inactive_tag
        where inactive_tag.talent_id = p_talent_id
          and inactive_tag.opportunity_id = recommendation.role_id
          and inactive_tag.tag in ('내부:프로세스중단', '내부:아카이브')
      )
    order by
      exists (
        select 1
        from public.talent_opportunity_tag process_tag
        where process_tag.talent_id = p_talent_id
          and process_tag.opportunity_id = recommendation.role_id
          and (
            process_tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
            or process_tag.tag like '내부단계:%'
          )
      ) desc,
      (recommendation.feedback = 'like' or recommendation.saved_stage = 'connected') desc,
      recommendation.updated_at desc,
      recommendation.created_at desc,
      recommendation.id desc
    limit 1;
  end if;

  if v_source_role_id is not null then
    v_existing_result := public.set_talent_internal_role_recommendation_before_company_share_v1(
      p_talent_id => p_talent_id,
      p_source_role_id => v_source_role_id,
      p_target_role_id => p_target_role_id,
      p_context => p_context,
      p_accept => false
    );

    return v_existing_result || jsonb_build_object('company', v_company_name);
  end if;

  if v_target_stage_tag is not null then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', 'target_has_existing_process',
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'company', v_company_name,
      'companyShared', v_target_stage_tag not in ('내부:프로세스중단', '내부:아카이브')
    );
  end if;

  if jsonb_array_length(v_target_fit_reasons) = 0 then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', 'candidate_fit_reasons_required',
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'company', v_company_name,
      'companyShared', false
    );
  end if;

  if v_target_recommendation.id is null then
    insert into public.talent_opportunity_recommendation (
      talent_id,
      role_id,
      opportunity_type,
      kind,
      fit_summary,
      fit_reasons,
      tradeoffs,
      preference_fit,
      score,
      recommended_at
    ) values (
      p_talent_id,
      p_target_role_id,
      'internal_recommendation',
      'match',
      v_target_fit_summary,
      v_target_fit_reasons,
      '[]'::jsonb,
      '{}'::jsonb,
      case
        when v_target_fit.score is null then null
        else least(
          1::numeric,
          greatest(0::numeric, v_target_fit.score::numeric / 100)
        )
      end,
      v_now
    )
    returning * into v_target_recommendation;
  else
    update public.talent_opportunity_recommendation
    set opportunity_type = 'internal_recommendation',
        kind = 'match',
        fit_summary = v_target_fit_summary,
        fit_reasons = v_target_fit_reasons,
        score = case
          when v_target_fit.score is null then null
          else least(
            1::numeric,
            greatest(0::numeric, v_target_fit.score::numeric / 100)
          )
        end,
        recommended_at = v_now,
        dismissed_at = null,
        updated_at = v_now
    where id = v_target_recommendation.id
    returning * into v_target_recommendation;
  end if;

  update public.talent_opportunity_fit
  set recommend = true
  where id = v_target_fit.id;

  delete from public.talent_opportunity_tag
  where talent_id = p_talent_id
    and opportunity_id = p_target_role_id
    and (
      tag in (
        '내부:추천', '내부:수락', '내부:거절', '내부:보류',
        '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
        '내부:프로세스중단', '내부:아카이브'
      )
      or tag like '내부단계:%'
    );

  insert into public.talent_opportunity_tag (
    talent_id, opportunity_id, tag, created_at, updated_at
  ) values (
    p_talent_id, p_target_role_id, '내부:추천', v_now, v_now
  );

  delete from public.talent_progress
  where talent_id = p_talent_id
    and role_id = p_target_role_id
    and kind = 'candidate_requested_connection';

  v_progress_context := jsonb_strip_nulls(
    jsonb_build_object(
      'conversationId', nullif(btrim(coalesce(p_context ->> 'conversationId', '')), ''),
      'userMessageId', nullif(btrim(coalesce(p_context ->> 'userMessageId', '')), ''),
      'targetRoleId', p_target_role_id
    )
  );

  insert into public.talent_progress (
    talent_id,
    role_id,
    recommendation_id,
    user_id,
    kind,
    text,
    metadata
  ) values (
    p_talent_id,
    p_target_role_id,
    v_target_recommendation.id,
    p_talent_id,
    'candidate_role_recommendation_presented',
    format('검토할 추천 역할 추가: %s', v_target_role.name),
    v_progress_context
  );

  return jsonb_build_object(
    'status', 'recommended',
    'targetRoleId', p_target_role_id,
    'targetRecommendationId', v_target_recommendation.id,
    'targetRoleName', v_target_role.name,
    'company', v_company_name,
    'targetAccepted', false,
    'companyShared', false,
    'recommendedAt', v_now
  );
end;
$$;

comment on function public.present_talent_internal_role_recommendation_for_review_v1(
  uuid, uuid, uuid, jsonb
) is
  'Presents an active stored-fit internal role for candidate review. Reuses same-company replacement safeguards when a related recommendation exists; otherwise creates an independent formal recommendation without acceptance or company sharing.';

revoke all on function public.present_talent_internal_role_recommendation_for_review_v1(
  uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.present_talent_internal_role_recommendation_for_review_v1(
  uuid, uuid, uuid, jsonb
) to service_role;
