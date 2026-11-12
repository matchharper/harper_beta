-- Company-side read windows (PR-5). Additive: two views, no table, function or data change.
--
-- 1) company_readable_talents_v1: who a company workspace may read.
--    One row per talent x company workspace where the talent is not deleted and has
--    not blocked that company. Row presence is the "already related" rule (R5).
--    Each boolean column is one existing rule, so every reader keeps the rule it uses:
--      can_show_new          (R1) onboarding done, open_to_matches, internal recommendation not off
--      can_consider          (R2) onboarding done or an experience/education row,
--                                 open_to_matches or exceptional_only, internal recommendation not off.
--                                 profile_visibility only takes open_to_matches/exceptional_only/dont_share,
--                                 so this is also the evidence-read rule written as <> 'dont_share'.
--      can_continue_accepted (R4) onboarding done, open_to_matches or exceptional_only,
--                                 internal recommendation not off
--    The view crosses talents with every workspace: always filter by company_workspace_id.
--    Simple security_invoker view (no SECURITY DEFINER, no SET): the planner inlines it, so
--    talent_id = ANY(...) and the workspace filter reach the base tables' keys as before.
--
--    Blocked-company names are compared after the same trim as the web's JS String.trim():
--    leading/trailing TAB, LF, VT, FF, CR, SPACE, NBSP, U+1680, U+2000-U+200A, U+2028, U+2029,
--    U+202F, U+205F, U+3000 and U+FEFF are removed (btrim() removed plain spaces only), then
--    lower(). Everything else in the comparison is unchanged: a blocked name equal to the
--    company name or to coalesce(published_name, '') blocks that workspace.
--    A blocked name that is empty after the trim ('', spaces, a tab, an NBSP) is ignored,
--    as the web drops it with filter(Boolean); otherwise it would equal
--    coalesce(published_name, '') and hide the talent from every workspace without a
--    published name. Production has no such entry (2026-11-11), so no row changes.
--
-- 2) company_readable_role_fit_v1: the talent_opportunity_fit columns the company web reads,
--    with the workspace of the Role, so a reader can scope by company_workspace_id.
--
-- Both are service_role only, like company_readable_role_evaluations_v1, plus SELECT for
-- harper_worker where that role exists (like 20261108141000:213-217), so a Worker running
-- with WORKER_DB_ROLE=harper_worker can read them. harper_worker already reads every base
-- table these security_invoker views read (talent_users, talent_setting, company_workspace,
-- talent_experiences, talent_educations, talent_opportunity_fit, company_roles; checked in
-- production 2026-11-11), so this adds no data access.

create or replace view public.company_readable_talents_v1 with (security_invoker = true) as
select talent.user_id as talent_id,
       workspace.company_workspace_id,
       (setting.is_onboarding_done is true
        and setting.profile_visibility = 'open_to_matches'
        and setting.get_internal_recommendation is not false) as can_show_new,
       ((setting.is_onboarding_done is true
         or exists (select 1 from public.talent_experiences experience
                    where experience.talent_id = talent.user_id)
         or exists (select 1 from public.talent_educations education
                    where education.talent_id = talent.user_id))
        and setting.profile_visibility in ('open_to_matches', 'exceptional_only')
        and setting.get_internal_recommendation is not false) as can_consider,
       (setting.is_onboarding_done is true
        and setting.profile_visibility in ('open_to_matches', 'exceptional_only')
        and setting.get_internal_recommendation is not false) as can_continue_accepted
from public.talent_users talent
join public.talent_setting setting on setting.user_id = talent.user_id
cross join public.company_workspace workspace
where talent.deleted_at is null
  and not exists (
    select 1 from unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
    -- A name that is empty after the trim becomes null and matches nothing.
    where nullif(lower(regexp_replace(blocked.name,
            '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
            '', 'g')), '')
      in (lower(regexp_replace(workspace.company_name,
            '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
            '', 'g')),
          lower(regexp_replace(coalesce(workspace.published_name, ''),
            '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+|[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+$',
            '', 'g'))));

revoke all on public.company_readable_talents_v1 from public, anon, authenticated;
grant select on public.company_readable_talents_v1 to service_role;

create or replace view public.company_readable_role_fit_v1 with (security_invoker = true) as
select fit.id, fit.talent_id, fit.opportunity_id, role.company_workspace_id,
       fit.score, fit.company_criteria_evaluations,
       -- talent_role_fit_v2 writes reason only at stage 1, from the candidate's
       -- side (it quotes the candidate's own Brief); companies get no v2 reason.
       case when fit.fit_contract_version is distinct from 'talent_role_fit_v2'
            then fit.reason end as reason,
       fit.last_evaluated_at, fit.created_at, fit.expires_at
from public.talent_opportunity_fit fit
join public.company_roles role on role.role_id = fit.opportunity_id;

revoke all on public.company_readable_role_fit_v1 from public, anon, authenticated;
grant select on public.company_readable_role_fit_v1 to service_role;

-- The direct-Postgres Worker may run as harper_worker. It already reads every base
-- table of these views; no table privileges are added.
do $$ begin
 if exists(select 1 from pg_roles where rolname='harper_worker') then
  grant select on public.company_readable_talents_v1, public.company_readable_role_fit_v1 to harper_worker;
 end if;
end $$;
