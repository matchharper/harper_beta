-- Company descriptions are optional during signup; names remain required.
-- Preserve the installed ownership, research and billing contracts.
do $migration$
declare
  definition text;
  required_description constant text := $clause$length(trim(coalesce(p_values->>'description','')))=0 or $clause$;
begin
  definition := pg_get_functiondef(
    'public.workspace_signup_update_v1(uuid,uuid,text,jsonb)'::regprocedure
  );
  if position(required_description in definition) > 0 then
    execute replace(definition, required_description, '');
  elsif position($clause$length(p_values->>'description')>8000$clause$ in definition) = 0 then
    raise exception 'Unexpected company signup validation; review before applying';
  end if;
end;
$migration$;
