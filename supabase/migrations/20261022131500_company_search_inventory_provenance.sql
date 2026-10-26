-- Expose the actual comparison boundary behind a changing new-member count.
-- Existing populations and authorization remain unchanged; no synthetic history.
create or replace function public.company_role_search_inventory_v1(p_workspace uuid, p_role uuid, p_version text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with last_search as (
    select id, source_cutoff as cutoff from public.company_first_search_runs
    where company_workspace_id=p_workspace and status='succeeded'
      and (role_id=p_role or p_role=any(requested_role_ids) or p_role=any(scheduled_role_ids))
      and source_cutoff is not null
    order by source_cutoff desc, id desc limit 1
  ), population as (
    select talent.user_id, talent.created_at,
      exists(select 1 from public.company_role_candidate_evaluations e
        where e.company_workspace_id=p_workspace and e.role_id=p_role and e.talent_id=talent.user_id
          and e.brief_version=p_version
          and (e.stage=2 or (e.stage=1 and e.assessment->>'proceedToStage2'='false'
            and not exists(select 1 from public.company_role_candidate_evaluations later
              where later.role_id=e.role_id and later.talent_id=e.talent_id and later.brief_version=e.brief_version
                and later.stage=1 and (later.evaluated_at,later.id)>(e.evaluated_at,e.id))))) as assessed
    from public.talent_users talent join public.talent_setting settings on settings.user_id=talent.user_id
    join public.company_workspace workspace on workspace.company_workspace_id=p_workspace
    join public.company_roles role on role.role_id=p_role and role.company_workspace_id=p_workspace
    where talent.deleted_at is null and settings.is_onboarding_done is true
      and settings.profile_visibility='open_to_matches' and settings.get_internal_recommendation is not false
      and not exists(select 1 from unnest(coalesce(settings.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
  ) select jsonb_build_object('newMembersSince',(select cutoff from last_search),
      'newMembersSinceRunId',(select id from last_search),'shareable',count(*),'unassessed',count(*) filter(where not assessed),
      'newUnassessed',count(*) filter(where not assessed and created_at>coalesce((select cutoff from last_search),'-infinity'::timestamptz)))
    from population
$$;
