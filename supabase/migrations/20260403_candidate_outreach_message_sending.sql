alter table public.candidate_outreach_message
  drop constraint if exists candidate_outreach_message_status_check;

alter table public.candidate_outreach_message
  add constraint candidate_outreach_message_status_check
  check (status in ('draft', 'sending', 'sent', 'skipped', 'canceled'));
