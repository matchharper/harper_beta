begin;

alter table public.talent_opportunity_matching_review
  add column final_fit text
  constraint matching_review_final_fit_check
  check (final_fit in ('excellent', 'good', 'borderline', 'uncertain', 'unfit'));

comment on column public.talent_opportunity_matching_review.final_fit is
  'Overall role fit from the company-shareable presentation writer. NULL means not evaluated by this contract; separate from shared fit axes and route selection.';

notify pgrst, 'reload schema';
commit;
