-- Prepare the company board's presentation lookup without activating the
-- unified matching selection triggers in the later migration.
alter table public.talent_opportunity_matching_review
  add column if not exists presentation_fingerprint text;
