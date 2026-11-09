-- A candidate's withdrawal no longer erases the company's own records.
--
-- What a company decided and why, and what it was shown, are the company's
-- records. Withdrawal still sets talent_users.deleted_at, which is the
-- "withdrew" fact and keeps the person out of matching and contact.
-- Reasons and records already erased before this migration stay erased.
--
-- The company's notes about the person close with the withdrawal: they leave
-- the screen and what Harper reads, like a deleted note. Their versions stay in
-- company_candidate_note_revisions, and a Pass reason stays on its decision.

drop trigger if exists talent_users_redact_company_decisions on public.talent_users;
drop trigger if exists talent_users_redact_company_decisions_on_deletion on public.talent_users;
drop trigger if exists company_decision_events_redact_deleted_talent on public.company_decision_events;
drop trigger if exists talent_users_delete_company_records_on_deletion on public.talent_users;

drop function if exists public.redact_deleted_talent_decisions_v1();
drop function if exists public.redact_decision_about_deleted_talent_v1();
drop function if exists public.delete_company_records_of_deleted_talent_v1();

create or replace function public.close_company_notes_of_withdrawn_talent_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_candidate_notes set deleted_at = clock_timestamp()
    where talent_id = new.user_id and deleted_at is null;
  -- Copies with no note row left: Pass reasons, kept on the decision.
  delete from public.talent_progress where talent_id = new.user_id and kind = 'org_note';
  return null;
end
$$;

revoke all on function public.close_company_notes_of_withdrawn_talent_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_users_close_company_notes_on_withdrawal on public.talent_users;
create trigger talent_users_close_company_notes_on_withdrawal
  after update of deleted_at on public.talent_users
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.close_company_notes_of_withdrawn_talent_v1();

-- People who withdrew before this migration.
update public.company_candidate_notes note set deleted_at = clock_timestamp()
  from public.talent_users talent
  where talent.user_id = note.talent_id and talent.deleted_at is not null and note.deleted_at is null;
delete from public.talent_progress progress
  using public.talent_users talent
  where talent.user_id = progress.talent_id and talent.deleted_at is not null and progress.kind = 'org_note';
