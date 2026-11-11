-- Versions an evaluation read (PR-4; runs after 20261111010000 and 20261109020000).
--
-- Each company evaluation row (stage 1/2 scores, stage 3 explanations) now
-- records which inputs it was made from, so it can be read back later through
-- the history tables of 20261111010000 (candidate) and 20261109020000 /
-- 20261105130100 (company):
--
-- source_context_version          Candidate Brief/Memory version (talent_context_revisions.id;
--                                 0 = no Brief/Memory yet). The Worker reads the Brief
--                                 only; Memory stays the Behavior builder's input.
-- source_behavior_context_version Candidate Behavior Context version of the text read.
-- source_behavior_context_hash    Its context_hash (a version and hash pair names one
--                                 talent_behavior_context_revisions row).
-- source_setting_revision         Candidate talent_setting_revisions.revision in force.
-- source_company_info_revision    company_info_revisions.revision of the company name and
--                                 description in the role text that was scored.
--
-- The Worker writes the numbers it read with the inputs. NULL means not read
-- (stage 3 reads no Behavior, company description or company Memory) or not
-- known: rows saved before this migration, writers that do not send them yet,
-- or a candidate change committed while the inputs were being read. There is
-- deliberately no default and no trigger that fills the current number: a
-- current number is not proof of what was read.
--
-- For the same reason the evaluation trigger of 20261105130100 that filled
-- source_company_memory_version with the latest company memory version when it
-- was empty is dropped here: evaluations that never read company memory got a
-- number too. The Worker now writes the version it read and leaves the rest
-- NULL. company_decision_events keeps its own trigger on the same function, and
-- the function stays. Rows already filled by the trigger are not changed.
--
-- company_readable_role_evaluations_v1 (select e.*) keeps its column list; no
-- reader needs these columns yet. Recreate the view when one does.

begin;

set local lock_timeout = '5s';

-- The Worker that writes these columns also reads the tables they point to.
do $$
begin
  if to_regclass('public.talent_context_revisions') is null
    or to_regclass('public.talent_setting_revisions') is null
    or to_regclass('public.company_info_revisions') is null then
    raise exception 'apply 20261109020000 and 20261111010000 first';
  end if;
end $$;

alter table public.company_role_candidate_evaluations
  add column if not exists source_context_version bigint,
  add column if not exists source_behavior_context_version bigint,
  add column if not exists source_behavior_context_hash text,
  add column if not exists source_setting_revision bigint,
  add column if not exists source_company_info_revision integer;

comment on column public.company_role_candidate_evaluations.source_context_version is
  'Candidate Brief/Memory version read (talent_context_revisions.id, 0 = none yet). NULL = unknown.';
comment on column public.company_role_candidate_evaluations.source_behavior_context_version is
  'Candidate Behavior Context version of the text read. NULL = not read (stage 3) or unknown.';
comment on column public.company_role_candidate_evaluations.source_behavior_context_hash is
  'context_hash of the candidate Behavior Context text read. NULL = not read (stage 3) or unknown.';
comment on column public.company_role_candidate_evaluations.source_setting_revision is
  'Candidate setting version in force when the inputs were read (talent_setting_revisions.revision). NULL = unknown.';
comment on column public.company_role_candidate_evaluations.source_company_info_revision is
  'Company information version of the company name/description scored (company_info_revisions.revision). NULL = not read (stage 3) or unknown.';
comment on column public.company_role_candidate_evaluations.source_company_memory_version is
  'Company memory version read (company_memory_revisions.id). NULL = not read or unknown; no longer filled by a trigger.';

drop trigger if exists company_role_candidate_evaluations_memory_version
  on public.company_role_candidate_evaluations;

commit;
