alter table public.talent_opportunity_fit
  add column if not exists recommend boolean not null default false;

comment on column public.talent_opportunity_fit.recommend is
  'Whether this fit was selected for proactive talent delivery. Fit and delivery selection are intentionally separate.';

-- Preserve already-delivered decisions. These rows are excluded from another
-- delivery by the recommendation table, but keeping the decision makes the
-- same-company history truthful.
update public.talent_opportunity_fit fit
set recommend = true
where (
    fit.human_label = 'fit'
    or (fit.human_label is null and fit.label = 'fit')
  )
  and exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles delivered_role
      on delivered_role.role_id = recommendation.role_id
    where recommendation.talent_id = fit.talent_id
      and recommendation.role_id = fit.opportunity_id
      and delivered_role.source_type = 'internal'
      and lower(coalesce(delivered_role.information ->> 'testOnly', 'false')) <> 'true'
  );

-- Give existing, never-delivered company groups one conservative starting
-- choice. This is only a migration backfill; future choices come from the
-- internal-fit evaluator and are not enforced as a database cardinality rule.
with ranked as (
  select
    fit.id,
    row_number() over (
      partition by fit.talent_id, role.company_workspace_id
      order by
        case when fit.human_label = 'fit' then 0 else 1 end,
        fit.score desc,
        fit.last_evaluated_at desc,
        fit.id
    ) as company_rank
  from public.talent_opportunity_fit fit
  join public.company_roles role
    on role.role_id = fit.opportunity_id
  where (
      fit.human_label = 'fit'
      or (fit.human_label is null and fit.label = 'fit')
    )
    and role.source_type = 'internal'
    and role.status in ('active', 'paused')
    and coalesce(role.is_expired, false) = false
    and (role.expires_at is null or role.expires_at > now())
    and lower(coalesce(role.information ->> 'testOnly', 'false')) <> 'true'
    and not exists (
      select 1
      from public.talent_opportunity_recommendation recommendation
      join public.company_roles recommended_role
        on recommended_role.role_id = recommendation.role_id
      where recommendation.talent_id = fit.talent_id
        and recommended_role.company_workspace_id = role.company_workspace_id
        and recommended_role.source_type = 'internal'
        and lower(coalesce(recommended_role.information ->> 'testOnly', 'false')) <> 'true'
    )
)
update public.talent_opportunity_fit fit
set recommend = true
from ranked
where ranked.id = fit.id
  and ranked.company_rank = 1;

create index if not exists talent_opportunity_fit_recommendable_idx
  on public.talent_opportunity_fit (talent_id, score desc, last_evaluated_at desc)
  where recommend = true;
