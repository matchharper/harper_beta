-- Enforce the same public data home boundary for service-side imports and
-- transfers as for the Career writer. SHARE also serializes a concurrent
-- reassignment of the workspace while the datum is being attached.
create function public.career_require_public_company_home_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (select from public.company_workspace
    where company_workspace_id=new.company_workspace_id and is_public_data_home for share) then
    raise exception 'Shared company material requires a public data home' using errcode='23514';
  end if;
  return new;
end $$;
create trigger career_require_public_company_home before insert or update of company_workspace_id
  on public.company_datas for each row execute function public.career_require_public_company_home_v1();
revoke all on function public.career_require_public_company_home_v1() from public,anon,authenticated;

-- Observations identify their source document through a JSON resource ref.
-- A hard-deleted document must revoke the same copies as a scope withdrawal.
create or replace function public.career_public_scope_revoked_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.source_scope='public' and (tg_op='DELETE' or new.source_scope is distinct from 'public') then
    update career_public_observations set deleted_at=now() where
      resource_ref->>'kind'='web_resource' and resource_ref->>'id'=old.id::text and deleted_at is null;
    perform career_purge_resource_copies_v1(null,'web_resource',old.id::text);
  end if;
  return null;
end $$;
create trigger career_public_document_removed after delete on public.documents
  for each row execute function public.career_public_scope_revoked_v1();

create or replace function public.career_resolve_public_company_v1(p_target jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  candidates jsonb; company_id bigint; name_key text:=nullif(lower(btrim(p_target->>'name')),'');
  website_key text:=career_company_url_key_v1(p_target->>'officialWebsite');
  linkedin_key text:=career_company_url_key_v1(p_target->>'linkedinUrl');
  linkedin_id bigint:=nullif(p_target->>'linkedinCompanyId','')::bigint;
  selected company_db;
  has_identity boolean:=website_key is not null or linkedin_key is not null or linkedin_id is not null;
  kind text:=p_target->>'kind';
begin
  if kind in ('company','company_workspace','company_datum') and
    pg_input_is_valid(p_target->>'id',case when kind='company' then 'bigint' else 'uuid' end) is distinct from true then
    return '{"status":"missing"}';
  end if;
  if kind='company' then company_id:=(p_target->>'id')::bigint;
  elsif kind='company_workspace' then
    select w.company_db_id into company_id from company_workspace w
      where w.company_workspace_id=(p_target->>'id')::uuid and w.is_internal is false;
  elsif kind='company_datum' then
    select w.company_db_id into company_id from company_datas d join company_workspace w using(company_workspace_id)
      where d.id=(p_target->>'id')::uuid and w.is_public_data_home;
  elsif kind is not null then return jsonb_build_object('status','missing'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('companyRef',career_company_ref_v1(c),'name',c.name,
    'website',c.website_url,'linkedinUrl',c.linkedin_url,'linkedinCompanyId',c.linkedin_company_id::text) order by c.id),'[]') into candidates
  from company_db c where case
    when kind is not null then c.id=company_id
    when has_identity then career_company_url_key_v1(c.website_url)=website_key
      or career_company_url_key_v1(c.linkedin_url)=linkedin_key or c.linkedin_company_id=linkedin_id
    else lower(btrim(c.name))=name_key end;
  -- A directory entry created before public research may have only a name.
  -- A new identifier cannot settle whether that entry is the same employer.
  -- Return explicit candidates instead of splitting its research across IDs.
  if jsonb_array_length(candidates)=0 and kind is null and has_identity and name_key is not null then
    select coalesce(jsonb_agg(jsonb_build_object('companyRef',career_company_ref_v1(c),'name',c.name,
      'website',c.website_url,'linkedinUrl',c.linkedin_url,'linkedinCompanyId',c.linkedin_company_id::text)
      order by c.id),'[]') into candidates
    from company_db c where lower(btrim(c.name))=name_key
      and (website_key is null or career_company_url_key_v1(c.website_url) is null)
      and (linkedin_key is null or career_company_url_key_v1(c.linkedin_url) is null)
      and (linkedin_id is null or c.linkedin_company_id is null);
    if jsonb_array_length(candidates)>0 then
      return jsonb_build_object('status','ambiguous','candidates',candidates,
        'reason','An existing name has no matching identifier to distinguish it from this employer');
    end if;
  end if;
  if jsonb_array_length(candidates)=0 then return jsonb_build_object('status','missing'); end if;
  if jsonb_array_length(candidates)>1 then return jsonb_build_object('status','ambiguous','candidates',candidates); end if;
  if has_identity and kind is null then
    select * into selected from company_db where id=(candidates->0->'companyRef'->>'id')::bigint;
    if (website_key is not null and selected.website_url is not null and website_key is distinct from career_company_url_key_v1(selected.website_url))
       or (linkedin_key is not null and selected.linkedin_url is not null and linkedin_key is distinct from career_company_url_key_v1(selected.linkedin_url))
       or (linkedin_id is not null and selected.linkedin_company_id is not null and linkedin_id<>selected.linkedin_company_id)
       or (name_key is not null and lower(btrim(selected.name)) is distinct from name_key) then
      return jsonb_build_object('status','ambiguous','candidates',candidates);
    end if;
  end if;
  return jsonb_build_object('status','found')||(candidates->0);
end $$;

-- Recheck and lock new reference kinds when caching dependent material.
create or replace function public.career_lock_cache_sources_v1(p_user uuid,p_value jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;
begin
 for r in select value from career_json_resource_refs_v1(p_value) value
  where value->>'kind' in ('company','company_datum','company_workspace','role','document','memory','profile','message','operation','opportunity','observation','web_resource')
  order by value->>'kind',value->>'id' loop
  case r->>'kind'
   when 'company_datum' then perform 1 from company_datas where id=(case when pg_input_is_valid(r->>'id','uuid') then r->>'id' end)::uuid for share;
   when 'company_workspace' then perform 1 from company_workspace where company_workspace_id=(case when pg_input_is_valid(r->>'id','uuid') then r->>'id' end)::uuid for share;
   when 'company' then perform 1 from company_db where id=(case when pg_input_is_valid(r->>'id','bigint') then r->>'id' end)::bigint for share;
   when 'role' then perform 1 from company_roles where role_id=(case when pg_input_is_valid(r->>'id','uuid') then r->>'id' end)::uuid for share;
   when 'document' then perform 1 from talent_documents where id::text=r->>'id' and talent_id=p_user for share;
   when 'memory' then perform 1 from talent_contexts where id::text=r->>'id' and talent_id=p_user for share;
   when 'profile' then perform 1 from talent_profiles where id::text=r->>'id' and talent_id=p_user for share;
   when 'message' then perform 1 from talent_messages where id::text=r->>'id' and user_id=p_user for share;
   when 'operation' then perform 1 from talent_external_operations where id::text=r->>'id' and user_id=p_user for share;
   when 'opportunity' then perform 1 from career_opportunities where id=(case when pg_input_is_valid(r->>'id','uuid') then r->>'id' end)::uuid and talent_id=p_user for share;
   when 'observation' then perform 1 from career_public_observations where id::text=r->>'id' for share;
   when 'web_resource' then perform 1 from documents where id::text=r->>'id' for share;
  end case;
  if not career_resource_available_v1(p_user,r) then raise exception 'Source unavailable while saving cached content' using errcode='42501'; end if;
 end loop;
end $$;

-- Compare typed input with primary keys so a Role or opportunity detail does
-- not scan the entire directory. Invalid references have no matching row.
create or replace function public.career_resource_direct_available_v1(p_user uuid,p_ref jsonb)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare target text:=p_ref->>'id'; role_row public.company_roles;
  target_uuid uuid:=(case when pg_input_is_valid(target,'uuid') then target end)::uuid;
  target_directory_id bigint:=(case when pg_input_is_valid(target,'bigint') then target end)::bigint;
begin
 case p_ref->>'kind'
 when 'company_datum' then return exists(select from company_datas d where d.id=target_uuid);
 when 'company_workspace' then return exists(select from company_workspace w where w.company_workspace_id=target_uuid
   and w.company_db_id is not null and w.is_internal is false);
 when 'company' then return exists(select 1 from company_db where id=target_directory_id and
  (p_ref->>'revision' is null or ((case when pg_input_is_valid(p_ref->>'revision','bigint') then p_ref->>'revision' end)::bigint)>coalesce((public_context->>'revokedThroughRevision')::bigint,0)));
 when 'web_resource' then return exists(select 1 from documents d join career_public_observations o on o.id=d.current_observation_id where d.id=target_directory_id and d.source_scope='public' and o.deleted_at is null);
 when 'observation' then return exists(select 1 from career_public_observations o join documents d on d.id::text=o.resource_ref->>'id'
   where o.id=target_uuid and o.deleted_at is null and d.source_scope='public');
 when 'document' then return exists(select 1 from talent_documents where id::text=target and talent_id=p_user and not is_deleted);
 when 'memory' then return exists(select 1 from talent_contexts where id::text=target and talent_id=p_user and deleted_at is null);
 when 'message' then return exists(select 1 from talent_messages where id::text=target and user_id=p_user);
 when 'email_message' then return exists(select 1 from talent_integrations where talent_id=p_user and provider='gmail' and status='active'
   and composio_connected_account_id=split_part(target,'/',1) and split_part(target,'/',2)<>'' and split_part(target,'/',3)=''
   and (p_ref->>'revision' is null or career_mail_sync->>'generation'=p_ref->>'revision'));
 when 'profile' then return exists(select 1 from talent_profiles where id::text=target and talent_id=p_user);
 when 'operation' then return exists(select 1 from talent_external_operations where id::text=target and user_id=p_user);
 when 'opportunity' then return exists(select 1 from career_opportunities where id=target_uuid and talent_id=p_user and deleted_at is null);
 when 'posting' then return exists(select 1 from official_jobs where id=target_uuid and is_published);
 when 'role' then
  select * into role_row from company_roles where role_id=target_uuid;
  if not found then return false; end if;
  if role_row.source_provider='career_public_discovery' and not exists(select 1 from career_public_observations o join documents d on d.id::text=o.resource_ref->>'id'
   where o.id::text=role_row.information->'publicDiscovery'->>'observationId' and o.deleted_at is null and d.source_scope='public') then return false;end if;
  if lower(coalesce(role_row.information->>'testOnly','false'))='true' and not coalesce(role_row.information->'testTalentIds','[]') ? p_user::text then return false; end if;
  if role_row.source_type='internal' then
   begin return read_career_internal_role_v1(p_user,role_row.role_id) is not null;
   exception when others then return false; end;
  end if;
  return coalesce(role_row.source_provider,'')<>'user_submitted' or coalesce(role_row.information->'submittedTalentIds','[]') ? p_user::text;
 else return false;
 end case;
end $$;

create or replace function public.career_read_public_company_targets_v1(p_user uuid,p_refs jsonb)
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
        where o.id=(case when pg_input_is_valid(target->>'id','uuid') then target->>'id' end)::uuid and o.talent_id=p_user and o.deleted_at is null
          and o.merged_into_id is null;
    end if;
    if input_ref->>'kind' is null and nullif(input_ref->>'name','') is not null then
      identity:=input_ref;
      resolved:=career_resolve_public_company_v1(identity);
    elsif target is not null and career_resource_available_v1(p_user,target) then
      if target->>'kind'='posting' then
        select j.* into posting from official_jobs j where j.id=(case when pg_input_is_valid(target->>'id','uuid') then target->>'id' end)::uuid
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
        select * into role_row from company_roles where role_id=(case when pg_input_is_valid(target->>'id','uuid') then target->>'id' end)::uuid;
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
              where w.company_workspace_id=(case when pg_input_is_valid(role_row.information #>> '{gtm,sourceWorkspaceId}','uuid') then role_row.information #>> '{gtm,sourceWorkspaceId}' end)::uuid
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

create or replace function public.career_read_company_datum_v1(p_data_ref jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d company_datas; c company_db;
begin
  if p_data_ref->>'kind' is distinct from 'company_datum' or pg_input_is_valid(p_data_ref->>'id','uuid') is distinct from true then return '{"status":"missing"}'; end if;
  select * into d from company_datas where id=(p_data_ref->>'id')::uuid;
  if not found then return '{"status":"missing"}'; end if;
  select cd.* into c from company_workspace w join company_db cd on cd.id=w.company_db_id
    where w.company_workspace_id=d.company_workspace_id and w.is_public_data_home;
  if not found then return '{"status":"missing"}'; end if;
  if p_data_ref->>'revision' is not null and d.revision::text<>p_data_ref->>'revision' then
    return jsonb_build_object('status','version_unavailable','latestRef',career_company_datum_json_v1(d)->'dataRef');
  end if;
  return career_company_datum_json_v1(d)||jsonb_build_object('status','found','companyRef',career_company_ref_v1(c));
end $$;
