update public.talent_opportunity_recommendation
set saved_stage = 'saved'
where saved_stage = 'planned';

alter table public.talent_opportunity_recommendation
  drop constraint if exists talent_opportunity_recommendation_saved_stage_check;

alter table public.talent_opportunity_recommendation
  add constraint talent_opportunity_recommendation_saved_stage_check
  check (
    saved_stage is null
    or saved_stage in (
      'saved',
      'applied',
      'connected',
      'closed',
      'hidden'
    )
  );

delete from public.translation_entries
where namespace = 'career'
  and key in (
    'career.common.career_history_panel.planned',
    'career.history.saved_opportunity_status.planned'
  );
