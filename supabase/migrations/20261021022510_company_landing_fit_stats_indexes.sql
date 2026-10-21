-- Cover the exact public landing aggregates without scanning wide fit payloads.
-- These are read indexes, not additional constraints. For production rollout,
-- build each index CONCURRENTLY before applying this idempotent migration.
create index if not exists talent_external_fit_landing_stats_idx
  on public.talent_external_fit (created_at, role_id, talent_id);

create index if not exists talent_opportunity_fit_landing_stats_idx
  on public.talent_opportunity_fit (created_at, opportunity_id, talent_id);
