begin;

-- Reuse the existing pair assessment cache. This is the actual Decisions result,
-- consumed by talent selection and contact composition, not a new reasoning state.
alter table public.talent_opportunity_fit
  add column if not exists decisions_assessment jsonb,
  drop constraint if exists talent_role_fit_v2_contract;

comment on column public.talent_opportunity_fit.decisions_assessment is
  'Role-search Decisions stage1/stage2 results for Opportunity fits. Stage2 mutualFit is the unrounded 0-100 shortlist score. Null for legacy grade evaluations. Internal evidence, not outbound copy.';

-- The former CHECK required qualitative grades and written reasons. Decisions
-- supplies neither. Output structure is validated by the shared API adapter;
-- source freshness, pair uniqueness, selection and sharing guards remain intact.
-- Keep the v2 envelope so existing source invalidation and visibility readers
-- continue to require a current durable selection. Do not reinterpret scores as
-- legacy grades or introduce a score cutoff for priority review.
create or replace function public.talent_internal_role_priority_review_is_recommendable_v1(
  p_fit public.talent_opportunity_fit
)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select case
    when p_fit.id is null or public.role_matching_slot_type_v1(p_fit.opportunity_id,now()) <> 'paid' then false
    when p_fit.fit_contract_version='talent_role_fit_v2' then
      p_fit.evaluated_stage=2 and p_fit.input_fingerprint is not null
      and coalesce(lower(nullif(btrim(p_fit.human_label),'')),'fit')='fit'
      and (
        p_fit.decisions_assessment is not null
        or (p_fit.role_fit not in ('bad','unfit')
            and p_fit.candidate_fit not in ('bad','unfit')
            and p_fit.company_fit not in ('bad','unfit'))
      )
      and (
        (p_fit.decisions_assessment is null
          and p_fit.role_fit='perfect' and p_fit.company_fit='perfect')
        or exists (
          select 1 from public.talent_opportunity_matching_review selected
          where selected.talent_id=p_fit.talent_id and selected.opportunity_id=p_fit.opportunity_id
            and selected.input_fingerprint=p_fit.input_fingerprint
            and selected.decision in ('candidate_first','both') and selected.closed_at is null
        )
      )
    else public.talent_internal_role_is_candidate_visible_v1(p_fit)
  end;
$$;
revoke all on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)
  from public,anon,authenticated;
grant execute on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)
  to service_role;

notify pgrst, 'reload schema';
commit;
