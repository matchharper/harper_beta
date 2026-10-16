-- Production applied 2026-10-16; history version 20261016094155.
-- Keep the 20s latency target separate from the cancellation deadline.
-- PostgREST reads this function-level setting before executing the RPC.
-- Stay below the Data API's 60s ceiling; do not relax other API queries.
ALTER FUNCTION public.search_external_roles_filter_first(text)
  SET statement_timeout = '50s';
NOTIFY pgrst, 'reload schema';
