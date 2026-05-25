alter table public.talent_opportunity_recommendation
  drop column if exists recommendation_status,
  drop column if exists recommendation_reasons,
  drop column if exists confidence;
