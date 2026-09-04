create unique index if not exists talent_progress_org_candidate_role_move_event_key_uidx
  on public.talent_progress ((metadata ->> 'eventKey'))
  where kind = 'org_candidate_role_move'
    and nullif(metadata ->> 'eventKey', '') is not null;

create unique index if not exists contact_queue_candidate_role_changed_transfer_uidx
  on public.contact_queue ((payload ->> 'transferId'))
  where type = 'internal_candidate_role_changed'
    and nullif(payload ->> 'transferId', '') is not null;

create or replace function public.move_company_candidate_to_role_v1(
  p_company_workspace_id uuid,
  p_talent_id uuid,
  p_source_role_id uuid,
  p_target_role_id uuid,
  p_target_stage_id text,
  p_source_company_message_id bigint,
  p_company_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_transfer_id uuid := gen_random_uuid();
  v_existing_event_key text;
  v_existing_result jsonb;
  v_source_role public.company_roles%rowtype;
  v_target_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_talent public.talent_users%rowtype;
  v_source_recommendation public.talent_opportunity_recommendation%rowtype;
  v_target_recommendation public.talent_opportunity_recommendation%rowtype;
  v_source_fit public.talent_opportunity_fit%rowtype;
  v_target_fit public.talent_opportunity_fit%rowtype;
  v_source_tag text;
  v_target_tag text;
  v_source_stage_id text;
  v_source_stage_label text;
  v_target_stage_label text;
  v_target_existing_stage_id text;
  v_target_existing_stage_label text;
  v_target_custom_stage_id uuid;
  v_target_custom_stage_key text;
  v_move_reason text;
  v_locale text := 'ko';
  v_open_question_count integer := 0;
  v_active_meeting_count integer := 0;
  v_is_test_only boolean := false;
  v_event_key_prefix text;
  v_out_event_key text;
  v_in_event_key text;
  v_previous_target_state jsonb := '{}'::jsonb;
  v_provenance jsonb;
  v_result jsonb;
begin
  if p_company_workspace_id is null
    or p_talent_id is null
    or p_source_role_id is null
    or p_target_role_id is null
    or nullif(btrim(p_target_stage_id), '') is null
    or p_source_company_message_id is null
    or p_company_user_id is null then
    raise exception 'missing required role move input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', p_company_workspace_id, p_talent_id, p_source_role_id, p_target_role_id),
      0
    )
  );

  v_event_key_prefix := concat_ws(
    ':',
    'org-role-move',
    p_company_workspace_id,
    p_source_company_message_id,
    p_talent_id,
    p_source_role_id,
    p_target_role_id
  );
  v_out_event_key := v_event_key_prefix || ':out';
  v_in_event_key := v_event_key_prefix || ':in';

  select progress.metadata -> 'resultSnapshot'
    into v_existing_result
  from public.talent_progress progress
  where progress.kind = 'org_candidate_role_move'
    and progress.metadata ->> 'eventKey' = v_out_event_key
  order by progress.created_at desc, progress.id desc
  limit 1;

  if v_existing_result is not null then
    return v_existing_result || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into v_workspace
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_company_workspace_id;
  if not found then
    return jsonb_build_object(
      'status', 'permission_denied',
      'candidateNotification', 'not_created'
    );
  end if;

  select * into v_talent
  from public.talent_users talent
  where talent.user_id = p_talent_id
    and talent.deleted_at is null;
  if not found then
    return jsonb_build_object(
      'status', 'source_candidate_not_found',
      'candidateNotification', 'not_created'
    );
  end if;

  select * into v_source_role
  from public.company_roles role
  where role.role_id = p_source_role_id
    and role.company_workspace_id = p_company_workspace_id
    and lower(coalesce(role.source_type, '')) = 'internal'
  for update;

  select * into v_target_role
  from public.company_roles role
  where role.role_id = p_target_role_id
    and role.company_workspace_id = p_company_workspace_id
    and lower(coalesce(role.source_type, '')) = 'internal'
  for update;

  if v_source_role.role_id is null or v_target_role.role_id is null then
    return jsonb_build_object(
      'status', 'permission_denied',
      'candidateName', v_talent.name,
      'candidateNotification', 'not_created'
    );
  end if;

  if p_source_role_id = p_target_role_id then
    return jsonb_build_object(
      'status', 'same_role',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'candidateNotification', 'not_created'
    );
  end if;

  if lower(coalesce(v_target_role.status, '')) not in (
    'active', 'open', 'top_priority', 'paused'
  ) then
    return jsonb_build_object(
      'status', 'target_role_unavailable',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'targetRoleStatus', v_target_role.status,
      'candidateNotification', 'not_created'
    );
  end if;

  v_is_test_only := lower(coalesce(v_target_role.information ->> 'testOnly', 'false')) = 'true';
  if v_is_test_only and (
    nullif(btrim(v_target_role.information ->> 'testFixture'), '') is null
    or not coalesce(v_target_role.information -> 'testTalentIds', '[]'::jsonb)
      @> jsonb_build_array(p_talent_id::text)
  ) then
    return jsonb_build_object(
      'status', 'test_only_target_blocked',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'candidateNotification', 'not_created'
    );
  end if;

  select recommendation.* into v_source_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_source_role_id
  order by recommendation.updated_at desc, recommendation.created_at desc, recommendation.id desc
  limit 1
  for update;

  if v_source_recommendation.id is null then
    return jsonb_build_object(
      'status', 'source_candidate_not_found',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'candidateNotification', 'not_created'
    );
  end if;

  select tag.tag into v_source_tag
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

  if v_source_tag is null then
    return jsonb_build_object(
      'status', 'source_candidate_not_found',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'candidateNotification', 'not_created'
    );
  end if;

  if v_source_tag = '내부:연결대기' then
    v_source_stage_id := 'pending_connection';
    v_source_stage_label := '연결 대기';
  elsif v_source_tag = '내부:연결됨' then
    v_source_stage_id := 'connected';
    v_source_stage_label := '연결됨';
  elsif v_source_tag = '내부:최종오퍼' then
    v_source_stage_id := 'final_offer';
    v_source_stage_label := '최종 오퍼';
  elsif v_source_tag = '내부:프로세스중단' then
    v_source_stage_id := 'process_stopped';
    v_source_stage_label := '프로세스 중단';
  elsif v_source_tag = '내부:아카이브' then
    v_source_stage_id := 'archived';
    v_source_stage_label := '아카이브';
  else
    select 'custom:' || stage.id::text, stage.label
      into v_source_stage_id, v_source_stage_label
    from public.ops_matching_role_stages stage
    where stage.role_id = p_source_role_id
      and replace(lower(stage.id::text), '-', '') = substring(v_source_tag from length('내부단계:') + 1)
    limit 1;
    if v_source_stage_id is null then
      return jsonb_build_object(
        'status', 'source_candidate_not_found',
        'candidateName', v_talent.name,
        'sourceRoleName', v_source_role.name,
        'targetRoleName', v_target_role.name,
        'candidateNotification', 'not_created'
      );
    end if;
  end if;

  p_target_stage_id := lower(btrim(p_target_stage_id));
  if p_target_stage_id = 'pending_connection' then
    v_target_stage_label := '연결 대기';
    v_target_tag := '내부:연결대기';
  elsif p_target_stage_id = 'connected' then
    v_target_stage_label := '연결됨';
    v_target_tag := '내부:연결됨';
  elsif p_target_stage_id = 'final_offer' then
    v_target_stage_label := '최종 오퍼';
    v_target_tag := '내부:최종오퍼';
  elsif p_target_stage_id like 'custom:%' then
    begin
      v_target_custom_stage_id := substring(p_target_stage_id from length('custom:') + 1)::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object(
        'status', 'target_stage_not_found',
        'candidateName', v_talent.name,
        'sourceRoleName', v_source_role.name,
        'targetRoleName', v_target_role.name,
        'candidateNotification', 'not_created'
      );
    end;
    select stage.label into v_target_stage_label
    from public.ops_matching_role_stages stage
    where stage.id = v_target_custom_stage_id
      and stage.role_id = p_target_role_id;
    if v_target_stage_label is null then
      return jsonb_build_object(
        'status', 'target_stage_not_found',
        'candidateName', v_talent.name,
        'sourceRoleName', v_source_role.name,
        'targetRoleName', v_target_role.name,
        'candidateNotification', 'not_created'
      );
    end if;
    v_target_custom_stage_key := replace(lower(v_target_custom_stage_id::text), '-', '');
    v_target_tag := '내부단계:' || v_target_custom_stage_key;
  else
    return jsonb_build_object(
      'status', 'target_stage_not_supported',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'targetRoleName', v_target_role.name,
      'candidateNotification', 'not_created'
    );
  end if;

  select tag.tag into v_target_tag
  from public.talent_opportunity_tag tag
  where tag.talent_id = p_talent_id
    and tag.opportunity_id = p_target_role_id
    and (
      tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
      or tag.tag like '내부단계:%'
    )
  order by tag.updated_at desc, tag.created_at desc, tag.id desc
  limit 1
  for update;

  if v_target_tag is not null then
    if v_target_tag = '내부:연결대기' then
      v_target_existing_stage_id := 'pending_connection';
      v_target_existing_stage_label := '연결 대기';
    elsif v_target_tag = '내부:연결됨' then
      v_target_existing_stage_id := 'connected';
      v_target_existing_stage_label := '연결됨';
    elsif v_target_tag = '내부:최종오퍼' then
      v_target_existing_stage_id := 'final_offer';
      v_target_existing_stage_label := '최종 오퍼';
    else
      select 'custom:' || stage.id::text, stage.label
        into v_target_existing_stage_id, v_target_existing_stage_label
      from public.ops_matching_role_stages stage
      where stage.role_id = p_target_role_id
        and replace(lower(stage.id::text), '-', '') = substring(v_target_tag from length('내부단계:') + 1)
      limit 1;
      v_target_existing_stage_label := coalesce(v_target_existing_stage_label, '진행 중');
    end if;
    return jsonb_build_object(
      'status', 'already_in_target_pipeline',
      'candidateName', v_talent.name,
      'sourceRoleName', v_source_role.name,
      'sourceStageId', v_source_stage_id,
      'sourceStageLabel', v_source_stage_label,
      'targetRoleName', v_target_role.name,
      'targetRoleStatus', v_target_role.status,
      'targetExistingStageId', v_target_existing_stage_id,
      'targetExistingStageLabel', v_target_existing_stage_label,
      'candidateNotification', 'not_created'
    );
  end if;

  -- Recreate the exact destination tag after the active-pipeline check reused
  -- v_target_tag for the current target state.
  if p_target_stage_id = 'pending_connection' then
    v_target_tag := '내부:연결대기';
  elsif p_target_stage_id = 'connected' then
    v_target_tag := '내부:연결됨';
  elsif p_target_stage_id = 'final_offer' then
    v_target_tag := '내부:최종오퍼';
  else
    v_target_tag := '내부단계:' || v_target_custom_stage_key;
  end if;

  select recommendation.* into v_target_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_target_role_id
  order by recommendation.updated_at desc, recommendation.created_at desc, recommendation.id desc
  limit 1
  for update;

  if v_target_recommendation.id is not null then
    v_previous_target_state := jsonb_build_object(
      'feedback', v_target_recommendation.feedback,
      'savedStage', v_target_recommendation.saved_stage,
      'processedStage', v_target_recommendation.processed_stage
    );
  else
    insert into public.talent_opportunity_recommendation (
      talent_id,
      role_id,
      fit_summary,
      fit_reasons,
      talent_memo,
      tradeoffs,
      opportunity_type,
      kind,
      recommended_at
    ) values (
      p_talent_id,
      p_target_role_id,
      v_source_recommendation.fit_summary,
      coalesce(v_source_recommendation.fit_reasons, '[]'::jsonb),
      v_source_recommendation.talent_memo,
      coalesce(v_source_recommendation.tradeoffs, '[]'::jsonb),
      coalesce(nullif(v_source_recommendation.opportunity_type, ''), 'match'),
      coalesce(nullif(v_source_recommendation.kind, ''), 'match'),
      v_now
    ) returning * into v_target_recommendation;
  end if;

  v_provenance := jsonb_build_object(
    'transferId', v_transfer_id,
    'source', 'company_requested',
    'sourceRoleId', p_source_role_id,
    'targetRoleId', p_target_role_id,
    'targetStageId', p_target_stage_id,
    'movedAt', v_now
  );

  update public.talent_opportunity_recommendation
  set saved_stage = 'closed',
      processed_stage = 'archived',
      updated_at = v_now
  where id = v_source_recommendation.id;

  update public.talent_opportunity_recommendation
  set feedback = 'like',
      feedback_at = v_now,
      feedback_reason = null,
      saved_stage = 'connected',
      processed_stage = p_target_stage_id,
      recommended_at = v_now,
      dismissed_at = null,
      email_acceptance_confirmation = coalesce(email_acceptance_confirmation, '{}'::jsonb)
        || jsonb_build_object('roleMove', v_provenance),
      evidence = coalesce(evidence, '{}'::jsonb)
        || jsonb_build_object('roleMove', v_provenance),
      updated_at = v_now
  where id = v_target_recommendation.id
  returning * into v_target_recommendation;

  delete from public.talent_opportunity_tag
  where talent_id = p_talent_id
    and opportunity_id = p_source_role_id
    and (
      tag in (
        '내부:수락', '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
        '내부:프로세스중단', '내부:거절', '내부:보류', '내부:추천', '내부:아카이브'
      )
      or tag like '내부단계:%'
    );
  insert into public.talent_opportunity_tag (talent_id, opportunity_id, tag, created_at, updated_at)
  values (p_talent_id, p_source_role_id, '내부:아카이브', v_now, v_now);

  delete from public.talent_opportunity_tag
  where talent_id = p_talent_id
    and opportunity_id = p_target_role_id
    and (
      tag in (
        '내부:수락', '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
        '내부:프로세스중단', '내부:거절', '내부:보류', '내부:추천', '내부:아카이브'
      )
      or tag like '내부단계:%'
    );
  insert into public.talent_opportunity_tag (talent_id, opportunity_id, tag, created_at, updated_at)
  values (p_talent_id, p_target_role_id, v_target_tag, v_now, v_now);

  select fit.* into v_source_fit
  from public.talent_opportunity_fit fit
  where fit.talent_id = p_talent_id
    and fit.opportunity_id = p_source_role_id
  order by fit.last_evaluated_at desc, fit.created_at desc, fit.id desc
  limit 1;

  v_move_reason := concat_ws(
    E'\n\n',
    nullif(btrim(coalesce(v_source_fit.reason, v_source_recommendation.fit_summary, '')), ''),
    format('요청에 따라 %s에서 %s로 이동했습니다.', v_source_role.name, v_target_role.name)
  );

  if not v_is_test_only then
    select fit.* into v_target_fit
    from public.talent_opportunity_fit fit
    where fit.talent_id = p_talent_id
      and fit.opportunity_id = p_target_role_id
    order by fit.last_evaluated_at desc, fit.created_at desc, fit.id desc
    limit 1
    for update;

    if v_target_fit.id is not null then
      update public.talent_opportunity_fit
      set reason = v_move_reason,
          company_side_evaluation_metadata = coalesce(company_side_evaluation_metadata, '{}'::jsonb)
            || jsonb_build_object('roleMove', v_provenance),
          last_evaluated_at = v_now
      where id = v_target_fit.id;
    else
      insert into public.talent_opportunity_fit (
        talent_id,
        opportunity_id,
        label,
        score,
        reason,
        kind,
        company_side_evaluation_metadata,
        last_evaluated_at
      ) values (
        p_talent_id,
        p_target_role_id,
        coalesce(nullif(v_source_fit.label, ''), 'ambiguous'),
        coalesce(v_source_fit.score, 0),
        v_move_reason,
        'role_transfer',
        jsonb_build_object('roleMove', v_provenance),
        v_now
      );
    end if;
  end if;

  select count(*)::integer into v_open_question_count
  from public.company_talent_requests request
  where request.company_workspace_id = p_company_workspace_id
    and request.talent_id = p_talent_id
    and request.role_id = p_source_role_id
    and request.workflow_status in ('queued', 'awaiting_talent', 'relay_queued', 'review_required');

  select count(*)::integer into v_active_meeting_count
  from public.meeting_schedules meeting
  where meeting.company_workspace_id = p_company_workspace_id
    and meeting.talent_id = p_talent_id
    and meeting.role_id = p_source_role_id
    and (
      meeting.status in ('preparing', 'awaiting_talent')
      or (
        meeting.status = 'confirmed'
        and coalesce(meeting.confirmed_end_at, meeting.confirmed_start_at, v_now) >= v_now
      )
    );

  update public.contact_queue
  set status = 'cancelled',
      cancelled_at = v_now,
      locked_at = null,
      locked_by = null,
      last_error = 'candidate_role_moved',
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'roleMoveCancellation', jsonb_build_object(
          'transferId', v_transfer_id,
          'cancelledAt', v_now
        )
      ),
      updated_at = v_now
  where user_id = p_talent_id
    and role_id = p_source_role_id
    and type = 'internal_connection_confirmed'
    and status in ('queued', 'failed');

  select case
    when lower(coalesce(setting.setting_locale, setting.preferred_locale, 'ko')) like 'en%'
      then 'en'
    else 'ko'
  end into v_locale
  from public.talent_setting setting
  where setting.user_id = p_talent_id;
  v_locale := coalesce(v_locale, 'ko');

  v_result := jsonb_build_object(
    'status', 'moved',
    'transferId', v_transfer_id,
    'candidateName', v_talent.name,
    'sourceRoleName', v_source_role.name,
    'sourceRoleId', p_source_role_id,
    'sourceRecommendationId', v_source_recommendation.id,
    'sourceStageId', v_source_stage_id,
    'sourceStageLabel', v_source_stage_label,
    'targetRoleName', v_target_role.name,
    'targetRoleId', p_target_role_id,
    'targetRoleStatus', v_target_role.status,
    'targetRecommendationId', v_target_recommendation.id,
    'targetStageId', p_target_stage_id,
    'targetStageLabel', v_target_stage_label,
    'candidateNotification', 'queued',
    'openQuestionCount', v_open_question_count,
    'activeMeetingCount', v_active_meeting_count
  );

  insert into public.talent_progress (
    talent_id, role_id, recommendation_id, text, kind, metadata,
    company_user_id, created_at
  ) values (
    p_talent_id,
    p_source_role_id,
    v_source_recommendation.id,
    format('%s 역할에서 %s 역할로 이동되었습니다.', v_source_role.name, v_target_role.name),
    'org_candidate_role_move',
    jsonb_build_object(
      'eventType', 'candidate_role_moved',
      'eventKey', v_out_event_key,
      'transferId', v_transfer_id,
      'direction', 'out',
      'sourceRoleId', p_source_role_id,
      'sourceRoleName', v_source_role.name,
      'sourceRecommendationId', v_source_recommendation.id,
      'sourceStageId', v_source_stage_id,
      'sourceStageLabel', v_source_stage_label,
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'targetRecommendationId', v_target_recommendation.id,
      'targetStageId', p_target_stage_id,
      'targetStageLabel', v_target_stage_label,
      'previousTargetState', v_previous_target_state,
      'movedAt', v_now,
      'resultSnapshot', v_result
    ),
    p_company_user_id,
    v_now
  );

  insert into public.talent_progress (
    talent_id, role_id, recommendation_id, text, kind, metadata,
    company_user_id, created_at
  ) values (
    p_talent_id,
    p_target_role_id,
    v_target_recommendation.id,
    format('%s 역할에서 %s 역할로 이동되었습니다.', v_source_role.name, v_target_role.name),
    'org_candidate_role_move',
    jsonb_build_object(
      'eventType', 'candidate_role_moved',
      'eventKey', v_in_event_key,
      'transferId', v_transfer_id,
      'direction', 'in',
      'sourceRoleId', p_source_role_id,
      'sourceRoleName', v_source_role.name,
      'sourceRecommendationId', v_source_recommendation.id,
      'sourceStageId', v_source_stage_id,
      'sourceStageLabel', v_source_stage_label,
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'targetRecommendationId', v_target_recommendation.id,
      'targetStageId', p_target_stage_id,
      'targetStageLabel', v_target_stage_label,
      'previousTargetState', v_previous_target_state,
      'movedAt', v_now,
      'resultSnapshot', v_result
    ),
    p_company_user_id,
    v_now
  );

  insert into public.contact_queue (
    user_id,
    role_id,
    recommendation_id,
    type,
    status,
    scheduled_at,
    payload,
    created_at,
    updated_at
  ) values (
    p_talent_id,
    p_target_role_id,
    v_target_recommendation.id,
    'internal_candidate_role_changed',
    'queued',
    v_now,
    jsonb_build_object(
      'transferId', v_transfer_id,
      'locale', v_locale,
      'talentName', v_talent.name,
      'companyName', v_workspace.company_name,
      'sourceRoleId', p_source_role_id,
      'sourceRoleName', v_source_role.name,
      'targetRoleId', p_target_role_id,
      'targetRoleName', v_target_role.name,
      'targetStageId', p_target_stage_id,
      'targetStageLabel', v_target_stage_label
    ),
    v_now,
    v_now
  );

  return v_result;
end;
$$;

revoke all on function public.move_company_candidate_to_role_v1(
  uuid, uuid, uuid, uuid, text, bigint, uuid
) from public, anon, authenticated;

grant execute on function public.move_company_candidate_to_role_v1(
  uuid, uuid, uuid, uuid, text, bigint, uuid
) to service_role;
