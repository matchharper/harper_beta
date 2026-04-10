create extension if not exists pgcrypto;

alter table public.company_workspace
  add column if not exists company_db_id integer null references public.company_db(id) on delete set null;

create unique index if not exists company_workspace_company_db_uidx
  on public.company_workspace (company_db_id)
  where company_db_id is not null;

alter table public.company_roles
  add column if not exists source_type text not null default 'internal',
  add column if not exists source_provider text null,
  add column if not exists source_job_id text null,
  add column if not exists posted_at timestamptz null,
  add column if not exists expires_at timestamptz null,
  add column if not exists location_text text null,
  add column if not exists work_mode text null;

alter table public.company_roles
  drop constraint if exists company_roles_type_check;

do $$
begin
  alter table public.company_roles
    add constraint company_roles_type_check
    check (
      coalesce(type, '{}'::text[]) <@ array[
        'full_time',
        'part_time',
        'internship',
        'contract'
      ]::text[]
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.company_roles
    add constraint company_roles_source_type_check
    check (source_type in ('internal', 'external'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.company_roles
    add constraint company_roles_work_mode_check
    check (work_mode in ('onsite', 'hybrid', 'remote'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.company_roles
    add constraint company_roles_posted_expires_at_check
    check (
      expires_at is null
      or posted_at is null
      or expires_at >= posted_at
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists company_roles_source_type_status_posted_idx
  on public.company_roles (source_type, status, posted_at desc nulls last, updated_at desc);

create unique index if not exists company_roles_external_source_job_uidx
  on public.company_roles (source_provider, source_job_id)
  where source_type = 'external'
    and source_provider is not null
    and source_job_id is not null;

create table if not exists public.talent_opportunity_recommendation (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  kind text not null default 'recommendation',
  score numeric(6,5) null,
  rank integer null,
  recommendation_reasons jsonb not null default '[]'::jsonb,
  model_version text null,
  feedback text null,
  feedback_reason text null,
  feedback_at timestamptz null,
  viewed_at timestamptz null,
  clicked_at timestamptz null,
  dismissed_at timestamptz null,
  recommended_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint talent_opportunity_recommendation_unique unique (talent_id, role_id),
  constraint talent_opportunity_recommendation_kind_check
    check (kind in ('match', 'recommendation')),
  constraint talent_opportunity_recommendation_score_check
    check (score is null or (score >= 0 and score <= 1)),
  constraint talent_opportunity_recommendation_rank_check
    check (rank is null or rank > 0),
  constraint talent_opportunity_recommendation_feedback_check
    check (feedback is null or feedback in ('like', 'neutral', 'dislike'))
);

create index if not exists talent_opportunity_recommendation_talent_recent_idx
  on public.talent_opportunity_recommendation (talent_id, recommended_at desc)
  where dismissed_at is null;

create index if not exists talent_opportunity_recommendation_feedback_idx
  on public.talent_opportunity_recommendation (talent_id, feedback, feedback_at desc nulls last);

create index if not exists talent_opportunity_recommendation_role_recent_idx
  on public.talent_opportunity_recommendation (role_id, recommended_at desc);

create or replace function public.set_talent_opportunity_recommendation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists talent_opportunity_recommendation_set_updated_at
  on public.talent_opportunity_recommendation;

create trigger talent_opportunity_recommendation_set_updated_at
before update on public.talent_opportunity_recommendation
for each row
execute function public.set_talent_opportunity_recommendation_updated_at();

alter table public.talent_opportunity_recommendation enable row level security;

drop policy if exists talent_opportunity_recommendation_select_own
  on public.talent_opportunity_recommendation;

create policy talent_opportunity_recommendation_select_own
  on public.talent_opportunity_recommendation
  for select
  using (talent_id = auth.uid());

drop policy if exists talent_opportunity_recommendation_update_own
  on public.talent_opportunity_recommendation;

create policy talent_opportunity_recommendation_update_own
  on public.talent_opportunity_recommendation
  for update
  using (talent_id = auth.uid())
  with check (talent_id = auth.uid());
