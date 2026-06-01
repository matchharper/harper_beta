create table if not exists public.ops_internal_recommendation_hidden (
  recommendation_id uuid primary key references public.talent_opportunity_recommendation(id) on delete cascade,
  hidden_at timestamptz not null default now()
);

alter table public.ops_internal_recommendation_hidden enable row level security;
