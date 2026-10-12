-- A stale displayed revision is an HTTP conflict, not a transient database
-- serialization failure. PostgREST 14 retries 40001 indefinitely with the same
-- stale input. Keep the revision guard and return PT409 without retrying.
-- These v2 functions were introduced after the September conflict-code repair.
-- Preserve the live function bodies, owners, privileges and search paths.
do $$
declare
  signature text;
  definition text;
  updated_definition text;
begin
  foreach signature in array array[
    'public.update_talent_role_feedback_v2(uuid,uuid,text,text,text,timestamptz,timestamptz,text)',
    'public.accept_talent_internal_role_recommendation_v2(uuid,uuid,uuid,text,jsonb,jsonb,timestamptz)',
    'public.decide_company_intro_request_v2(uuid,uuid,text,text,jsonb,timestamptz)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position('recommendation_changed_refresh_required' in definition) = 0 then
      raise exception 'Missing recommendation revision guard in %', signature;
    end if;
    updated_definition := regexp_replace(
      definition,
      'errcode[[:space:]]*=[[:space:]]*''40001''',
      'errcode = ''PT409''',
      'gi'
    );
    if definition is distinct from updated_definition then
      execute updated_definition;
    elsif position('PT409' in definition) = 0 then
      raise exception 'Unexpected recommendation conflict code in %', signature;
    end if;
  end loop;
end $$;
