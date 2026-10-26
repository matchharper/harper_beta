-- Accepted candidates use the same review path for every internal role type.
-- Consent, sharing, live role, existing delivery and terminal-state guards remain.
create or replace function public.accepted_role_pair_is_available_v1(p_recommendation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.talent_opportunity_recommendation rec
    join public.company_roles role on role.role_id=rec.role_id
    join public.company_internal_roles internal_role on internal_role.role_id=role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id=role.company_workspace_id
    join public.talent_users talent on talent.user_id=rec.talent_id
    join public.talent_setting setting on setting.user_id=rec.talent_id
    where rec.id=p_recommendation_id and rec.feedback='like' and rec.saved_stage='connected'
      and coalesce(rec.opportunity_type,'') <> 'intro_request'
      and public.current_talent_recommendation_id_v1(rec.id)=rec.id
      and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
      and (role.expires_at is null or role.expires_at>now())
      and coalesce(lower(btrim(role.information->>'testOnly')),'') not in ('true','1','yes','on')
      and public.role_matching_slot_type_v1(role.role_id,now()) in ('free','paid')
      and talent.deleted_at is null and setting.is_onboarding_done is true
      and setting.profile_visibility in ('open_to_matches','exceptional_only')
      and setting.get_internal_recommendation is not false
      and not exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      and not exists (select 1 from public.talent_opportunity_recommendation newer
        where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
          and (newer.created_at,newer.id)>(rec.created_at,rec.id))
      and not exists (select 1 from public.company_intro_candidates intro
        where intro.talent_id=rec.talent_id and intro.role_id=rec.role_id)
      and not exists (select 1 from public.talent_opportunity_tag tag
        where tag.talent_id=rec.talent_id and tag.opportunity_id=rec.role_id
          and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브')
            or tag.tag like '내부단계:%'))
      and not exists (select 1 from public.talent_progress progress
        where progress.talent_id=rec.talent_id and progress.role_id=rec.role_id
          and progress.kind='intro_to_company'
          and (progress.metadata->>'slackSent'='true' or progress.metadata->>'deliveryStatus' in ('pending','sent')))
      and not exists (select 1 from public.talent_opportunity_matching_review review
        join public.talent_opportunity_fit fit on fit.talent_id=review.talent_id and fit.opportunity_id=review.opportunity_id
        where review.recommendation_id=rec.id and review.decision='reject' and review.closed_at is null
          and fit.expires_at>now() and review.input_fingerprint=fit.input_fingerprint)
  );
$$;
revoke all on function public.accepted_role_pair_is_available_v1(uuid) from public,anon,authenticated;
grant execute on function public.accepted_role_pair_is_available_v1(uuid) to service_role;
