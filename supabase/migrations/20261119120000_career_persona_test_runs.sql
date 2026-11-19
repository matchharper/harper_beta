-- Developer-only Career persona test histories.
-- Each row is one test account that played a real person's public profile.
-- The dev Persona control signs the browser into talent_user_id to review the
-- whole account as that user, and report_markdown keeps the evaluation text.
create table if not exists public.career_persona_test_runs (
  id uuid primary key default gen_random_uuid(),
  persona_key text not null,
  persona_name text not null default '',
  linkedin_url text not null default '',
  talent_user_id uuid not null unique references auth.users(id) on delete cascade,
  label text not null default '',
  report_markdown text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists career_persona_test_runs_persona_idx
  on public.career_persona_test_runs (persona_key, created_at desc);

-- Server routes use the service role; no client policy is granted.
alter table public.career_persona_test_runs enable row level security;
