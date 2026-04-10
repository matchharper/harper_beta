alter table public.candidate_outreach
  add column if not exists email_discovery_cancel_requested_at timestamptz null;

alter table public.candidate_outreach
  drop constraint if exists candidate_outreach_email_discovery_status_check;

alter table public.candidate_outreach
  add constraint candidate_outreach_email_discovery_status_check
  check (
    email_discovery_status in (
      'not_started',
      'searching',
      'found',
      'not_found',
      'canceled',
      'manual',
      'error'
    )
  );
