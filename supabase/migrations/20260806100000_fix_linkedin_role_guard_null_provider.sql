create or replace function public.guard_linkedin_role_write_for_vc_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fallback_workspace text;
begin
  if new.source_provider is null
     or new.source_provider not in (
       'linkedin',
       'linkedin_jobs',
       'linkedin_jobs_scraping'
     ) then
    return new;
  end if;

  -- Participate in the same workspace serialization as VC transition apply.
  -- If LinkedIn gets the lock first, VC apply waits and its active-set
  -- fingerprint becomes stale. If VC gets it first, this trigger waits for
  -- commit and then observes the operational VC identity below.
  perform public.lock_company_role_ingest(new.company_workspace_id);

  fallback_workspace := current_setting(
    'harper.allow_linkedin_vc_fallback_workspace',
    true
  );
  if fallback_workspace = new.company_workspace_id::text then
    return new;
  end if;

  if public.vc_identity_is_operational(new.company_workspace_id) then
    -- Returning NULL from a BEFORE trigger skips the row. This is the final
    -- write-time guard for LinkedIn jobs that passed their target gate before
    -- a VC cutover committed.
    return null;
  end if;

  return new;
end;
$$;
