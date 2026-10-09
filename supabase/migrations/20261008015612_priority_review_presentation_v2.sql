begin;

-- A formal card is a selection fact, not a change to the shared V2 assessment.
-- Reuse matching_review so later reads/acceptance see the presented selection.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_old text := $old$update public.talent_opportunity_fit
  set recommend = true
  where id = v_target_fit.id;$old$;
  v_new text := $new$if v_target_fit.fit_contract_version='talent_role_fit_v2' then
    update public.talent_opportunity_matching_review selected
    set recommendation_id=v_target_recommendation.id
    where selected.talent_id=p_talent_id and selected.opportunity_id=p_target_role_id
      and selected.input_fingerprint=v_target_fit.input_fingerprint
      and selected.decision in ('candidate_first','both')
      and selected.closed_at is null and selected.recommendation_id is null;
    insert into public.talent_opportunity_matching_review (
      talent_id,opportunity_id,decision,reason,input_fingerprint,
      recommendation_id,priority_request_id,reviewed_at
    )
    select p_talent_id,p_target_role_id,'candidate_first',
      v_target_fit_reasons::text,v_target_fit.input_fingerprint,
      v_target_recommendation.id,
      (select requested.id from public.talent_progress requested
        where requested.talent_id=p_talent_id and requested.role_id=p_target_role_id
          and requested.kind='candidate_requested_connection'
          and requested.metadata->>'withdrawnAt' is null
        order by requested.created_at,requested.id limit 1),v_now
    where not exists (
      select 1 from public.talent_opportunity_matching_review selected
      where selected.talent_id=p_talent_id and selected.opportunity_id=p_target_role_id
        and selected.input_fingerprint=v_target_fit.input_fingerprint
        and selected.decision in ('candidate_first','both') and selected.closed_at is null
    );
  else
    update public.talent_opportunity_fit set recommend=true where id=v_target_fit.id;
  end if;$new$;
  v_delete text := $delete$delete from public.talent_progress
  where talent_id = p_talent_id
    and role_id = p_target_role_id
    and kind = 'candidate_requested_connection';$delete$;
begin
  foreach v_signature in array array[
    'public.present_talent_internal_role_recommendation_for_review_v1(uuid,uuid,uuid,jsonb)',
    'public.set_talent_internal_role_recommendation_before_company_share_v1(uuid,uuid,uuid,jsonb,boolean)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1
      or (length(v_definition)-length(replace(v_definition,v_delete,'')))/length(v_delete)<>1 then
      raise exception 'Unexpected current Role presentation definition: %',v_signature;
    end if;
    v_definition:=replace(v_definition,v_old,v_new);
    -- The formal recommendation resolves the request in readers; keep its
    -- original row and the matching_review FK for history and idempotency.
    v_definition:=replace(v_definition,v_delete,'-- Preserve the original priority-review request history.');
    execute v_definition;
  end loop;
end $migration$;

-- Presentation can delegate to the same-company helper. Give only its review
-- action the same explicit-request capability; acceptance still needs a card.
do $migration$
declare v_definition text; v_old text; v_new text;
begin
  v_definition:=pg_get_functiondef('public.set_talent_internal_role_recommendation_before_company_share_v1(uuid,uuid,uuid,jsonb,boolean)'::regprocedure);
  v_old:='and public.talent_internal_role_is_candidate_visible_v1(fit)';
  v_new:=$predicate$and (
    public.talent_internal_role_is_candidate_visible_v1(fit)
    or (
      not p_accept
      and fit.fit_contract_version='talent_role_fit_v2' and fit.evaluated_stage=2
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
    then raise exception 'Unexpected current same-company Role presentation definition'; end if;
  execute replace(v_definition,v_old,v_new);
end $migration$;

notify pgrst, 'reload schema';
commit;
