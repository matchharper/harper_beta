create extension if not exists pgcrypto;

create table if not exists public.career_email_messages (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  talent_message_id bigint null references public.talent_messages(id) on delete set null,
  inbound_event_id uuid null references public.email_inbound_events(id) on delete set null,
  reply_job_id uuid null references public.email_reply_jobs(id) on delete set null,
  direction text not null,
  mail_type text not null,
  status text not null default 'sent',
  from_email text null,
  to_email text null,
  subject text null,
  body_text text null,
  created_by text null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint career_email_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint career_email_messages_mail_type_check
    check (mail_type in (
      'onboarding',
      'onboarding_review',
      'user_reply',
      'auto_reply',
      'opportunity_recommendation',
      'manual_ops',
      'other'
    )),
  constraint career_email_messages_status_check
    check (status in ('queued', 'sent', 'received', 'failed', 'skipped'))
);

create index if not exists career_email_messages_talent_recent_idx
  on public.career_email_messages (talent_id, occurred_at desc, created_at desc);

create unique index if not exists career_email_messages_talent_message_uidx
  on public.career_email_messages (talent_message_id)
  where talent_message_id is not null;

alter table public.career_email_messages enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.career_email_messages to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant select, insert, update on public.career_email_messages to harper_worker';

    execute 'drop policy if exists career_email_messages_harper_worker_all on public.career_email_messages';
    execute 'create policy career_email_messages_harper_worker_all on public.career_email_messages for all to harper_worker using (true) with check (true)';
  end if;
end;
$$;
