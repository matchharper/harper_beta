-- A candidate's withdrawal no longer erases the company's own records.
--
-- What a company decided and why, what it was shown and what it noted are the
-- company's records. Withdrawal still sets talent_users.deleted_at, which is
-- the "withdrew" fact and keeps the person out of matching and contact.
-- Reasons and records already erased before this migration stay erased.

drop trigger if exists talent_users_redact_company_decisions on public.talent_users;
drop trigger if exists talent_users_redact_company_decisions_on_deletion on public.talent_users;
drop trigger if exists company_decision_events_redact_deleted_talent on public.company_decision_events;
drop trigger if exists talent_users_delete_company_records_on_deletion on public.talent_users;

drop function if exists public.redact_deleted_talent_decisions_v1();
drop function if exists public.redact_decision_about_deleted_talent_v1();
drop function if exists public.delete_company_records_of_deleted_talent_v1();
