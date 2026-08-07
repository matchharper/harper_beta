begin;

alter table public.company_slack_channels
  alter column reply_to_harper_threads set default true;

update public.company_slack_channels
set
  reply_to_harper_threads = true,
  updated_at = timezone('utc', now())
where not reply_to_harper_threads;

comment on column public.company_slack_channels.reply_to_harper_threads is
  'When true, non-mention replies in Harper-managed threads are classified before Harper responds. Explicit mentions bypass classification.';

commit;
