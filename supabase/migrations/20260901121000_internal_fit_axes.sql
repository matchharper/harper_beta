alter table public.talent_opportunity_fit
  add column if not exists role_fit text,
  add column if not exists candidate_fit text,
  add column if not exists company_fit text;

comment on column public.talent_opportunity_fit.role_fit is
  'Latest model judgment of objective role capability and hard requirements: fit, hold, ambiguous, or unfit.';

comment on column public.talent_opportunity_fit.candidate_fit is
  'Latest model judgment of candidate-side preference compatibility: fit, middle, or unfit.';

comment on column public.talent_opportunity_fit.company_fit is
  'Latest model judgment of company interview likelihood against its supplied bar: fit, ambiguous, or unfit.';

-- Existing rows predate the separated axes and intentionally remain null until
-- their next internal-fit evaluation. Do not infer the three axes from the old
-- holistic label because that would create false historical facts.
