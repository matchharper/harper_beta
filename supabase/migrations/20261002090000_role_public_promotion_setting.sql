begin;

-- Let the existing atomic company-data mutation path save the public
-- promotion setting with its workspace, optimistic-concurrency, and event
-- guarantees. Preserve the deployed function bodies outside these boundaries.
do $migration$
declare
  v_patch record;
  v_definition text;
  v_signature regprocedure;
  v_count integer;
begin
  for v_patch in select * from (values
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$'role_request', 'role_memory', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time',$patch$,
     $patch$'role_request', 'role_memory', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time', 'role_is_promote',$patch$, 1),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$where change ->> 'key' in ('role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time')$patch$,
     $patch$where change ->> 'key' in ('role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote')$patch$, 2),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$if v_key in ('role_request', 'role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time') then$patch$,
     $patch$if v_key in ('role_request', 'role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote') then$patch$, 1),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$if v_key in ('role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time')$patch$,
     $patch$if v_key in ('role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote')$patch$, 1),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$'role_employment_types', 'role_is_expired', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time'
    ) and jsonb_typeof(v_value)$patch$,
     $patch$'role_employment_types', 'role_is_expired', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time', 'role_is_promote'
    ) and jsonb_typeof(v_value)$patch$, 1),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$elsif v_key in ('role_is_expired', 'role_is_company_first_search')
       and jsonb_typeof(v_value) <> 'boolean' then$patch$,
     $patch$elsif v_key in ('role_is_expired', 'role_is_company_first_search', 'role_is_promote')
       and jsonb_typeof(v_value) <> 'boolean' then$patch$, 1),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$      elsif v_key = 'role_is_company_first_search' then$patch$,
     $patch$      elsif v_key = 'role_is_promote' then
        update public.company_internal_roles
        set is_promote = (v_value #>> '{}')::boolean,
            updated_at = v_now
        where role_id = v_role_id
          and is_promote is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_is_company_first_search' then$patch$, 1),
    ($patch$public.validate_company_data_change_value_v1(text, jsonb, text)$patch$,
     $patch$  if p_key = 'role_is_company_first_search' then$patch$,
     $patch$  if p_key = 'role_is_promote' then
    if jsonb_typeof(p_value) is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'role_is_promote must be boolean';
    end if;
    return;
  end if;
  if p_key = 'role_is_company_first_search' then$patch$, 1),
    ($patch$public.company_data_change_current_value_v1(uuid, text, uuid)$patch$,
     $patch$    when 'role_is_company_first_search' then$patch$,
     $patch$    when 'role_is_promote' then
      select to_jsonb(internal_role.is_promote) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_is_company_first_search' then$patch$, 1)
  ) as patches(signature, old_text, new_text, expected_count)
  loop
    v_signature := to_regprocedure(v_patch.signature);
    if v_signature is null then raise exception 'Missing function: %', v_patch.signature; end if;
    v_definition := pg_get_functiondef(v_signature);
    v_count := (length(v_definition) - length(replace(v_definition, v_patch.old_text, '')))
      / length(v_patch.old_text);
    if v_count <> v_patch.expected_count then
      raise exception 'Unexpected function definition: % (expected %, found %)',
        v_patch.signature, v_patch.expected_count, v_count;
    end if;
    execute replace(v_definition, v_patch.old_text, v_patch.new_text);
  end loop;
end;
$migration$;

commit;
