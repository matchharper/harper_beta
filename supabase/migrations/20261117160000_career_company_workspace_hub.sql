-- Shared company research belongs to the company's own workspace: the one its
-- Roles already use. A Role reaches its research without an official URL or a
-- directory match, and no second, empty workspace is created per company.
-- No dedicated data home holds research yet, so the marker is removed outright.
set local lock_timeout='2s';

drop trigger if exists career_guard_company_home on public.company_workspace;
drop trigger if exists career_no_data_home_role on public.company_roles;
drop trigger if exists career_no_data_home_member on public.company_user_workspace;
drop trigger if exists career_no_data_home_invite on public.company_workspace_invitations;
drop trigger if exists career_no_data_home_team on public.company_workspace_teams;
drop trigger if exists career_require_public_company_home on public.company_datas;
drop function if exists public.career_guard_company_home_v1();
drop function if exists public.career_forbid_tenant_use_of_data_home_v1();
drop function if exists public.career_require_public_company_home_v1();

-- The pre-marker importer becomes the importer again.
drop function if exists public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean);
alter function public.import_talent_job_link_core_v1(uuid,text,uuid,uuid,jsonb,jsonb,boolean) rename to import_talent_job_link;

drop function if exists public.career_read_company_datas_v1(bigint[],text[],integer,integer);
drop function if exists public.career_read_company_topic_evidence_v1(bigint[],text,integer,integer,boolean);
drop function if exists public.career_finish_company_summary_v1(text,uuid,jsonb,text,jsonb,jsonb);
drop function if exists public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid);
drop function if exists public.career_write_company_datum_v1(jsonb,text,text,jsonb,jsonb,uuid,jsonb);
drop function if exists public.career_read_company_datum_v1(jsonb);
drop function if exists public.career_company_datum_json_v1(public.company_datas);

drop index if exists public.company_public_data_home;
alter table public.company_workspace drop constraint if exists company_public_data_home_identity;
alter table public.company_workspace drop column if exists is_public_data_home;

-- Nothing writes or reads structured facts; the Markdown content is the record.
alter table public.company_datas drop column if exists facts;
-- Deleting a workspace removes its research instead of blocking the deletion.
alter table public.company_datas drop constraint company_datas_company_workspace_id_fkey,
  add constraint company_datas_company_workspace_id_fkey foreign key (company_workspace_id)
    references public.company_workspace(company_workspace_id) on delete cascade;

-- A company site with or without a leading www is the same site. The directory's
-- indexed key keeps its own definition; workspace comparisons use this one.
create function public.career_company_site_key_v1(p_url text) returns text
language sql immutable strict security invoker set search_path=public,pg_temp as $$
  select regexp_replace(public.career_company_url_key_v1(p_url),'^www\.','')
$$;

-- A customer (internal) workspace is reachable by ref or name only once it holds
-- shared research; its other contents stay private to the customer.
create function public.career_company_workspace_public_v1(w public.company_workspace) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
  select not coalesce(w.is_internal,false)
    or exists(select from company_datas d where d.company_workspace_id=w.company_workspace_id)
$$;

-- A directory company can have more than one workspace. Its research stays in
-- one of them: the one already holding research, else a public one, else the oldest.
create function public.career_company_home_v1(p_workspace uuid) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce((
    select s.company_workspace_id from company_workspace w
      join company_workspace s on s.company_db_id=w.company_db_id
    where w.company_workspace_id=p_workspace and w.company_db_id is not null
    order by exists(select from company_datas d where d.company_workspace_id=s.company_workspace_id) desc,
      coalesce(s.is_internal,false), s.created_at, s.company_workspace_id
    limit 1), (select company_workspace_id from company_workspace where company_workspace_id=p_workspace))
$$;

create function public.career_company_home_json_v1(p_workspace uuid) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'companyRef',jsonb_build_object('kind','company_workspace','id',w.company_workspace_id::text),
    'name',coalesce(nullif(btrim(w.published_name),''),nullif(btrim(w.company_name),''),c.name),
    'website',coalesce(nullif(btrim(w.homepage_url),''),c.website_url),
    'linkedinUrl',coalesce(nullif(btrim(w.linkedin_url),''),c.linkedin_url),
    'linkedinCompanyId',c.linkedin_company_id::text))
  from company_workspace w left join company_db c on c.id=w.company_db_id
  where w.company_workspace_id=public.career_company_home_v1(p_workspace)
$$;

create function public.career_company_datum_json_v1(d public.company_datas) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object('dataRef',jsonb_build_object('kind','company_datum','id',d.id::text,
    'revision',d.revision::text),'label',d.label,'content',d.content,'sourceRefs',d.source_refs,'checkedAt',d.checked_at,
    'sources',(select jsonb_agg(jsonb_build_object('ref',r.ref,'url',o.source_url,'title',doc.title)
        order by r.ord) from jsonb_array_elements(d.source_refs) with ordinality r(ref,ord)
      join career_public_observations o on o.id=(r.ref->>'id')::uuid
      join documents doc on o.resource_ref->>'id'=doc.id::text
      where o.deleted_at is null and doc.source_scope='public')))
$$;

-- Resolve a company ref or a named company to the workspace holding its
-- research. A directory company without any workspace is found by its
-- directory ref; the first saved entry creates its workspace.
create or replace function public.career_resolve_public_company_v1(p_target jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  kind text:=p_target->>'kind'; home uuid; homes uuid[]; directory bigint[];
  name_key text:=nullif(lower(btrim(p_target->>'name')),'');
  website_key text:=career_company_url_key_v1(p_target->>'officialWebsite');
  linkedin_key text:=career_company_url_key_v1(p_target->>'linkedinUrl');
  linkedin_id bigint:=case when pg_input_is_valid(p_target->>'linkedinCompanyId','bigint') then (p_target->>'linkedinCompanyId')::bigint end;
begin
  if kind in ('company','company_workspace','company_datum') and
    pg_input_is_valid(p_target->>'id',case when kind='company' then 'bigint' else 'uuid' end) is distinct from true then
    return '{"status":"missing"}';
  end if;
  if kind='company_workspace' then
    select career_company_home_v1(w.company_workspace_id) into home from company_workspace w
      where w.company_workspace_id=(p_target->>'id')::uuid and career_company_workspace_public_v1(w);
  elsif kind='company_datum' then
    select company_workspace_id into home from company_datas where id=(p_target->>'id')::uuid;
  elsif kind='company' then
    select career_company_home_v1(company_workspace_id) into home from company_workspace
      where company_db_id=(p_target->>'id')::bigint order by coalesce(is_internal,false), created_at, company_workspace_id limit 1;
    -- A workspace recorded before its directory entry is the same company when their links match.
    if home is null then
      select career_company_home_v1(w.company_workspace_id) into home from company_workspace w
        join company_db c on c.id=(p_target->>'id')::bigint
        where w.company_db_id is null and career_company_workspace_public_v1(w)
          and (career_company_site_key_v1(w.homepage_url)=career_company_site_key_v1(c.website_url)
            or career_company_site_key_v1(w.linkedin_url)=career_company_site_key_v1(c.linkedin_url))
        order by w.created_at, w.company_workspace_id limit 1;
    end if;
    if home is null then directory:=array(select id from company_db where id=(p_target->>'id')::bigint); end if;
  elsif kind is not null then return '{"status":"missing"}';
  else
    if website_key is not null or linkedin_key is not null or linkedin_id is not null then
      homes:=array(select distinct career_company_home_v1(w.company_workspace_id) from company_workspace w
        where career_company_workspace_public_v1(w) and (
          w.company_db_id in (select c.id from company_db c where career_company_url_key_v1(c.website_url)=website_key
            or career_company_url_key_v1(c.linkedin_url)=linkedin_key or c.linkedin_company_id=linkedin_id)
          or career_company_site_key_v1(w.homepage_url)=career_company_site_key_v1(p_target->>'officialWebsite')
          or career_company_site_key_v1(w.linkedin_url)=career_company_site_key_v1(p_target->>'linkedinUrl')));
      if cardinality(homes)=0 then
        directory:=array(select c.id from company_db c where career_company_url_key_v1(c.website_url)=website_key
          or career_company_url_key_v1(c.linkedin_url)=linkedin_key or c.linkedin_company_id=linkedin_id order by c.id);
      end if;
    end if;
    -- A name alone, or a name whose official link is not yet stored. A stored
    -- different website identifies a different company with the same name.
    if coalesce(cardinality(homes),0)=0 and coalesce(cardinality(directory),0)=0 and name_key is not null then
      homes:=array(select distinct career_company_home_v1(w.company_workspace_id) from company_workspace w
        left join company_db c on c.id=w.company_db_id
        where career_company_workspace_public_v1(w)
          and name_key in (lower(btrim(w.company_name)),lower(btrim(w.published_name)),lower(btrim(c.name)))
          and (website_key is null or coalesce(career_company_url_key_v1(w.homepage_url),career_company_url_key_v1(c.website_url)) is null));
      if cardinality(homes)=0 then
        directory:=array(select c.id from company_db c where lower(btrim(c.name))=name_key
          and (website_key is null or career_company_url_key_v1(c.website_url) is null) order by c.id);
      end if;
    end if;
    if cardinality(homes)=1 then home:=homes[1]; end if;
  end if;

  if home is not null then return jsonb_build_object('status','found')||career_company_home_json_v1(home); end if;
  if cardinality(homes)>1 then
    return jsonb_build_object('status','ambiguous','candidates',
      (select jsonb_agg(career_company_home_json_v1(h) order by h) from unnest(homes) h));
  end if;
  if cardinality(directory)=1 then
    return (select jsonb_build_object('status','found')||jsonb_strip_nulls(jsonb_build_object('companyRef',career_company_ref_v1(c),
      'name',c.name,'website',c.website_url,'linkedinUrl',c.linkedin_url,'linkedinCompanyId',c.linkedin_company_id::text))
      from company_db c where c.id=directory[1]);
  end if;
  if cardinality(directory)>1 then
    return jsonb_build_object('status','ambiguous','candidates',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'companyRef',career_company_ref_v1(c),'name',c.name,'website',c.website_url,'linkedinUrl',c.linkedin_url,
      'linkedinCompanyId',c.linkedin_company_id::text)) order by c.id) from company_db c where c.id=any(directory)));
  end if;
  return '{"status":"missing"}';
end $$;

-- Employer of a Role, posting or owned opportunity, under the caller's access.
-- The Role's own workspace is its employer; no URL or directory link is needed.
-- An anonymous Role, a user-submitted posting, or a GTM host never resolves.
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
    company_row := null;
    if target->>'kind'='opportunity' then
      select o.primary_ref into target from career_opportunities o
        where o.id=(case when pg_input_is_valid(target->>'id','uuid') then target->>'id' end)::uuid and o.talent_id=p_user and o.deleted_at is null
          and o.merged_into_id is null;
    end if;
    if input_ref->>'kind' is null and nullif(btrim(input_ref->>'name'),'') is not null then
      identity:=input_ref;
      resolved:=career_resolve_public_company_v1(identity);
    elsif target is not null and career_resource_available_v1(p_user,target) then
      if target->>'kind'='posting' then
        select j.* into posting from official_jobs j where j.id=(case when pg_input_is_valid(target->>'id','uuid') then target->>'id' end)::uuid
          and j.is_published and nullif(btrim(j.company_name),'') is not null
          and not exists(select from company_internal_roles i where i.role_id=j.role_id and i.is_anonymous);
        if found then
          if posting.role_id is not null and career_resource_available_v1(p_user,jsonb_build_object('kind','role','id',posting.role_id::text)) then
            target:=jsonb_build_object('kind','role','id',posting.role_id::text);
            posting_name:=posting.company_name;
          else
            identity:=jsonb_strip_nulls(jsonb_build_object('name',posting.company_name,
              'officialWebsite',nullif(btrim(posting.company_website_url),'')));
            resolved:=career_resolve_public_company_v1(identity);
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
            resolved := jsonb_build_object('status','found')||career_company_home_json_v1(company_row.company_workspace_id);
          end if;
        end if;
      when 'company' then resolved:=career_resolve_public_company_v1(target);
      when 'company_workspace' then resolved:=career_resolve_public_company_v1(target);
      when 'company_datum' then resolved:=career_resolve_public_company_v1(target);
      else null;
      end case;
    end if;
    -- A named employer without any saved company keeps its identity, so the
    -- first saved research can create the company's workspace.
    if resolved->>'status'='missing' and identity is not null then
      resolved := resolved || jsonb_build_object('identity',identity);
    end if;
    result := result || jsonb_build_array(coalesce(resolved,jsonb_build_object('status','unavailable'))
      || jsonb_build_object('targetRef',input_ref));
  end loop;
  return result;
end $$;

create function public.career_write_company_datum_v1(
  p_target jsonb,p_label text,p_content text,p_source_refs jsonb,p_data_ref jsonb,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  refs jsonb; resolved jsonb; w_id uuid; d company_datas; company_id bigint; observation_ids uuid[];
  data_id uuid:=coalesce(case when pg_input_is_valid(p_data_ref->>'id','uuid') then (p_data_ref->>'id')::uuid end,p_request_id,gen_random_uuid());
  v_name text:=nullif(btrim(p_target->>'name'),'');
begin
  if nullif(btrim(p_label),'') is null or nullif(btrim(p_content),'') is null then
    raise exception 'Company material requires a label and content';
  end if;
  if p_data_ref is not null and
    (p_data_ref->>'kind' is distinct from 'company_datum' or p_data_ref->>'id' is null or p_data_ref->>'revision' is null) then
    raise exception 'Editing company material requires its ID and revision';
  end if;
  refs:=career_exact_company_sources_v1(p_source_refs);
  select array_agg((r->>'id')::uuid) into observation_ids from jsonb_array_elements(refs) r;
  -- Serializes the first write for a name, so concurrent writers share one workspace.
  if p_target->>'kind' is null and v_name is not null then
    perform pg_advisory_xact_lock(hashtextextended('career-company-name:'||lower(v_name),0));
  end if;
  resolved:=career_resolve_public_company_v1(p_target);

  if resolved->>'status'='found' and resolved->'companyRef'->>'kind'='company_workspace' then
    w_id:=(resolved->'companyRef'->>'id')::uuid;
  elsif resolved->>'status'='found' and resolved->'companyRef'->>'kind'='company' and p_data_ref is null then
    company_id:=(resolved->'companyRef'->>'id')::bigint;
    perform pg_advisory_xact_lock(hashtextextended('career-company-directory:'||company_id,0));
    select career_company_home_v1(company_workspace_id) into w_id from company_workspace
      where company_db_id=company_id order by coalesce(is_internal,false), created_at, company_workspace_id limit 1;
    if w_id is null then
      insert into company_workspace(company_name,company_db_id,homepage_url,linkedin_url,external_roles_enabled,is_internal,is_scrape_original,has_career_page)
        select coalesce(c.name,v_name),c.id,coalesce(c.website_url,nullif(btrim(p_target->>'officialWebsite'),'')),
          coalesce(c.linkedin_url,nullif(btrim(p_target->>'linkedinUrl'),'')),false,false,false,false from company_db c where c.id=company_id
        returning company_workspace_id into w_id;
    end if;
  elsif resolved->>'status'='missing' and p_target->>'kind' is null and v_name is not null and p_data_ref is null then
    insert into company_workspace(company_name,homepage_url,linkedin_url,external_roles_enabled,is_internal,is_scrape_original,has_career_page)
      values(v_name,nullif(btrim(p_target->>'officialWebsite'),''),nullif(btrim(p_target->>'linkedinUrl'),''),false,false,false,false)
      returning company_workspace_id into w_id;
  else
    return resolved;
  end if;
  perform 1 from company_workspace where company_workspace_id=w_id for update;
  if p_target->>'kind'='company' then
    update company_workspace set company_db_id=(p_target->>'id')::bigint
      where company_workspace_id=w_id and company_db_id is null;
  end if;

  select * into d from company_datas where id=data_id for update;
  if found and d.company_workspace_id<>w_id then raise exception 'Material belongs to another company'; end if;
  if p_data_ref is not null and d.id is null then return '{"status":"missing"}'; end if;
  if p_data_ref is null and d.id is null and p_label='summary' then
    select * into d from company_datas where company_workspace_id=w_id and label='summary' for update;
  end if;
  if d.id is not null then
    if (p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision') and (d.label,d.content,d.source_refs) is not distinct from (p_label,p_content,refs) then
      return jsonb_build_object('status','unchanged')||career_company_home_json_v1(w_id)||career_company_datum_json_v1(d);
    end if;
    if p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision' then
      return jsonb_build_object('status','conflict','current',career_company_datum_json_v1(d),
        'dataRef',career_company_datum_json_v1(d)->'dataRef')||career_company_home_json_v1(w_id);
    end if;
    if p_label='summary' and d.label<>'summary' and exists(select from company_datas where company_workspace_id=w_id and label='summary') then
      raise exception 'Company summary already exists';
    end if;
    update company_datas set label=p_label,content=p_content,source_refs=refs,
      checked_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 where id=d.id returning * into d;
  else
    insert into company_datas(id,company_workspace_id,label,content,source_refs)
      values(data_id,w_id,p_label,p_content,refs) returning * into d;
  end if;

  update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','company_workspace','id',w_id::text))
    where id=any(observation_ids) and not about_refs @> jsonb_build_array(jsonb_build_object('kind','company_workspace','id',w_id::text));
  -- A directory company's text/vector projection includes its research.
  update company_db set public_context=public_context
    where id=(select company_db_id from company_workspace where company_workspace_id=w_id);
  return jsonb_build_object('status','saved')||career_company_home_json_v1(w_id)||career_company_datum_json_v1(d);
end $$;

-- Resolve a Role, posting or owned opportunity under the caller's current
-- access before writing. The shared record keeps only public observations.
create function public.career_write_employer_datum_v1(
  p_user uuid, p_target jsonb, p_label text, p_content text,
  p_source_refs jsonb, p_data_ref jsonb, p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare resolution jsonb; company_target jsonb;
begin
  if p_user is null or coalesce(p_target->>'kind','') not in ('role','posting','opportunity') then
    return jsonb_build_object('status','unavailable');
  end if;
  resolution := career_read_public_company_targets_v1(p_user,jsonb_build_array(p_target))->0;
  if resolution->>'status'='found' then
    company_target := resolution->'companyRef';
  elsif resolution->>'status'='missing' and resolution ? 'identity' then
    company_target := resolution->'identity';
  end if;
  if company_target is null then
    return coalesce(resolution-'targetRef',jsonb_build_object('status','unavailable'));
  end if;
  return career_write_company_datum_v1(company_target,p_label,p_content,p_source_refs,p_data_ref,p_request_id);
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

create function public.career_read_company_datum_v1(p_data_ref jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d company_datas;
begin
  if p_data_ref->>'kind' is distinct from 'company_datum' or pg_input_is_valid(p_data_ref->>'id','uuid') is distinct from true then return '{"status":"missing"}'; end if;
  select * into d from company_datas where id=(p_data_ref->>'id')::uuid;
  if not found then return '{"status":"missing"}'; end if;
  if p_data_ref->>'revision' is not null and d.revision::text<>p_data_ref->>'revision' then
    return jsonb_build_object('status','version_unavailable','latestRef',career_company_datum_json_v1(d)->'dataRef');
  end if;
  return career_company_datum_json_v1(d)||jsonb_build_object('status','found',
    'companyRef',career_company_home_json_v1(d.company_workspace_id)->'companyRef');
end $$;

-- Per company workspace (or any sibling workspace of the same directory company):
-- its overview, every label with its entry count and latest check, and one page
-- of entries for the requested labels (an empty array: every label).
create function public.career_read_company_datas_v2(p_workspaces uuid[],p_labels text[],p_offset integer,p_limit integer) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(career_company_home_json_v1(c.id)||jsonb_build_object('requestedId',c.requested::text,
      'summary',(select career_company_datum_json_v1(s) from company_datas s where s.company_workspace_id=c.id and s.label='summary'),
      'labels',coalesce((select jsonb_agg(jsonb_build_object('label',l.label,'count',l.n,'checkedAt',l.latest) order by l.label)
        from (select label,count(*) n,max(checked_at) latest from company_datas where company_workspace_id=c.id group by label) l),'[]'),
      'items',coalesce((select jsonb_agg(career_company_datum_json_v1(p.item) order by p.checked_at desc,p.id) from (
        select d as item,d.checked_at,d.id from company_datas d where d.company_workspace_id=c.id and
          p_labels is not null and (cardinality(p_labels)=0 or d.label=any(p_labels))
        order by d.checked_at desc,d.id offset greatest(0,p_offset) limit greatest(0,p_limit)) p),'[]'),
      'total',(select count(*) from company_datas d where d.company_workspace_id=c.id and
        p_labels is not null and (cardinality(p_labels)=0 or d.label=any(p_labels))))
    order by c.ord),'[]')
  from unnest(p_workspaces) with ordinality given(id,ord)
  cross join lateral (select career_company_home_v1(given.id) id, given.ord, given.id requested) c
  where c.id is not null
$$;

-- Public sources linked to a company's workspace or its directory entry.
create function public.career_company_workspace_evidence_v1(p_workspace uuid,p_query text,p_offset integer,p_limit integer)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by page.observed_at desc, page.id), '[]'::jsonb)
  from (
    select o.id, d.title, o.source_url, o.observed_at, o.published_at,
      coalesce(d.source_fetched_at, o.source_fetched_at) as source_fetched_at,
      o.provenance->>'coverage' as coverage,
      case when p_query <> '' then o.content end as content
    from documents d
    join career_public_observations o on o.id = d.current_observation_id
    where d.source_scope = 'public' and o.deleted_at is null
      and exists (
        select 1 from career_public_observations linked
        where linked.resource_ref->>'id' = d.id::text and linked.deleted_at is null
          and (linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company_workspace','id',p_workspace::text))
            or linked.about_refs @> (select jsonb_build_array(jsonb_build_object('kind','company','id',w.company_db_id::text))
              from company_workspace w where w.company_workspace_id=p_workspace and w.company_db_id is not null))
      )
      and (p_query = '' or to_tsvector('simple', coalesce(d.title,'') || ' ' || o.content)
        @@ websearch_to_tsquery('simple', p_query))
    order by o.observed_at desc, o.id
    offset greatest(0,p_offset) limit greatest(1,p_limit)
  ) page
$$;

-- Topic reads search the company's own notes, plus matching linked sources.
create function public.career_read_company_topic_evidence_v2(
  p_workspaces uuid[], p_query text, p_offset integer, p_limit integer, p_include_sources boolean
) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with terms as (select unnest(tsvector_to_array(to_tsvector('simple', p_query))) term),
  matches as (
    select d.company_workspace_id, d.id, score.word_matches,
      row_number() over (partition by d.company_workspace_id order by score.word_matches desc,d.checked_at desc,d.id) pos,
      count(*) over (partition by d.company_workspace_id) total
    from company_datas d
    cross join lateral (
      select count(*) word_matches from terms where strpos(lower(d.label || ' ' || d.content), term)>0
    ) score
    where d.company_workspace_id=any(p_workspaces) and score.word_matches>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'companyId', c.id::text, 'items', coalesce(page.items,'[]'::jsonb), 'total',coalesce(page.total,0),
    'observations', case when p_include_sources then career_company_workspace_evidence_v1(c.id,p_query,p_offset,p_limit)
                         else '[]'::jsonb end
  )),'[]'::jsonb)
  from unnest(p_workspaces) c(id) left join lateral (
    select jsonb_agg(career_company_datum_json_v1(d) order by m.pos) items,max(m.total) total
    from matches m join company_datas d on d.id=m.id
    where m.company_workspace_id=c.id and m.pos>greatest(0,p_offset) and m.pos<=greatest(0,p_offset)+greatest(0,p_limit)
  ) page on true
$$;

-- Withdrawal of a source removes the research it supported and every cached copy.
create or replace function public.career_revoke_company_data_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d company_datas; company_id bigint;
begin
  if tg_op='UPDATE' and (new.deleted_at is null or old.deleted_at is not null) then return new; end if;
  for d in delete from company_datas where source_refs @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text)) returning * loop
    perform career_purge_resource_copies_v1(null,'company_datum',d.id::text);
    perform career_purge_resource_copies_v1(null,'company_workspace',d.company_workspace_id::text);
    select company_db_id into company_id from company_workspace where company_workspace_id=d.company_workspace_id;
    if company_id is not null then
      update company_db set public_context=public_context||jsonb_build_object('revokedThroughRevision',public_facts_revision)
        where id=company_id;
      perform career_purge_resource_copies_v1(null,'company',company_id::text);
    end if;
  end loop;
  update company_db set
    linkedin_url=case when public_context->'fieldSources'->'linkedin_url' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
      then null else linkedin_url end,
    linkedin_company_id=case when public_context->'fieldSources'->'linkedin_company_id' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
      then null else linkedin_company_id end
    where public_context->'fieldSources'->'linkedin_url' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
       or public_context->'fieldSources'->'linkedin_company_id' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text));
  return coalesce(new,old);
end $$;

-- Directory companies, plus companies known only by their workspace.
create or replace function public.career_search_resources_v1(p_user uuid,p_source text,p_query text,p_offset integer default 0,p_limit integer default 50)
returns table(ref jsonb,title text,body text,facts jsonb) language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare term text:='%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%';
begin
 if p_offset<0 or p_limit<1 or p_limit>501 then raise exception 'Invalid transport page'; end if;
 if p_source='companies' then
  return query select r.ref,r.title,r.body,r.facts from (
   select jsonb_build_object('kind','company','id',c.id::text,'revision',c.public_facts_revision::text) ref,
    coalesce(c.name,'') title,coalesce(c.short_description,c.description,'') body,
    jsonb_build_object('location',c.location,'website',c.website_url) facts, 0 part, c.id sort_id, null::uuid sort_uuid
   from company_db c where p_query='' or c.name ilike term
    or to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.description,'')||' '||coalesce(c.short_description,'')||' '||coalesce(c.specialities,'')||' '||coalesce(c.location,'')||' '||c.public_context::text) @@ websearch_to_tsquery('simple',p_query)
    or career_company_url_key_v1(c.website_url)=career_company_url_key_v1(case when p_query like '%://%' then p_query else 'https://'||p_query end)
    or exists(select from company_workspace w join company_datas d using(company_workspace_id) where w.company_db_id=c.id
        and (to_tsvector('simple',d.label||' '||d.content) @@ websearch_to_tsquery('simple',p_query) or (d.label||' '||d.content) ilike term))
    or exists(select 1 from career_public_observations linked join documents d on d.id::text=linked.resource_ref->>'id'
      join career_public_observations o on o.id=d.current_observation_id
      where o.deleted_at is null and linked.deleted_at is null and d.source_scope='public' and linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text))
        and (to_tsvector('simple',o.content) @@ websearch_to_tsquery('simple',p_query)
          or d.title ilike term or o.content ilike term))
   union all
   select jsonb_build_object('kind','company_workspace','id',w.company_workspace_id::text),
    coalesce(nullif(btrim(w.published_name),''),w.company_name,''),
    coalesce(split_part((select s.content from company_datas s where s.company_workspace_id=w.company_workspace_id and s.label='summary'),chr(10)||chr(10),1),''),
    jsonb_build_object('website',w.homepage_url), 1, null, w.company_workspace_id
   from company_workspace w where p_query<>'' and w.company_db_id is null and not coalesce(w.is_internal,false)
    and (w.company_name ilike term or w.published_name ilike term
      or exists(select from company_datas d where d.company_workspace_id=w.company_workspace_id
        and (to_tsvector('simple',d.label||' '||d.content) @@ websearch_to_tsquery('simple',p_query) or (d.label||' '||d.content) ilike term)))
  ) r order by r.part,r.sort_id,r.sort_uuid offset p_offset limit p_limit;
 elsif p_source='documents' then
  return query select jsonb_build_object('kind','document','id',d.id::text,'revision',d.revision::text),d.file_name,
    coalesce(d.description,''),jsonb_build_object('kind',d.kind,'updatedAt',d.updated_at)
  from talent_documents d where d.talent_id=p_user and not d.is_deleted
    and (p_query='' or to_tsvector('simple',d.file_name||' '||coalesce(d.description,'')||' '||coalesce(d.extracted_text,'')) @@ websearch_to_tsquery('simple',p_query))
  order by d.id offset p_offset limit p_limit;
 elsif p_source='public_resources' then
  return query select jsonb_build_object('kind','web_resource','id',d.id::text,'revision',o.id::text),coalesce(d.title,d.url,''),
    coalesce(d.excerpt,''),jsonb_build_object('url',o.source_url,'observedAt',o.observed_at,'publishedAt',o.published_at,'sourceFetchedAt',o.source_fetched_at)
  from documents d join career_public_observations o on o.id=d.current_observation_id
  where d.source_scope='public' and o.deleted_at is null
    and (p_query='' or to_tsvector('simple',coalesce(d.title,'')||' '||o.content) @@ websearch_to_tsquery('simple',p_query))
  order by d.id offset p_offset limit p_limit;
 else raise exception 'Unsupported resource search source'; end if;
end $$;

-- A company workspace ref is readable for any public company workspace.
create or replace function public.career_resource_direct_available_v1(p_user uuid,p_ref jsonb)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare target text:=p_ref->>'id'; role_row public.company_roles;
  target_uuid uuid:=(case when pg_input_is_valid(target,'uuid') then target end)::uuid;
  target_directory_id bigint:=(case when pg_input_is_valid(target,'bigint') then target end)::bigint;
begin
 case p_ref->>'kind'
 when 'company_datum' then return exists(select from company_datas d where d.id=target_uuid);
 when 'company_workspace' then return exists(select from company_workspace w where w.company_workspace_id=target_uuid
   and career_company_workspace_public_v1(w));
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

-- Public job indexing no longer needs to skip research-only workspaces.
create or replace function public.career_index_public_job_v1(p_existing_role uuid,p_workspace_id uuid,p_role jsonb,p_workspace jsonb,p_observation uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r company_roles; w company_workspace; o career_public_observations; facts jsonb; fresh boolean:=false;
begin
 select * into o from career_public_observations where id=p_observation and deleted_at is null for share;
 if not found or o.provenance->>'scope'<>'public' then raise exception 'Public source unavailable'; end if;
 if nullif(p_role->>'title','') is null or nullif(p_role->>'companyName','') is null or nullif(p_role->>'description','') is null then raise exception 'Public posting details required'; end if;
 if p_role->>'extractedBy'='manual' then raise exception 'Personal overrides cannot enter public discovery'; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(p_role->>'userSubmittedSourceJobId',p_role->>'canonicalUrl'),0));
 if exists(select 1 from company_roles where external_jd_url=p_role->>'canonicalUrl' and
   (source_type<>'external' or coalesce(information->>'testOnly','false')='true')) then raise exception 'Posting cannot enter public directory'; end if;
 if p_existing_role is not null then
  select * into r from company_roles where role_id=p_existing_role for update;
  if not found or r.source_type<>'external' or coalesce(r.information->>'testOnly','false')='true' then raise exception 'External role unavailable'; end if;
  if r.external_jd_url is distinct from p_role->>'canonicalUrl' and r.source_job_id is distinct from p_role->>'userSubmittedSourceJobId' then raise exception 'Posting identity changed'; end if;
 else
  select * into r from company_roles where source_type='external' and
    (external_jd_url=p_role->>'canonicalUrl' or (source_provider='career_public_discovery' and source_job_id=p_role->>'userSubmittedSourceJobId'))
    order by updated_at desc limit 1 for update;
 end if;
 if r.role_id is not null then
  select * into w from company_workspace where company_workspace_id=r.company_workspace_id for update;
 elsif p_workspace_id is not null then
  select * into w from company_workspace where company_workspace_id=p_workspace_id and not coalesce(is_internal,false) for update;
  if not found then raise exception 'External workspace unavailable'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('public-company:'||coalesce(nullif(p_workspace->>'careerUrl',''),p_role->>'companyName'),0));
  select * into w from company_workspace where not coalesce(is_internal,false) and
    nullif(p_workspace->>'careerUrl','') is not null and career_url=p_workspace->>'careerUrl' limit 1 for update;
  if not found then
   insert into company_workspace(company_name,published_name,company_db_id,career_url,logo_url,external_roles_enabled,has_career_page,is_internal,is_scrape_original)
   values(p_role->>'companyName',p_role->>'companyName',nullif(p_workspace->>'companyDbId','')::bigint,
     nullif(p_workspace->>'careerUrl',''),nullif(p_workspace->>'companyLogoUrl',''),true,
     nullif(p_workspace->>'careerUrl','') is not null,false,false) returning * into w;
  end if;
 end if;
 facts:=jsonb_build_object('publicDiscovery',jsonb_build_object('observationId',p_observation,'sourceUrl',o.source_url,
  'provider',p_role->>'provider','providerJobId',p_role->>'providerJobId','providerCompanyId',p_role->>'providerCompanyId',
  'providerCompanyUrl',p_role->>'providerCompanyUrl','extractedBy',p_role->>'extractedBy','observedAt',o.observed_at));
 if r.role_id is null then
  insert into company_roles(company_workspace_id,name,description,external_jd_url,information,is_expired,expires_at,posted_at,
   location_text,salary_range,source_job_id,source_provider,source_type,status,summary,type,work_mode)
  values(w.company_workspace_id,p_role->>'title',p_role->>'description',p_role->>'canonicalUrl',facts,coalesce(nullif(p_role->>'deadline','')::timestamptz<now(),false),
   nullif(p_role->>'deadline','')::timestamptz,nullif(p_role->>'postedAt','')::timestamptz,p_role->>'location',p_role->>'salaryRange',p_role->>'userSubmittedSourceJobId',
   'career_public_discovery','external','active','{}',array(select jsonb_array_elements_text(coalesce(p_role->'employmentTypes','[]'))),p_role->>'workMode')
  returning * into r; fresh:=true;
 elsif r.source_provider in ('user_submitted','career_public_discovery') then
  update company_roles set name=p_role->>'title',description=p_role->>'description',external_jd_url=p_role->>'canonicalUrl',
   information=facts,location_text=p_role->>'location',salary_range=p_role->>'salaryRange',
   source_provider='career_public_discovery',source_job_id=p_role->>'userSubmittedSourceJobId',
   is_expired=coalesce(nullif(p_role->>'deadline','')::timestamptz<now(),false),expires_at=nullif(p_role->>'deadline','')::timestamptz,
   posted_at=nullif(p_role->>'postedAt','')::timestamptz,expired_at=null,status='active',summary='{}',
   description_summary=null,title_embedding=null,title_embedding_text=null,seniority_level=null,country_code=null,
   salary_min=null,salary_max=null,salary_currency=null,salary_period=null,salary_is_predicted=false,
   type=array(select jsonb_array_elements_text(coalesce(p_role->'employmentTypes','[]'))),work_mode=p_role->>'workMode',updated_at=now()
  where company_roles.role_id=r.role_id returning * into r;
 end if;
 update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','role','id',r.role_id::text))
  where id=p_observation and not about_refs @> jsonb_build_array(jsonb_build_object('kind','role','id',r.role_id::text));
 return jsonb_build_object('roleId',r.role_id,'createdRole',fresh,'searchEnabled',w.external_roles_enabled);
end $$;

revoke all on function public.career_company_site_key_v1(text),public.career_company_workspace_public_v1(public.company_workspace),public.career_company_home_v1(uuid),public.career_company_home_json_v1(uuid),
  public.career_company_datum_json_v1(public.company_datas),public.career_write_company_datum_v1(jsonb,text,text,jsonb,jsonb,uuid),
  public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid),
  public.career_finish_company_summary_v1(text,uuid,jsonb,text,jsonb,jsonb),public.career_read_company_datum_v1(jsonb),
  public.career_read_company_datas_v2(uuid[],text[],integer,integer),
  public.career_company_workspace_evidence_v1(uuid,text,integer,integer),
  public.career_read_company_topic_evidence_v2(uuid[],text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.career_company_site_key_v1(text),public.career_company_workspace_public_v1(public.company_workspace),public.career_company_home_v1(uuid),public.career_company_home_json_v1(uuid),
  public.career_company_datum_json_v1(public.company_datas),public.career_write_company_datum_v1(jsonb,text,text,jsonb,jsonb,uuid),
  public.career_write_employer_datum_v1(uuid,jsonb,text,text,jsonb,jsonb,uuid),
  public.career_finish_company_summary_v1(text,uuid,jsonb,text,jsonb,jsonb),public.career_read_company_datum_v1(jsonb),
  public.career_read_company_datas_v2(uuid[],text[],integer,integer),
  public.career_company_workspace_evidence_v1(uuid,text,integer,integer),
  public.career_read_company_topic_evidence_v2(uuid[],text,integer,integer,boolean) to service_role;
