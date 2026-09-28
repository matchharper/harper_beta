-- The search setting controls future periodic runs only. Never close, hide,
-- or interrupt an existing company-first proposal when the setting changes.
-- Extend the existing atomic company-data RPC (including proposal application),
-- preserving its workspace, expected-value, event and transaction contracts.
begin;

drop trigger if exists company_internal_role_close_company_intro_on_change
  on public.company_internal_roles;
drop function if exists public.close_company_intro_on_internal_role_change_v1();

-- These functions belong to the deployed baseline. Patch only the reviewed
-- field boundaries; fail closed on an unexpected definition instead of replacing
-- unrelated production behavior. CREATE OR REPLACE retains existing privileges.
do $migration$
declare
  v_patch record;
  v_definition text;
  v_signature regprocedure;
begin
  for v_patch in
    select * from (values
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$'role_request', 'role_memory', 'role_is_expired', 'role_source_type',$patch$, $patch$'role_request', 'role_memory', 'role_is_company_first_search',
      'role_is_expired', 'role_source_type',$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$  -- Validate all expected values before making the first physical write.$patch$, $patch$  -- Lock the canonical setting too: Ops can update it without locking the Role.
  perform internal_role.role_id
  from public.company_internal_roles internal_role
  where internal_role.role_id in (
    select (change ->> 'role_id')::uuid
    from jsonb_array_elements(p_changes) change
    where change ->> 'key' = 'role_is_company_first_search'
  )
  order by internal_role.role_id
  for update;
  if exists (
    select 1 from jsonb_array_elements(p_changes) change
    where change ->> 'key' = 'role_is_company_first_search'
      and not exists (
        select 1 from public.company_internal_roles internal_role
        where internal_role.role_id = (change ->> 'role_id')::uuid
      )
  ) then
    raise exception using errcode = 'P0002', message = 'internal role settings not found';
  end if;

  -- Validate all expected values before making the first physical write.$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$if v_key in ('role_request', 'role_memory') then$patch$, $patch$if v_key in ('role_request', 'role_memory', 'role_is_company_first_search') then$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$if v_key = 'role_memory'
       or ($patch$, $patch$if v_key in ('role_memory', 'role_is_company_first_search')
       or ($patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$elsif v_key = 'role_is_expired' and jsonb_typeof(v_value) <> 'boolean' then
      raise exception using errcode = '22023', message = 'role_is_expired must be boolean';$patch$, $patch$elsif v_key in ('role_is_expired', 'role_is_company_first_search')
       and jsonb_typeof(v_value) <> 'boolean' then
      raise exception using errcode = '22023', message = format('%s must be boolean', v_key);$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$'role_employment_types', 'role_is_expired'
    ) and jsonb_typeof(v_value)$patch$, $patch$'role_employment_types', 'role_is_expired', 'role_is_company_first_search'
    ) and jsonb_typeof(v_value)$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$, $patch$      elsif v_key = 'role_is_expired' then$patch$, $patch$      elsif v_key = 'role_is_company_first_search' then
        update public.company_internal_roles
        set is_company_first_search = (v_value #>> '{}')::boolean,
            updated_at = v_now
        where role_id = v_role_id
          and is_company_first_search is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_is_expired' then$patch$),
    ($patch$public.validate_company_data_change_value_v1(text, jsonb, text)$patch$, $patch$begin
  if p_key = 'role_status' then$patch$, $patch$begin
  if p_key = 'role_is_company_first_search' then
    if jsonb_typeof(p_value) is distinct from 'boolean' then
      raise exception using errcode = '22023', message = 'role_is_company_first_search must be boolean';
    end if;
    return;
  end if;

  if p_key = 'role_status' then$patch$),
    ($patch$public.company_data_change_current_value_v1(uuid, text, uuid)$patch$, $patch$    when 'role_request' then$patch$, $patch$    when 'role_is_company_first_search' then
      select to_jsonb(internal_role.is_company_first_search) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_request' then$patch$),
    ($patch$public.request_company_intro_v1(uuid, uuid, uuid, uuid, text[], text)$patch$, $patch$        and internal_role.is_company_first_search is true
$patch$, $patch$$patch$),
    ($patch$public.decide_company_intro_request_v1(uuid, uuid, text, text, jsonb)$patch$, $patch$          and internal_role.is_company_first_search is true
$patch$, $patch$$patch$),
    ($patch$public.company_first_outbox_is_deliverable_v1(uuid)$patch$, $patch$or internal_role.is_company_first_search is not true$patch$, $patch$or internal_role.role_id is null$patch$)
    ) as patches(signature, old_text, new_text)
  loop
    v_signature := to_regprocedure(v_patch.signature);
    if v_signature is null then
      raise exception 'Missing function: %', v_patch.signature;
    end if;
    v_definition := pg_get_functiondef(v_signature);
    if position(v_patch.old_text in v_definition) = 0 then
      raise exception 'Unexpected function definition: %', v_patch.signature;
    end if;
    if (length(v_definition) - length(replace(v_definition, v_patch.old_text, '')))
         / length(v_patch.old_text) <> 1 then
      raise exception 'Ambiguous patch target: %', v_patch.signature;
    end if;
    execute replace(v_definition, v_patch.old_text, v_patch.new_text);
  end loop;
end;
$migration$;

comment on column public.company_internal_roles.is_company_first_search is
  'Opt-in for future periodic company-first searches. Existing proposals and connections are unaffected; explicit one-off searches retain their own request scope.';

commit;
