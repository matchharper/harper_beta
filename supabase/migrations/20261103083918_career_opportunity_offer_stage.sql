-- Final offers use the existing personal opportunity progress and activity records.
begin;
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
  if p_saved_stage not in ('saved', 'applied', 'connected', 'offer', 'closed', 'hidden') then
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
     and p_saved_stage not in ('saved', 'applied', 'connected', 'offer', 'closed', 'hidden') then
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

commit;
