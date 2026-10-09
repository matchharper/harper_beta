begin;

-- Keep introduction available to readers from earlier releases. New writers
-- store the same TL;DR there and in tldr; existing reports are not relabelled.
alter table public.talent_opportunity_matching_review
  add column tldr text,
  add column harper_note text;

comment on column public.talent_opportunity_matching_review.tldr is
  'Company-shareable TL;DR generated after selection; NULL for reports predating this writer contract.';
comment on column public.talent_opportunity_matching_review.harper_note is
  'Company-shareable recruiter interpretation from the presentation writer. Internal reranking interpretation remains in reason.';

notify pgrst, 'reload schema';
commit;
