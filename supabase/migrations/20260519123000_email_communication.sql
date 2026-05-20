create extension if not exists pgcrypto;

create table if not exists public.email_reply_aliases (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  expires_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_inbound_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_event_id text null,
  provider_email_id text not null,
  message_id text null,
  from_email text null,
  to_addresses text[] not null default '{}'::text[],
  cc_addresses text[] not null default '{}'::text[],
  subject text null,
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint email_inbound_events_provider_not_empty_check
    check (length(trim(provider)) > 0),
  constraint email_inbound_events_provider_email_id_not_empty_check
    check (length(trim(provider_email_id)) > 0),
  unique (provider, provider_email_id)
);

create unique index if not exists email_inbound_events_provider_event_uidx
  on public.email_inbound_events (provider, provider_event_id)
  where provider_event_id is not null;

create table if not exists public.email_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  inbound_event_id uuid not null unique references public.email_inbound_events(id) on delete cascade,
  talent_id uuid null references public.talent_users(user_id) on delete set null,
  conversation_id uuid null references public.talent_conversations(id) on delete set null,
  user_message_id bigint null,
  assistant_message_id bigint null,
  status text not null default 'queued',
  attempts integer not null default 0,
  locked_at timestamptz null,
  locked_by text null,
  last_error text null,
  skip_reason text null,
  resend_email_id text null,
  processed_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_reply_jobs_status_check
    check (status in ('queued', 'processing', 'sent', 'skipped', 'failed')),
  constraint email_reply_jobs_attempts_check
    check (attempts >= 0),
  constraint email_reply_jobs_user_message_id_check
    check (user_message_id is null or user_message_id > 0),
  constraint email_reply_jobs_assistant_message_id_check
    check (assistant_message_id is null or assistant_message_id > 0)
);

create index if not exists email_reply_aliases_talent_idx
  on public.email_reply_aliases (talent_id, created_at desc);

create index if not exists email_reply_jobs_claim_idx
  on public.email_reply_jobs (status, created_at)
  where status in ('queued', 'processing');

create index if not exists email_reply_jobs_talent_recent_idx
  on public.email_reply_jobs (talent_id, created_at desc)
  where talent_id is not null;

create or replace function public.set_email_reply_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists email_reply_jobs_set_updated_at
  on public.email_reply_jobs;
create trigger email_reply_jobs_set_updated_at
before update on public.email_reply_jobs
for each row execute function public.set_email_reply_jobs_updated_at();

create or replace function public.claim_email_reply_jobs(
  worker_id text,
  batch_size integer default 5,
  max_attempts integer default 3,
  stale_after_seconds integer default 600
)
returns setof public.email_reply_jobs
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.email_reply_jobs
    where attempts < greatest(1, max_attempts)
      and (
        status = 'queued'
        or (
          status = 'processing'
          and locked_at < timezone('utc', now()) - make_interval(secs => greatest(60, stale_after_seconds))
        )
      )
    order by created_at asc
    for update skip locked
    limit greatest(1, least(batch_size, 20))
  )
  update public.email_reply_jobs j
     set status = 'processing',
         attempts = attempts + 1,
         locked_at = timezone('utc', now()),
         locked_by = nullif(trim(worker_id), ''),
         last_error = null,
         updated_at = timezone('utc', now())
    from picked
   where j.id = picked.id
  returning j.*;
$$;

alter table public.email_reply_aliases enable row level security;
alter table public.email_inbound_events enable row level security;
alter table public.email_reply_jobs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant usage on schema public to harper_worker';
    execute 'grant select, update on public.talent_users, public.talent_experiences, public.talent_educations, public.talent_extras to harper_worker';
    execute 'grant select, insert, update on public.talent_setting, public.talent_insights to harper_worker';
    execute 'grant select, insert, update on public.talent_conversations to harper_worker';
    execute 'grant select, insert on public.talent_messages to harper_worker';
    execute 'grant select, insert on public.talent_activity_events to harper_worker';
    execute 'grant select, insert, update on public.email_reply_aliases, public.email_inbound_events, public.email_reply_jobs to harper_worker';
    execute 'grant execute on function public.claim_email_reply_jobs(text, integer, integer, integer) to harper_worker';
    execute 'grant usage, select on all sequences in schema public to harper_worker';

    execute 'drop policy if exists email_reply_aliases_harper_worker_all on public.email_reply_aliases';
    execute 'create policy email_reply_aliases_harper_worker_all on public.email_reply_aliases for all to harper_worker using (true) with check (true)';

    execute 'drop policy if exists email_inbound_events_harper_worker_all on public.email_inbound_events';
    execute 'create policy email_inbound_events_harper_worker_all on public.email_inbound_events for all to harper_worker using (true) with check (true)';

    execute 'drop policy if exists email_reply_jobs_harper_worker_all on public.email_reply_jobs';
    execute 'create policy email_reply_jobs_harper_worker_all on public.email_reply_jobs for all to harper_worker using (true) with check (true)';

    execute 'drop policy if exists talent_activity_events_harper_worker_insert on public.talent_activity_events';
    execute 'create policy talent_activity_events_harper_worker_insert on public.talent_activity_events for insert to harper_worker with check (true)';
  end if;
end;
$$;
