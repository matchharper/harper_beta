alter table public.email_reply_jobs
  add column if not exists kind text not null default 'reply';

alter table public.email_reply_jobs
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists email_reply_jobs_status_kind_created_idx
  on public.email_reply_jobs (status, kind, created_at);

