-- Replace the legacy manual-matching audit table with the compact durable
-- output of the company-scoped matching and route decision worker. The old
-- columns and rows are intentionally retired; this table has a new meaning.
begin;

drop table if exists public.talent_opportunity_matching_review;

create table public.talent_opportunity_matching_review (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.company_first_search_runs(id) on delete cascade,
  talent_id uuid not null
    references public.talent_users(user_id) on delete cascade,
  opportunity_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  decision text not null,
  reason text not null,
  criteria_evaluations jsonb not null default '[]'::jsonb,
  input_fingerprint text not null,
  discovery_run_id uuid
    references public.opportunity_discovery_run(id) on delete set null,
  reviewed_at timestamptz not null default timezone('utc', now()),
  unique (run_id, talent_id)
);

create index talent_opportunity_matching_review_pair_idx
  on public.talent_opportunity_matching_review (
    talent_id,
    opportunity_id,
    reviewed_at desc
  );
create index talent_opportunity_matching_review_decision_idx
  on public.talent_opportunity_matching_review (decision, reviewed_at desc);

comment on table public.talent_opportunity_matching_review is
  'Final company-scoped matching review: candidate-first, company-first, or no-action.';
comment on column public.talent_opportunity_matching_review.criteria_evaluations is
  'Validated scorer evaluations for the selected primary Role criteria; empty when no criteria apply.';
comment on column public.talent_opportunity_matching_review.discovery_run_id is
  'Existing opportunity worker run queued for a candidate-first decision.';

alter table public.talent_opportunity_matching_review enable row level security;
revoke all on table public.talent_opportunity_matching_review
  from public, anon, authenticated;
grant select, insert, update, delete on table public.talent_opportunity_matching_review
  to service_role;

commit;
