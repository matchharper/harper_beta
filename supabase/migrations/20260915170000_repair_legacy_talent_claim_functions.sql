begin;

-- These account-claim helpers live in the deployed database baseline. Remove
-- references to legacy talent tables and columns that no longer exist while
-- preserving the rest of each deployed function body.
do $$
declare
  v_function text;
begin
  select pg_get_functiondef(
    to_regprocedure(
      'public.claim_career_email_onboarding_lead(uuid,uuid,text,text,text)'
    )
  )
  into v_function;

  if v_function is null then
    raise exception 'claim_career_email_onboarding_lead not found';
  end if;

  v_function := replace(
    v_function,
    E'\n    update public.talent_publications\n       set talent_id = target_user_id\n     where talent_id = source_user_id;\n',
    E'\n'
  );

  if position('public.talent_publications' in v_function) > 0 then
    raise exception 'claim_career_email_onboarding_lead still references talent_publications';
  end if;

  execute v_function;

  select pg_get_functiondef(
    to_regprocedure(
      'public.claim_talent_user_email_alias(text,uuid,text,text,text)'
    )
  )
  into v_function;

  if v_function is null then
    raise exception 'claim_talent_user_email_alias not found';
  end if;

  v_function := replace(v_function, E'    network_waitlist_id,\n', '');
  v_function := replace(v_function, E'    network_source_talent_id,\n', '');
  v_function := replace(
    v_function,
    E'    null,\n    source_row.network_source_talent_id,\n',
    ''
  );
  v_function := replace(
    v_function,
    E'\n  update public.talent_internal\n     set talent_id = target_user_id\n   where talent_id = source_row.user_id;\n',
    E'\n'
  );
  v_function := replace(
    v_function,
    E'\n  update public.talent_publications\n     set talent_id = target_user_id\n   where talent_id = source_row.user_id;\n',
    E'\n'
  );
  v_function := replace(
    v_function,
    E'\n  update public.talent_users\n     set network_waitlist_id = source_row.network_waitlist_id,\n         updated_at = now_ts\n   where user_id = target_user_id;\n',
    E'\n'
  );

  if position('network_waitlist_id' in v_function) > 0
     or position('network_source_talent_id' in v_function) > 0
     or position('public.talent_internal' in v_function) > 0
     or position('public.talent_publications' in v_function) > 0 then
    raise exception 'claim_talent_user_email_alias still has obsolete references';
  end if;

  execute v_function;
end;
$$;

commit;
