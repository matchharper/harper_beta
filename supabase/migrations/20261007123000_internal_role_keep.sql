begin;
create or replace function public.update_talent_role_feedback_v2(
  p_talent_id uuid,p_recommendation_id uuid,p_feedback text,p_feedback_reason text,
  p_saved_stage text,p_feedback_at timestamptz,
  p_expected_updated_at timestamptz default null,p_source text default 'career'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
  if p_expected_updated_at is not null and p_expected_updated_at is distinct from v_rec.updated_at then
    raise exception 'recommendation_changed_refresh_required' using errcode='40001';
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
end $$;
revoke all on function public.update_talent_role_feedback_v2(uuid,uuid,text,text,text,timestamptz,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.update_talent_role_feedback_v2(uuid,uuid,text,text,text,timestamptz,timestamptz,text)
  to service_role;

create or replace function public.record_candidate_opportunity_feedback_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.feedback is not distinct from new.feedback then return new; end if;
  insert into public.talent_progress (
    talent_id,role_id,recommendation_id,kind,text,metadata,open_to_talent,open_to_company
  ) values (new.talent_id,new.role_id,new.id,'candidate_opportunity_feedback_changed',
    coalesce(new.feedback,'cleared'),jsonb_build_object(
      'previousFeedback',old.feedback,'feedback',new.feedback,
      'source',coalesce(nullif(current_setting('harper.feedback_source',true),''),'unspecified'),
      'feedbackAt',new.feedback_at),true,false);
  return new;
end $$;
revoke all on function public.record_candidate_opportunity_feedback_v1() from public,anon,authenticated;
create trigger record_candidate_opportunity_feedback
  after update of feedback on public.talent_opportunity_recommendation
  for each row execute function public.record_candidate_opportunity_feedback_v1();
commit;
