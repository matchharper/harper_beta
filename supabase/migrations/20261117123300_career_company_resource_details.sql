-- An employer is derived only from a source the candidate can read. An
-- anonymous Role, a personal email, or a user's evaluation never identifies
-- the employer of a shared company document.
create function public.career_read_public_company_targets_v1(p_user uuid,p_refs jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  input_ref jsonb; target jsonb; resolved jsonb; identity jsonb; role_row company_roles;
  published jsonb; company_row company_workspace; advertised_name text; posting official_jobs; posting_name text;
  result jsonb := '[]';
begin
  for input_ref in select value from jsonb_array_elements(p_refs) loop
    target := input_ref;
    resolved := null;
    identity := null;
    posting_name := null;
    if target->>'kind'='opportunity' then
      select o.primary_ref into target from career_opportunities o
        where o.id::text=target->>'id' and o.talent_id=p_user and o.deleted_at is null
          and o.merged_into_id is null;
    end if;
    if input_ref->>'kind' is null and nullif(input_ref->>'name','') is not null then
      identity:=input_ref;
      resolved:=career_resolve_public_company_v1(identity);
    elsif target is not null and career_resource_available_v1(p_user,target) then
      if target->>'kind'='posting' then
        select j.* into posting from official_jobs j where j.id::text=target->>'id'
          and j.is_published and nullif(btrim(j.company_name),'') is not null
          and not exists(select from company_internal_roles i where i.role_id=j.role_id and i.is_anonymous);
        if found then
          if career_company_url_key_v1(posting.company_website_url) is not null then
            identity:=jsonb_build_object('name',posting.company_name,'officialWebsite',posting.company_website_url);
          elsif posting.role_id is not null and career_resource_available_v1(p_user,jsonb_build_object('kind','role','id',posting.role_id::text)) then
            target:=jsonb_build_object('kind','role','id',posting.role_id::text);
            posting_name:=posting.company_name;
          end if;
        end if;
      end if;
      case target->>'kind'
      when 'role' then
        select * into role_row from company_roles where role_id::text=target->>'id';
        published := null;
        if role_row.source_type='internal' then
          published := read_career_internal_role_v1(p_user,role_row.role_id);
        end if;
        if (role_row.source_type='external' and role_row.source_provider is distinct from 'user_submitted')
            or (role_row.source_type='internal' and published #>> '{factsSource,kind}'='role') then
          if role_row.information->>'purpose'='gtm_outreach' then
            -- This Role is hosted in Harper's workspace. Only the actual
            -- source employer binding can be used, never the hosting workspace.
            advertised_name := role_row.information #>> '{gtm,companyName}';
            select w.* into company_row from company_workspace w
              where w.company_workspace_id::text=role_row.information #>> '{gtm,sourceWorkspaceId}'
                and w.company_workspace_id<>role_row.company_workspace_id
                and advertised_name in (w.company_name,w.published_name);
          else
            select * into company_row from company_workspace
              where company_workspace_id=role_row.company_workspace_id
              and (role_row.source_type='external' or published->>'companyName' in (company_name,published_name));
          end if;
          if company_row.company_workspace_id is not null and
            (posting_name is null or posting_name in (company_row.company_name,company_row.published_name)) then
            if company_row.company_db_id is not null then
              resolved := career_resolve_public_company_v1(jsonb_build_object(
                'kind','company','id',company_row.company_db_id::text));
            end if;
            if company_row.company_db_id is null then
              identity := jsonb_strip_nulls(jsonb_build_object('name',nullif(btrim(company_row.company_name),''),
                'officialWebsite',case when career_company_url_key_v1(company_row.homepage_url) is not null then company_row.homepage_url end,
                'linkedinUrl',case when career_company_url_key_v1(company_row.linkedin_url) is not null then company_row.linkedin_url end));
            end if;
          end if;
        end if;
      when 'company' then resolved:=career_resolve_public_company_v1(target);
      when 'company_workspace' then resolved:=career_resolve_public_company_v1(target);
      when 'company_datum' then resolved:=career_resolve_public_company_v1(target);
      else null;
      end case;
    end if;
    if nullif(identity->>'name','') is not null and (identity ? 'officialWebsite' or identity ? 'linkedinUrl' or identity ? 'linkedinCompanyId') then
      if resolved is null then
        resolved := career_resolve_public_company_v1(identity);
      end if;
      resolved := resolved || jsonb_build_object('identity',identity);
    end if;
    result := result || jsonb_build_array(coalesce(resolved,jsonb_build_object('status','unavailable'))
      || jsonb_build_object('targetRef',input_ref));
  end loop;
  return result;
end $$;

-- The lease spans an external provider request, so an ordinary SQL row lock
-- (which ends with the RPC) cannot coalesce requests across app processes.
-- There are no user inputs or company data here. Released rows are deleted.
create table public.career_company_summary_leases(
  company_key text primary key, owner uuid not null, expires_at timestamptz not null
);
alter table public.career_company_summary_leases enable row level security;
revoke all on public.career_company_summary_leases from public,anon,authenticated;
grant select,insert,update,delete on public.career_company_summary_leases to service_role;

create function public.career_claim_company_summary_v1(p_key text,p_owner uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  delete from career_company_summary_leases where expires_at<clock_timestamp();
  insert into career_company_summary_leases(company_key,owner,expires_at)
    values(p_key,p_owner,clock_timestamp()+interval '3 minutes')
    on conflict do nothing;
  return found;
end $$;

create function public.career_finish_company_summary_v1(p_key text,p_owner uuid,p_target jsonb,
  p_content text,p_source_refs jsonb,p_data_ref jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  delete from career_company_summary_leases where company_key=p_key and owner=p_owner
    and expires_at>clock_timestamp();
  if not found or p_content is null then return null; end if;
  return career_write_company_datum_v1(p_target,'summary',p_content,p_source_refs,p_data_ref,p_owner);
end $$;
revoke all on function public.career_read_public_company_targets_v1(uuid,jsonb),
  public.career_claim_company_summary_v1(text,uuid),public.career_finish_company_summary_v1(text,uuid,jsonb,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.career_read_public_company_targets_v1(uuid,jsonb),
  public.career_claim_company_summary_v1(text,uuid),public.career_finish_company_summary_v1(text,uuid,jsonb,text,jsonb,jsonb)
  to service_role;
