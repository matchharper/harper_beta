alter table public.talent_opportunity_recommendation
  drop column if exists dismissed_at,
  drop column if exists recommended_at,
  drop column if exists processed_stage;
