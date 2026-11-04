-- Production: build these indexes CONCURRENTLY before applying this migration
-- so active discovery writers are not blocked. Applying afterwards records the
-- schema change without rebuilding the already-validated indexes.
CREATE INDEX IF NOT EXISTS career_background_recovery_pending_idx
  ON public.opportunity_discovery_run (updated_at)
  WHERE trigger_payload->>'runContract' = 'career_agent_v1'
    AND status IN ('handed_off', 'completed')
    AND coverage->>'sourceEventsFinishedAt' IS NULL;

CREATE INDEX IF NOT EXISTS career_internal_evaluation_recovery_idx
  ON public.opportunity_discovery_run (created_at)
  WHERE trigger = 'career_internal_evaluation'
    AND trigger_payload->>'executor' = 'career_internal_beta_v1';
