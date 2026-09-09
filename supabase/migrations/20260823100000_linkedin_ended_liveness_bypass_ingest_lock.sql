begin;

-- The VC-primary write guard serializes LinkedIn ingestion against VC source
-- transitions. Expiry sweeps only deactivate an existing LinkedIn role, so
-- making those updates wait for the ingestion lock cannot protect a future
-- LinkedIn write and can make an entire weekly sweep fail behind one workspace.
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

  -- A transition to ended that changes only liveness metadata is a
  -- deactivation, not a competing LinkedIn ingestion write. Let it proceed
  -- without taking the workspace advisory lock and without suppressing it for
  -- an operational VC identity. Reactivation and content/source changes still
  -- follow the serialized guard path below.
  if tg_op = 'UPDATE'
     and lower(btrim(coalesce(new.status, ''))) = 'ended'
     and (
       to_jsonb(new) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) = (
       to_jsonb(old) - array[
         'status',
         'is_expired',
         'expired_at',
         'updated_at'
       ]
     ) then
    return new;
  end if;

  perform public.lock_company_role_ingest(new.company_workspace_id);

  fallback_workspace := current_setting(
    'harper.allow_linkedin_vc_fallback_workspace',
    true
  );
  if fallback_workspace = new.company_workspace_id::text then
    return new;
  end if;

  if public.vc_identity_is_operational(new.company_workspace_id) then
    return null;
  end if;

  return new;
end;
$$;

comment on function public.guard_linkedin_role_write_for_vc_primary() is
  'Serializes LinkedIn ingestion with VC transitions while allowing ended-only liveness updates to bypass the workspace advisory lock.';

commit;
