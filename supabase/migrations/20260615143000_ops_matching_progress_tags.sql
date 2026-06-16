create table if not exists public.talent_opportunity_tag (
  id uuid primary key default gen_random_uuid(),
  talent_id text not null references public.talent_users(user_id) on delete cascade,
  opportunity_id uuid not null references public.company_roles(role_id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_opportunity_tag_nonempty check (btrim(tag) <> '')
);

create unique index if not exists talent_opportunity_tag_unique_lower_idx
  on public.talent_opportunity_tag (talent_id, opportunity_id, lower(btrim(tag)));

create index if not exists talent_opportunity_tag_opportunity_idx
  on public.talent_opportunity_tag (opportunity_id, updated_at desc);

alter table public.talent_opportunity_tag enable row level security;

create table if not exists public.talent_progress (
  id uuid primary key default gen_random_uuid(),
  talent_id text not null references public.talent_users(user_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  recommendation_id uuid references public.talent_opportunity_recommendation(id) on delete set null,
  text text not null,
  user_id text,
  created_at timestamptz not null default now(),
  constraint talent_progress_text_nonempty check (btrim(text) <> '')
);

create index if not exists talent_progress_talent_role_created_at_idx
  on public.talent_progress (talent_id, role_id, created_at desc);

create index if not exists talent_progress_recommendation_created_at_idx
  on public.talent_progress (recommendation_id, created_at desc);

alter table public.talent_progress enable row level security;
