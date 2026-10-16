-- Production applied 2026-10-16; history version 20261016091100.
-- Live databases: build this index CONCURRENTLY outside the migration transaction
-- first. The retry EXISTS otherwise scans every discovery run, including its
-- toasted trigger_payload, while holding the parent run's row lock.
-- This is an access path only; it adds no new uniqueness or lifecycle constraint.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE INDEX IF NOT EXISTS opportunity_discovery_run_initial_retry_idx
  ON public.opportunity_discovery_run ((trigger_payload->>'initialOnboardingRetryOf'))
  WHERE (trigger_payload->>'initialOnboardingRetryOf') IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = 'public.opportunity_discovery_run_initial_retry_idx'::regclass
      AND indisvalid AND indisready
  ) THEN
    RAISE EXCEPTION 'Complete the concurrent retry lookup index build first';
  END IF;
END $$;
