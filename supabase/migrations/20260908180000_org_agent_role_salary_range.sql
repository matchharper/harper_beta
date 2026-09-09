begin;

-- Role compensation already has a canonical company_roles column and website
-- editor. This wrapper extends the shared company-data mutation contract while
-- preserving optimistic checks, atomic batches, and one company event.
create or replace function public.apply_company_data_changes_with_role_salary_v1(
  p_workspace_id uuid,
  p_changes jsonb,
  p_source text,
  p_event_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_change jsonb;
  v_changed_count integer := 0;
  v_current text;
  v_expected jsonb;
  v_other_changes jsonb;
  v_other_changed_count integer := 0;
  v_other_result jsonb;
  v_other_status text;
  v_role_id uuid;
  v_value jsonb;
  v_value_text text;
  v_now timestamptz := transaction_timestamp();
begin
  if p_workspace_id is null
     or jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) not between 1 and 12 then
    raise exception using
      errcode = '22023',
      message = 'invalid company data changes';
  end if;
  if p_source is null or p_source not in ('chat', 'slack', 'website') then
    raise exception using
      errcode = '22023',
      message = 'invalid company data source';
  end if;
  if p_event_content is null
     or char_length(p_event_content) not between 1 and 300
     or p_event_content ~ E'[\\r\\n]' then
    raise exception using
      errcode = '22023',
      message = 'invalid company event content';
  end if;

  perform 1
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'company workspace not found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_changes) item
    where jsonb_typeof(item) is distinct from 'object'
  ) then
    raise exception using
      errcode = '22023',
      message = 'each company data change must be an object';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_changes) item
    where item ->> 'key' = 'salaryRange'
  ) is distinct from (
    select count(distinct item ->> 'role_id')
    from jsonb_array_elements(p_changes) item
    where item ->> 'key' = 'salaryRange'
  ) then
    raise exception using
      errcode = '22023',
      message = 'duplicate role salary range target';
  end if;

  -- Lock compensation targets in a stable order before delegating the rest of
  -- the batch to the existing shared mutation function.
  for v_change in
    select value
    from jsonb_array_elements(p_changes)
    where value ->> 'key' = 'salaryRange'
    order by value ->> 'role_id'
  loop
    if nullif(v_change ->> 'role_id', '') is null
       or not (v_change ? 'expected')
       or not (v_change ? 'value') then
      raise exception using
        errcode = '22023',
        message = 'role salary range requires role_id, expected, and value';
    end if;
    begin
      v_role_id := (v_change ->> 'role_id')::uuid;
    exception
      when invalid_text_representation then
        raise exception using
          errcode = '22023',
          message = 'invalid role salary range role_id';
    end;
    v_expected := v_change -> 'expected';
    v_value := v_change -> 'value';
    if jsonb_typeof(v_expected) not in ('string', 'null')
       or jsonb_typeof(v_value) not in ('string', 'null')
       or (
         jsonb_typeof(v_value) = 'string'
         and char_length(v_value #>> '{}') > 1000
       ) then
      raise exception using
        errcode = '22023',
        message = 'role salary range must be text of at most 1000 characters or null';
    end if;

    select role.salary_range
    into v_current
    from public.company_roles role
    where role.role_id = v_role_id
      and role.company_workspace_id = p_workspace_id
      and role.source_type = 'internal'
      and coalesce(role.is_expired, false) = false
      and exists (
        select 1
        from public.company_internal_roles internal_role
        where internal_role.role_id = role.role_id
      )
    for update;
    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'active internal role not found';
    end if;
    if coalesce(to_jsonb(v_current), 'null'::jsonb) is distinct from v_expected then
      return jsonb_build_object(
        'status', 'conflict',
        'key', 'salaryRange',
        'role_id', v_role_id
      );
    end if;
    if coalesce(to_jsonb(v_current), 'null'::jsonb) is distinct from v_value then
      v_changed_count := v_changed_count + 1;
    end if;
  end loop;

  select coalesce(jsonb_agg(value), '[]'::jsonb)
  into v_other_changes
  from jsonb_array_elements(p_changes)
  where value ->> 'key' is distinct from 'salaryRange';

  if jsonb_array_length(v_other_changes) > 0 then
    v_other_result := public.apply_company_data_changes_v1(
      p_workspace_id,
      v_other_changes,
      p_source,
      p_event_content
    );
    v_other_status := v_other_result ->> 'status';
    v_other_changed_count := coalesce(
      (v_other_result ->> 'changed_count')::integer,
      0
    );
    if v_other_status = 'conflict' then
      return v_other_result;
    end if;
    if v_other_status not in ('updated', 'already_reflected') then
      raise exception using
        errcode = 'P0001',
        message = 'unexpected company data update result';
    end if;
  end if;

  for v_change in
    select value
    from jsonb_array_elements(p_changes)
    where value ->> 'key' = 'salaryRange'
    order by value ->> 'role_id'
  loop
    v_role_id := (v_change ->> 'role_id')::uuid;
    v_value := v_change -> 'value';
    v_value_text := case
      when jsonb_typeof(v_value) = 'null' then null
      else v_value #>> '{}'
    end;
    update public.company_roles role
    set salary_range = v_value_text,
        updated_at = v_now
    where role.role_id = v_role_id
      and role.company_workspace_id = p_workspace_id
      and role.salary_range is distinct from v_value_text;
  end loop;

  if v_changed_count > 0
     and coalesce(v_other_status, 'already_reflected') = 'already_reflected' then
    insert into public.company_events(workspace_id, content, source, created_at)
    values (p_workspace_id, p_event_content, p_source, v_now);
  end if;

  if v_changed_count > 0 or v_other_status = 'updated' then
    return jsonb_build_object(
      'status', 'updated',
      'changed_count', v_changed_count + v_other_changed_count
    );
  end if;
  return jsonb_build_object('status', 'already_reflected', 'changed_count', 0);
end;
$$;

comment on function public.apply_company_data_changes_with_role_salary_v1(
  uuid, jsonb, text, text
) is 'Applies an optimistic atomic company-data batch that may include internal Role salary ranges.';

revoke all on function public.apply_company_data_changes_with_role_salary_v1(
  uuid, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.apply_company_data_changes_with_role_salary_v1(
  uuid, jsonb, text, text
) to service_role;

commit;
