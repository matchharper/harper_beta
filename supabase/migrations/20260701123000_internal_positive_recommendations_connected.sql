update public.talent_opportunity_recommendation rec
set
  saved_stage = 'connected',
  updated_at = timezone('utc', now())
from public.company_roles role
where role.role_id = rec.role_id
  and (
    lower(coalesce(role.source_type, '')) = 'internal'
    or rec.opportunity_type in ('internal_recommendation', 'intro_request')
  )
  and lower(coalesce(rec.feedback, '')) in ('like', 'positive')
  and (
    rec.saved_stage is null
    or rec.saved_stage = 'saved'
    or rec.saved_stage = 'applied'
  );
