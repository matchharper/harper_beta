begin;

-- Defense-in-depth for the SECURITY DEFINER mutation boundary. Application
-- callers normalize values first, but direct service-role/website RPC calls
-- must not be able to bypass the same flat catalog contract.
create or replace function public.validate_company_data_change_value_v1(
  p_key text,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_type text := jsonb_typeof(p_value);
  v_text text;
  v_max_length integer;
  v_max_items integer;
  v_numeric numeric;
begin
  if p_key in (
    'workspace_published_name', 'role_description_summary',
    'role_source_provider', 'role_source_job_id', 'role_posted_at',
    'role_expires_at', 'role_is_expired', 'role_source_type'
  ) and p_source <> 'website' then
    raise exception using
      errcode = '22023',
      message = format('%s is only available to website mutations', p_key);
  end if;

  if p_key in ('founded_year', 'employee_count_start', 'employee_count_end') then
    if v_type = 'null' then
      return;
    end if;
    if v_type <> 'number' then
      raise exception using errcode = '22023', message = 'integer field must be a number or null';
    end if;
    begin
      v_numeric := (p_value #>> '{}')::numeric;
    exception when others then
      raise exception using errcode = '22023', message = 'integer field is invalid';
    end;
    if v_numeric < 0
       or trunc(v_numeric) <> v_numeric
       or v_numeric > 2147483647 then
      raise exception using errcode = '22023', message = 'integer field must be a non-negative 32-bit integer';
    end if;
    return;
  end if;

  if p_key = 'role_is_expired' then
    if v_type <> 'boolean' then
      raise exception using errcode = '22023', message = 'role_is_expired must be boolean';
    end if;
    return;
  end if;

  if p_key in ('specialities', 'investors', 'related_links', 'role_employment_types') then
    if v_type <> 'array' then
      raise exception using errcode = '22023', message = 'list field must be an array';
    end if;
    v_max_items := case p_key
      when 'related_links' then 12
      when 'role_employment_types' then 4
      else 24
    end;
    if jsonb_array_length(p_value) > v_max_items then
      raise exception using
        errcode = '22023',
        message = format('%s exceeds %s items', p_key, v_max_items);
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_value) item
      where jsonb_typeof(item) <> 'string'
        or nullif(btrim(item #>> '{}'), '') is null
        or (item #>> '{}') ~ E'[\\r\\n\\t]'
    ) then
      raise exception using errcode = '22023', message = 'list items must be nonblank single-line strings';
    end if;
    if (
      select count(*) <> count(distinct (item #>> '{}'))
      from jsonb_array_elements(p_value) item
    ) then
      raise exception using errcode = '22023', message = 'list items must be unique';
    end if;
    if p_key = 'role_employment_types' and exists (
      select 1
      from jsonb_array_elements_text(p_value) item
      where item not in ('full_time', 'part_time', 'internship', 'contract')
    ) then
      raise exception using errcode = '22023', message = 'invalid role employment type';
    end if;
    if p_key = 'related_links' and exists (
      select 1
      from jsonb_array_elements_text(p_value) item
      where char_length(item) > 2000
        or item !~* '^https?://[^[:space:]]+$'
    ) then
      raise exception using errcode = '22023', message = 'related_links must contain valid http(s) URLs';
    end if;
    return;
  end if;

  if p_key = 'role_status' then
    if v_type <> 'string'
       or (p_value #>> '{}') not in ('top_priority', 'active', 'paused', 'ended') then
      raise exception using errcode = '22023', message = 'invalid role status';
    end if;
    return;
  end if;

  if p_key = 'role_work_mode' then
    if v_type = 'null' then
      return;
    end if;
    if v_type <> 'string'
       or (p_value #>> '{}') not in ('onsite', 'hybrid', 'remote') then
      raise exception using errcode = '22023', message = 'invalid role work mode';
    end if;
    return;
  end if;

  if p_key = 'role_source_type' then
    if v_type <> 'string'
       or (p_value #>> '{}') not in ('internal', 'external') then
      raise exception using errcode = '22023', message = 'invalid role source type';
    end if;
    return;
  end if;

  if p_key in ('role_posted_at', 'role_expires_at') then
    if v_type = 'null' then
      return;
    end if;
    if v_type <> 'string'
       or nullif(btrim(p_value #>> '{}'), '') is null
       or char_length(p_value #>> '{}') > 100 then
      raise exception using errcode = '22023', message = 'role timestamp must be an ISO timestamp or null';
    end if;
    begin
      perform (p_value #>> '{}')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'role timestamp must be an ISO timestamp or null';
    end;
    return;
  end if;

  if v_type = 'null' then
    if p_key in ('company_name', 'role_name') then
      raise exception using errcode = '22023', message = format('%s cannot be null', p_key);
    end if;
    return;
  end if;
  if v_type <> 'string' then
    raise exception using errcode = '22023', message = 'text field must be a string or null';
  end if;

  v_text := p_value #>> '{}';
  if nullif(btrim(v_text), '') is null then
    raise exception using errcode = '22023', message = 'empty text must be represented as null';
  end if;
  v_max_length := case p_key
    when 'company_name' then 200
    when 'company_description' then 8000
    when 'pitch' then 8000
    when 'workspace_request' then 6000
    when 'logo_url' then 2000
    when 'homepage_url' then 2000
    when 'career_url' then 2000
    when 'linkedin_url' then 2000
    when 'short_description' then 4000
    when 'funding_url' then 2000
    when 'location' then 500
    when 'total_funding_raised' then 1000
    when 'main_investors' then 2000
    when 'last_funding_stage' then 300
    when 'last_funding_round_description' then 8000
    when 'workspace_memory' then 12000
    when 'workspace_published_name' then 200
    when 'role_name' then 200
    when 'role_description' then 20000
    when 'role_external_jd_url' then 2000
    when 'role_location' then 300
    when 'role_request' then 20000
    when 'role_memory' then 12000
    when 'role_description_summary' then 20000
    when 'role_source_provider' then 200
    when 'role_source_job_id' then 500
    else null
  end;
  if v_max_length is null or char_length(v_text) > v_max_length then
    raise exception using
      errcode = '22023',
      message = format('%s exceeds its maximum length', p_key);
  end if;
  if p_key in (
    'logo_url', 'homepage_url', 'career_url', 'linkedin_url',
    'funding_url', 'role_external_jd_url'
  ) and v_text !~* '^https?://[^[:space:]]+$' then
    raise exception using errcode = '22023', message = format('%s must be a valid http(s) URL', p_key);
  end if;
end;
$$;

-- Return the normalized logical value used by optimistic expected-value checks.
-- The function deliberately contains an allowlist instead of dynamic SQL.
create or replace function public.company_data_change_current_value_v1(
  p_workspace_id uuid,
  p_key text,
  p_role_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_value jsonb;
begin
  case p_key
    when 'company_name' then
      select to_jsonb(workspace.company_name) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'workspace_published_name' then
      select to_jsonb(workspace.published_name) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'company_description' then
      select to_jsonb(workspace.company_description) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'pitch' then
      select to_jsonb(workspace.pitch) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'workspace_request' then
      select to_jsonb(workspace.request) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'logo_url' then
      select to_jsonb(workspace.logo_url) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'homepage_url' then
      select to_jsonb(workspace.homepage_url) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'career_url' then
      select to_jsonb(workspace.career_url) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'linkedin_url' then
      select to_jsonb(workspace.linkedin_url) into v_value
      from public.company_workspace workspace
      where workspace.company_workspace_id = p_workspace_id;
    when 'short_description' then
      select to_jsonb(company.short_description) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'funding_url' then
      select to_jsonb(company.funding_url) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'location' then
      select to_jsonb(company.location) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'founded_year' then
      select to_jsonb(company.founded_year) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'employee_count_start' then
      select to_jsonb((company.employee_count_range ->> 'start')::integer)
      into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'employee_count_end' then
      select to_jsonb((company.employee_count_range ->> 'end')::integer)
      into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'specialities' then
      select coalesce((
        select jsonb_agg(
          regexp_replace(btrim(part), E'\\s+', ' ', 'g') order by ordinal
        )
        from regexp_split_to_table(
          coalesce(company.specialities, ''), E'[\\n,]+'
        ) with ordinality parts(part, ordinal)
        where nullif(btrim(part), '') is not null
      ), '[]'::jsonb) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'investors' then
      select coalesce((
        select jsonb_agg(
          regexp_replace(btrim(part), E'\\s+', ' ', 'g') order by ordinal
        )
        from regexp_split_to_table(
          coalesce(company.investors, ''), E'[\\n,]+'
        ) with ordinality parts(part, ordinal)
        where nullif(btrim(part), '') is not null
      ), '[]'::jsonb) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'related_links' then
      select coalesce(to_jsonb(company.related_links), '[]'::jsonb) into v_value
      from public.company_workspace workspace
      left join public.company_db company on company.id = workspace.company_db_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'total_funding_raised' then
      select to_jsonb(data.total_funding_raised) into v_value
      from public.company_workspace workspace
      left join public.company_data data
        on data.company_workspace_id = workspace.company_workspace_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'main_investors' then
      select to_jsonb(data.main_investors) into v_value
      from public.company_workspace workspace
      left join public.company_data data
        on data.company_workspace_id = workspace.company_workspace_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'last_funding_stage' then
      select to_jsonb(data.last_funding_stage) into v_value
      from public.company_workspace workspace
      left join public.company_data data
        on data.company_workspace_id = workspace.company_workspace_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'last_funding_round_description' then
      select to_jsonb(data.last_funding_round_description) into v_value
      from public.company_workspace workspace
      left join public.company_data data
        on data.company_workspace_id = workspace.company_workspace_id
      where workspace.company_workspace_id = p_workspace_id;
    when 'workspace_memory' then
      select to_jsonb(memory.content) into v_value
      from public.company_memories memory
      where memory.company_workspace_id = p_workspace_id
        and memory.role_id is null;
    when 'role_name' then
      select to_jsonb(role.name) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_description' then
      select to_jsonb(role.description) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_description_summary' then
      select to_jsonb(role.description_summary) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_external_jd_url' then
      select to_jsonb(role.external_jd_url) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_location' then
      select to_jsonb(role.location_text) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_status' then
      select to_jsonb(role.status) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_work_mode' then
      select to_jsonb(role.work_mode) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_employment_types' then
      select coalesce(to_jsonb(role.type), '[]'::jsonb) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_request' then
      select to_jsonb(internal_role.request) into v_value
      from public.company_roles role
      left join public.company_internal_roles internal_role
        on internal_role.role_id = role.role_id
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_memory' then
      select to_jsonb(memory.content) into v_value
      from public.company_memories memory
      where memory.company_workspace_id = p_workspace_id
        and memory.role_id = p_role_id;
    when 'role_is_expired' then
      select to_jsonb(role.is_expired) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_source_type' then
      select to_jsonb(role.source_type) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_source_provider' then
      select to_jsonb(role.source_provider) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_source_job_id' then
      select to_jsonb(role.source_job_id) into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_posted_at' then
      select case
        when role.posted_at is null then 'null'::jsonb
        else to_jsonb(to_char(
          date_trunc('milliseconds', role.posted_at) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ))
      end into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    when 'role_expires_at' then
      select case
        when role.expires_at is null then 'null'::jsonb
        else to_jsonb(to_char(
          date_trunc('milliseconds', role.expires_at) at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ))
      end into v_value
      from public.company_roles role
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id;
    else
      raise exception using
        errcode = '22023',
        message = format('unsupported company data key: %s', p_key);
  end case;

  return coalesce(v_value, 'null'::jsonb);
end;
$$;

-- Private transactional executor shared by direct apply and proposal resolve.
create or replace function public.apply_company_data_changes_internal_v1(
  p_workspace_id uuid,
  p_changes jsonb,
  p_source text,
  p_event_content text,
  p_sync_company_db boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
      'role_request', 'role_memory', 'role_is_expired', 'role_source_type',
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

  -- Validate all expected values before making the first physical write.
  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_key := v_change ->> 'key';
    v_role_id := nullif(v_change ->> 'role_id', '')::uuid;
    v_value := v_change -> 'value';
    v_current := public.company_data_change_current_value_v1(
      p_workspace_id, v_key, v_role_id
    );

    if v_key in ('role_request', 'role_memory') then
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

    if v_key = 'role_memory'
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
    elsif v_key = 'role_is_expired' and jsonb_typeof(v_value) <> 'boolean' then
      raise exception using errcode = '22023', message = 'role_is_expired must be boolean';
    elsif v_key not in (
      'company_name', 'role_name', 'founded_year', 'employee_count_start',
      'employee_count_end', 'specialities', 'investors', 'related_links',
      'role_employment_types', 'role_is_expired'
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
    elsif v_key = 'role_request'
       and jsonb_typeof(v_value) <> 'null'
       and char_length(v_value #>> '{}') > 20000 then
      raise exception using errcode = '22023', message = 'role_request exceeds 20000 characters';
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
$$;

create or replace function public.apply_company_data_changes_v1(
  p_workspace_id uuid,
  p_changes jsonb,
  p_source text,
  p_event_content text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.apply_company_data_changes_internal_v1(
    p_workspace_id, p_changes, p_source, p_event_content, true
  );
$$;

create or replace function public.present_company_agent_update_proposal_v1(
  p_workspace_id uuid,
  p_scope_key text,
  p_source text,
  p_user_message_id bigint,
  p_summary text,
  p_preview text,
  p_payload jsonb,
  p_presentation_text text,
  p_slack_thread_id uuid default null,
  p_message_metadata jsonb default '{}'::jsonb,
  p_model text default null,
  p_thinking_logs jsonb default '[]'::jsonb,
  p_message_type text default 'chat'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_message public.company_messages%rowtype;
  v_proposal_id uuid := gen_random_uuid();
  v_presented_message_id bigint;
  v_now timestamptz := transaction_timestamp();
  v_slack_workspace_id uuid;
begin
  if p_source is null or p_source not in ('chat', 'slack') then
    raise exception using errcode = '22023', message = 'proposal source must be chat or slack';
  end if;
  if p_message_type is distinct from p_source then
    raise exception using errcode = '22023', message = 'proposal message_type must match its chat or Slack source';
  end if;
  if jsonb_typeof(p_message_metadata) <> 'object'
     or jsonb_typeof(p_thinking_logs) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid proposal message metadata';
  end if;
  if nullif(btrim(p_scope_key), '') is null or char_length(p_scope_key) > 500 then
    raise exception using errcode = '22023', message = 'invalid proposal scope';
  end if;
  if nullif(btrim(p_summary), '') is null
     or char_length(p_summary) > 160
     or p_summary ~ E'[\\r\\n]' then
    raise exception using errcode = '22023', message = 'invalid proposal summary';
  end if;
  if p_preview is null or char_length(p_preview) > 3000 then
    raise exception using errcode = '22023', message = 'invalid proposal preview';
  end if;
  if p_presentation_text is null
     or char_length(p_presentation_text) not between 1 and 6000 then
    raise exception using errcode = '22023', message = 'invalid proposal presentation text';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'changes') <> 'array'
     or jsonb_array_length(p_payload -> 'changes') not between 1 and 12
     or nullif(p_payload ->> 'event_content', '') is null
     or char_length(p_payload ->> 'event_content') > 300
     or (p_payload ->> 'event_content') ~ E'[\\r\\n]' then
    raise exception using errcode = '22023', message = 'proposal payload must include changes and event_content';
  end if;

  perform 1 from public.company_workspace
  where company_workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company workspace not found';
  end if;

  select message.* into v_user_message
  from public.company_messages message
  where message.id = p_user_message_id
    and message.company_workspace_id = p_workspace_id
    and message.role = 'user';
  if not found then
    raise exception using errcode = '23514', message = 'proposal user message is invalid';
  end if;

  if p_source = 'chat' then
    if p_slack_thread_id is not null or v_user_message.message_type <> 'chat' then
      raise exception using errcode = '23514', message = 'chat proposal scope does not match its user message';
    end if;
  else
    select channel.company_workspace_id
    into v_slack_workspace_id
    from public.company_slack_threads thread
    join public.company_slack_channels channel on channel.id = thread.channel_id
    where thread.id = p_slack_thread_id;
    if v_slack_workspace_id is distinct from p_workspace_id
       or v_user_message.message_type <> 'slack'
       or v_user_message.slack_thread_id is distinct from p_slack_thread_id then
      raise exception using errcode = '23514', message = 'Slack proposal scope does not match its user message';
    end if;
  end if;

  delete from public.company_agent_update_proposals proposal
  where proposal.workspace_id = p_workspace_id
    and proposal.status in ('applied', 'rejected', 'superseded', 'expired', 'stale')
    and proposal.updated_at < v_now - interval '30 days';

  if p_source = 'chat' then
    update public.company_agent_update_proposals proposal
    set status = 'superseded', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where proposal.workspace_id = p_workspace_id
      and proposal.scope_key = p_scope_key
      and proposal.status in ('draft', 'pending');

    insert into public.company_messages(
      conversation_id, company_workspace_id, role_id, company_user_id, role,
      content, message_type, model, status, mentions, thinking_logs, metadata,
      created_at
    ) values (
      v_user_message.conversation_id, p_workspace_id, null, null, 'assistant',
      p_presentation_text, p_message_type, p_model, 'completed', '[]'::jsonb,
      p_thinking_logs,
      p_message_metadata || jsonb_build_object(
        'source', 'company_side_llm',
        'updateProposalRef', jsonb_build_object(
          'proposalId', v_proposal_id,
          'summary', p_summary
        )
      ),
      v_now
    ) returning id into v_presented_message_id;

    insert into public.company_agent_update_proposals(
      id, workspace_id, scope_key, status, source, slack_thread_id, summary,
      preview, presentation_text, payload, message_metadata, message_model,
      message_thinking_logs, message_type, created_by_user_message_id,
      presented_message_id, expires_at, created_at, updated_at
    ) values (
      v_proposal_id, p_workspace_id, p_scope_key, 'pending', 'chat', null,
      p_summary, p_preview, p_presentation_text,
      p_payload || jsonb_build_object('source', p_source), p_message_metadata,
      p_model, p_thinking_logs, p_message_type, p_user_message_id,
      v_presented_message_id, v_now + interval '24 hours', v_now, v_now
    );

    update public.company_conversations
    set last_message_id = v_presented_message_id,
        last_message_at = v_now,
        updated_at = v_now
    where id = v_user_message.conversation_id;
  else
    -- Keep the delivered pending proposal until the new Slack draft has
    -- actually been posted and activated.
    update public.company_agent_update_proposals proposal
    set status = 'superseded', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where proposal.workspace_id = p_workspace_id
      and proposal.scope_key = p_scope_key
      and proposal.status = 'draft';

    insert into public.company_agent_update_proposals(
      id, workspace_id, scope_key, status, source, slack_thread_id, summary,
      preview, presentation_text, payload, message_metadata, message_model,
      message_thinking_logs, message_type, created_by_user_message_id,
      presented_message_id, expires_at, created_at, updated_at
    ) values (
      v_proposal_id, p_workspace_id, p_scope_key, 'draft', 'slack',
      p_slack_thread_id, p_summary, p_preview, p_presentation_text,
      p_payload || jsonb_build_object('source', p_source), p_message_metadata,
      p_model, p_thinking_logs, p_message_type, p_user_message_id,
      null, v_now + interval '24 hours', v_now, v_now
    );
  end if;

  return jsonb_build_object(
    'status', case when p_source = 'chat' then 'pending' else 'draft' end,
    'proposal_id', v_proposal_id,
    'presented_message_id', v_presented_message_id,
    'presentation_text', p_presentation_text
  );
end;
$$;

create or replace function public.activate_slack_company_agent_update_proposal_v1(
  p_proposal_id uuid,
  p_slack_message_ts text,
  p_slack_bot_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_proposal public.company_agent_update_proposals%rowtype;
  v_user_message public.company_messages%rowtype;
  v_message_id bigint;
  v_message_created_at timestamptz;
  v_now timestamptz := transaction_timestamp();
begin
  if nullif(btrim(p_slack_message_ts), '') is null
     or nullif(btrim(p_slack_bot_user_id), '') is null then
    raise exception using errcode = '22023', message = 'Slack delivery identifiers are required';
  end if;

  select proposal.workspace_id into v_workspace_id
  from public.company_agent_update_proposals proposal
  where proposal.id = p_proposal_id;
  if not found then
    return jsonb_build_object('status', 'not_found', 'proposal_id', p_proposal_id);
  end if;

  perform 1 from public.company_workspace
  where company_workspace_id = v_workspace_id
  for update;

  select proposal.* into v_proposal
  from public.company_agent_update_proposals proposal
  where proposal.id = p_proposal_id
  for update;

  if v_proposal.status = 'pending' then
    select message.id into v_message_id
    from public.company_messages message
    where message.id = v_proposal.presented_message_id
      and message.slack_message_ts = p_slack_message_ts
      and message.slack_user_id = p_slack_bot_user_id;
    if found then
      return jsonb_build_object(
        'status', 'pending', 'proposal_id', p_proposal_id,
        'presented_message_id', v_message_id
      );
    end if;
    return jsonb_build_object('status', 'slack_delivery_conflict', 'proposal_id', p_proposal_id);
  end if;
  if v_proposal.status <> 'draft' or v_proposal.source <> 'slack' then
    return jsonb_build_object('status', v_proposal.status, 'proposal_id', p_proposal_id);
  end if;
  if v_proposal.expires_at <= v_now then
    update public.company_agent_update_proposals
    set status = 'expired', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where id = p_proposal_id;
    return jsonb_build_object(
      'status', 'expired', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary
    );
  end if;

  select message.* into v_user_message
  from public.company_messages message
  where message.id = v_proposal.created_by_user_message_id
    and message.company_workspace_id = v_workspace_id
    and message.role = 'user'
    and message.message_type = 'slack'
    and message.slack_thread_id = v_proposal.slack_thread_id;
  if not found then
    raise exception using errcode = '23514', message = 'Slack proposal user message is unavailable';
  end if;

  insert into public.company_messages(
    conversation_id, company_workspace_id, role_id, company_user_id, role,
    content, message_type, model, status, mentions, thinking_logs, metadata,
    created_at, slack_thread_id, slack_message_ts, slack_user_id
  ) values (
    v_user_message.conversation_id, v_workspace_id, null, null, 'assistant',
    v_proposal.presentation_text, v_proposal.message_type,
    v_proposal.message_model, 'completed', '[]'::jsonb,
    v_proposal.message_thinking_logs,
    v_proposal.message_metadata || jsonb_build_object(
      'source', 'company_side_llm',
      'updateProposalRef', jsonb_build_object(
        'proposalId', p_proposal_id,
        'summary', v_proposal.summary
      )
    ),
    v_now, v_proposal.slack_thread_id, p_slack_message_ts,
    p_slack_bot_user_id
  )
  on conflict (slack_thread_id, slack_message_ts)
    where message_type = 'slack'
      and slack_thread_id is not null
      and nullif(slack_message_ts, '') is not null
  do update set
    metadata = public.company_messages.metadata
      || v_proposal.message_metadata
      || jsonb_build_object(
        'source', 'company_side_llm',
        'updateProposalRef', jsonb_build_object(
          'proposalId', p_proposal_id,
          'summary', v_proposal.summary
        )
      ),
    model = v_proposal.message_model,
    thinking_logs = v_proposal.message_thinking_logs
  where public.company_messages.company_workspace_id = v_workspace_id
    and public.company_messages.slack_thread_id = v_proposal.slack_thread_id
    and public.company_messages.role = 'assistant'
    and public.company_messages.slack_user_id = p_slack_bot_user_id
    and public.company_messages.content = v_proposal.presentation_text
    and public.company_messages.metadata ->> 'source' = 'slack_thread_sync'
  returning id, created_at into v_message_id, v_message_created_at;

  if v_message_id is null then
    return jsonb_build_object('status', 'slack_delivery_conflict', 'proposal_id', p_proposal_id);
  end if;

  update public.company_agent_update_proposals proposal
  set status = 'superseded', payload = null, preview = null,
      presentation_text = null, updated_at = v_now
  where proposal.workspace_id = v_workspace_id
    and proposal.scope_key = v_proposal.scope_key
    and proposal.status = 'pending';

  update public.company_agent_update_proposals
  set status = 'pending', presented_message_id = v_message_id, updated_at = v_now
  where id = p_proposal_id;

  update public.company_conversations
  set last_message_id = v_message_id,
      last_message_at = v_message_created_at,
      updated_at = v_now
  where id = v_user_message.conversation_id
    and (last_message_id is null or last_message_id <= v_message_id);

  delete from public.company_agent_update_proposals proposal
  where proposal.workspace_id = v_workspace_id
    and proposal.status in ('applied', 'rejected', 'superseded', 'expired', 'stale')
    and proposal.updated_at < v_now - interval '30 days';

  return jsonb_build_object(
    'status', 'pending', 'proposal_id', p_proposal_id,
    'presented_message_id', v_message_id
  );
end;
$$;

create or replace function public.resolve_company_agent_update_proposal_v1(
  p_workspace_id uuid,
  p_scope_key text,
  p_current_user_message_id bigint,
  p_proposal_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.company_agent_update_proposals%rowtype;
  v_current_message public.company_messages%rowtype;
  v_previous_message public.company_messages%rowtype;
  v_apply_result jsonb;
  v_now timestamptz := transaction_timestamp();
begin
  if p_action not in ('apply', 'reject', 'preview') then
    raise exception using errcode = '22023', message = 'invalid proposal action';
  end if;

  perform 1 from public.company_workspace
  where company_workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company workspace not found';
  end if;

  select proposal.* into v_proposal
  from public.company_agent_update_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.workspace_id = p_workspace_id
    and proposal.scope_key = p_scope_key
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'proposal_id', p_proposal_id);
  end if;

  if v_proposal.status <> 'pending' then
    return jsonb_build_object('status', v_proposal.status, 'proposal_id', p_proposal_id);
  end if;
  if v_proposal.expires_at <= v_now then
    update public.company_agent_update_proposals
    set status = 'expired', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where id = p_proposal_id;
    return jsonb_build_object(
      'status', 'expired', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary
    );
  end if;

  if p_action = 'preview' then
    return jsonb_build_object(
      'status', 'preview', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary, 'preview', v_proposal.preview,
      'presentation_text', v_proposal.presentation_text
    );
  end if;

  select message.* into v_current_message
  from public.company_messages message
  where message.id = p_current_user_message_id
    and message.company_workspace_id = p_workspace_id
    and message.role = 'user';
  if not found then
    raise exception using errcode = '23514', message = 'current user message is invalid';
  end if;

  if v_proposal.source = 'chat' then
    if v_current_message.message_type <> 'chat' then
      raise exception using errcode = '23514', message = 'proposal scope does not match current chat message';
    end if;
    select message.* into v_previous_message
    from public.company_messages message
    where message.conversation_id = v_current_message.conversation_id
      and message.message_type = 'chat'
      and message.id < v_current_message.id
    order by message.id desc
    limit 1;
  else
    if v_current_message.message_type <> 'slack'
       or v_current_message.slack_thread_id is distinct from v_proposal.slack_thread_id then
      raise exception using errcode = '23514', message = 'proposal scope does not match current Slack message';
    end if;
    select message.* into v_previous_message
    from public.company_messages message
    where message.slack_thread_id = v_proposal.slack_thread_id
      and message.message_type = 'slack'
      and message.id < v_current_message.id
    order by message.id desc
    limit 1;
  end if;

  if v_previous_message.role <> 'assistant'
     or v_previous_message.metadata #>> '{updateProposalRef,proposalId}' is distinct from p_proposal_id::text
     or (v_proposal.source = 'slack' and nullif(v_previous_message.slack_message_ts, '') is null) then
    return jsonb_build_object(
      'status', 'needs_repreview', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary, 'preview', v_proposal.preview,
      'presentation_text', v_proposal.presentation_text
    );
  end if;

  if p_action = 'reject' then
    update public.company_agent_update_proposals
    set status = 'rejected', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where id = p_proposal_id;
    return jsonb_build_object(
      'status', 'rejected', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary
    );
  end if;

  v_apply_result := public.apply_company_data_changes_internal_v1(
    p_workspace_id,
    v_proposal.payload -> 'changes',
    v_proposal.payload ->> 'source',
    v_proposal.payload ->> 'event_content',
    true
  );

  if v_apply_result ->> 'status' = 'conflict' then
    update public.company_agent_update_proposals
    set status = 'stale', payload = null, preview = null,
        presentation_text = null, updated_at = v_now
    where id = p_proposal_id;
    return jsonb_build_object(
      'status', 'stale', 'proposal_id', p_proposal_id,
      'summary', v_proposal.summary,
      'conflict', v_apply_result
    );
  end if;

  update public.company_agent_update_proposals
  set status = 'applied', payload = null, preview = null,
      presentation_text = null, applied_at = v_now, updated_at = v_now
  where id = p_proposal_id;

  delete from public.company_agent_update_proposals proposal
  where proposal.workspace_id = p_workspace_id
    and proposal.status in ('applied', 'rejected', 'superseded', 'expired', 'stale')
    and proposal.updated_at < v_now - interval '30 days';

  return jsonb_build_object(
    'status', 'applied', 'proposal_id', p_proposal_id,
    'summary', v_proposal.summary,
    'apply_result', v_apply_result
  );
end;
$$;

revoke all on function public.validate_company_data_change_value_v1(text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.company_data_change_current_value_v1(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_company_data_changes_internal_v1(uuid, jsonb, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.apply_company_data_changes_v1(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.present_company_agent_update_proposal_v1(uuid, text, text, bigint, text, text, jsonb, text, uuid, jsonb, text, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.activate_slack_company_agent_update_proposal_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.resolve_company_agent_update_proposal_v1(uuid, text, bigint, uuid, text)
  from public, anon, authenticated;

grant execute on function public.apply_company_data_changes_v1(uuid, jsonb, text, text)
  to service_role;
grant execute on function public.present_company_agent_update_proposal_v1(uuid, text, text, bigint, text, text, jsonb, text, uuid, jsonb, text, jsonb, text)
  to service_role;
grant execute on function public.activate_slack_company_agent_update_proposal_v1(uuid, text, text)
  to service_role;
grant execute on function public.resolve_company_agent_update_proposal_v1(uuid, text, bigint, uuid, text)
  to service_role;

comment on function public.apply_company_data_changes_v1(uuid, jsonb, text, text) is
  'Atomically validates optimistic expected values, applies a flat company-data batch, mirrors internal role requests, and writes one compact event.';
comment on function public.present_company_agent_update_proposal_v1(uuid, text, text, bigint, text, text, jsonb, text, uuid, jsonb, text, jsonb, text) is
  'Persists an exact request/memory confirmation after its final presentation text exists.';
comment on function public.activate_slack_company_agent_update_proposal_v1(uuid, text, text) is
  'Idempotently links a delivered Slack confirmation message and activates its draft proposal.';
comment on function public.resolve_company_agent_update_proposal_v1(uuid, text, bigint, uuid, text) is
  'Atomically previews, rejects, or applies one adjacent pending company-side update proposal.';

commit;
