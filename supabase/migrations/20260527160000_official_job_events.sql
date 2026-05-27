create table if not exists public.official_job_events (
  id uuid primary key default gen_random_uuid(),
  official_job_id uuid null references public.official_jobs(id) on delete set null,
  job_slug text null,
  event_type text not null,
  user_id text null,
  user_email text null,
  anonymous_id text null,
  path text null,
  referrer text null,
  user_agent text null,
  ip_address text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint official_job_events_event_type_check check (
    event_type in (
      'jobs_list_view',
      'jobs_cta_click',
      'jobs_identity_linked',
      'job_detail_view',
      'job_list_click',
      'job_apply_click',
      'job_company_click'
    )
  ),
  constraint official_job_events_job_slug_format_check check (
    job_slug is null or job_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  constraint official_job_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

alter table public.official_job_events
  drop constraint if exists official_job_events_event_type_check;

alter table public.official_job_events
  add constraint official_job_events_event_type_check check (
    event_type in (
      'jobs_list_view',
      'jobs_cta_click',
      'jobs_identity_linked',
      'job_detail_view',
      'job_list_click',
      'job_apply_click',
      'job_company_click'
    )
  );

create index if not exists official_job_events_recent_idx
  on public.official_job_events (created_at desc);

create index if not exists official_job_events_job_recent_idx
  on public.official_job_events (job_slug, event_type, created_at desc)
  where job_slug is not null;

create index if not exists official_job_events_user_recent_idx
  on public.official_job_events (user_id, created_at desc)
  where user_id is not null;

create index if not exists official_job_events_anonymous_recent_idx
  on public.official_job_events (anonymous_id, created_at desc)
  where anonymous_id is not null;

alter table public.official_job_events enable row level security;
