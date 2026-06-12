create extension if not exists pgcrypto;

create table if not exists public.contact_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.talent_users(user_id) on delete cascade,
  scheduled_at timestamptz not null,
  type text not null,
  status text not null default 'queued',
  sent_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  locked_at timestamptz null,
  locked_by text null,
  resend_email_id text null,
  last_error text null,
  constraint contact_queue_type_check
    check (type in (
      'career_signup_no_profile_submit',
      'career_profile_submitted_no_answer',
      'internal_recommendation_call_abandoned'
    )),
  constraint contact_queue_status_check
    check (status in ('queued', 'processing', 'stopped', 'sent', 'cancelled', 'failed')),
  constraint contact_queue_attempts_check check (attempts >= 0),
  constraint contact_queue_payload_object_check check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists contact_queue_user_type_uidx
  on public.contact_queue (user_id, type);

create index if not exists contact_queue_claim_idx
  on public.contact_queue (status, scheduled_at, created_at)
  where status in ('queued', 'processing');

create index if not exists contact_queue_user_recent_idx
  on public.contact_queue (user_id, created_at desc);

create or replace function public.set_contact_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists contact_queue_set_updated_at
  on public.contact_queue;
create trigger contact_queue_set_updated_at
before update on public.contact_queue
for each row execute function public.set_contact_queue_updated_at();

create or replace function public.claim_contact_queue_jobs(
  worker_id text,
  batch_size integer default 10,
  max_attempts integer default 3,
  stale_after_seconds integer default 600
)
returns setof public.contact_queue
language sql
security definer
set search_path = public
as $$
  with picked as (
    select id
    from public.contact_queue
    where attempts < greatest(1, max_attempts)
      and scheduled_at <= timezone('utc', now())
      and (
        status = 'queued'
        or (
          status = 'processing'
          and locked_at < timezone('utc', now()) - make_interval(secs => greatest(60, stale_after_seconds))
        )
      )
    order by scheduled_at asc, created_at asc
    for update skip locked
    limit greatest(1, least(batch_size, 50))
  )
  update public.contact_queue q
     set status = 'processing',
         attempts = attempts + 1,
         locked_at = timezone('utc', now()),
         locked_by = nullif(trim(worker_id), ''),
         last_error = null,
         updated_at = timezone('utc', now())
    from picked
   where q.id = picked.id
  returning q.*;
$$;

alter table public.contact_queue enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.contact_queue to service_role';
    execute 'grant execute on function public.claim_contact_queue_jobs(text, integer, integer, integer) to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant usage on schema public to harper_worker';
    execute 'grant select, insert, update on public.contact_queue to harper_worker';
    execute 'grant execute on function public.claim_contact_queue_jobs(text, integer, integer, integer) to harper_worker';

    execute 'drop policy if exists contact_queue_harper_worker_all on public.contact_queue';
    execute 'create policy contact_queue_harper_worker_all on public.contact_queue for all to harper_worker using (true) with check (true)';
  end if;
end;
$$;
