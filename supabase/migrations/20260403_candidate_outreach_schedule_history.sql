alter table public.candidate_outreach
  add column if not exists memo text null,
  add column if not exists history jsonb not null default '[]'::jsonb,
  add column if not exists sequence_schedule jsonb null;

alter table public.candidate_outreach
  drop constraint if exists candidate_outreach_sequence_mark_check;

alter table public.candidate_outreach
  add constraint candidate_outreach_sequence_mark_check
  check (
    sequence_mark is null
    or sequence_mark in (
      'need_email',
      'find_fail',
      'ready',
      'in_sequence',
      'linkedin_contacted',
      'waiting_reply',
      'replied',
      'paused',
      'closed'
    )
  );
