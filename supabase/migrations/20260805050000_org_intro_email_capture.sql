begin;

create table if not exists public.org_intro_email_threads (
  id uuid primary key default gen_random_uuid(),
  outbound_message_id uuid not null unique
    references public.career_email_messages(id) on delete cascade,
  talent_id uuid not null
    references public.talent_users(user_id) on delete cascade,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  recommendation_id uuid not null
    references public.talent_opportunity_recommendation(id) on delete cascade,
  capture_address text not null unique,
  participant_emails text[] not null,
  status text not null default 'active'
    check (status in ('active', 'closed')),
  message_count integer not null default 0
    check (message_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (capture_address = lower(btrim(capture_address))),
  check (cardinality(participant_emails) >= 2)
);

create index if not exists org_intro_email_threads_workspace_updated_idx
  on public.org_intro_email_threads (
    company_workspace_id,
    updated_at desc
  );

create index if not exists org_intro_email_threads_recommendation_idx
  on public.org_intro_email_threads (recommendation_id);

alter table public.org_intro_email_threads enable row level security;

revoke all on table public.org_intro_email_threads from public, anon, authenticated;
grant all on table public.org_intro_email_threads to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant select, update on table public.org_intro_email_threads to harper_worker;
    create policy org_intro_email_threads_worker_access
      on public.org_intro_email_threads
      for all
      to harper_worker
      using (true)
      with check (true);
  end if;
end;
$$;

alter table public.career_email_messages
  drop constraint if exists career_email_messages_mail_type_check;

alter table public.career_email_messages
  add constraint career_email_messages_mail_type_check
  check (
    mail_type = any (
      array[
        'onboarding',
        'onboarding_review',
        'onboarding_profile_ingestion_failed',
        'existing_user_login',
        'sign_up_followup',
        'sign_up_followup_reply',
        'user_reply',
        'auto_reply',
        'opportunity_recommendation',
        'manual_ops',
        'org_intro',
        'org_intro_reply',
        'internal_connection_confirmed',
        'other'
      ]::text[]
    )
  );

comment on table public.org_intro_email_threads is
  'Routes replies from a multi-party organization introduction to capture-only storage.';

comment on column public.org_intro_email_threads.capture_address is
  'Per-introduction reply address included alongside the human participants in Reply-To.';

commit;
