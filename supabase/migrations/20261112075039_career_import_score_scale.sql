-- Recommendation scores use 0–1; the assessment retains its original 0–100 value.
begin;

-- Attach scoring evidence only to the recommendation this run was created for.
-- Publication, feedback, saved stages and list membership are not scoring decisions.
create or replace function public.attach_career_import_evaluation(p_run uuid,p_token uuid)
returns void language sql security invoker set search_path='' as $$
  update public.talent_opportunity_recommendation rec
  set evidence=coalesce(rec.evidence,'{}'::jsonb)||jsonb_build_object('evaluationId',e.id),
      score=(e.assessment#>>'{fit,mutualFit}')::numeric / 100
  from public.external_recommendation_runs run, public.talent_external_evaluations e
  where run.id=p_run and run.lease_token=p_token and run.surface='import'
    and rec.id=(run.request->>'recommendationId')::uuid
    and rec.external_experiment_run_id=run.id and rec.talent_id=run.talent_id
    and e.id=any(run.evaluation_ids) and e.talent_id=rec.talent_id and e.role_id=rec.role_id
    and rec.evidence->>'evaluationId' is null;
$$;
revoke all on function public.attach_career_import_evaluation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.attach_career_import_evaluation(uuid,uuid) to service_role;

commit;
