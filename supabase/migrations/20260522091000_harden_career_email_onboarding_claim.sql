do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.claim_career_email_onboarding_lead(uuid, uuid, text, text, text)'::regprocedure
  )
  into function_sql;

  if position('talent_activity_events' in function_sql) = 0 then
    function_sql := replace(
      function_sql,
      $anchor$
    if exists (select 1 from public.talent_setting where user_id = target_user_id) then
$anchor$,
      $replacement$
    update public.talent_activity_events
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_conversation_summaries
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.opportunity_discovery_run
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_opportunity_profile_snapshot
       set talent_id = target_user_id
     where talent_id = source_user_id;

    update public.talent_opportunity_delivery
       set talent_id = target_user_id
     where talent_id = source_user_id;

    delete from public.talent_company_recommendation source_recommendation
     using public.talent_company_recommendation target_recommendation
     where source_recommendation.talent_id = source_user_id
       and target_recommendation.talent_id = target_user_id
       and target_recommendation.company_db_id = source_recommendation.company_db_id;

    update public.talent_company_recommendation
       set talent_id = target_user_id
     where talent_id = source_user_id;

    delete from public.talent_company_follow source_follow
     using public.talent_company_follow target_follow
     where source_follow.talent_id = source_user_id
       and target_follow.talent_id = target_user_id
       and target_follow.company_db_id = source_follow.company_db_id;

    update public.talent_company_follow
       set talent_id = target_user_id
     where talent_id = source_user_id;

    if exists (select 1 from public.talent_setting where user_id = target_user_id) then
$replacement$
    );

    if position('talent_activity_events' in function_sql) = 0 then
      raise exception 'Failed to patch claim_career_email_onboarding_lead';
    end if;

    execute function_sql;
  end if;
end;
$$;
