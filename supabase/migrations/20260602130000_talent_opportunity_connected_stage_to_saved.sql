update public.talent_opportunity_recommendation
set
  saved_stage = 'saved',
  updated_at = now()
where saved_stage = 'connected';
