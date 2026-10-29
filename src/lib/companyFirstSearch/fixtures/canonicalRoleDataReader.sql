-- Existing canonical reader, captured with the pre-migration schema fixture.
CREATE OR REPLACE FUNCTION public.company_data_change_current_value_v1(p_workspace_id uuid, p_key text, p_role_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    when 'role_intro_search_date' then
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
    when 'role_intro_search_date' then
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
    when 'role_intro_search_date' then
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
    when 'role_is_anonymous' then
      select to_jsonb(internal_role.is_anonymous) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_is_promote' then
      select to_jsonb(internal_role.is_promote) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
    when 'role_is_company_first_search' then
      select to_jsonb(internal_role.is_company_first_search) into v_value
      from public.company_roles role
      join public.company_internal_roles internal_role on internal_role.role_id = role.role_id
      where role.role_id = p_role_id
        and role.company_workspace_id = p_workspace_id
        and role.source_type = 'internal';
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
$function$;
