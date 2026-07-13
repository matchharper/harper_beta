alter table public.email_inbound_events
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.email_inbound_events.attachments is
  'Normalized inbound email attachment metadata, storage paths, and extraction status.';
