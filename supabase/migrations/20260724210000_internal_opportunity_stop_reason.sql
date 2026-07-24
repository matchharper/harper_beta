create or replace function public.change_internal_talent_opportunity_decision(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_action text,
  p_changed_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_role_id uuid;
  v_result uuid;
begin
  v_result := public.change_internal_talent_opportunity_decision(
    p_talent_id,
    p_recommendation_id,
    p_action,
    p_changed_at
  );

  if p_action <> 'stop_process' then
    return v_result;
  end if;

  v_reason := nullif(left(btrim(coalesce(p_reason, '')), 1000), '');

  select recommendation.role_id
  into v_role_id
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id;

  insert into public.talent_progress (
    kind,
    metadata,
    recommendation_id,
    role_id,
    talent_id,
    text
  )
  values (
    'org_stage_change',
    jsonb_build_object(
      'source', 'career_position_tab',
      'stage', 'process_stopped',
      'stopNote', v_reason,
      'stopReason', 'candidate',
      'tag', '내부:프로세스중단'
    ),
    p_recommendation_id,
    v_role_id,
    p_talent_id,
    case
      when v_reason is null then
        '후보자가 제품에서 진행을 중단했습니다.'
      else
        '후보자가 제품에서 진행을 중단했습니다.' || E'\n이유: ' || v_reason
    end
  );

  return v_result;
end;
$$;

revoke all on function public.change_internal_talent_opportunity_decision(
  uuid,
  uuid,
  text,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function public.change_internal_talent_opportunity_decision(
  uuid,
  uuid,
  text,
  timestamptz,
  text
) to service_role;
