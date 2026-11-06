-- Notes whose talent_progress copy was deleted from the Ops timeline (#256).
--
-- company_candidate_notes is the original and the org_note copy follows it
-- (20261105140000). The Ops matching timeline deleted the copy only, so the
-- note stayed live in the notes table: hidden today, but back once readers
-- move to the notes table (C3b), and the company could no longer edit or
-- delete it. The app now deletes a note from Ops the way the company screen
-- does (deleted_at, with history).
--
-- close_company_notes_without_copy_v1 marks a live note whose copy is gone as
-- deleted, recording the deleted revision at the time it runs. A copy is only
-- removed when its note is deleted, from the Ops timeline, or by account
-- deletion (whose notes are removed with the account), so a live note without
-- one was deleted from Ops. This migration only creates the function; whether
-- to run it for notes deleted from Ops before this fix is open (run once by
-- hand: select public.close_company_notes_without_copy_v1();).

create or replace function public.close_company_notes_without_copy_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.company_candidate_notes note
  set deleted_at = now()
  where note.deleted_at is null
    and not exists (
      select 1 from public.talent_progress progress
      where progress.id = note.id and progress.kind = 'org_note'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_company_notes_without_copy_v1()
  from public, anon, authenticated, service_role;
