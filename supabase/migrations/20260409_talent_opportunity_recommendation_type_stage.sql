alter table public.talent_opportunity_recommendation
  add column if not exists opportunity_type text null,
  add column if not exists saved_stage text null;

update public.talent_opportunity_recommendation
set feedback = null
where feedback = 'neutral';

update public.talent_opportunity_recommendation as recommendation
set opportunity_type = case
  when recommendation.kind = 'match' then 'intro_request'
  when role.source_type = 'internal' then 'internal_recommendation'
  else 'external_jd'
end
from public.company_roles as role
where role.role_id = recommendation.role_id
  and (
    recommendation.opportunity_type is null
    or recommendation.opportunity_type not in (
      'external_jd',
      'internal_recommendation',
      'intro_request'
    )
  );

update public.talent_opportunity_recommendation
set opportunity_type = 'external_jd'
where opportunity_type is null;

update public.talent_opportunity_recommendation
set saved_stage = case
  when feedback = 'like' and opportunity_type = 'intro_request' then 'connected'
  when feedback = 'like' and opportunity_type = 'internal_recommendation' then 'applied'
  when feedback = 'like' then 'saved'
  else null
end
where saved_stage is distinct from case
  when feedback = 'like' and opportunity_type = 'intro_request' then 'connected'
  when feedback = 'like' and opportunity_type = 'internal_recommendation' then 'applied'
  when feedback = 'like' then 'saved'
  else null
end;

alter table public.talent_opportunity_recommendation
  alter column opportunity_type set default 'external_jd',
  alter column opportunity_type set not null;

alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_feedback_check;

do $$
begin
  alter table public.talent_opportunity_recommendation
    add constraint talent_opportunity_recommendation_feedback_check
    check (feedback is null or feedback in ('like', 'dislike'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.talent_opportunity_recommendation
    add constraint talent_opportunity_recommendation_opportunity_type_check
    check (
      opportunity_type in (
        'external_jd',
        'internal_recommendation',
        'intro_request'
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.talent_opportunity_recommendation
    add constraint talent_opportunity_recommendation_saved_stage_check
    check (
      saved_stage is null
      or saved_stage in ('saved', 'applied', 'connected', 'closed')
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists talent_opportunity_recommendation_saved_stage_idx
  on public.talent_opportunity_recommendation (
    talent_id,
    feedback,
    saved_stage,
    feedback_at desc nulls last
  );
