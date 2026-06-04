update public.talent_opportunity_recommendation tor
set
  processed_stage = 'pending',
  updated_at = now()
from public.company_roles cr
where tor.role_id = cr.role_id
  and (cr.source_type = 'internal' or cr.source_type is null)
  and tor.feedback = 'like'
  and (tor.processed_stage is null or btrim(tor.processed_stage) = '');
