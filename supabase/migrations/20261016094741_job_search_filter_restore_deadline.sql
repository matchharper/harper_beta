-- Production applied 2026-10-16; history version 20261016094801.
-- Restore the existing API deadline; raising it does not solve search latency.
ALTER FUNCTION public.search_external_roles_filter_first(text) RESET statement_timeout;
NOTIFY pgrst, 'reload schema';
