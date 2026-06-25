alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_saved_stage_check;

alter table public.talent_opportunity_recommendation
  add constraint talent_opportunity_recommendation_saved_stage_check
  check (
    saved_stage is null
    or saved_stage in (
      'saved',
      'planned',
      'applied',
      'connected',
      'closed',
      'hidden'
    )
  );
