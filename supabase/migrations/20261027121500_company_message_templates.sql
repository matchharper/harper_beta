-- Message templates a company team saves and reuses when contacting
-- candidates: interview scheduling settings, intro emails and the reason for
-- interest sent with an Intro request. Shared by everyone in the workspace.
-- `kind` and `content` stay open text/JSON so new template uses need no schema
-- change; the per-kind limit lives in the server.
create table if not exists public.company_message_templates (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  kind text not null,
  name text not null,
  content jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_message_templates_workspace_kind_idx
  on public.company_message_templates (company_workspace_id, kind, created_at);

alter table public.company_message_templates enable row level security;
revoke all on public.company_message_templates from public, anon, authenticated;
grant all on public.company_message_templates to service_role;
