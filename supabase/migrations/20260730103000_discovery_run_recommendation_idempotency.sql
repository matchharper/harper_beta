create unique index if not exists talent_opportunity_recommendation_run_role_uidx
  on public.talent_opportunity_recommendation (discovery_run_id, role_id)
  where discovery_run_id is not null;
