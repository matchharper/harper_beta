-- Hosted default privileges grant these roles directly, independently of PUBLIC.
-- These functions are trigger-only; table writers need no direct EXECUTE grant.
revoke all on function public.revise_career_profile_cache(), public.revise_career_context_cache()
from anon, authenticated, service_role;
