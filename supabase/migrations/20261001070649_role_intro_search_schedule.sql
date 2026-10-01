begin;

alter table public.company_internal_roles
  add column if not exists intro_search_date text[] not null default array['Mon', 'Wed', 'Fri']::text[],
  add column if not exists intro_search_time smallint not null default 9;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_internal_roles_intro_search_date_check') then
    alter table public.company_internal_roles
      add constraint company_internal_roles_intro_search_date_check check (
        cardinality(intro_search_date) between 1 and 7
        and intro_search_date <@ array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']::text[]
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_internal_roles_intro_search_time_check') then
    alter table public.company_internal_roles
      add constraint company_internal_roles_intro_search_time_check check (intro_search_time between 0 and 23);
  end if;
end;
$constraints$;

alter table public.company_first_search_runs
  add column if not exists scheduled_role_ids uuid[] not null default '{}'::uuid[];

comment on column public.company_internal_roles.intro_search_date is
  'Weekdays for periodic company-first search, in Asia/Seoul. Explicit and post-calibration searches are unaffected.';
comment on column public.company_internal_roles.intro_search_time is
  'Hour from 0 to 23 for periodic company-first search, in Asia/Seoul.';
comment on column public.company_first_search_runs.scheduled_role_ids is
  'Role scope captured when a periodic search is queued; empty for legacy and non-periodic runs.';

-- Keep the established atomic company-data mutation contract, including
-- authorization, optimistic concurrency, proposals, events, and retries.
do $migration$
declare
  v_patch record;
  v_definition text;
  v_signature regprocedure;
begin
  for v_patch in select * from (values
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$'role_request', 'role_memory', 'role_is_company_first_search',$patch$,
     $patch$'role_request', 'role_memory', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time',$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$where change ->> 'key' = 'role_is_company_first_search'$patch$,
     $patch$where change ->> 'key' in ('role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time')$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$if v_key in ('role_request', 'role_memory', 'role_is_company_first_search') then$patch$,
     $patch$if v_key in ('role_request', 'role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time') then$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$'role_employment_types', 'role_is_expired', 'role_is_company_first_search'
    ) and jsonb_typeof(v_value)$patch$,
     $patch$'role_employment_types', 'role_is_expired', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time'
    ) and jsonb_typeof(v_value)$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$if v_key in ('role_memory', 'role_is_company_first_search')$patch$,
     $patch$if v_key in ('role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time')$patch$),
    ($patch$public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)$patch$,
     $patch$      elsif v_key = 'role_is_company_first_search' then$patch$,
     $patch$      elsif v_key = 'role_intro_search_date' then
        update public.company_internal_roles
        set intro_search_date = array(select jsonb_array_elements_text(v_value)),
            updated_at = v_now
        where role_id = v_role_id
          and to_jsonb(intro_search_date) is distinct from v_value;
      elsif v_key = 'role_intro_search_time' then
        update public.company_internal_roles
        set intro_search_time = (v_value #>> '{}')::smallint,
            updated_at = v_now
        where role_id = v_role_id
          and intro_search_time is distinct from (v_value #>> '{}')::smallint;
      elsif v_key = 'role_is_company_first_search' then$patch$),
    ($patch$public.validate_company_data_change_value_v1(text, jsonb, text)$patch$,
     $patch$begin
  if p_key = 'role_is_company_first_search' then$patch$,
     $patch$begin
  if p_key = 'role_intro_search_date' then
    if jsonb_typeof(p_value) is distinct from 'array'
       or jsonb_array_length(p_value) not between 1 and 7
       or exists (
         select 1 from jsonb_array_elements_text(p_value) day
         where day not in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
       )
       or (select count(distinct day) from jsonb_array_elements_text(p_value) day)
          <> jsonb_array_length(p_value) then
      raise exception using errcode = '22023', message = 'invalid intro search weekdays';
    end if;
    return;
  end if;
  if p_key = 'role_intro_search_time' then
    if jsonb_typeof(p_value) is distinct from 'number'
       or (p_value #>> '{}') !~ '^(0|[1-9]|1[0-9]|2[0-3])$' then
      raise exception using errcode = '22023', message = 'invalid intro search hour';
    end if;
    return;
  end if;
  if p_key = 'role_is_company_first_search' then$patch$),
    ($patch$public.company_data_change_current_value_v1(uuid, text, uuid)$patch$,
     $patch$    when 'role_is_company_first_search' then$patch$,
     $patch$    when 'role_intro_search_date' then
      select to_jsonb(internal_role.intro_search_date) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_intro_search_time' then
      select to_jsonb(internal_role.intro_search_time) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_is_company_first_search' then$patch$)
  ) as patches(signature, old_text, new_text)
  loop
    v_signature := to_regprocedure(v_patch.signature);
    if v_signature is null then raise exception 'Missing function: %', v_patch.signature; end if;
    v_definition := pg_get_functiondef(v_signature);
    if (length(v_definition) - length(replace(v_definition, v_patch.old_text, '')))
         / length(v_patch.old_text) =
           (case when v_patch.old_text = $target$where change ->> 'key' = 'role_is_company_first_search'$target$
                 then 2 else 1 end) then
      execute replace(v_definition, v_patch.old_text, v_patch.new_text);
    elsif position(v_patch.new_text in v_definition) = 0 then
      raise exception 'Unexpected function definition: %', v_patch.signature;
    end if;
  end loop;
end;
$migration$;

commit;
