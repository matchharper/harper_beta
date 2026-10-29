-- Schema-only snapshot before canonical brief retirement (2026-10-28).
-- Used to execute the migration against the actual predecessor, without production data.
CREATE OR REPLACE FUNCTION public.apply_company_data_changes_internal_v1(p_workspace_id uuid, p_changes jsonb, p_source text, p_event_content text, p_sync_company_db boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_workspace public.company_workspace%rowtype;
  v_change jsonb;
  v_key text;
  v_role_id uuid;
  v_expected jsonb;
  v_current jsonb;
  v_value jsonb;
  v_physical jsonb;
  v_company_db_id public.company_db.id%type;
  v_company_db_value jsonb;
  v_changed_count integer := 0;
  v_role_count integer;
  v_requested_role_count integer;
  v_employee_start integer;
  v_employee_end integer;
  v_text text;
  v_text_array text[];
  v_target_changed boolean;
  v_current_timestamp timestamptz;
  v_expected_timestamp timestamptz;
  v_value_timestamp timestamptz;
  v_current_role_source text;
  v_final_role_source text;
  v_final_role_expired boolean;
  v_now timestamptz := transaction_timestamp();
begin
  if p_sync_company_db is null then
    raise exception using errcode = '22023', message = 'company_db sync mode is required';
  end if;
  if p_source is null or p_source not in ('slack', 'website', 'chat') then
    raise exception using errcode = '22023', message = 'invalid company event source';
  end if;
  if p_event_content is null
     or char_length(p_event_content) not between 1 and 300
     or p_event_content ~ E'[\\r\\n]' then
    raise exception using errcode = '22023', message = 'invalid company event content';
  end if;
  if coalesce(jsonb_typeof(p_changes), '') <> 'array' then
    raise exception using errcode = '22023', message = 'changes must be an array';
  end if;
  if jsonb_array_length(p_changes) < 1
     or jsonb_array_length(p_changes) > (
       case when p_source = 'website' then 24 else 12 end
     ) then
    raise exception using errcode = '22023', message = 'changes exceeds the source-specific batch limit';
  end if;

  select workspace.*
  into v_workspace
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company workspace not found';
  end if;
  v_company_db_id := v_workspace.company_db_id;

  if v_company_db_id is not null then
    perform company.id
    from public.company_db company
    where company.id = v_company_db_id
    for update;
  end if;

  perform data.company_workspace_id
  from public.company_data data
  where data.company_workspace_id = p_workspace_id
  for update;

  -- Validate shape, allowlist, role scoping, and duplicate physical targets.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    if jsonb_typeof(v_change) <> 'object' then
      raise exception using errcode = '22023', message = 'each change must be an object';
    end if;
    v_key := v_change ->> 'key';
    if v_key is null or v_key not in (
      'company_name', 'workspace_published_name', 'company_description',
      'pitch', 'workspace_request',
      'logo_url', 'homepage_url', 'career_url', 'linkedin_url',
      'short_description', 'funding_url', 'location', 'founded_year',
      'employee_count_start', 'employee_count_end', 'specialities',
      'investors', 'related_links', 'total_funding_raised',
      'main_investors', 'last_funding_stage',
      'last_funding_round_description', 'workspace_memory', 'role_name',
      'role_description', 'role_description_summary',
      'role_external_jd_url', 'role_location',
      'role_status', 'role_work_mode', 'role_employment_types',
      'role_request', 'role_memory', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous',
      'role_is_expired', 'role_source_type',
      'role_source_provider', 'role_source_job_id', 'role_posted_at',
      'role_expires_at'
    ) then
      raise exception using errcode = '22023', message = 'unsupported company data key';
    end if;
    if not (v_change ? 'value') then
      raise exception using errcode = '22023', message = 'change value is required';
    end if;
    if not p_sync_company_db and v_key in (
      'short_description', 'funding_url', 'location', 'founded_year',
      'employee_count_start', 'employee_count_end', 'specialities',
      'investors', 'related_links'
    ) then
      raise exception using
        errcode = '22023',
        message = format('%s requires a target company_db row', v_key);
    end if;
    perform public.validate_company_data_change_value_v1(
      v_key,
      v_change -> 'value',
      p_source
    );
    if v_key like 'role_%' then
      if nullif(v_change ->> 'role_id', '') is null then
        raise exception using errcode = '22023', message = 'role_id is required for role keys';
      end if;
    elsif nullif(v_change ->> 'role_id', '') is not null then
      raise exception using errcode = '22023', message = 'role_id is forbidden for workspace keys';
    end if;
  end loop;

  if exists (
    select 1
    from (
      select
        change ->> 'key' as key,
        coalesce(change ->> 'role_id', '') as role_id,
        count(*) as count
      from jsonb_array_elements(p_changes) change
      group by change ->> 'key', coalesce(change ->> 'role_id', '')
      having count(*) > 1
    ) duplicates
  ) then
    raise exception using errcode = '22023', message = 'duplicate company data target';
  end if;

  select count(distinct (change ->> 'role_id')::uuid)
  into v_requested_role_count
  from jsonb_array_elements(p_changes) change
  where nullif(change ->> 'role_id', '') is not null;

  select count(*)
  into v_role_count
  from public.company_roles role
  where role.company_workspace_id = p_workspace_id
    and role.role_id in (
      select distinct (change ->> 'role_id')::uuid
      from jsonb_array_elements(p_changes) change
      where nullif(change ->> 'role_id', '') is not null
    );
  if v_role_count <> v_requested_role_count then
    raise exception using errcode = '23514', message = 'role does not belong to company workspace';
  end if;

  perform role.role_id
  from public.company_roles role
  where role.company_workspace_id = p_workspace_id
    and role.role_id in (
      select distinct (change ->> 'role_id')::uuid
      from jsonb_array_elements(p_changes) change
      where nullif(change ->> 'role_id', '') is not null
    )
  order by role.role_id
  for update;

  perform memory.id
  from public.company_memories memory
  where memory.company_workspace_id = p_workspace_id
    and (
      memory.role_id is null
      or memory.role_id in (
        select distinct (change ->> 'role_id')::uuid
        from jsonb_array_elements(p_changes) change
        where nullif(change ->> 'role_id', '') is not null
      )
    )
  order by memory.role_id nulls first, memory.id
  for update;

  -- Lock the canonical setting too: Ops can update it without locking the Role.
  perform internal_role.role_id
  from public.company_internal_roles internal_role
  where internal_role.role_id in (
    select (change ->> 'role_id')::uuid
    from jsonb_array_elements(p_changes) change
    where change ->> 'key' in ('role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous')
  )
  order by internal_role.role_id
  for update;
  if exists (
    select 1 from jsonb_array_elements(p_changes) change
    where change ->> 'key' in ('role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous')
      and not exists (
        select 1 from public.company_internal_roles internal_role
        where internal_role.role_id = (change ->> 'role_id')::uuid
      )
  ) then
    raise exception using errcode = 'P0002', message = 'internal role settings not found';
  end if;

  -- Validate all expected values before making the first physical write.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_key := v_change ->> 'key';
    v_role_id := nullif(v_change ->> 'role_id', '')::uuid;
    v_value := v_change -> 'value';
    v_current := public.company_data_change_current_value_v1(
      p_workspace_id, v_key, v_role_id
    );

    if v_key in ('role_request', 'role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous') then
      select
        lower(btrim(coalesce(role.source_type, ''))),
        lower(btrim(coalesce(
          (
            select change ->> 'value'
            from jsonb_array_elements(p_changes) change
            where change ->> 'key' = 'role_source_type'
              and nullif(change ->> 'role_id', '')::uuid = v_role_id
            limit 1
          ),
          role.source_type,
          ''
        ))),
        coalesce(
          (
            select (change ->> 'value')::boolean
            from jsonb_array_elements(p_changes) change
            where change ->> 'key' = 'role_is_expired'
              and nullif(change ->> 'role_id', '')::uuid = v_role_id
            limit 1
          ),
          role.is_expired
        )
      into v_current_role_source, v_final_role_source, v_final_role_expired
      from public.company_roles role
      where role.role_id = v_role_id
        and role.company_workspace_id = p_workspace_id;

      if v_key = 'role_request'
         and (
           v_current_role_source = 'external'
           or not exists (
             select 1 from public.company_internal_roles internal_role
             where internal_role.role_id = v_role_id
           )
         ) then
        -- For currently external roles the parent is the only request store.
        -- During external -> internal conversion it is therefore also the
        -- optimistic transition snapshot. A currently internal role always
        -- keeps the extension canonical, even when its final source is external.
        select coalesce(to_jsonb(role.request), 'null'::jsonb)
        into v_current
        from public.company_roles role
        where role.role_id = v_role_id
          and role.company_workspace_id = p_workspace_id;
      end if;
    end if;

    if v_key in (
      'company_name', 'company_description', 'logo_url', 'homepage_url',
      'linkedin_url'
    ) then
      if not (v_change ? 'expected_physical') then
        raise exception using errcode = '22023', message = 'expected_physical is required for mirrored keys';
      end if;
      execute format(
        'select to_jsonb(company.%I) from public.company_db company where company.id = $1',
        case v_key
          when 'company_name' then 'name'
          when 'company_description' then 'description'
          when 'logo_url' then 'logo'
          when 'homepage_url' then 'website_url'
          when 'linkedin_url' then 'linkedin_url'
        end
      ) into v_company_db_value using v_company_db_id;
      v_physical := jsonb_build_object(
        'workspace', v_current,
        'company_db', coalesce(v_company_db_value, 'null'::jsonb)
      );
      if v_physical is distinct from v_change -> 'expected_physical' then
        return jsonb_build_object('status', 'conflict', 'key', v_key, 'role_id', v_role_id);
      end if;
      if v_current is distinct from v_value
         or (
           p_sync_company_db
           and coalesce(v_company_db_value, 'null'::jsonb) is distinct from v_value
         ) then
        v_changed_count := v_changed_count + 1;
      end if;
    else
      if not (v_change ? 'expected') then
        raise exception using errcode = '22023', message = 'expected is required';
      end if;
      v_expected := v_change -> 'expected';
      if v_key in ('role_posted_at', 'role_expires_at') then
        -- Treat timestamps as millisecond-precision instants. PostgreSQL emits
        -- timestamptz JSON with an offset while browser forms use ISO `Z`; a
        -- text comparison would otherwise report a change for the same time.
        v_current_timestamp := case
          when jsonb_typeof(v_current) = 'null' then null
          else date_trunc('milliseconds', (v_current #>> '{}')::timestamptz)
        end;
        v_expected_timestamp := case
          when jsonb_typeof(v_expected) = 'null' then null
          else date_trunc('milliseconds', (v_expected #>> '{}')::timestamptz)
        end;
        v_value_timestamp := case
          when jsonb_typeof(v_value) = 'null' then null
          else date_trunc('milliseconds', (v_value #>> '{}')::timestamptz)
        end;
        if v_current_timestamp is distinct from v_expected_timestamp then
          return jsonb_build_object('status', 'conflict', 'key', v_key, 'role_id', v_role_id);
        end if;
        if v_current_timestamp is distinct from v_value_timestamp then
          v_changed_count := v_changed_count + 1;
        end if;
      else
        if v_current is distinct from v_expected then
          return jsonb_build_object('status', 'conflict', 'key', v_key, 'role_id', v_role_id);
        end if;
        if v_current is distinct from v_value then
          v_changed_count := v_changed_count + 1;
        end if;
      end if;
    end if;

    if v_key in ('role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous')
       or (
         v_key = 'role_request'
         and (p_source <> 'website' or v_final_role_source = 'internal')
       ) then
      if v_final_role_source is distinct from 'internal'
         or coalesce(v_final_role_expired, true) then
        raise exception using errcode = '23514', message = 'role request and memory require a final active internal role';
      end if;
    elsif v_key = 'role_request'
       and v_final_role_source is distinct from 'external' then
      raise exception using errcode = '23514', message = 'website role request requires an internal or external role';
    end if;

    if v_key = 'company_name'
       and (jsonb_typeof(v_value) <> 'string' or nullif(btrim(v_value #>> '{}'), '') is null) then
      raise exception using errcode = '22023', message = 'company_name must be nonblank text';
    elsif v_key = 'role_name'
       and (jsonb_typeof(v_value) <> 'string' or nullif(btrim(v_value #>> '{}'), '') is null) then
      raise exception using errcode = '22023', message = 'role_name must be nonblank text';
    elsif v_key in ('founded_year', 'employee_count_start', 'employee_count_end')
       and jsonb_typeof(v_value) not in ('number', 'null') then
      raise exception using errcode = '22023', message = 'integer field must be a number or null';
    elsif v_key in ('specialities', 'investors', 'related_links', 'role_employment_types')
       and jsonb_typeof(v_value) <> 'array' then
      raise exception using errcode = '22023', message = 'list field must be an array';
    elsif v_key in ('role_is_expired', 'role_is_company_first_search', 'role_is_promote', 'role_is_anonymous')
       and jsonb_typeof(v_value) <> 'boolean' then
      raise exception using errcode = '22023', message = format('%s must be boolean', v_key);
    elsif v_key not in (
      'company_name', 'role_name', 'founded_year', 'employee_count_start',
      'employee_count_end', 'specialities', 'investors', 'related_links',
      'role_employment_types', 'role_is_expired', 'role_is_company_first_search',
      'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous'
    ) and jsonb_typeof(v_value) not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'text field must be a string or null';
    end if;

    if v_key in ('specialities', 'investors', 'related_links', 'role_employment_types')
       and exists (
         select 1
         from jsonb_array_elements(v_value) item
         where jsonb_typeof(item) <> 'string'
       ) then
      raise exception using errcode = '22023', message = 'list items must be strings';
    end if;

    if v_key in ('specialities', 'investors')
       and jsonb_array_length(v_value) > 24 then
      raise exception using errcode = '22023', message = 'company list exceeds 24 items';
    elsif v_key = 'related_links' and jsonb_array_length(v_value) > 12 then
      raise exception using errcode = '22023', message = 'related_links exceeds 12 items';
    end if;

    if v_key = 'workspace_request'
       and jsonb_typeof(v_value) <> 'null'
       and char_length(v_value #>> '{}') > 6000 then
      raise exception using errcode = '22023', message = 'workspace_request exceeds 6000 characters';
    elsif v_key in ('workspace_memory', 'role_memory')
       and jsonb_typeof(v_value) <> 'null'
       and (
         char_length(v_value #>> '{}') > 12000
         or nullif(btrim(v_value #>> '{}'), '') is null
       ) then
      raise exception using errcode = '22023', message = 'memory must contain 1 to 12000 characters';
    end if;
  end loop;

  if v_changed_count = 0 then
    return jsonb_build_object('status', 'already_reflected', 'changed_count', 0);
  end if;

  -- Validate the merged employee range, not each half independently.
  select (company.employee_count_range ->> 'start')::integer,
         (company.employee_count_range ->> 'end')::integer
  into v_employee_start, v_employee_end
  from public.company_workspace workspace
  left join public.company_db company on company.id = workspace.company_db_id
  where workspace.company_workspace_id = p_workspace_id;
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    if v_change ->> 'key' = 'employee_count_start' then
      v_employee_start := case
        when jsonb_typeof(v_change -> 'value') = 'null' then null
        else (((v_change -> 'value') #>> '{}')::numeric)::integer
      end;
    elsif v_change ->> 'key' = 'employee_count_end' then
      v_employee_end := case
        when jsonb_typeof(v_change -> 'value') = 'null' then null
        else (((v_change -> 'value') #>> '{}')::numeric)::integer
      end;
    end if;
  end loop;
  if v_employee_start is not null and v_employee_end is not null
     and v_employee_start > v_employee_end then
    raise exception using errcode = '22023', message = 'employee_count_start cannot exceed employee_count_end';
  end if;

  perform set_config('harper.company_role_request_sync', 'canonical', true);

  -- Apply role source conversions first regardless of JSON array order. This
  -- guarantees an external -> internal batch has its canonical extension row
  -- before role_request or role_memory final values are written.
  for v_change in
    select value
    from jsonb_array_elements(p_changes)
    where value ->> 'key' = 'role_source_type'
    order by value ->> 'role_id'
  loop
    v_role_id := (v_change ->> 'role_id')::uuid;
    v_text := v_change ->> 'value';
    if v_text = 'internal' then
      update public.company_roles
      set source_type = v_text, updated_at = v_now
      where role_id = v_role_id and source_type is distinct from v_text;
      insert into public.company_internal_roles(role_id, request, updated_at)
      select role_id, request, v_now
      from public.company_roles
      where role_id = v_role_id
      on conflict (role_id) do nothing;
    elsif exists (
      select 1
      from public.company_roles role
      where role.role_id = v_role_id
        and role.source_type is distinct from v_text
    ) then
      if exists (
        select 1 from public.company_memories
        where company_workspace_id = p_workspace_id and role_id = v_role_id
      ) then
        raise exception using errcode = '23514', message = 'cannot make a role external while role memory exists';
      end if;
      update public.company_roles role
      set request = coalesce(
            (
              select internal_role.request
              from public.company_internal_roles internal_role
              where internal_role.role_id = role.role_id
            ),
            role.request
          ),
          source_type = v_text,
          updated_at = v_now
      where role.role_id = v_role_id;
      delete from public.company_internal_roles where role_id = v_role_id;
    end if;
  end loop;

  -- Apply exact final values. All expected checks above ran while target rows
  -- were locked, so no later branch can observe a different snapshot.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_key := v_change ->> 'key';
    v_role_id := nullif(v_change ->> 'role_id', '')::uuid;
    v_value := v_change -> 'value';
    v_text := case when jsonb_typeof(v_value) = 'null' then null else v_value #>> '{}' end;
    continue when v_key = 'role_source_type';

    v_current := public.company_data_change_current_value_v1(
      p_workspace_id, v_key, v_role_id
    );
    if v_key in (
      'company_name', 'company_description', 'logo_url', 'homepage_url',
      'linkedin_url'
    ) then
      execute format(
        'select to_jsonb(company.%I) from public.company_db company where company.id = $1',
        case v_key
          when 'company_name' then 'name'
          when 'company_description' then 'description'
          when 'logo_url' then 'logo'
          when 'homepage_url' then 'website_url'
          when 'linkedin_url' then 'linkedin_url'
        end
      ) into v_company_db_value using v_company_db_id;
      v_target_changed := v_current is distinct from v_value
        or (
          p_sync_company_db
          and coalesce(v_company_db_value, 'null'::jsonb) is distinct from v_value
        );
    else
      v_target_changed := v_current is distinct from v_value;
    end if;
    continue when not v_target_changed;

    if v_key = 'company_name' then
      update public.company_workspace set company_name = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and company_name is distinct from v_text;
    elsif v_key = 'workspace_published_name' then
      update public.company_workspace set published_name = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and published_name is distinct from v_text;
    elsif v_key = 'company_description' then
      update public.company_workspace set company_description = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and company_description is distinct from v_text;
    elsif v_key = 'pitch' then
      update public.company_workspace set pitch = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and pitch is distinct from v_text;
    elsif v_key = 'workspace_request' then
      update public.company_workspace set request = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and request is distinct from v_text;
    elsif v_key = 'logo_url' then
      update public.company_workspace set logo_url = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and logo_url is distinct from v_text;
    elsif v_key = 'homepage_url' then
      update public.company_workspace set homepage_url = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and homepage_url is distinct from v_text;
    elsif v_key = 'career_url' then
      update public.company_workspace set career_url = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and career_url is distinct from v_text;
    elsif v_key = 'linkedin_url' then
      update public.company_workspace set linkedin_url = v_text, updated_at = v_now
      where company_workspace_id = p_workspace_id and linkedin_url is distinct from v_text;
    elsif v_key = 'workspace_memory' then
      if v_text is null or nullif(btrim(v_text), '') is null then
        delete from public.company_memories
        where company_workspace_id = p_workspace_id and role_id is null;
      else
        insert into public.company_memories(company_workspace_id, role_id, content, updated_at)
        values (p_workspace_id, null, v_text, v_now)
        on conflict (company_workspace_id) where role_id is null do update
          set content = excluded.content, updated_at = v_now
          where company_memories.content is distinct from excluded.content;
      end if;
      update public.company_workspace set updated_at = v_now
      where company_workspace_id = p_workspace_id;
    elsif v_key like 'role_%' then
      if v_key = 'role_name' then
        update public.company_roles set name = v_text, updated_at = v_now
        where role_id = v_role_id and name is distinct from v_text;
      elsif v_key = 'role_description' then
        update public.company_roles set description = v_text, updated_at = v_now
        where role_id = v_role_id and description is distinct from v_text;
      elsif v_key = 'role_description_summary' then
        update public.company_roles set description_summary = v_text, updated_at = v_now
        where role_id = v_role_id and description_summary is distinct from v_text;
      elsif v_key = 'role_external_jd_url' then
        update public.company_roles set external_jd_url = v_text, updated_at = v_now
        where role_id = v_role_id and external_jd_url is distinct from v_text;
      elsif v_key = 'role_location' then
        update public.company_roles set location_text = v_text, updated_at = v_now
        where role_id = v_role_id and location_text is distinct from v_text;
      elsif v_key = 'role_status' then
        update public.company_roles set status = v_text, updated_at = v_now
        where role_id = v_role_id and status is distinct from v_text;
      elsif v_key = 'role_work_mode' then
        update public.company_roles set work_mode = v_text, updated_at = v_now
        where role_id = v_role_id and work_mode is distinct from v_text;
      elsif v_key = 'role_employment_types' then
        select coalesce(array_agg(item order by ordinal), '{}'::text[])
        into v_text_array
        from jsonb_array_elements_text(v_value) with ordinality values_(item, ordinal);
        update public.company_roles set type = v_text_array, updated_at = v_now
        where role_id = v_role_id and type is distinct from v_text_array;
      elsif v_key = 'role_request' then
        select lower(btrim(coalesce(source_type, '')))
        into v_final_role_source
        from public.company_roles
        where role_id = v_role_id;
        if v_final_role_source = 'internal' then
          update public.company_internal_roles
          set request = v_text, updated_at = v_now
          where role_id = v_role_id and request is distinct from v_text;
        end if;
        update public.company_roles
        set request = v_text, updated_at = v_now
        where role_id = v_role_id and request is distinct from v_text;
      elsif v_key = 'role_memory' then
        if v_text is null or nullif(btrim(v_text), '') is null then
          delete from public.company_memories
          where company_workspace_id = p_workspace_id and role_id = v_role_id;
        else
          insert into public.company_memories(company_workspace_id, role_id, content, updated_at)
          values (p_workspace_id, v_role_id, v_text, v_now)
          on conflict (company_workspace_id, role_id) where role_id is not null do update
            set content = excluded.content, updated_at = v_now
            where company_memories.content is distinct from excluded.content;
        end if;
        update public.company_roles set updated_at = v_now where role_id = v_role_id;
      elsif v_key = 'role_intro_search_date' then
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
      elsif v_key = 'role_intro_search_date' then
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
      elsif v_key = 'role_intro_search_date' then
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
      elsif v_key = 'role_is_anonymous' then
        update public.company_internal_roles
        set is_anonymous = (v_value #>> '{}')::boolean,
            updated_at = v_now
        where role_id = v_role_id
          and is_anonymous is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_is_promote' then
        update public.company_internal_roles
        set is_promote = (v_value #>> '{}')::boolean,
            updated_at = v_now
        where role_id = v_role_id
          and is_promote is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_is_company_first_search' then
        update public.company_internal_roles
        set is_company_first_search = (v_value #>> '{}')::boolean,
            updated_at = v_now
        where role_id = v_role_id
          and is_company_first_search is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_is_expired' then
        update public.company_roles
        set is_expired = (v_value #>> '{}')::boolean, updated_at = v_now
        where role_id = v_role_id
          and is_expired is distinct from (v_value #>> '{}')::boolean;
      elsif v_key = 'role_source_provider' then
        update public.company_roles set source_provider = v_text, updated_at = v_now
        where role_id = v_role_id and source_provider is distinct from v_text;
      elsif v_key = 'role_source_job_id' then
        update public.company_roles set source_job_id = v_text, updated_at = v_now
        where role_id = v_role_id and source_job_id is distinct from v_text;
      elsif v_key = 'role_posted_at' then
        update public.company_roles
        set posted_at = date_trunc('milliseconds', v_text::timestamptz), updated_at = v_now
        where role_id = v_role_id
          and date_trunc('milliseconds', posted_at)
            is distinct from date_trunc('milliseconds', v_text::timestamptz);
      elsif v_key = 'role_expires_at' then
        update public.company_roles
        set expires_at = date_trunc('milliseconds', v_text::timestamptz), updated_at = v_now
        where role_id = v_role_id
          and date_trunc('milliseconds', expires_at)
            is distinct from date_trunc('milliseconds', v_text::timestamptz);
      end if;
    else
      -- Remaining workspace keys live in company_db or company_data. Lazily
      -- create only when the logical value actually changes.
      if v_key in (
        'company_name', 'company_description', 'logo_url', 'homepage_url',
        'linkedin_url', 'short_description', 'funding_url', 'location',
        'founded_year', 'employee_count_start', 'employee_count_end',
        'specialities', 'investors', 'related_links'
      ) then
        if v_company_db_id is null then
          insert into public.company_db default values returning id into v_company_db_id;
          update public.company_workspace
          set company_db_id = v_company_db_id, updated_at = v_now
          where company_workspace_id = p_workspace_id;
        end if;
        if v_key = 'short_description' then
          update public.company_db set short_description = v_text, last_updated_at = v_now where id = v_company_db_id;
        elsif v_key = 'funding_url' then
          update public.company_db set funding_url = v_text, last_updated_at = v_now where id = v_company_db_id;
        elsif v_key = 'location' then
          update public.company_db set location = v_text, last_updated_at = v_now where id = v_company_db_id;
        elsif v_key = 'founded_year' then
          update public.company_db set founded_year = (v_text::numeric)::integer, last_updated_at = v_now where id = v_company_db_id;
        elsif v_key in ('employee_count_start', 'employee_count_end') then
          update public.company_db
          set employee_count_range = jsonb_strip_nulls(jsonb_build_object(
                'start', v_employee_start, 'end', v_employee_end
              )),
              last_updated_at = v_now
          where id = v_company_db_id;
        elsif v_key in ('specialities', 'investors') then
          select coalesce(array_agg(item order by ordinal), '{}'::text[])
          into v_text_array
          from jsonb_array_elements_text(v_value) with ordinality values_(item, ordinal);
          if v_key = 'specialities' then
            update public.company_db set specialities = array_to_string(v_text_array, ', '), last_updated_at = v_now where id = v_company_db_id;
          else
            update public.company_db set investors = nullif(array_to_string(v_text_array, ', '), ''), last_updated_at = v_now where id = v_company_db_id;
          end if;
        elsif v_key = 'related_links' then
          select coalesce(array_agg(item order by ordinal), '{}'::text[])
          into v_text_array
          from jsonb_array_elements_text(v_value) with ordinality values_(item, ordinal);
          update public.company_db set related_links = v_text_array, last_updated_at = v_now where id = v_company_db_id;
        end if;
        update public.company_workspace set updated_at = v_now
        where company_workspace_id = p_workspace_id;
      else
        insert into public.company_data(company_workspace_id)
        values (p_workspace_id)
        on conflict (company_workspace_id) do nothing;
        if v_key = 'total_funding_raised' then
          update public.company_data set total_funding_raised = v_text, updated_at = v_now where company_workspace_id = p_workspace_id;
        elsif v_key = 'main_investors' then
          update public.company_data set main_investors = v_text, updated_at = v_now where company_workspace_id = p_workspace_id;
        elsif v_key = 'last_funding_stage' then
          update public.company_data set last_funding_stage = v_text, updated_at = v_now where company_workspace_id = p_workspace_id;
        elsif v_key = 'last_funding_round_description' then
          update public.company_data set last_funding_round_description = v_text, updated_at = v_now where company_workspace_id = p_workspace_id;
        end if;
        update public.company_workspace set updated_at = v_now
        where company_workspace_id = p_workspace_id;
      end if;
    end if;

    -- Mirrored company_db fields are written after their canonical workspace field.
    if p_sync_company_db
       and v_key in ('company_name', 'company_description', 'logo_url', 'homepage_url', 'linkedin_url') then
      if v_company_db_id is null then
        insert into public.company_db default values returning id into v_company_db_id;
        update public.company_workspace
        set company_db_id = v_company_db_id, updated_at = v_now
        where company_workspace_id = p_workspace_id;
      end if;
      if v_key = 'company_name' then
        update public.company_db set name = v_text, last_updated_at = v_now where id = v_company_db_id;
      elsif v_key = 'company_description' then
        update public.company_db set description = v_text, last_updated_at = v_now where id = v_company_db_id;
      elsif v_key = 'logo_url' then
        update public.company_db set logo = v_text, last_updated_at = v_now where id = v_company_db_id;
      elsif v_key = 'homepage_url' then
        update public.company_db set website_url = v_text, last_updated_at = v_now where id = v_company_db_id;
      elsif v_key = 'linkedin_url' then
        update public.company_db set linkedin_url = v_text, last_updated_at = v_now where id = v_company_db_id;
      end if;
    end if;
  end loop;

  insert into public.company_events(workspace_id, content, source, created_at)
  values (p_workspace_id, p_event_content, p_source, v_now);

  return jsonb_build_object('status', 'updated', 'changed_count', v_changed_count);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_legacy_company_role_request_to_internal_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if current_setting('harper.company_role_request_sync', true) = 'canonical' then
    return new;
  end if;

  if lower(btrim(coalesce(new.source_type, ''))) = 'internal'
     and (
       tg_op = 'INSERT'
       or new.request is distinct from old.request
       or new.source_type is distinct from old.source_type
     ) then
    insert into public.company_internal_roles (role_id, request, updated_at)
    values (
      new.role_id,
      case when nullif(btrim(new.request), '') is null then null else new.request end,
      transaction_timestamp()
    )
    on conflict (role_id) do update
      set request = excluded.request,
          updated_at = transaction_timestamp()
      where company_internal_roles.request is distinct from excluded.request;
  elsif lower(btrim(coalesce(new.source_type, ''))) <> 'internal' then
    -- The parent request is the durable legacy/external value. Removing the
    -- internal-only extension on source transition prevents stale canonical
    -- data from surviving an old writer's internal -> external update.
    delete from public.company_internal_roles
    where role_id = new.role_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_internal_company_role_legacy_request_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.request is not distinct from old.request then
    return new;
  end if;

  if lower(btrim(coalesce(new.source_type, ''))) <> 'internal'
     and lower(btrim(coalesce(old.source_type, ''))) <> 'internal'
     and not exists (
       select 1 from public.company_internal_roles internal_role
       where internal_role.role_id = new.role_id
     ) then
    return new;
  end if;

  if current_setting('harper.company_role_request_sync', true) = 'canonical' then
    return new;
  end if;

  if lower(coalesce(
       current_setting('harper.company_role_request_guard_enabled', true),
       'off'
     )) in ('on', 'true', '1') then
    raise exception using
      errcode = '55000',
      message = 'direct writes to company_roles.request are disabled for internal roles',
      hint = 'Write company_internal_roles.request through apply_company_data_changes_v1; the legacy value is mirrored in the same transaction.';
  end if;

  return new;
end;
$function$
;
