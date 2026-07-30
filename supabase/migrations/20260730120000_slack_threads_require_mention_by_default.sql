alter table public.company_slack_channels
  alter column reply_to_harper_threads set default false;

update public.company_slack_channels
set
  reply_to_harper_threads = false,
  updated_at = timezone('utc', now())
where reply_to_harper_threads;

comment on column public.company_slack_channels.reply_to_harper_threads is
  'When true, human replies in Harper-managed threads invoke Harper without an explicit mention. Defaults to false so @Harper is required.';
