-- Production applied 2026-10-16; history version 20261016094947.
-- Raise all application Data API query/lock deadlines to 50 seconds.
-- Existing longer direct-DB/Worker deadlines remain longer (database: 5min).
ALTER ROLE authenticator SET statement_timeout = '50s';
ALTER ROLE authenticator SET lock_timeout = '50s';
ALTER ROLE anon SET statement_timeout = '50s';
ALTER ROLE anon SET lock_timeout = '50s';
ALTER ROLE authenticated SET statement_timeout = '50s';
ALTER ROLE authenticated SET lock_timeout = '50s';
ALTER ROLE service_role SET statement_timeout = '50s';
ALTER ROLE service_role SET lock_timeout = '50s';

ALTER FUNCTION public.search_external_roles_filter_first(text) SET statement_timeout = '50s';
ALTER FUNCTION public.set_timeout_and_execute_raw_sql(text, integer, integer, integer) SET statement_timeout = '50s';

CREATE OR REPLACE FUNCTION public.search_external_roles_v2(p_sql text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SET search_path = ''
SET statement_timeout = '50s'
AS $function$
begin
 perform set_config('statement_timeout','50000',true);
 perform set_config('ivfflat.probes','12',true);
 perform set_config('ivfflat.iterative_scan','relaxed_order',true);
 perform set_config('ivfflat.max_probes','48',true);
 return query execute 'select to_jsonb(result) from (' || p_sql || ') result';
end $function$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

