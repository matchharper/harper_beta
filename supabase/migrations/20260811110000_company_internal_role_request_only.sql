-- Make company_internal_roles.request the only role-request store.
-- The legacy parent column intentionally remains untouched here so it can be
-- dropped in a separate, deployment-safe migration after this code is live.

begin;

drop trigger if exists company_roles_legacy_request_to_internal
  on public.company_roles;
drop trigger if exists company_roles_guard_internal_legacy_request
  on public.company_roles;
drop function if exists public.sync_legacy_company_role_request_to_internal_v1();
drop function if exists public.guard_internal_company_role_legacy_request_v1();

create or replace function public.build_company_role_search_tsv_v1(
  p_name text,
  p_description text,
  p_request text,
  p_location_text text,
  p_work_mode text,
  p_type text[]
)
returns tsvector
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    setweight(to_tsvector('simple', coalesce(p_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(p_description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(p_request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(p_location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(p_work_mode, '')), 'D') ||
    setweight(
      to_tsvector('simple', array_to_string(coalesce(p_type, '{}'::text[]), ' ')),
      'D'
    );
$$;

create or replace function public.set_company_roles_opportunity_search_tsv()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request text;
begin
  if lower(coalesce(new.status, 'active')) = 'draft' then
    new.opportunity_search_tsv := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(new.is_expired, false) = true
     and old.opportunity_search_tsv is null then
    return new;
  end if;

  if lower(btrim(coalesce(new.source_type, ''))) = 'internal' then
    select internal_role.request
    into v_request
    from public.company_internal_roles internal_role
    where internal_role.role_id = new.role_id;
  end if;

  new.opportunity_search_tsv := public.build_company_role_search_tsv_v1(
    new.name,
    new.description,
    v_request,
    new.location_text,
    new.work_mode,
    new.type
  );
  return new;
end;
$$;

drop trigger if exists company_roles_set_opportunity_search_tsv
  on public.company_roles;
create trigger company_roles_set_opportunity_search_tsv
before insert or update of
  name,
  description,
  location_text,
  work_mode,
  type,
  is_expired,
  status,
  source_type
on public.company_roles
for each row
execute function public.set_company_roles_opportunity_search_tsv();

create or replace function public.refresh_company_role_search_from_internal_request_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id uuid := case when tg_op = 'DELETE' then old.role_id else new.role_id end;
  v_request text := case when tg_op = 'DELETE' then null else new.request end;
begin
  update public.company_roles role
  set opportunity_search_tsv = case
    when lower(coalesce(role.status, 'active')) = 'draft' then null
    when coalesce(role.is_expired, false) = true
         and role.opportunity_search_tsv is null then null
    else public.build_company_role_search_tsv_v1(
      role.name,
      role.description,
      v_request,
      role.location_text,
      role.work_mode,
      role.type
    )
  end
  where role.role_id = v_role_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists company_internal_roles_refresh_role_search
  on public.company_internal_roles;
drop trigger if exists company_internal_roles_refresh_role_search_delete
  on public.company_internal_roles;
create trigger company_internal_roles_refresh_role_search
after insert or update of request
on public.company_internal_roles
for each row
execute function public.refresh_company_role_search_from_internal_request_v1();

create trigger company_internal_roles_refresh_role_search_delete
after delete
on public.company_internal_roles
for each row
execute function public.refresh_company_role_search_from_internal_request_v1();

-- Rebuild existing vectors once so no indexed request text remains derived from
-- the legacy parent column. Preserve intentionally cleared expired rows.
update public.company_roles role
set opportunity_search_tsv = case
  when lower(coalesce(role.status, 'active')) = 'draft' then null
  when coalesce(role.is_expired, false) = true
       and role.opportunity_search_tsv is null then null
  else public.build_company_role_search_tsv_v1(
    role.name,
    role.description,
    case
      when lower(btrim(coalesce(role.source_type, ''))) = 'internal' then (
        select internal_role.request
        from public.company_internal_roles internal_role
        where internal_role.role_id = role.role_id
      )
      else null
    end,
    role.location_text,
    role.work_mode,
    role.type
  )
end;

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
         and v_current_role_source = 'internal'
         and not exists (
           select 1
           from public.company_internal_roles internal_role
           where internal_role.role_id = v_role_id
         ) then
        raise exception using
          errcode = '23514',
          message = 'canonical internal role request row is missing';
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

    if v_key in ('role_request', 'role_memory')
       and (
         v_final_role_source is distinct from 'internal'
         or coalesce(v_final_role_expired, true)
       ) then
      raise exception using
        errcode = '23514',
        message = 'role request and memory require a final active internal role';
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
      values (v_role_id, null, v_now)
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
      set source_type = v_text,
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
        update public.company_internal_roles
        set request = v_text, updated_at = v_now
        where role_id = v_role_id and request is distinct from v_text;
        update public.company_roles
        set updated_at = v_now
        where role_id = v_role_id;
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



comment on column public.company_internal_roles.request is
  'Canonical and sole candidate-matching request for an internal company role.';
comment on function public.apply_company_data_changes_v1(uuid, jsonb, text, text) is
  'Atomically validates optimistic expected values, applies a flat company-data batch, writes internal role requests only to company_internal_roles, and records one compact event.';
comment on function public.set_company_roles_opportunity_search_tsv() is
  'Maintains role search vectors from parent role fields and the canonical internal-role request.';
comment on function public.refresh_company_role_search_from_internal_request_v1() is
  'Refreshes a parent role search vector whenever its canonical internal-role request changes.';

revoke all on function public.build_company_role_search_tsv_v1(
  text, text, text, text, text, text[]
) from public, anon, authenticated;
revoke all on function public.refresh_company_role_search_from_internal_request_v1()
  from public, anon, authenticated;

commit;
