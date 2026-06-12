do $$
declare
  function_sql text;
begin
  select pg_get_functiondef(
    to_regprocedure('public.claim_career_email_onboarding_lead(uuid, uuid, text, text, text)')
  )
  into function_sql;

  if function_sql is not null and position('talent_opportunity_profile_snapshot' in function_sql) > 0 then
    function_sql := replace(
      function_sql,
      $snapshot_update$
    update public.talent_opportunity_profile_snapshot
       set talent_id = target_user_id
     where talent_id = source_user_id;

$snapshot_update$,
      ''
    );

    execute function_sql;
  end if;
end;
$$;

drop table if exists public.talent_opportunity_profile_snapshot;
