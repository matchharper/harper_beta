begin;

alter table public.talent_conversations
  add column if not exists profile_ingestion_status text,
  add column if not exists profile_ingestion_error text,
  add column if not exists profile_ingestion_updated_at timestamptz;

comment on column public.talent_conversations.profile_ingestion_status is
  'Latest onboarding profile ingestion state. The application currently writes processing, completed, or failed.';
comment on column public.talent_conversations.profile_ingestion_error is
  'Last onboarding profile ingestion error for retry and user-visible recovery.';
comment on column public.talent_conversations.profile_ingestion_updated_at is
  'Time at which the onboarding profile ingestion state last changed.';

commit;
