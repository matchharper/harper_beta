alter table public.candidate_outreach_message
  add column if not exists scheduled_for timestamptz null;

create index if not exists candidate_outreach_message_manual_schedule_idx
  on public.candidate_outreach_message (status, scheduled_for asc)
  where kind = 'manual' and scheduled_for is not null;
