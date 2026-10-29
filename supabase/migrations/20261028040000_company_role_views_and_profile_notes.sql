-- Views a company team arranges for a Role's candidates.
--
-- company_role_list_columns: comparison columns the company-side LLM adds to
--   the inbox list on request. Shared by everyone who can open the Role.
--   `values` maps a talent ID to the cell text. Open JSON so new column uses
--   need no schema change.
-- company_role_board_layouts: where each teammate placed candidate cards on
--   the Role's board view, and the last zoom/pan. One row per Role and person.
-- company_role_board_texts: text boxes the team writes on a Role's board,
--   shared by everyone who can open the Role. Each tab of the board (a stage,
--   or saved candidates) has its own boxes, named by `board`. One row per box,
--   so teammates editing different boxes never overwrite each other.
create table if not exists public.company_role_list_columns (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  label text not null,
  description text,
  "values" jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_role_list_columns_role_idx
  on public.company_role_list_columns (role_id, created_at);

create table if not exists public.company_role_board_layouts (
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  company_user_id uuid not null,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  positions jsonb not null default '{}'::jsonb,
  viewport jsonb,
  updated_at timestamptz not null default now(),
  primary key (role_id, company_user_id)
);

create table if not exists public.company_role_board_texts (
  id uuid primary key,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  board text not null,
  text text not null,
  size integer not null default 24,
  x double precision not null,
  y double precision not null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_role_board_texts_board_idx
  on public.company_role_board_texts (role_id, board, created_at);

alter table public.company_role_list_columns enable row level security;
alter table public.company_role_board_layouts enable row level security;
alter table public.company_role_board_texts enable row level security;
revoke all on public.company_role_list_columns from public, anon, authenticated;
revoke all on public.company_role_board_layouts from public, anon, authenticated;
revoke all on public.company_role_board_texts from public, anon, authenticated;
grant all on public.company_role_list_columns to service_role;
grant all on public.company_role_board_layouts to service_role;
grant all on public.company_role_board_texts to service_role;
