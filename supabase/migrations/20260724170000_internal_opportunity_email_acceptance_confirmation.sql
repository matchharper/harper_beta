alter table public.talent_opportunity_recommendation
  add column if not exists email_acceptance_confirmation jsonb
  not null default '{}'::jsonb;

alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_email_acceptance_confirmation_object;

alter table public.talent_opportunity_recommendation
  add constraint talent_opportunity_recommendation_email_acceptance_confirmation_object
  check (jsonb_typeof(email_acceptance_confirmation) = 'object');

comment on column public.talent_opportunity_recommendation.email_acceptance_confirmation
  is 'Two-step email acceptance state for internal connection recommendations.';
