begin;

-- This workflow keeps execution history in local artifacts. Remove the earlier
-- DB queue/lease implementation if this file is re-run after the first draft.
drop trigger if exists company_internal_roles_enqueue_matching_v1
  on public.company_internal_roles;
drop trigger if exists company_roles_enqueue_matching_on_status_v1
  on public.company_roles;
drop trigger if exists company_roles_touch_status_changed_at_v1
  on public.company_roles;

drop function if exists public.claim_company_role_matching_run_v1(text, integer);
drop function if exists public.enqueue_due_company_role_matching_runs_v1(timestamptz);
drop function if exists public.enqueue_company_role_matching_on_status_v1();
drop function if exists public.enqueue_company_role_matching_on_internal_role_v1();
drop function if exists public.enqueue_company_role_matching_run_v1(uuid, text, text);
drop function if exists public.touch_company_role_status_changed_at_v1();

drop table if exists public.company_role_matching_runs;

-- No column used by this workflow belongs on company_roles.
alter table public.company_roles
  drop column if exists status_changed_at;

alter table public.talent_opportunity_fit
  add column if not exists company_side_evaluation_metadata jsonb;

alter table public.company_internal_roles
  add column if not exists max_peding_talents integer,
  add column if not exists memory text;

comment on column public.talent_opportunity_fit.company_side_evaluation_metadata is
  'Optional company-side Codex evaluation provenance. Kept separate from company_criteria_evaluations and reevaluation_criteria.';
comment on column public.company_internal_roles.max_peding_talents is
  'Maximum effective internal pending talents for recurring company-side matching. Null pauses search and fit writes.';
create table if not exists public.company_behavior_contexts (
  company_workspace_id uuid primary key
    references public.company_workspace(company_workspace_id) on delete cascade,
  text_context text not null default '',
  context_version bigint not null default 0,
  context_hash text not null default '',
  source_fingerprint text not null default '',
  source_snapshot jsonb not null default '{}'::jsonb,
  changed_domains text[] not null default '{}',
  builder_version text not null default 'company_behavior_lines_v1',
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.company_role_behavior_contexts (
  role_id uuid primary key
    references public.company_roles(role_id) on delete cascade,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  text_context text not null default '',
  context_version bigint not null default 0,
  context_hash text not null default '',
  source_fingerprint text not null default '',
  source_snapshot jsonb not null default '{}'::jsonb,
  changed_domains text[] not null default '{}',
  builder_version text not null default 'company_role_behavior_lines_v1',
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists company_role_behavior_contexts_workspace_idx
  on public.company_role_behavior_contexts(company_workspace_id, updated_at desc);

alter table public.company_behavior_contexts enable row level security;
alter table public.company_role_behavior_contexts enable row level security;

grant all on table public.company_behavior_contexts to service_role;
grant all on table public.company_role_behavior_contexts to service_role;

comment on table public.company_behavior_contexts is
  'One concise behavior context per company workspace. A role matching run may use only evidence attached to its target role.';
comment on table public.company_role_behavior_contexts is
  'One concise behavior context per internal role, built only from evidence attached to that role.';

commit;
