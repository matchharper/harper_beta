-- A Role-search selection waits for candidate cadence. NULL delivery asks only
-- whether an unassigned proposal is current; a concrete delivery also needs its
-- exact contact decision. The search weekday is not a delivery authorization.
create or replace function public.scheduled_candidate_delivery_is_current_v1(p_talent uuid,p_role uuid,p_delivery uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
select exists(
  select 1 from public.talent_opportunity_matching_review selected
  join public.company_first_search_runs search on search.id=selected.run_id
  left join public.opportunity_discovery_run delivery on delivery.id=p_delivery and delivery.talent_id=p_talent
  join public.company_roles role on role.role_id=selected.opportunity_id
  join public.company_workspace company on company.company_workspace_id=role.company_workspace_id
  join public.talent_users talent on talent.user_id=selected.talent_id
  join public.talent_setting setting on setting.user_id=talent.user_id
  where selected.talent_id=p_talent and selected.opportunity_id=p_role
    and selected.decision in ('candidate_first','both') and selected.closed_at is null
    and (selected.recommendation_id is null or exists (
      select 1 from public.talent_opportunity_recommendation own_rec
      where own_rec.id=selected.recommendation_id and own_rec.discovery_run_id=p_delivery))
    and (selected.discovery_run_id is null or selected.discovery_run_id=p_delivery)
    and (p_delivery is null or (
      delivery.context_metrics->'internalContactSelection'->'selectedReviewIds' ? selected.id::text
      and delivery.context_metrics->'internalContactSelection'->'result'->'roleIds' ? p_role::text
    ) or (
      -- Keep already queued/sealed deliveries compatible during rollout.
      selected.discovery_run_id=p_delivery
      and delivery.trigger_payload->'manualInternalRecommendation'->>'matchingReviewId'=selected.id::text
    ))
    and selected.not_before<=now()
    and not exists (
      select 1 from public.opportunity_discovery_run contact_run
      where contact_run.talent_id=p_talent
        and (contact_run.context_metrics->'internalContactSelection'->'rejectedReviewIds' ? selected.id::text
          or (contact_run.context_metrics->'internalContactSelection'->'handledReviewIds' ? selected.id::text
        and (contact_run.context_metrics->'internalContactSelection'->'result'->'roleIds'='[]'::jsonb
          or exists (
            select 1 from public.talent_opportunity_delivery sent
            where sent.discovery_run_id=contact_run.id and sent.talent_id=p_talent
              and sent.channel='email' and sent.status='sent'
              and not exists (
                select 1 from jsonb_array_elements_text(
                  contact_run.context_metrics->'internalContactSelection'->'result'->'roleIds') chosen(id)
                where not coalesce(sent.payload->'recommendationExposures'
                  @> jsonb_build_array(jsonb_build_object('roleId',chosen.id)),false)))))))
    and search.contract_version='scheduled_agentic_role_search_v1'
    and selected.evaluation_ref->>'inputContractVersion'='worker_behavior_v1'
    and selected.evaluation_ref->>'briefVersion'=public.company_role_search_brief_version_v1(p_role)
    and selected.evaluation_ref->>'talentSourceFingerprint'=public.scheduled_talent_source_fingerprint_v1(p_talent)
    and selected.evaluation_ref->>'companyMemoryFingerprint'=public.scheduled_company_memory_fingerprint_v1(p_role)
    and selected.evaluation_ref->>'inputFingerprint'=selected.input_fingerprint
    and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
    and (role.expires_at is null or role.expires_at>now())
    and lower(coalesce(role.information->>'testOnly','false')) not in ('true','1','yes','on')
    and public.role_matching_slot_type_v1(p_role,now())='paid'
    and talent.deleted_at is null and setting.get_internal_recommendation is not false
    and setting.profile_visibility in ('open_to_matches','exceptional_only')
    and not exists(select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
      where lower(btrim(blocked.name)) in (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))
    and not exists(select 1 from public.talent_opportunity_recommendation rec
      where rec.talent_id=p_talent and rec.role_id=p_role and rec.discovery_run_id is distinct from p_delivery)
    and not exists(select 1 from public.company_intro_candidates intro
      where intro.talent_id=p_talent and intro.role_id=p_role
        and (intro.status in ('awaiting_talent','connecting','connected','passed') or intro.close_reason='company_passed'))
    and not exists(select 1 from public.talent_opportunity_tag tag
      where tag.talent_id=p_talent and tag.opportunity_id=p_role
        and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag.tag like '내부단계:%'))
);
$$;
revoke all on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) to service_role;

-- An unchanged proposal, including a candidate-side rejection, must not be
-- selected again. A stale Decisions reference must not block a genuinely new
-- assessment after Behavior Context or company Memory changes. Those sources
-- do not close review rows through the older fit invalidation triggers.
create or replace function public.talent_first_pair_is_available_v1(p_talent_id uuid,p_role_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not exists (select 1 from public.talent_opportunity_recommendation
    where talent_id=p_talent_id and role_id=p_role_id)
  and not exists (select 1 from public.talent_opportunity_matching_review review
    where review.talent_id=p_talent_id and review.opportunity_id=p_role_id
      and review.decision in ('candidate_first','both') and review.closed_at is null
      and review.recommendation_id is null
      and (review.evaluation_ref->>'inputContractVersion' is distinct from 'worker_behavior_v1' or (
        review.evaluation_ref->>'briefVersion'=public.company_role_search_brief_version_v1(p_role_id)
        and review.evaluation_ref->>'talentSourceFingerprint'=public.scheduled_talent_source_fingerprint_v1(p_talent_id)
        and review.evaluation_ref->>'companyMemoryFingerprint'=public.scheduled_company_memory_fingerprint_v1(p_role_id)
        and review.evaluation_ref->>'inputFingerprint'=review.input_fingerprint)))
  and not exists (select 1 from public.company_intro_candidates
    where talent_id=p_talent_id and role_id=p_role_id
      and (status in ('awaiting_talent','connecting','connected','passed') or close_reason='company_passed'))
  and not exists (select 1 from public.talent_opportunity_tag
    where talent_id=p_talent_id and opportunity_id=p_role_id
      and (tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼') or tag like '내부단계:%'));
$$;
revoke all on function public.talent_first_pair_is_available_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.talent_first_pair_is_available_v1(uuid,uuid) to service_role;
