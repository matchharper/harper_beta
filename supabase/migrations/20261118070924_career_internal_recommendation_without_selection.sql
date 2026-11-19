-- Selection is provenance, not permission to save a candidate-facing recommendation.
-- Preserve the existing writer, ownership, opt-out, test isolation and delivery locks.
do $migration$
declare
  definition text := pg_get_functiondef('public.write_career_opportunities(uuid,text,jsonb)'::regprocedure);
  selection_gate text := 'if not found then raise exception ''Selected internal proposal unavailable; a public posting chosen by the user uses apply_to_internal_role''; end if;';
  read_gate text := 'perform public.read_career_internal_role_v1(p_talent,role.role_id);';
  publication_boundary text := $boundary$if not exists(select 1 from public.talent_setting t where t.user_id=p_talent
          and t.get_internal_recommendation is distinct from false
          and t.profile_visibility is distinct from 'dont_share') then
          raise exception 'Internal recommendations disabled';
        end if;
        if role.status not in ('active','paused','top_priority') or coalesce(role.is_expired,false)
          or (role.expires_at is not null and role.expires_at<=now()) then
          raise exception 'Role is unavailable';
        end if;
        if lower(btrim(coalesce(role.information->>'testOnly','false'))) in ('true','1','yes','on')
          and not (nullif(role.information->>'testFixture','') is not null
            and coalesce(role.information->'testTalentIds','[]'::jsonb) ? p_talent::text) then
          raise exception 'Test Role unavailable';
        end if;$boundary$;
begin
  if strpos(definition,selection_gate)=0 and strpos(definition,publication_boundary)>0 then return; end if;
  if strpos(definition,selection_gate)=0 or strpos(definition,read_gate)=0 then
    raise exception 'Internal recommendation writer changed; inspect before applying';
  end if;
  definition := replace(definition,selection_gate,'-- An available selection is linked when present; it is not required.');
  definition := replace(definition,read_gate,publication_boundary);
  execute definition;
end
$migration$;
