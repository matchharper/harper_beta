-- SQLSTATE 40001 means serialization_failure. PostgREST 14 retries it even
-- when a function deliberately raises it for an ordinary version conflict.
-- PT409 preserves the HTTP conflict response without retrying the transaction.
-- Replace only explicit application error codes; real PostgreSQL serialization
-- failures retain SQLSTATE 40001.
do $$
declare
  target record;
  definition text;
  updated_definition text;
begin
  for target in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and n.nspname in ('public', 'gtm_view')
      and p.prosrc ~* 'errcode[[:space:]]*=[[:space:]]*''40001'''
  loop
    definition := pg_get_functiondef(target.oid);
    updated_definition := regexp_replace(
      definition,
      'errcode[[:space:]]*=[[:space:]]*''40001''',
      'errcode = ''PT409''',
      'gi'
    );
    execute updated_definition;
    raise notice 'Replaced application conflict SQLSTATE in %.%',
      target.nspname, target.proname;
  end loop;
end $$;
