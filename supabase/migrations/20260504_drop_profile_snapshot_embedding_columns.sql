alter table if exists public.talent_opportunity_profile_snapshot
  drop column if exists snapshot_embedding,
  drop column if exists embedding_model;
