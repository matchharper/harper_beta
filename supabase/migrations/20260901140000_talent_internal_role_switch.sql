create or replace function public.set_talent_internal_role_recommendation_before_company_share_v1(
  p_talent_id uuid,
  p_source_role_id uuid,
  p_target_role_id uuid,
  p_context jsonb default '{}'::jsonb,
  p_accept boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_source_role public.company_roles%rowtype;
  v_target_role public.company_roles%rowtype;
  v_source_recommendation public.talent_opportunity_recommendation%rowtype;
  v_target_recommendation public.talent_opportunity_recommendation%rowtype;
  v_target_fit public.talent_opportunity_fit%rowtype;
  v_setting public.talent_setting%rowtype;
  v_source_stage_tag text;
  v_target_stage_tag text;
  v_target_fit_summary text;
  v_target_fit_reasons jsonb := '[]'::jsonb;
  v_summary_language text;
  v_source_saved_stage_before text;
  v_target_saved_stage_before text;
  v_change_reason text;
  v_progress_context jsonb;
begin
  if p_talent_id is null
    or p_source_role_id is null
    or p_target_role_id is null then
    raise exception 'talent_internal_role_recommendation_change_missing_input'
      using errcode = '22023';
  end if;

  if p_source_role_id = p_target_role_id then
    return jsonb_build_object(
      'status', 'no_change',
      'reason', 'same_role',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  -- Serialize all candidate-side changes for one talent. The lock also makes a
  -- repeated tool call observe the completed recommendation change instead of creating a
  -- second recommendation episode.
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
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  if lower(coalesce(v_setting.profile_visibility, '')) = 'dont_share' then
    return jsonb_build_object(
      'status', 'required_next_step',
      'reason', 'profile_sharing_disabled',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  select role.* into v_source_role
  from public.company_roles role
  where role.role_id = p_source_role_id
    and lower(coalesce(role.source_type, '')) = 'internal'
  for update;

  select role.* into v_target_role
  from public.company_roles role
  where role.role_id = p_target_role_id
    and lower(coalesce(role.source_type, '')) = 'internal'
  for update;

  if v_source_role.role_id is null
    or v_target_role.role_id is null
    or v_source_role.company_workspace_id is distinct from v_target_role.company_workspace_id then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'not_same_internal_company',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  -- Test-only opportunities are never a candidate-side recommendation target. Direct
  -- fixtures have a separate, exact-ID recommendation path.
  if lower(coalesce(v_source_role.information ->> 'testOnly', 'false')) = 'true'
    or lower(coalesce(v_target_role.information ->> 'testOnly', 'false')) = 'true' then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'role_not_available',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'companyShared', false
    );
  end if;

  if lower(coalesce(v_target_role.status, '')) <> 'active'
    or coalesce(v_target_role.is_expired, false)
    or (v_target_role.expires_at is not null and v_target_role.expires_at <= v_now) then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'target_role_unavailable',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
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

  select recommendation.* into v_source_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_source_role_id
  order by recommendation.updated_at desc, recommendation.created_at desc, recommendation.id desc
  limit 1
  for update;

  if v_source_recommendation.id is null then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', 'source_recommendation_not_found',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'companyShared', false
    );
  end if;

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
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
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

  if not p_accept
    and v_target_recommendation.id is not null
    and coalesce(v_target_fit.recommend, false)
    and exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = p_target_role_id
        and tag.tag in ('내부:추천', '내부:수락')
    ) then
    return jsonb_build_object(
      'status', 'no_change',
      'reason', 'already_recommended',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'targetRecommendationId', v_target_recommendation.id,
      'targetAccepted', v_target_recommendation.feedback = 'like',
      'companyShared', false
    );
  end if;

  if p_accept
    and v_target_recommendation.id is not null
    and v_source_recommendation.saved_stage = 'closed'
    and v_target_recommendation.feedback = 'like'
    and v_target_recommendation.saved_stage = 'connected'
    and coalesce(v_target_fit.recommend, false)
    and exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = p_source_role_id
        and tag.tag = '내부:아카이브'
    )
    and exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = p_target_role_id
        and tag.tag in ('내부:추천', '내부:수락')
    ) then
    -- A retry can observe a role change written by an earlier version that only
    -- closed the source recommendation. Keep the visible candidate history
    -- consistent with the current role-selection semantics.
    update public.talent_opportunity_recommendation
    set feedback = 'dislike',
        feedback_at = coalesce(feedback_at, v_now),
        feedback_reason = '해당 회사의 다른 역할을 우선 선택',
        updated_at = v_now
    where id = v_source_recommendation.id
      and (
        feedback is distinct from 'dislike'
        or feedback_reason is distinct from '해당 회사의 다른 역할을 우선 선택'
      );

    return jsonb_build_object(
      'status', 'no_change',
      'reason', 'already_accepted',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'targetRecommendationId', v_target_recommendation.id,
      'targetAccepted', true,
      'companyShared', false
    );
  end if;

  select tag.tag into v_source_stage_tag
  from public.talent_opportunity_tag tag
  where tag.talent_id = p_talent_id
    and tag.opportunity_id = p_source_role_id
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

  if v_source_stage_tag is not null then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', case
        when v_source_stage_tag in ('내부:프로세스중단', '내부:아카이브')
          then 'source_process_inactive'
        else 'company_process_started'
      end,
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'companyShared', v_source_stage_tag not in ('내부:프로세스중단', '내부:아카이브')
    );
  end if;

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

  if v_target_stage_tag is not null then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', 'target_has_existing_process',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'companyShared', v_target_stage_tag not in ('내부:프로세스중단', '내부:아카이브')
    );
  end if;

  if v_target_recommendation.id is null then
    if p_accept then
      return jsonb_build_object(
        'status', 'action_unavailable',
        'reason', 'target_review_required_before_acceptance',
        'sourceRoleId', p_source_role_id,
        'targetRoleId', p_target_role_id,
        'sourceRoleName', v_source_role.name,
        'targetRoleName', v_target_role.name,
        'companyShared', false
      );
    end if;

    if jsonb_array_length(v_target_fit_reasons) = 0 then
      return jsonb_build_object(
        'status', 'action_unavailable',
        'reason', 'candidate_fit_reasons_required',
        'sourceRoleId', p_source_role_id,
        'targetRoleId', p_target_role_id,
        'sourceRoleName', v_source_role.name,
        'targetRoleName', v_target_role.name,
        'companyShared', false
      );
    end if;

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
  end if;

  if not p_accept and jsonb_array_length(v_target_fit_reasons) = 0 then
    return jsonb_build_object(
      'status', 'action_unavailable',
      'reason', 'candidate_fit_reasons_required',
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'companyShared', false
    );
  end if;

  v_source_saved_stage_before := v_source_recommendation.saved_stage;
  v_target_saved_stage_before := v_target_recommendation.saved_stage;

  v_change_reason := case
    when p_accept then format(
      '추천 역할 수락 및 선택 변경: %s → %s',
      v_source_role.name,
      v_target_role.name
    )
    else format(
      '검토할 추천 역할 추가: %s → %s',
      v_source_role.name,
      v_target_role.name
    )
  end;

  if p_accept then
    update public.talent_opportunity_recommendation
    set feedback = 'dislike',
        feedback_at = v_now,
        feedback_reason = '해당 회사의 다른 역할을 우선 선택',
        saved_stage = 'closed',
        updated_at = v_now
    where id = v_source_recommendation.id;
  end if;

  update public.talent_opportunity_recommendation
  set fit_summary = case when p_accept then fit_summary else v_target_fit_summary end,
      fit_reasons = case when p_accept then fit_reasons else v_target_fit_reasons end,
      feedback = case when p_accept then 'like' else null end,
      feedback_at = case when p_accept then v_now else null end,
      feedback_reason = null,
      saved_stage = case when p_accept then 'connected' else null end,
      recommended_at = case
        when p_accept then coalesce(v_target_recommendation.recommended_at, v_now)
        else v_now
      end,
      dismissed_at = null,
      email_acceptance_confirmation = '{}'::jsonb,
      updated_at = v_now
  where id = v_target_recommendation.id
  returning * into v_target_recommendation;

  -- The target is now worth presenting, but an already-delivered source fit
  -- remains historical truth. Do not rewrite sibling fit/recommend decisions.
  update public.talent_opportunity_fit
  set recommend = true
  where id = v_target_fit.id;

  if p_accept then
    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id
      and opportunity_id = p_source_role_id
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
      p_talent_id, p_source_role_id, '내부:아카이브', v_now, v_now
    );
  end if;

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
    p_talent_id,
    p_target_role_id,
    case when p_accept then '내부:수락' else '내부:추천' end,
    v_now,
    v_now
  );

  delete from public.talent_progress
  where talent_id = p_talent_id
    and role_id = p_target_role_id
    and kind = 'candidate_requested_connection';

  v_progress_context := jsonb_strip_nulls(
    jsonb_build_object(
      'conversationId', nullif(btrim(coalesce(p_context ->> 'conversationId', '')), ''),
      'userMessageId', nullif(btrim(coalesce(p_context ->> 'userMessageId', '')), '')
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
    case
      when p_accept then 'candidate_role_recommendation_accepted'
      else 'candidate_role_recommendation_presented'
    end,
    v_change_reason,
    v_progress_context || jsonb_build_object(
      'sourceRoleId', p_source_role_id,
      'targetRoleId', p_target_role_id
    )
  );

  if p_accept then
    if v_source_saved_stage_before is distinct from 'closed' then
      insert into public.talent_role_activity (
        recommendation_id,
        kind,
        metadata
      ) values (
        v_source_recommendation.id,
        'saved_stage_changed',
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_source_saved_stage_before,
          'savedStage', 'closed'
        )
      );
    end if;

    if v_target_saved_stage_before is distinct from 'connected' then
      insert into public.talent_role_activity (
        recommendation_id,
        kind,
        metadata
      ) values (
        v_target_recommendation.id,
        'saved_stage_changed',
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_target_saved_stage_before,
          'savedStage', 'connected'
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', case when p_accept then 'accepted' else 'recommended' end,
    'sourceRoleId', p_source_role_id,
    'sourceRecommendationId', v_source_recommendation.id,
    'sourceRoleName', v_source_role.name,
    'targetRoleId', p_target_role_id,
    'targetRecommendationId', v_target_recommendation.id,
    'targetRoleName', v_target_role.name,
    'targetAccepted', p_accept,
    'companyShared', false,
    'recommendedAt', v_now
  );
end;
$$;

comment on function public.set_talent_internal_role_recommendation_before_company_share_v1(
  uuid, uuid, uuid, jsonb, boolean
) is
  'Presents an active same-company fit for candidate review, or accepts it only after explicit acceptance, before company sharing.';

revoke all on function public.set_talent_internal_role_recommendation_before_company_share_v1(
  uuid, uuid, uuid, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.set_talent_internal_role_recommendation_before_company_share_v1(
  uuid, uuid, uuid, jsonb, boolean
) to service_role;
