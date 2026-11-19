-- Company identity and the public workspace marker/index are installed first.
create table public.company_datas (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete restrict,
  label text not null,
  content text not null,
  facts jsonb,
  source_refs jsonb not null check (jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs)>0),
  checked_at timestamptz not null default now(),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index company_datas_summary on public.company_datas(company_workspace_id) where label='summary';
create index company_datas_read on public.company_datas(company_workspace_id,label,checked_at desc,id);
create index company_datas_sources on public.company_datas using gin(source_refs);
create index company_datas_text on public.company_datas using gin(to_tsvector('simple',label||' '||content));
-- Literal names in Korean source text can carry a grammatical ending, which
-- the simple full-text configuration treats as part of the same token.
create index company_datas_substring on public.company_datas using gin((label||' '||content) public.gin_trgm_ops);
alter table public.company_datas enable row level security;
revoke all on public.company_datas from public,anon,authenticated;
grant select,insert,update,delete on public.company_datas to service_role;

create function public.career_guard_company_home_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if (new.is_public_data_home or (tg_op='UPDATE' and old.is_public_data_home))
      and current_user in ('anon','authenticated') then
    raise exception 'Public data homes are managed by the directory' using errcode='42501';
  end if;
  if tg_op='UPDATE' and new.is_public_data_home and not old.is_public_data_home and (
    exists(select from company_roles where company_workspace_id=old.company_workspace_id) or
    exists(select from company_user_workspace where company_workspace_id=old.company_workspace_id) or
    exists(select from company_workspace_invitations where company_workspace_id=old.company_workspace_id) or
    exists(select from company_workspace_teams where company_workspace_id=old.company_workspace_id)
  ) then raise exception 'A tenant or recruiting workspace cannot become a public data home'; end if;
  if tg_op='UPDATE' and old.is_public_data_home and
     (old.company_db_id,old.is_public_data_home) is distinct from (new.company_db_id,new.is_public_data_home)
     and exists(select from company_datas where company_workspace_id=old.company_workspace_id) then
    raise exception 'Move the public company material before reassigning its workspace';
  end if;
  return new;
end $$;
create trigger career_guard_company_home before insert or update of is_public_data_home, company_db_id
  on public.company_workspace for each row execute function public.career_guard_company_home_v1();

create function public.career_exact_company_sources_v1(p_refs jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare ref jsonb; observation career_public_observations; result jsonb:='[]'; exact_ref jsonb;
begin
  if jsonb_typeof(p_refs) is distinct from 'array' or jsonb_array_length(p_refs)=0 then
    raise exception 'Public source observations required';
  end if;
  for ref in select value from jsonb_array_elements(p_refs) order by value->>'id' loop
    select o.* into observation from documents d join career_public_observations o
      on o.resource_ref->>'kind'='web_resource' and o.resource_ref->>'id'=d.id::text
      where d.source_scope='public' and o.provenance->>'scope'='public' and o.deleted_at is null
        and case ref->>'kind'
          when 'observation' then o.id=(ref->>'id')::uuid and
            (ref->>'revision' is null or o.content_hash=ref->>'revision')
          when 'web_resource' then d.id=(ref->>'id')::bigint and
            o.id=coalesce((ref->>'revision')::uuid,d.current_observation_id)
          else false end
      for share of d for no key update of o;
    if not found then raise exception 'Public source version unavailable' using errcode='42501'; end if;
    exact_ref:=jsonb_build_object('kind','observation','id',observation.id::text);
    if not result @> jsonb_build_array(exact_ref) then result:=result||jsonb_build_array(exact_ref); end if;
  end loop;
  return result;
end $$;

create function public.career_company_ref_v1(p_company public.company_db) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('kind','company','id',p_company.id::text,'revision',p_company.public_facts_revision::text)
$$;
create function public.career_resolve_public_company_v1(p_target jsonb) returns jsonb
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

create function public.career_company_datum_json_v1(d public.company_datas) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_strip_nulls(jsonb_build_object('dataRef',jsonb_build_object('kind','company_datum','id',d.id::text,
    'revision',d.revision::text),'label',d.label,'content',d.content,'facts',d.facts,'sourceRefs',d.source_refs,'checkedAt',d.checked_at,
    'sources',(select jsonb_agg(jsonb_build_object('ref',r.ref,'url',o.source_url,'title',doc.title)
        order by r.ord) from jsonb_array_elements(d.source_refs) with ordinality r(ref,ord)
      join career_public_observations o on o.id=(r.ref->>'id')::uuid
      join documents doc on o.resource_ref->>'id'=doc.id::text
      where o.deleted_at is null and doc.source_scope='public')))
$$;
create function public.career_read_company_datum_v1(p_data_ref jsonb) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare d company_datas; c company_db;
begin
  if p_data_ref->>'kind' is distinct from 'company_datum' then return '{"status":"missing"}'; end if;
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

create function public.career_read_company_datas_v1(p_companies bigint[],p_labels text[],p_offset integer,p_limit integer) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(result order by ord),'[]') from (
    select c.ord, jsonb_build_object('companyRef',career_company_ref_v1(cd),'name',cd.name,'summary',s.summary,
      'labels',coalesce(s.labels,'[]'),'items',coalesce(page.items,'[]'),'total',coalesce(s.total,0)) result
    from unnest(p_companies) with ordinality c(id,ord) join company_db cd on cd.id=c.id
    left join company_workspace w on w.company_db_id=c.id and w.is_public_data_home
    left join lateral (
      select (jsonb_agg(career_company_datum_json_v1(d)) filter(where d.label='summary'))->0 summary,
        jsonb_agg(distinct d.label order by d.label) labels,
        count(*) filter(where p_labels is not null and (cardinality(p_labels)=0 or d.label=any(p_labels))) total
        from company_datas d where d.company_workspace_id=w.company_workspace_id
    ) s on true
    left join lateral (
      select jsonb_agg(career_company_datum_json_v1(data.item) order by data.checked_at desc,data.id) items from (
        select d as item,d.checked_at,d.id from company_datas d where d.company_workspace_id=w.company_workspace_id and
          p_labels is not null and (cardinality(p_labels)=0 or d.label=any(p_labels))
        order by d.checked_at desc,d.id offset greatest(0,p_offset) limit greatest(0,p_limit)
      ) data
    ) page on true
  ) found
$$;

create function public.career_write_company_datum_v1(
  p_target jsonb,p_label text,p_content text,p_source_refs jsonb,p_data_ref jsonb,p_request_id uuid,
  p_facts jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  refs jsonb; resolved jsonb; c company_db; d company_datas; w_id uuid;
  data_id uuid:=coalesce((p_data_ref->>'id')::uuid,p_request_id,gen_random_uuid());
  website text:=nullif(btrim(p_target->>'officialWebsite'),''); linkedin text:=nullif(btrim(p_target->>'linkedinUrl'),'');
  linkedin_id bigint:=nullif(p_target->>'linkedinCompanyId','')::bigint;
  company_name text:=nullif(btrim(p_target->>'name'),''); source_map jsonb; observation_ids uuid[]; proven jsonb;
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

  if p_target->>'kind' is null then
    if website is not null and career_company_url_key_v1(website) is null then raise exception 'Invalid official website'; end if;
    if linkedin is not null and coalesce(career_company_url_key_v1(linkedin),'') !~ '^(www\.)?linkedin\.com/company/[^/]+$' then
      raise exception 'Invalid LinkedIn company URL';
    end if;
    -- Sorted identity locks also serialize a second discovery using a different
    -- member of the same supplied identifier set.
    perform pg_advisory_xact_lock(hashtextextended(lock_key,0)) from (
      select distinct key lock_key from unnest(array[
        'company-directory:'||website, 'career-website:'||career_company_url_key_v1(website),
        'career-linkedin:'||career_company_url_key_v1(linkedin), 'career-linkedin-id:'||linkedin_id::text
      ]) key where key is not null order by key
    ) identity_locks;
  end if;
  resolved:=career_resolve_public_company_v1(p_target);
  if p_target->>'kind' is null and website is null and linkedin is null and linkedin_id is null then
    -- A bare name needs a company link or the exact employer's official source.
    -- Compare official website paths too: a shared hosting domain by itself
    -- cannot distinguish multiple employers.
    select coalesce(jsonb_agg(candidate),'[]') into proven
      from jsonb_array_elements(case when resolved->>'status'='found' then jsonb_build_array(resolved-'status')
        else coalesce(resolved->'candidates','[]') end) candidate
      join company_db cd on cd.id=(candidate->'companyRef'->>'id')::bigint
      where exists(select from career_public_observations o
        cross join lateral (select career_company_url_key_v1(o.source_url) url_key) page
        cross join lateral (select career_company_url_key_v1(cd.website_url) site) company
        where o.id=any(observation_ids) and (
          o.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',cd.id::text))
          or (page.url_key=career_company_url_key_v1(cd.linkedin_url))
          or ((page.url_key=company.site or starts_with(page.url_key,company.site||'/')) and not exists(
            select from company_db other where other.id<>cd.id and career_company_url_key_v1(other.website_url)=company.site))
        ));
    if jsonb_array_length(proven)=1 then resolved:=(proven->0)||'{"status":"found"}'::jsonb;
    elsif resolved->>'status'='found' then
      return jsonb_build_object('status','ambiguous','candidates',jsonb_build_array(resolved-'status'),
        'reason','Confirm the public employer identity for this material');
    end if;
  end if;
  if resolved->>'status'='found' then
    select * into c from company_db where id=(resolved->'companyRef'->>'id')::bigint for update;
    if not found then return '{"status":"missing"}'; end if;
  elsif resolved->>'status'='missing' and p_target->>'kind' is null and company_name is not null
        and (website is not null or linkedin_id is not null or linkedin is not null) and p_data_ref is null then
    if website is null and not exists(select from career_public_observations o where o.id=any(observation_ids) and
      career_company_url_key_v1(o.source_url) in (career_company_url_key_v1(linkedin),
      'linkedin.com/company/'||linkedin_id::text,'www.linkedin.com/company/'||linkedin_id::text)) then
      return jsonb_build_object('status','missing','reason','The new company requires its official website or independently verified LinkedIn identity');
    end if;
    source_map:=jsonb_strip_nulls(jsonb_build_object('name',refs,'website_url',case when website is not null then refs end,
        'linkedin_url',case when linkedin is not null then refs end,'linkedin_company_id',case when linkedin_id is not null then refs end));
    insert into company_db(name,website_url,linkedin_url,linkedin_company_id,public_context)
      values(company_name,website,linkedin,linkedin_id,jsonb_build_object('fieldSources',source_map,'sourceRefs',refs))
      returning * into c;
  else return resolved; end if;

  select company_workspace_id into w_id from company_workspace where company_db_id=c.id and is_public_data_home for update;
  if w_id is null and p_data_ref is not null then return '{"status":"missing"}'; end if;
  if w_id is null then
    -- Name and URLs stay on company_db. Legacy name/URL-based importers must
    -- not mistake this dedicated holder for a recruiting or customer workspace.
    insert into company_workspace(company_name,company_db_id,external_roles_enabled,is_internal,is_scrape_original,has_career_page,is_public_data_home)
      values('',c.id,false,false,false,false,true) returning company_workspace_id into w_id;
  end if;

  select * into d from company_datas where id=data_id for update;
  if found and d.company_workspace_id<>w_id then raise exception 'Material belongs to another company'; end if;
  if p_data_ref is not null and d.id is null then return '{"status":"missing"}'; end if;
  if p_data_ref is null and d.id is null and p_label='summary' then
    select * into d from company_datas where company_workspace_id=w_id and label='summary' for update;
  end if;
  if d.id is not null then
    if (p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision') and (d.label,d.content,d.source_refs,d.facts) is not distinct from (p_label,p_content,refs,p_facts) then
      return jsonb_build_object('status','unchanged','companyRef',career_company_ref_v1(c))||career_company_datum_json_v1(d);
    end if;
    if p_data_ref is null or d.revision::text is distinct from p_data_ref->>'revision' then
      return jsonb_build_object('status','conflict','companyRef',career_company_ref_v1(c),'current',career_company_datum_json_v1(d),
        'dataRef',career_company_datum_json_v1(d)->'dataRef');
    end if;
    if p_label='summary' and d.label<>'summary' and exists(select from company_datas where company_workspace_id=w_id and label='summary') then
      raise exception 'Company summary already exists';
    end if;
    update company_datas set label=p_label,content=p_content,source_refs=refs,facts=p_facts,
      checked_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 where id=d.id returning * into d;
  else
    insert into company_datas(id,company_workspace_id,label,content,source_refs,facts)
      values(data_id,w_id,p_label,p_content,refs,p_facts) returning * into d;
  end if;

  update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text))
    where id=any(observation_ids) and not about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text));
  -- A reused source may already be linked, including edits that only change
  -- the datum content. Always invalidate the company's text/vector projection.
  update company_db set public_context=public_context where id=c.id returning * into c;
  return jsonb_build_object('status','saved','companyRef',career_company_ref_v1(c))||career_company_datum_json_v1(d);
end $$;

-- Source withdrawal takes precedence over every cached projection. Explicitly
-- purge company snapshots too: older callers may only have retained a company ref.
create function public.career_revoke_company_data_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare d company_datas; company_id bigint;
begin
  if tg_op='UPDATE' and (new.deleted_at is null or old.deleted_at is not null) then return new; end if;
  for d in delete from company_datas where source_refs @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text)) returning * loop
    select company_db_id into company_id from company_workspace where company_workspace_id=d.company_workspace_id;
    perform career_purge_resource_copies_v1(null,'company_datum',d.id::text);
    update company_db set public_context=public_context||jsonb_build_object('revokedThroughRevision',public_facts_revision)
      where id=company_id;
    perform career_purge_resource_copies_v1(null,'company',company_id::text);
  end loop;
  -- The original field revocation trigger handles name/website and clears
  -- fieldSources. Clear any public LinkedIn fields acquired by this writer first.
  update company_db set
    linkedin_url=case when public_context->'fieldSources'->'linkedin_url' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
      then null else linkedin_url end,
    linkedin_company_id=case when public_context->'fieldSources'->'linkedin_company_id' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
      then null else linkedin_company_id end
    where public_context->'fieldSources'->'linkedin_url' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text))
       or public_context->'fieldSources'->'linkedin_company_id' @> jsonb_build_array(jsonb_build_object('kind','observation','id',old.id::text));
  return coalesce(new,old);
end $$;
create trigger career_revoke_company_data before update of deleted_at or delete on public.career_public_observations
  for each row execute function public.career_revoke_company_data_v1();

-- The same protection applies to old API clients that know a workspace UUID.
create function public.career_forbid_tenant_use_of_data_home_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Lock the referenced workspace even when it currently has the ordinary role.
  -- This serializes concurrent changes to its marker with membership/role writes.
  if (select is_public_data_home from public.company_workspace where company_workspace_id=new.company_workspace_id for share) then
    raise exception 'A public directory data home cannot own a Role, team, invitation or membership' using errcode='42501';
  end if;
  return new;
end $$;
create trigger career_no_data_home_role before insert or update of company_workspace_id on public.company_roles
  for each row execute function public.career_forbid_tenant_use_of_data_home_v1();
create trigger career_no_data_home_member before insert or update of company_workspace_id on public.company_user_workspace
  for each row execute function public.career_forbid_tenant_use_of_data_home_v1();
create trigger career_no_data_home_invite before insert or update of company_workspace_id on public.company_workspace_invitations
  for each row execute function public.career_forbid_tenant_use_of_data_home_v1();
create trigger career_no_data_home_team before insert or update of company_workspace_id on public.company_workspace_teams
  for each row execute function public.career_forbid_tenant_use_of_data_home_v1();

create or replace function public.career_search_resources_v1(p_user uuid,p_source text,p_query text,p_offset integer default 0,p_limit integer default 50)
returns table(ref jsonb,title text,body text,facts jsonb) language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare term text:='%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%';
begin
 if p_offset<0 or p_limit<1 or p_limit>501 then raise exception 'Invalid transport page'; end if;
 if p_source='companies' then
  return query select jsonb_build_object('kind','company','id',c.id::text,'revision',c.public_facts_revision::text),
    coalesce(c.name,''),coalesce(c.short_description,c.description,''),
    jsonb_build_object('location',c.location,'website',c.website_url)
  from company_db c where p_query='' or c.name ilike '%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%'
   or to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.description,'')||' '||coalesce(c.short_description,'')||' '||coalesce(c.specialities,'')||' '||coalesce(c.location,'')||' '||c.public_context::text) @@ websearch_to_tsquery('simple',p_query)
   or career_company_url_key_v1(c.website_url)=career_company_url_key_v1(case when p_query like '%://%' then p_query else 'https://'||p_query end)
   or exists(select from company_workspace w join company_datas d using(company_workspace_id) where w.company_db_id=c.id
       and w.is_public_data_home and (to_tsvector('simple',d.label||' '||d.content) @@ websearch_to_tsquery('simple',p_query)
         or (d.label||' '||d.content) ilike term))
   or exists(select 1 from career_public_observations linked join documents d on d.id::text=linked.resource_ref->>'id'
     join career_public_observations o on o.id=d.current_observation_id
     where o.deleted_at is null and linked.deleted_at is null and d.source_scope='public' and linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text))
       and (to_tsvector('simple',o.content) @@ websearch_to_tsquery('simple',p_query)
         or d.title ilike term or o.content ilike term))
  order by c.id offset p_offset limit p_limit;
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

create or replace function public.career_lock_cache_sources_v1(p_user uuid,p_value jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;
begin
 for r in select value from career_json_resource_refs_v1(p_value) value
  where value->>'kind' in ('company','role','document','memory','profile','message','operation','opportunity','observation','web_resource')
  order by value->>'kind',value->>'id' loop
  case r->>'kind'
   when 'company_datum' then perform 1 from company_datas where id::text=r->>'id' for share;
   when 'company_workspace' then perform 1 from company_workspace where company_workspace_id::text=r->>'id' for share;
   when 'company' then perform 1 from company_db where id::text=r->>'id' for share;
   when 'role' then perform 1 from company_roles where role_id::text=r->>'id' for share;
   when 'document' then perform 1 from talent_documents where id::text=r->>'id' and talent_id=p_user for share;
   when 'memory' then perform 1 from talent_contexts where id::text=r->>'id' and talent_id=p_user for share;
   when 'profile' then perform 1 from talent_profiles where id::text=r->>'id' and talent_id=p_user for share;
   when 'message' then perform 1 from talent_messages where id::text=r->>'id' and user_id=p_user for share;
   when 'operation' then perform 1 from talent_external_operations where id::text=r->>'id' and user_id=p_user for share;
   when 'opportunity' then perform 1 from career_opportunities where id::text=r->>'id' and talent_id=p_user for share;
   when 'observation' then perform 1 from career_public_observations where id::text=r->>'id' for share;
   when 'web_resource' then perform 1 from documents where id::text=r->>'id' for share;
  end case;
  if not career_resource_available_v1(p_user,r) then raise exception 'Source unavailable while saving cached content' using errcode='42501'; end if;
 end loop;
end $$;

create or replace function public.career_retire_resource_cache_v1(p_before timestamptz,p_limit integer default 1000)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='25s' as $$
declare sets_removed integer;ops_removed integer;observations_removed integer;
begin
 if p_before>now()-interval '30 days' or p_limit<1 or p_limit>1000 then raise exception 'Invalid cache retention batch';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('career-resource-retention',0)) then return '{"busy":true}';end if;
 -- A root cannot change between marking and deletion. NOWAIT keeps maintenance
 -- from waiting behind user work; the next daily run retries a busy snapshot.
 begin
  lock table career_opportunities,career_views,career_result_sets,career_result_items,career_public_observations,
   documents,talent_external_operations,talent_agent_schedules,talent_documents,talent_contexts,talent_messages,
   talent_profile_revisions,talent_role_materials,career_action_items,company_db,company_roles,company_datas in share row exclusive mode nowait;
 exception when lock_not_available then return '{"busy":true}';end;
 create temporary table career_retention_edges(parent text,child text) on commit drop;
 create temporary table career_retention_roots(key text primary key) on commit drop;
 insert into career_retention_edges
 select 'operation:'||o.id,r from talent_external_operations o cross join lateral career_cache_reference_keys_v1(to_jsonb(o)) r
 union select 'set:'||s.id||':'||s.revision,r from career_result_sets s cross join lateral career_cache_reference_keys_v1(to_jsonb(s)) r
 union select 'set:'||i.set_id||':'||i.set_revision,r from career_result_items i cross join lateral career_cache_reference_keys_v1(to_jsonb(i)) r
 union select 'set:'||s.id||':*','set:'||s.id||':'||s.revision from career_result_sets s;
 create index on career_retention_edges(parent);
 insert into career_retention_roots
 select distinct key from (
  select r key from career_opportunities o cross join lateral career_cache_reference_keys_v1(to_jsonb(o)) r where o.deleted_at is null
  union select r from career_views v cross join lateral career_cache_reference_keys_v1(to_jsonb(v)) r
  union select 'operation:'||id from talent_external_operations where
   status in ('reserved','running','dispatching','uncertain','waiting','waiting_user','waiting_external','ready')
   or kind not in ('resource_item','resource_research','resource_evaluation','resource_search','public_discovery_event','delegated_work')
  union select r from talent_agent_schedules s cross join lateral career_cache_reference_keys_v1(to_jsonb(s)) r where s.status='active'
  union select r from talent_documents d cross join lateral career_cache_reference_keys_v1(to_jsonb(d)) r where not d.is_deleted
  union select r from talent_contexts c cross join lateral career_cache_reference_keys_v1(to_jsonb(c)) r where c.deleted_at is null
  union select r from talent_messages m cross join lateral career_cache_reference_keys_v1(m.payload) r
  union select r from talent_profile_revisions p cross join lateral career_cache_reference_keys_v1(to_jsonb(p)) r
  union select r from talent_role_materials m cross join lateral career_cache_reference_keys_v1(to_jsonb(m)) r
  union select r from career_action_items a cross join lateral career_cache_reference_keys_v1(to_jsonb(a)) r
  union select 'observation:'||current_observation_id from documents where current_observation_id is not null
  union select r from company_datas d cross join lateral career_cache_reference_keys_v1(d.source_refs) r
  union select r from company_db c cross join lateral career_cache_reference_keys_v1(c.public_context) r
  union select r from company_roles role cross join lateral career_cache_reference_keys_v1(role.information) r
  -- New intermediate artifacts can be resumed and are themselves roots until
  -- their cache window elapses, preserving the old evidence they reference.
  union select 'set:'||id||':'||revision from career_result_sets where created_at>=p_before
  union select 'operation:'||id from talent_external_operations where created_at>=p_before
 ) roots where key is not null on conflict do nothing;
 create temporary table career_retention_live(key text primary key) on commit drop;
 insert into career_retention_live with recursive live(key) as (
  select key from career_retention_roots union select e.child from live l join career_retention_edges e on e.parent=l.key
 ) select key from live;
 delete from career_result_sets where (id,revision) in (
  select id,revision from career_result_sets s where created_at<p_before and not exists(select 1 from career_retention_live l where l.key='set:'||s.id||':'||s.revision)
  order by created_at,id,revision limit p_limit);
 get diagnostics sets_removed=row_count;
 delete from talent_external_operations where id in (
  select o.id from talent_external_operations o where kind in ('resource_item','resource_research','resource_evaluation','resource_search')
   and o.request->>'searchReceipt' is distinct from 'true'
   and created_at<p_before and not exists(select 1 from career_retention_live l where l.key='operation:'||o.id)
   and not exists(select 1 from talent_external_operations child where child.parent_id=o.id)
  order by created_at,id limit p_limit);
 get diagnostics ops_removed=row_count;
 delete from career_public_observations where id in (
  select o.id from career_public_observations o where observed_at<p_before
   and not exists(select 1 from career_retention_live l where l.key='observation:'||o.id)
  order by observed_at,id limit p_limit);
 get diagnostics observations_removed=row_count;
 return jsonb_build_object('sets',sets_removed,'operations',ops_removed,'observations',observations_removed,'before',p_before);
end $$;

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
 elsif p_workspace_id is not null and not exists(select from company_workspace where company_workspace_id=p_workspace_id and is_public_data_home) then
  select * into w from company_workspace where company_workspace_id=p_workspace_id and not coalesce(is_internal,false) and not is_public_data_home for update;
  if not found then raise exception 'External workspace unavailable'; end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('public-company:'||coalesce(nullif(p_workspace->>'careerUrl',''),p_role->>'companyName'),0));
  select * into w from company_workspace where not coalesce(is_internal,false) and not is_public_data_home and
    nullif(p_workspace->>'careerUrl','') is not null and career_url=p_workspace->>'careerUrl' limit 1 for update;
  if not found then
   insert into company_workspace(company_name,published_name,company_db_id,career_url,logo_url,external_roles_enabled,has_career_page,is_internal,is_scrape_original)
   values(p_role->>'companyName',p_role->>'companyName',nullif(p_workspace->>'companyDbId','')::bigint,
     nullif(p_workspace->>'careerUrl',''),nullif(p_workspace->>'companyLogoUrl',''),true,
     nullif(p_workspace->>'careerUrl','') is not null,false,false) returning * into w;
  end if;
 end if;
 -- An existing disabled directory remains disabled. The source carries only
 -- independently rebuilt public facts, never old submittedTalentIds or reports.
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

revoke all on function public.career_guard_company_home_v1(),public.career_forbid_tenant_use_of_data_home_v1(),
  public.career_exact_company_sources_v1(jsonb),public.career_company_url_key_v1(text),
  public.career_company_ref_v1(public.company_db),public.career_resolve_public_company_v1(jsonb),
  public.career_company_datum_json_v1(public.company_datas),public.career_read_company_datum_v1(jsonb),
  public.career_read_company_datas_v1(bigint[],text[],integer,integer),
  public.career_write_company_datum_v1(jsonb,text,text,jsonb,jsonb,uuid,jsonb),
  public.career_revoke_company_data_v1() from public,anon,authenticated;
grant execute on function public.career_exact_company_sources_v1(jsonb),public.career_company_url_key_v1(text),
  public.career_company_ref_v1(public.company_db),public.career_resolve_public_company_v1(jsonb),
  public.career_company_datum_json_v1(public.company_datas),public.career_read_company_datum_v1(jsonb),
  public.career_read_company_datas_v1(bigint[],text[],integer,integer),
  public.career_write_company_datum_v1(jsonb,text,text,jsonb,jsonb,uuid,jsonb) to service_role;

-- A caller from before the data-home marker may pass the directory workspace
-- selected by company_db_id. Let the existing importer perform its normal public
-- career URL lookup or create the posting workspace; keep all its receipt logic.
alter function public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean) rename to import_talent_job_link_core_v1;
create function public.import_talent_job_link(p_talent_id uuid,p_saved_stage text,p_existing_role_id uuid,p_workspace_id uuid,
  p_role jsonb,p_workspace jsonb,p_preserve_existing_progress boolean default false)
returns table(role_id uuid,recommendation_id uuid,role_source_provider text,created_role boolean,created_workspace boolean,
  created_recommendation boolean,saved_stage text)
language sql security invoker set search_path=public,pg_temp as $$
  select * from public.import_talent_job_link_core_v1(p_talent_id,p_saved_stage,p_existing_role_id,case when exists(
    select from public.company_workspace where company_workspace_id=p_workspace_id and is_public_data_home
  ) then null else p_workspace_id end,p_role,p_workspace,p_preserve_existing_progress)
$$;
revoke all on function public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean) to service_role;
