begin;
-- The UI's displayed revision is checked under the same lock as acceptance.
create or replace function public.accept_talent_internal_role_recommendation_v2(
 p_talent_id uuid,p_recommendation_id uuid,p_source_role_id uuid default null,
 p_feedback_reason text default null,p_email_acceptance_confirmation jsonb default null,
 p_context jsonb default '{}'::jsonb,p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
 select updated_at into current_revision from public.talent_opportunity_recommendation
   where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 if p_expected_updated_at is not null and current_revision is distinct from p_expected_updated_at then
   raise exception 'recommendation_changed_refresh_required' using errcode='40001';
 end if;
 perform set_config('harper.feedback_source','candidate_acceptance',true);
 return public.accept_talent_internal_role_recommendation_v1(p_talent_id,p_recommendation_id,p_source_role_id,
   p_feedback_reason,p_email_acceptance_confirmation,p_context);
end $$;
revoke all on function public.accept_talent_internal_role_recommendation_v2(uuid,uuid,uuid,text,jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.accept_talent_internal_role_recommendation_v2(uuid,uuid,uuid,text,jsonb,jsonb,timestamptz) to service_role;

create or replace function public.decide_company_intro_request_v2(
 p_talent_id uuid,p_recommendation_id uuid,p_decision text,
 p_feedback_reason text default null,p_email_acceptance_confirmation jsonb default null,
 p_expected_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
 select updated_at into current_revision from public.talent_opportunity_recommendation
   where id=p_recommendation_id and talent_id=p_talent_id for update;
 if not found then raise exception 'internal_opportunity_not_found'; end if;
 if p_expected_updated_at is not null and current_revision is distinct from p_expected_updated_at then
   raise exception 'recommendation_changed_refresh_required' using errcode='40001';
 end if;
 perform set_config('harper.feedback_source','candidate_intro_decision',true);
 return public.decide_company_intro_request_v1(p_talent_id,p_recommendation_id,p_decision,
   p_feedback_reason,p_email_acceptance_confirmation);
end $$;
revoke all on function public.decide_company_intro_request_v2(uuid,uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.decide_company_intro_request_v2(uuid,uuid,text,text,jsonb,timestamptz) to service_role;
commit;
