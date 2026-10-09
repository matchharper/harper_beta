begin;

-- Explicit priority review uses a fixed product rule. Fit-cache expiry still
-- controls ordinary matching refresh, but does not block this requested review.
create or replace function public.talent_internal_role_priority_review_is_recommendable_v1(
  p_fit public.talent_opportunity_fit
)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select case
    when p_fit.id is null then false
    when p_fit.fit_contract_version='talent_role_fit_v2' then
      p_fit.evaluated_stage=2 and p_fit.input_fingerprint is not null
      and coalesce(lower(nullif(btrim(p_fit.human_label),'')),'fit')='fit'
      and p_fit.role_fit not in ('bad','unfit')
      and p_fit.candidate_fit not in ('bad','unfit')
      and p_fit.company_fit not in ('bad','unfit')
      and (
        (p_fit.role_fit='perfect' and p_fit.company_fit='perfect')
        or exists (
          select 1 from public.talent_opportunity_matching_review selected
          where selected.talent_id=p_fit.talent_id and selected.opportunity_id=p_fit.opportunity_id
            and selected.input_fingerprint=p_fit.input_fingerprint
            and selected.decision in ('candidate_first','both') and selected.closed_at is null
        )
      )
    else public.talent_internal_role_is_candidate_visible_v1(p_fit)
  end;
$$;
revoke all on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)
  from public,anon,authenticated;
grant execute on function public.talent_internal_role_priority_review_is_recommendable_v1(public.talent_opportunity_fit)
  to service_role;

create or replace view public.talent_role_fit_with_selection_v1 with(security_invoker=true) as
  select fit.*,public.talent_internal_role_is_candidate_visible_v1(fit) as candidate_visible,
    public.talent_internal_role_priority_review_is_recommendable_v1(fit) as priority_review_recommendable
  from public.talent_opportunity_fit fit;
revoke all on public.talent_role_fit_with_selection_v1 from public,anon,authenticated;
grant select on public.talent_role_fit_with_selection_v1 to service_role;

-- Replace the former model-discretion capability in both presentation paths.
-- The same-company acceptance path also accepts an already presented card when
-- its fit cache has expired; an unpresented request cannot bypass acceptance.
do $migration$
declare
  v_signature text;
  v_definition text;
  v_old text;
  v_new text;
  v_requested text := $requested$exists(select 1 from public.talent_progress requested
        where requested.talent_id=p_talent_id and requested.role_id=p_target_role_id
          and requested.kind='candidate_requested_connection'
          and requested.metadata->>'withdrawnAt' is null)$requested$;
  v_formal_card text := $formal$exists(select 1 from public.talent_opportunity_recommendation rec
        where rec.talent_id=p_talent_id and rec.role_id=p_target_role_id
          and rec.opportunity_type='internal_recommendation'
          and coalesce(rec.feedback,'') not in ('dislike','negative')
          and coalesce(rec.saved_stage,'')<>'closed')$formal$;
begin
  foreach v_signature in array array[
    'public.present_talent_internal_role_recommendation_for_review_v1(uuid,uuid,uuid,jsonb)',
    'public.set_talent_internal_role_recommendation_before_company_share_v1(uuid,uuid,uuid,jsonb,boolean)'
  ] loop
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    v_old:=$predicate$and (
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
    v_new:='and (public.talent_internal_role_is_candidate_visible_v1(fit) or ('
      ||'public.talent_internal_role_priority_review_is_recommendable_v1(fit) and ';
    if v_signature like '%set_talent_internal_role_recommendation_before_company_share%' then
      v_old:=replace(v_old,$old$or (
      fit.fit_contract_version$old$,$new$or (
      not p_accept
      and fit.fit_contract_version$new$);
      v_new:=v_new||'((not p_accept and '||v_requested||') or (p_accept and '||v_formal_card||'))))';
    else
      v_new:=v_new||v_requested||'))';
    end if;
    if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old)<>1 then
      raise exception 'Unexpected explicit-review presentation predicate: %',v_signature;
    end if;
    execute replace(v_definition,v_old,v_new);
  end loop;
end $migration$;

notify pgrst, 'reload schema';
commit;
