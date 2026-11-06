select distinct on (e.id)
 t.id as recommendation_id,t.talent_id,t.role_id,t.feedback,t.feedback_reason,t.saved_stage,
 t.recommended_at,t.feedback_at,e.id as evaluation_id,e.run_id,e.evaluated_at,e.assessment,e.input_snapshot,
 jsonb_build_object('salary_is_predicted',c.salary_is_predicted,'salary_min',c.salary_min,'salary_max',c.salary_max,'salary_currency',c.salary_currency,'salary_period',c.salary_period) as salary,
 c.description is not distinct from e.input_snapshot#>>'{candidate,roleDescription}' as same_jd
from public.talent_opportunity_recommendation t
join public.talent_external_evaluations e on e.id::text=t.evidence->>'evaluationId' and e.talent_id=t.talent_id and e.role_id=t.role_id
join public.company_roles c on c.role_id=t.role_id
where t.feedback in ('like','positive','dislike','negative')
 and e.evaluated_at<t.feedback_at
 and e.input_snapshot->>'evaluator'='external-fit-questions-v6-strong-constraints:openai:gpt-6-luna'
 and lower(coalesce(c.information->>'testOnly','false'))<>'true'
order by e.id,t.feedback_at desc
