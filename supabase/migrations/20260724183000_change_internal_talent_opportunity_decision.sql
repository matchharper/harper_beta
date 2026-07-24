create or replace function public.change_internal_talent_opportunity_decision(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_action text,
  p_changed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feedback text;
  v_feedback_at timestamptz;
  v_role_id uuid;
  v_role_status text;
  v_saved_stage text;
  v_source_type text;
begin
  if p_action not in ('revert', 'stop_process') then
    raise exception using
      errcode = '22023',
      message = 'invalid_internal_opportunity_decision_action';
  end if;

  select
    recommendation.feedback,
    recommendation.feedback_at,
    recommendation.role_id,
    recommendation.saved_stage,
    role.status,
    role.source_type
  into
    v_feedback,
    v_feedback_at,
    v_role_id,
    v_saved_stage,
    v_role_status,
    v_source_type
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role
    on role.role_id = recommendation.role_id
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update of recommendation;

  if not found or v_source_type is distinct from 'internal' then
    raise exception using
      errcode = 'P0002',
      message = 'internal_opportunity_not_found';
  end if;

  if p_action = 'revert' then
    if v_feedback = 'like' then
      if lower(trim(coalesce(v_saved_stage, ''))) = 'closed' then
        raise exception using
          errcode = 'P0001',
          message = 'internal_acceptance_already_progressed';
      end if;

      if v_feedback_at is null
        or p_changed_at < v_feedback_at
        or p_changed_at - v_feedback_at >= interval '24 hours'
      then
        raise exception using
          errcode = 'P0001',
          message = 'internal_acceptance_revert_window_expired';
      end if;

      if exists (
        select 1
        from public.talent_opportunity_tag tag
        where tag.talent_id = p_talent_id
          and tag.opportunity_id = v_role_id
          and (
            tag.tag like '내부:%'
            or tag.tag like '내부단계:%'
          )
          and tag.tag not in ('내부:수락', '내부:추천')
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'internal_acceptance_already_progressed';
      end if;
    elsif v_feedback = 'dislike' then
      if lower(trim(coalesce(v_role_status, ''))) = 'ended' then
        raise exception using
          errcode = 'P0001',
          message = 'ended_internal_role_cannot_be_reverted';
      end if;
    else
      raise exception using
        errcode = 'P0001',
        message = 'internal_decision_cannot_be_reverted';
    end if;

    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id
      and opportunity_id = v_role_id
      and (
        tag like '내부:%'
        or tag like '내부단계:%'
      );

    update public.talent_opportunity_recommendation
    set
      email_acceptance_confirmation = '{}'::jsonb,
      feedback = null,
      feedback_at = null,
      feedback_reason = null,
      saved_stage = null
    where id = p_recommendation_id
      and talent_id = p_talent_id;
  else
    if v_feedback is distinct from 'like' then
      raise exception using
        errcode = 'P0001',
        message = 'only_accepted_internal_role_can_be_stopped';
    end if;

    if lower(trim(coalesce(v_saved_stage, ''))) = 'closed' then
      raise exception using
        errcode = 'P0001',
        message = 'internal_process_already_closed';
    end if;

    if exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = v_role_id
        and tag.tag in ('내부:아카이브', '내부:프로세스중단', '내부:거절')
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'internal_process_already_closed';
    end if;

    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id
      and opportunity_id = v_role_id
      and (
        tag like '내부:%'
        or tag like '내부단계:%'
      );

    insert into public.talent_opportunity_tag (
      opportunity_id,
      tag,
      talent_id,
      updated_at
    )
    values (
      v_role_id,
      '내부:프로세스중단',
      p_talent_id,
      p_changed_at
    );

    update public.talent_opportunity_recommendation
    set saved_stage = 'closed'
    where id = p_recommendation_id
      and talent_id = p_talent_id;
  end if;

  update public.talent_calls
  set
    completed_at = p_changed_at,
    last_active_at = p_changed_at,
    state = coalesce(state, '{}'::jsonb) || jsonb_build_object(
      'closedFrom',
      'internal_opportunity_decision_change'
    ),
    status = 'completed',
    updated_at = p_changed_at
  where user_id = p_talent_id
    and kind = 'internal_opportunity_request'
    and status in ('pending', 'active')
    and state ->> 'opportunityId' = p_recommendation_id::text;

  return p_recommendation_id;
end;
$$;

revoke all on function public.change_internal_talent_opportunity_decision(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.change_internal_talent_opportunity_decision(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;
