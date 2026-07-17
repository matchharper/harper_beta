do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    'public.claim_career_email_onboarding_lead(uuid, uuid, text, text, text)'::regprocedure
  )
    into function_sql;

  if function_sql is null then
    raise exception 'claim_career_email_onboarding_lead function does not exist';
  end if;

  function_sql := replace(
    function_sql,
    E'\n    update public.opportunity_scheduler_checks\n       set talent_id = target_user_id\n     where talent_id = source_user_id;\n',
    E'\n    update public.opportunity_scheduler_checks\n       set talent_id = target_user_id::text\n     where talent_id = source_user_id::text;\n'
  );

  execute function_sql;
end;
$$;
