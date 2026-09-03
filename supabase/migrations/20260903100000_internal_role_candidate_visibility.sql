create or replace function public.request_talent_internal_role_reconsideration_v1(
  p_talent_id uuid,
  p_role_id uuid,
  p_new_information text,
  p_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_role public.company_roles%rowtype;
  v_fit public.talent_opportunity_fit%rowtype;
  v_company_name text := 'Undisclosed internal company';
  v_new_information text := nullif(btrim(coalesce(p_new_information, '')), '');
  v_previous_criteria jsonb := '{}'::jsonb;
  v_next_criteria jsonb;
  v_kind text;
  v_already_scheduled boolean := false;
begin
  if p_talent_id is null or p_role_id is null or v_new_information is null then
    raise exception 'talent_internal_role_reconsideration_missing_input';
  end if;

  select role.* into v_role
  from public.company_roles role
  where role.role_id = p_role_id
  for update;

  if v_role.role_id is null
    or lower(coalesce(v_role.source_type, '')) <> 'internal'
    or lower(coalesce(v_role.status, '')) <> 'active'
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now)
    or lower(coalesce(v_role.information->>'testOnly', 'false')) = 'true'
  then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'role_not_available',
      'roleId', p_role_id,
      'reconsiderationScheduled', false
    );
  end if;

  select coalesce(
    nullif(btrim(workspace.published_name), ''),
    'Undisclosed internal company'
  ) into v_company_name
  from public.company_workspace workspace
  where workspace.company_workspace_id = v_role.company_workspace_id;

  select fit.* into v_fit
  from public.talent_opportunity_fit fit
  where fit.talent_id = p_talent_id
    and fit.opportunity_id = p_role_id
  order by fit.last_evaluated_at desc, fit.created_at desc, fit.id desc
  limit 1
  for update;

  if v_fit.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'fit_review_in_progress',
      'roleId', p_role_id,
      'roleName', v_role.name,
      'company', v_company_name,
      'reconsiderationScheduled', false
    );
  end if;

  if nullif(btrim(coalesce(v_fit.human_label, '')), '') is not null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'human_review_required',
      'roleId', p_role_id,
      'roleName', v_role.name,
      'company', v_company_name,
      'reconsiderationScheduled', false
    );
  end if;

  if lower(btrim(coalesce(v_fit.candidate_fit, ''))) = 'unfit' then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'candidate_preference_unfit',
      'roleId', p_role_id,
      'roleName', v_role.name,
      'company', v_company_name,
      'reconsiderationScheduled', false
    );
  elsif lower(btrim(coalesce(v_fit.label, ''))) = 'hold' then
    v_kind := 'hold_answer';
  elsif lower(btrim(coalesce(v_fit.role_fit, ''))) = 'fit'
    and lower(btrim(coalesce(v_fit.company_fit, ''))) = 'fit'
    and lower(btrim(coalesce(v_fit.candidate_fit, ''))) = 'middle'
  then
    v_kind := 'candidate_preference';
  else
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'not_reconsideration_eligible',
      'roleId', p_role_id,
      'roleName', v_role.name,
      'company', v_company_name,
      'reconsiderationScheduled', false
    );
  end if;

  if exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    where recommendation.talent_id = p_talent_id
      and recommendation.role_id = p_role_id
      and coalesce(recommendation.saved_stage, '') <> 'closed'
  ) then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'already_formally_recommended',
      'roleId', p_role_id,
      'roleName', v_role.name,
      'company', v_company_name,
      'reconsiderationScheduled', false
    );
  end if;

  if jsonb_typeof(v_fit.reevaluation_criteria) = 'object' then
    v_previous_criteria := v_fit.reevaluation_criteria;
  end if;

  v_already_scheduled :=
    v_fit.reevaluation_checked_at is null
    and nullif(btrim(coalesce(v_previous_criteria->>'new_information', '')), '')
      = v_new_information;

  v_next_criteria := v_previous_criteria || jsonb_build_object(
    'new_information', left(v_new_information, 700),
    'requested_at', v_now,
    'request_source', left(btrim(coalesce(p_context->>'source', 'unknown')), 80),
    'reconsideration_kind', v_kind,
    'summary', coalesce(
      nullif(btrim(v_previous_criteria->>'summary'), ''),
      nullif(btrim(v_previous_criteria->>'question'), ''),
      case
        when v_kind = 'candidate_preference'
          then 'Reconsider this role using the candidate preference or context they just provided.'
        else 'Reconsider this role using the candidate fact they just provided.'
      end
    )
  );

  update public.talent_opportunity_fit
  set reevaluation_criteria = v_next_criteria,
      reevaluation_checked_at = null
  where id = v_fit.id;

  return jsonb_build_object(
    'status', case when v_already_scheduled then 'already_scheduled' else 'scheduled' end,
    'reason', v_kind,
    'fitId', v_fit.id,
    'roleId', p_role_id,
    'roleName', v_role.name,
    'company', v_company_name,
    'requestedAt', v_now,
    'reconsiderationKind', v_kind,
    'reconsiderationScheduled', true
  );
end;
$$;

comment on function public.request_talent_internal_role_reconsideration_v1(
  uuid,
  uuid,
  text,
  jsonb
) is
  'Schedules exact-role reevaluation only for an automatic hold or A/C fit with B=middle, using the existing reevaluation fields.';

revoke all on function public.request_talent_internal_role_reconsideration_v1(
  uuid,
  uuid,
  text,
  jsonb
) from public;

grant execute on function public.request_talent_internal_role_reconsideration_v1(
  uuid,
  uuid,
  text,
  jsonb
) to service_role;
