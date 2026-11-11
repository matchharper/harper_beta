-- Requested-search scores that read candidate Memory stop counting as evaluated
-- (pairs with Worker PR-3 option (b), company_requested_repository.scored_without_candidate_memory).
--
-- Stage-1/2 rows of company_role_candidate_evaluations saved by a company-requested
-- search (run contract company_agentic_role_search_v1) without an input contract
-- (input_contract_version IS NULL) are the earlier projection that also read the
-- candidate's Memory. The Worker no longer uses them as current scores and evaluates
-- those pairs again, so the unevaluated count shown to the company-side LLM counts
-- them as not evaluated too. Every other row still counts as before: Worker Behavior
-- rows (scheduled search, Opportunity, Career), company_requested_behavior_v1 rows,
-- stage-3 explanations and NULL rows of other run contracts (operator preview).
-- No row is changed or deleted; history is kept.
--
-- Section 2 is the definition from 20261022131500 copied exactly; the only change is
-- the two "not (... memory_run ...)" conditions (the evaluated row, and the later
-- stage-one row that would retire an earlier exclusion).
--
-- Section 1 guards against reverting a production change made after that migration:
-- the migration stops (nothing is replaced) unless the live definition is the one
-- copied here (md5 of pg_get_functiondef) or already has this change (a re-run).
-- The md5 is pg_get_functiondef of the 20261022131500 definition: local PostgreSQL
-- 16.15, PGlite 0.5.8 (PostgreSQL 18.3) and the production catalog (PostgreSQL 17,
-- read-only check on 2026-11-11) all print the same value;
-- requestedMemoryScores.database.test.ts checks it locally.
-- If it stops, re-copy the current production definition into section 2, add the
-- two conditions again and update the md5 here.

-- 1. Guard.
do $$
declare
  definition text;
begin
  if to_regprocedure('public.company_role_search_inventory_v1(uuid,uuid,text)') is null then
    raise exception 'inventory_definition_changed: public.company_role_search_inventory_v1(uuid,uuid,text) does not exist; re-copy the current production definition into section 2';
  end if;
  definition := pg_get_functiondef(to_regprocedure('public.company_role_search_inventory_v1(uuid,uuid,text)'));
  if md5(definition) <> '54c04d541f76a203100eb7f74f12b655'
    and position('memory_run.contract_version=''company_agentic_role_search_v1''' in definition) = 0 then
    raise exception 'inventory_definition_changed: public.company_role_search_inventory_v1 is not the 20261022131500 definition (md5 % <> 54c04d541f76a203100eb7f74f12b655); re-copy the current production definition into section 2, add the two conditions and update the md5 here',
      md5(definition);
  end if;
end;
$$;

-- 2. The 20261022131500 definition with the two conditions.
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
          and not (e.input_contract_version is null and e.stage in (1,2)
            and exists(select 1 from public.company_first_search_runs memory_run
              where memory_run.id=e.run_id and memory_run.contract_version='company_agentic_role_search_v1'))
          and (e.stage=2 or (e.stage=1 and e.assessment->>'proceedToStage2'='false'
            and not exists(select 1 from public.company_role_candidate_evaluations later
              where later.role_id=e.role_id and later.talent_id=e.talent_id and later.brief_version=e.brief_version
                and later.stage=1 and (later.evaluated_at,later.id)>(e.evaluated_at,e.id)
                and not (later.input_contract_version is null and later.stage in (1,2)
                  and exists(select 1 from public.company_first_search_runs memory_run
                    where memory_run.id=later.run_id and memory_run.contract_version='company_agentic_role_search_v1')))))) as assessed
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
