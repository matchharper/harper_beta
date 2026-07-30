-- Compact Slack agent model:
--   existing company_slack_integrations = one OAuth installation per workspace
--   company_slack_channels             = enabled channels and their default role
--   company_slack_threads              = one row per managed Slack thread
--   existing company_messages          = messages linked to a Slack thread
--   slack_reply_jobs                   = event dedupe and durable worker queue

begin;

alter table public.company_slack_integrations
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists slack_app_id text,
  add column if not exists slack_bot_user_id text,
  add column if not exists bot_token_ciphertext text,
  add column if not exists scopes text[] not null default '{}',
  add column if not exists status text not null default 'legacy',
  add column if not exists installed_at timestamptz;

alter table public.company_slack_integrations
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column slack_channel_id drop not null,
  alter column webhook_url_ciphertext drop not null;

update public.company_slack_integrations
set
  installed_at = coalesce(installed_at, connected_at, created_at),
  status = case
    when bot_token_ciphertext is not null then 'active'
    else 'legacy'
  end
where installed_at is null
   or status not in ('active', 'legacy', 'revoked', 'error');

-- The previous send-only migration allowed one row per channel. Keep the most
-- recently connected row as the workspace installation; a new bot install will
-- replace its legacy webhook fields.
delete from public.company_slack_integrations integration
where integration.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by company_workspace_id
        order by connected_at desc nulls last, created_at desc, id
      ) as row_number
    from public.company_slack_integrations
  ) ranked
  where ranked.row_number > 1
);

alter table public.company_slack_integrations
  drop constraint if exists company_slack_integrations_pkey,
  drop constraint if exists company_slack_integrations_workspace_channel_key,
  drop constraint if exists company_slack_integrations_status_check;

alter table public.company_slack_integrations
  add constraint company_slack_integrations_pkey
  primary key (company_workspace_id),
  add constraint company_slack_integrations_status_check
  check (status in ('active', 'legacy', 'revoked', 'error')),
  add constraint company_slack_integrations_active_bot_check
  check (
    status <> 'active'
    or (
      slack_app_id is not null
      and slack_bot_user_id is not null
      and bot_token_ciphertext is not null
    )
  );

create unique index if not exists company_slack_integrations_active_team_uidx
  on public.company_slack_integrations(slack_team_id)
  where status = 'active';

create table if not exists public.company_slack_channels (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_slack_integrations(company_workspace_id)
    on delete cascade,
  slack_channel_id text not null,
  slack_channel_name text,
  is_private boolean not null default false,
  is_enabled boolean not null default true,
  default_role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  respond_to_mentions boolean not null default true,
  reply_to_harper_threads boolean not null default true,
  notify_candidate_accepted boolean not null default true,
  notify_candidate_rejected boolean not null default true,
  notify_member_joined boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (company_workspace_id, slack_channel_id)
);

create index if not exists company_slack_channels_enabled_idx
  on public.company_slack_channels(company_workspace_id, is_enabled);

create table if not exists public.company_slack_threads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null
    references public.company_slack_channels(id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  slack_thread_ts text not null,
  created_by_harper boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (channel_id, slack_thread_ts)
);

alter table public.company_messages
  add column if not exists slack_thread_id uuid
    references public.company_slack_threads(id) on delete set null,
  add column if not exists slack_message_ts text,
  add column if not exists slack_user_id text;

create index if not exists company_messages_slack_thread_idx
  on public.company_messages(slack_thread_id, id)
  where message_type = 'slack'
    and slack_thread_id is not null;

create unique index if not exists company_messages_slack_message_uidx
  on public.company_messages(slack_thread_id, slack_message_ts)
  where message_type = 'slack'
    and slack_thread_id is not null
    and nullif(slack_message_ts, '') is not null;

create table if not exists public.slack_reply_jobs (
  id uuid primary key default gen_random_uuid(),
  slack_event_id text not null unique,
  thread_id uuid not null
    references public.company_slack_threads(id) on delete cascade,
  user_message_id bigint unique
    references public.company_messages(id) on delete set null,
  response_message_id bigint
    references public.company_messages(id) on delete set null,
  trigger_kind text not null
    check (trigger_kind in ('mention', 'thread_reply')),
  slack_message_ts text not null,
  slack_user_id text,
  prompt text not null,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'retry', 'completed', 'failed', 'ignored')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  locked_by text,
  response_text text,
  slack_response_ts text,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists slack_reply_jobs_poll_idx
  on public.slack_reply_jobs(status, next_attempt_at, created_at);

alter table public.company_slack_channels enable row level security;
alter table public.company_slack_threads enable row level security;
alter table public.slack_reply_jobs enable row level security;

revoke all on public.company_slack_channels from anon, authenticated;
revoke all on public.company_slack_threads from anon, authenticated;
revoke all on public.slack_reply_jobs from anon, authenticated;
grant all on public.company_slack_channels to service_role;
grant all on public.company_slack_threads to service_role;
grant all on public.slack_reply_jobs to service_role;

create or replace function public.claim_slack_reply_jobs(
  p_worker_id text,
  p_batch_size integer default 5,
  p_max_retry_count integer default 5,
  p_stale_after_seconds integer default 300
)
returns setof public.slack_reply_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select job.id
    from public.slack_reply_jobs job
    where (
      (
        job.status in ('queued', 'retry')
        and job.next_attempt_at <= timezone('utc', now())
      ) or (
        job.status = 'processing'
        and job.locked_at < timezone('utc', now())
          - make_interval(secs => greatest(p_stale_after_seconds, 30))
      )
    )
    and job.attempt_count < greatest(p_max_retry_count, 1)
    order by job.created_at
    for update skip locked
    limit greatest(least(p_batch_size, 20), 1)
  )
  update public.slack_reply_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    locked_at = timezone('utc', now()),
    locked_by = p_worker_id,
    updated_at = timezone('utc', now())
  from candidates
  where job.id = candidates.id
  returning job.*;
end;
$$;

revoke all on function public.claim_slack_reply_jobs(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_slack_reply_jobs(text, integer, integer, integer)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant usage on schema public to harper_worker;
    grant select, update on public.slack_reply_jobs to harper_worker;
    grant execute on function public.claim_slack_reply_jobs(text, integer, integer, integer)
      to harper_worker;
  end if;
end;
$$;

comment on table public.company_slack_integrations is
  'One Harper Slack bot OAuth installation per company workspace.';
comment on column public.company_slack_integrations.bot_token_ciphertext is
  'AES-256-GCM encrypted Slack bot token. Never expose this value to clients.';
comment on table public.company_slack_channels is
  'Allowlisted Slack channels. Every Slack member in an enabled channel may invoke Harper.';
comment on table public.company_slack_threads is
  'One normalized row per managed Slack thread; company_messages reference it.';
comment on table public.slack_reply_jobs is
  'Slack event dedupe and durable reply queue. Completed messages live in company_messages.';

commit;
