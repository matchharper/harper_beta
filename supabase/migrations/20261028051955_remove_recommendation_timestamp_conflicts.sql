-- Recommendation choices must not depend on incidental viewed/clicked timestamps.
-- Keep the optional timestamp argument for older callers, but do not compare it.
-- Ownership, row locks, consent and the existing decision executors remain intact.
begin;

CREATE OR REPLACE FUNCTION public.accept_talent_internal_role_recommendation_v2(p_talent_id uuid, p_recommendation_id uuid, p_source_role_id uuid DEFAULT NULL::uuid, p_feedback_reason text DEFAULT NULL::text, p_email_acceptance_confirmation jsonb DEFAULT NULL::jsonb, p_context jsonb DEFAULT '{}'::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
 perform 1 from public.talent_opportunity_recommendation
   where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 perform set_config('harper.feedback_source','candidate_acceptance',true);
 return public.accept_talent_internal_role_recommendation_v1(p_talent_id,p_recommendation_id,p_source_role_id,
   p_feedback_reason,p_email_acceptance_confirmation,p_context);
end $function$;

CREATE OR REPLACE FUNCTION public.decide_company_intro_request_v2(p_talent_id uuid, p_recommendation_id uuid, p_decision text, p_feedback_reason text DEFAULT NULL::text, p_email_acceptance_confirmation jsonb DEFAULT NULL::jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
 perform 1 from public.talent_opportunity_recommendation
   where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 perform set_config('harper.feedback_source','candidate_intro_decision',true);
 return public.decide_company_intro_request_v1(p_talent_id,p_recommendation_id,p_decision,
   p_feedback_reason,p_email_acceptance_confirmation);
end $function$;

CREATE OR REPLACE FUNCTION public.update_talent_role_feedback_v2(p_talent_id uuid, p_recommendation_id uuid, p_feedback text, p_feedback_reason text, p_saved_stage text, p_feedback_at timestamp with time zone, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_source text DEFAULT 'career'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rec public.talent_opportunity_recommendation; v_internal boolean; v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
  select * into v_rec from public.talent_opportunity_recommendation
    where id=p_recommendation_id and talent_id=p_talent_id for update;
  if not found then raise exception 'talent_role_activity_recommendation_not_found' using errcode='P0002'; end if;
  if public.current_talent_recommendation_id_v1(p_recommendation_id)<>p_recommendation_id then
    raise exception 'internal_recommendation_superseded';
  end if;
  select source_type='internal' into v_internal from public.company_roles where role_id=v_rec.role_id;
  if p_feedback is not null and p_feedback not in ('like','dislike','keep') then
    raise exception 'talent_role_activity_feedback_invalid' using errcode='22023';
  end if;
  if p_feedback='keep' and not coalesce(v_internal,false) then
    raise exception 'keep_requires_internal_recommendation' using errcode='22023';
  end if;
  if p_feedback='keep' and v_rec.feedback='keep'
     and (p_feedback_reason is null or p_feedback_reason is not distinct from v_rec.feedback_reason) then
    return jsonb_build_object('status','no_change','savedStage',v_rec.saved_stage,'updatedAt',v_rec.updated_at);
  end if;
  if p_feedback='keep' and (
      v_rec.feedback in ('like','dislike','positive','negative')
      or coalesce(v_rec.saved_stage,'') in ('connected','applied','accepted')
      or exists (select 1 from public.talent_opportunity_tag
        where talent_id=p_talent_id and opportunity_id=v_rec.role_id
          and (tag in ('내부:수락','내부:연결대기','내부:연결됨','내부:최종오퍼') or tag like '내부단계:%'))
    ) then raise exception 'keep_cannot_change_existing_decision' using errcode='22023';
  end if;
  if v_internal and p_feedback is null and v_rec.feedback is not null and v_rec.feedback<>'keep' then
    raise exception 'internal_decision_requires_existing_revert_flow' using errcode='22023';
  end if;
  perform set_config('harper.feedback_source',coalesce(nullif(p_source,''),'unspecified'),true);
  if p_feedback='keep' then
    update public.talent_opportunity_recommendation
      set feedback='keep',saved_stage='saved',
          feedback_at=case when v_rec.feedback='keep' then v_rec.feedback_at else now() end,
          feedback_reason=coalesce(nullif(btrim(p_feedback_reason),''),v_rec.feedback_reason),
          email_acceptance_confirmation='{}'::jsonb,updated_at=now()
      where id=v_rec.id;
    return jsonb_build_object('status','saved','savedStage','saved','updatedAt',now());
  end if;
  select public.update_talent_role_feedback_v1(p_talent_id,p_recommendation_id,
    p_feedback,p_feedback_reason,p_saved_stage,case when p_feedback is null then null else now() end)
    into v_result;
  return v_result;
end $function$;

commit;
