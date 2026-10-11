-- Shared assessment facts. Recommendation selection stays in matching_review.
-- Legacy columns remain readable during rollout; v2 never derives a score/label
-- or recommend boolean from grades. Human review columns are preserved.
begin;

alter table public.talent_opportunity_fit
  alter column score drop not null,
  alter column label drop not null,
  add column if not exists fit_contract_version text,
  add column if not exists evaluated_stage smallint,
  add column if not exists stage_one_result text,
  add column if not exists missing_info text,
  add column if not exists candidate_reason text,
  add column if not exists company_reason text,
  add column if not exists input_fingerprint text,
  add column if not exists source_versions jsonb,
  add column if not exists model_manifest jsonb,
  add column if not exists evaluation_started_at timestamptz,
  add column if not exists expires_at timestamptz;

alter table public.talent_opportunity_fit
  add constraint talent_role_fit_v2_contract check (
    fit_contract_version is distinct from 'talent_role_fit_v2' or (
      input_fingerprint is not null and expires_at is not null
      and evaluation_started_at is not null and evaluated_stage is not null
      and stage_one_result is not null
      and score is null and label is null and recommend = false
      and reevaluation_criteria is null and company_criteria_evaluations is null
      and ((evaluated_stage = 1 and stage_one_result = 'screened_out'
            and role_fit is null and candidate_fit is null and company_fit is null
            and missing_info is null and candidate_reason is null and company_reason is null)
        or (evaluated_stage = 2 and stage_one_result = 'continue'
            and candidate_reason is not null and company_reason is not null
            and role_fit = any(array['perfect','good','worth_considering','bad','unfit'])
            and candidate_fit = any(array['perfect','good','worth_considering','bad','unfit'])
            and company_fit = any(array['perfect','good','worth_considering','bad','unfit'])
            and role_fit is not null and candidate_fit is not null and company_fit is not null))
    )
  );

create index if not exists talent_role_fit_v2_expiry_idx
  on public.talent_opportunity_fit(opportunity_id, expires_at)
  where fit_contract_version = 'talent_role_fit_v2';

comment on column public.company_internal_roles.is_company_first_search is
  'Whether this role receives automatic company-first recommendations. Does not disable shared matching or talent-first discovery.';
comment on column public.talent_opportunity_fit.missing_info is
  'Optional high-value missing practical fact from shared assessment; not a scheduled question or user-visible question script.';
commit;
