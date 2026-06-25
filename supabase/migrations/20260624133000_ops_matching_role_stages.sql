create table if not exists public.ops_matching_role_stages (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  constraint ops_matching_role_stages_label_nonempty check (btrim(label) <> '')
);

create unique index if not exists ops_matching_role_stages_role_label_idx
  on public.ops_matching_role_stages (role_id, lower(btrim(label)));

create index if not exists ops_matching_role_stages_role_sort_idx
  on public.ops_matching_role_stages (role_id, sort_order, label);

alter table public.ops_matching_role_stages enable row level security;
