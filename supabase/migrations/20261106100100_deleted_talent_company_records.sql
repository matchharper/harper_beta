-- What companies were shown about a candidate, and their notes about the
-- candidate, go with the candidate's account.
--
-- company_presentations, company_candidate_notes and their revisions cascade
-- when the talent_users row is deleted. Account deletion does not delete that
-- row; it sets deleted_at (the row stays), so the cascades never fire. This
-- removes them when the account is marked deleted, the same moment decision
-- reasons are redacted (redact_deleted_talent_decisions_v1), and removes them
-- once for accounts already marked. Decisions keep their row; a decision's
-- presentation_id is set null by its foreign key.
--
-- Not changed here: the org_note copies in talent_progress, which predate the
-- notes table and were kept for deleted accounts before as well.

create or replace function public.delete_company_records_of_deleted_talent_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.company_presentations where talent_id = new.user_id;
  delete from public.company_candidate_note_revisions where talent_id = new.user_id;
  delete from public.company_candidate_notes where talent_id = new.user_id;
  return null;
end
$$;

revoke all on function public.delete_company_records_of_deleted_talent_v1()
  from public, anon, authenticated, service_role;

create trigger talent_users_delete_company_records_on_deletion
  after update of deleted_at on public.talent_users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.delete_company_records_of_deleted_talent_v1();

-- Accounts deleted before this migration.
delete from public.company_presentations presentation
  using public.talent_users talent
  where talent.user_id = presentation.talent_id and talent.deleted_at is not null;
delete from public.company_candidate_note_revisions revision
  using public.talent_users talent
  where talent.user_id = revision.talent_id and talent.deleted_at is not null;
delete from public.company_candidate_notes note
  using public.talent_users talent
  where talent.user_id = note.talent_id and talent.deleted_at is not null;
