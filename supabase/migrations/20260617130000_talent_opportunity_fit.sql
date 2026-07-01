create table if not exists public.talent_opportunity_fit (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  opportunity_id uuid not null references public.company_roles(role_id) on delete cascade,
  score integer not null,
  label text not null,
  reason text not null default '',
  reevaluation_criteria jsonb null,
  human_label text null,
  human_reason text null,
  human_reviewed_by text null,
  human_reviewed_at timestamptz null,
  last_evaluated_at timestamptz not null default timezone('utc', now()),
  reevaluation_checked_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint talent_opportunity_fit_unique_role unique (talent_id, opportunity_id),
  constraint talent_opportunity_fit_score_check check (score >= 0 and score <= 100),
  constraint talent_opportunity_fit_label_check
    check (label in ('fit', 'hold', 'ambiguous', 'dissatisfied', 'unfit')),
  constraint talent_opportunity_fit_human_label_check
    check (human_label is null or human_label in ('fit', 'hold', 'ambiguous', 'dissatisfied', 'unfit'))
);

create index if not exists talent_opportunity_fit_talent_label_score_idx
  on public.talent_opportunity_fit (talent_id, label, score desc);

create index if not exists talent_opportunity_fit_opportunity_label_idx
  on public.talent_opportunity_fit (opportunity_id, label);

create index if not exists talent_opportunity_fit_hold_check_idx
  on public.talent_opportunity_fit (talent_id, reevaluation_checked_at)
  where label = 'hold';

alter table public.talent_opportunity_fit enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute 'grant select, insert, update on public.talent_opportunity_fit to harper_worker';

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'talent_opportunity_fit'
        and policyname = 'harper_worker_talent_opportunity_fit_all'
    ) then
      execute 'create policy harper_worker_talent_opportunity_fit_all
        on public.talent_opportunity_fit
        for all
        to harper_worker
        using (true)
        with check (true)';
    end if;
  end if;
end $$;

insert into public.talent_opportunity_fit (
  talent_id,
  opportunity_id,
  score,
  label,
  reason,
  reevaluation_criteria,
  last_evaluated_at,
  reevaluation_checked_at,
  created_at
)
select
  rec.talent_id,
  rec.role_id,
  greatest(
    0,
    least(
      100,
      coalesce(
        case
          when rec.score is null then null
          when rec.score <= 1 then round(rec.score * 100)::integer
          else round(rec.score)::integer
        end,
        85
      )
    )
  ) as score,
  'fit' as label,
  coalesce(
    nullif(btrim(rec.fit_summary), ''),
    'Previously recommended internal opportunity.'
  ) as reason,
  null::jsonb as reevaluation_criteria,
  coalesce(rec.created_at, timezone('utc', now())) as last_evaluated_at,
  coalesce(rec.created_at, timezone('utc', now())) as reevaluation_checked_at,
  coalesce(rec.created_at, timezone('utc', now())) as created_at
from public.talent_opportunity_recommendation rec
join public.company_roles role
  on role.role_id = rec.role_id
where rec.role_id is not null
  and lower(coalesce(role.source_type, '')) = 'internal'
on conflict (talent_id, opportunity_id) do update set
  score = greatest(public.talent_opportunity_fit.score, excluded.score),
  label = case
    when public.talent_opportunity_fit.human_label is null then 'fit'
    else public.talent_opportunity_fit.label
  end,
  reason = case
    when public.talent_opportunity_fit.human_label is null then excluded.reason
    else public.talent_opportunity_fit.reason
  end,
  last_evaluated_at = greatest(
    public.talent_opportunity_fit.last_evaluated_at,
    excluded.last_evaluated_at
  ),
  reevaluation_checked_at = greatest(
    coalesce(public.talent_opportunity_fit.reevaluation_checked_at, '-infinity'::timestamptz),
    excluded.reevaluation_checked_at
  );
