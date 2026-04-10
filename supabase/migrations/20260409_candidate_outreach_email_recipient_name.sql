alter table public.candidate_outreach
  add column if not exists email_recipient_name text null;
