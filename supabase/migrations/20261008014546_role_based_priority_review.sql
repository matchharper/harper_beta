begin;

-- A review request joins the Role's next search; it never starts its own run.
drop trigger if exists queue_candidate_priority_review on public.talent_progress;
drop function if exists public.queue_candidate_priority_review_v1();

-- Retire only unclaimed work from the superseded registration trigger.
-- Requests stay active and are read by the ordinary Role-based search.
update public.opportunity_discovery_run
set status='cancelled', completed_at=now(), updated_at=now(),
    coverage=coalesce(coverage,'{}'::jsonb)||jsonb_build_object('completionKind','superseded_by_role_based_matching')
where trigger='priority_review_requested' and status='queued';
update public.company_first_search_runs
set status='cancelled', finished_at=now(), updated_at=now(),
    result=coalesce(result,'{}'::jsonb)||jsonb_build_object('resultReason','superseded_by_role_based_matching')
where trigger_reason='priority_review_requested' and status='queued';

-- The conversation model may present a current assessment for an exact Role
-- the candidate explicitly requested, without a prior background selection.
-- The existing RPC still owns onboarding, role/privacy, idempotency and consent.
do $migration$
declare v_definition text; v_old text; v_new text;
begin
  v_definition:=pg_get_functiondef('public.present_talent_internal_role_recommendation_for_review_v1(uuid,uuid,uuid,jsonb)'::regprocedure);
  v_old:='and public.talent_internal_role_is_candidate_visible_v1(fit)';
  v_new:=$predicate$and (
    public.talent_internal_role_is_candidate_visible_v1(fit)
    or (
      fit.fit_contract_version='talent_role_fit_v2' and fit.evaluated_stage=2
      and fit.input_fingerprint is not null and fit.expires_at>now()
      and coalesce(lower(nullif(btrim(fit.human_label),'')),'fit')='fit'
      and fit.role_fit not in ('bad','unfit') and fit.candidate_fit not in ('bad','unfit')
      and fit.company_fit not in ('bad','unfit')
      and exists(select 1 from public.talent_progress requested
        where requested.talent_id=p_talent_id and requested.role_id=p_target_role_id
          and requested.kind='candidate_requested_connection'
          and requested.metadata->>'withdrawnAt' is null)
    )
  )$predicate$;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1
    then raise exception 'Unexpected current Role presentation RPC definition'; end if;
  execute replace(v_definition,v_old,v_new);
end $migration$;

notify pgrst, 'reload schema';
commit;
