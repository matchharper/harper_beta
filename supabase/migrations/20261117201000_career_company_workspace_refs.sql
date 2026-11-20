-- Career reads, searches and recommends a company by its company_workspace.
-- A directory company (company_db) gets its workspace the first time Career
-- returns it, using the same home choice, lock and row shape as a company write.
-- Requires 20261117160000_career_company_workspace_hub.sql.
create or replace function public.career_company_workspaces_for_directory_v1(p_companies bigint[])
returns table(company_id bigint, company_workspace_id uuid)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c_id bigint; w uuid;
begin
  for c_id in select distinct x from unnest(p_companies) x where x is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('career-company-directory:'||c_id,0));
    select career_company_home_v1(cw.company_workspace_id) into w from company_workspace cw
      where cw.company_db_id=c_id order by coalesce(cw.is_internal,false), cw.created_at, cw.company_workspace_id limit 1;
    -- A workspace recorded before its directory entry is the same company when their links match.
    if w is null then
      select career_company_home_v1(cw.company_workspace_id) into w from company_workspace cw
        join company_db c on c.id=c_id
        where cw.company_db_id is null and career_company_workspace_public_v1(cw)
          and (career_company_site_key_v1(cw.homepage_url)=career_company_site_key_v1(c.website_url)
            or career_company_site_key_v1(cw.linkedin_url)=career_company_site_key_v1(c.linkedin_url))
        order by cw.created_at, cw.company_workspace_id limit 1;
    end if;
    if w is null then
      insert into company_workspace(company_name,company_db_id,homepage_url,linkedin_url,external_roles_enabled,is_internal,is_scrape_original,has_career_page)
        select coalesce(nullif(btrim(c.name),''),'Unknown company'),c.id,c.website_url,c.linkedin_url,false,false,false,false
        from company_db c where c.id=c_id
        returning company_workspace.company_workspace_id into w;
    end if;
    if w is not null then
      company_id:=c_id; company_workspace_id:=w; return next;
    end if;
  end loop;
end $$;

revoke all on function public.career_company_workspaces_for_directory_v1(bigint[]) from public, anon, authenticated;
grant execute on function public.career_company_workspaces_for_directory_v1(bigint[]) to service_role;

-- Company search returns workspaces. Each matching path is a set read on its own
-- index (directory full text and name trigram, workspace name, research text,
-- linked public sources), so a common word does not rescan sources per company.
-- A directory company without a workspace is returned as a company_db ref only so
-- the server can give it a workspace (career_company_workspaces_for_directory_v1)
-- before the result reaches the model.
create or replace function public.career_search_resources_v1(p_user uuid,p_source text,p_query text,p_offset integer default 0,p_limit integer default 50)
returns table(ref jsonb,title text,body text,facts jsonb) language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare term text:='%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%';
  tq tsquery:=websearch_to_tsquery('simple',coalesce(p_query,''));
  -- Only a domain-like query is compared as an official site.
  site text:=case when p_query ~ '\.' then career_company_site_key_v1(case when p_query like '%://%' then p_query else 'https://'||p_query end) end;
begin
 if p_offset<0 or p_limit<1 or p_limit>501 then raise exception 'Invalid transport page'; end if;
 if p_source='companies' then
  return query
  with directory_hits as (
    select c.id, 1 as score from company_db c where p_query<>'' and lower(btrim(c.name))=lower(btrim(p_query))
    union all select c.id, 2 from company_db c where p_query<>'' and c.name ilike term
    union all select c.id, 3 from company_db c where p_query<>'' and to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.description,'')||' '||coalesce(c.short_description,'')||' '||coalesce(c.specialities,'')||' '||coalesce(c.location,'')||' '||c.public_context::text) @@ tq
    union all select c.id, 1 from company_db c where site is not null and career_company_url_key_v1(c.website_url)=career_company_url_key_v1(case when p_query like '%://%' then p_query else 'https://'||p_query end)
  ), source_hits as (
    select a.value as about from career_public_observations linked
      join documents d on d.id::text=linked.resource_ref->>'id'
      join career_public_observations o on o.id=d.current_observation_id
      cross join lateral jsonb_array_elements(linked.about_refs) a
    where p_query<>'' and o.deleted_at is null and linked.deleted_at is null and d.source_scope='public'
      and a.value->>'kind' in ('company','company_workspace')
      and (to_tsvector('simple',o.content) @@ tq or d.title ilike term or o.content ilike term)
  ), workspace_hits as (
    select w.company_workspace_id, 1 as score from company_workspace w where p_query<>'' and lower(btrim(w.company_name))=lower(btrim(p_query))
    union all select w.company_workspace_id, 2 from company_workspace w where p_query<>'' and (w.company_name ilike term or w.published_name ilike term)
    union all select d.company_workspace_id, 3 from company_datas d where p_query<>'' and to_tsvector('simple',d.label||' '||d.content) @@ tq
    union all select d.company_workspace_id, 3 from company_datas d where p_query<>'' and (d.label||' '||d.content) ilike term
    union all select w.company_workspace_id, 1 from company_workspace w where site is not null and career_company_site_key_v1(w.homepage_url)=site
    union all select (s.about->>'id')::uuid, 4 from source_hits s where s.about->>'kind'='company_workspace' and pg_input_is_valid(s.about->>'id','uuid')
    union all select w.company_workspace_id, h.score from (
        select id, min(score) score from directory_hits group by id
        union all select (s.about->>'id')::bigint, 4 from source_hits s where s.about->>'kind'='company' and pg_input_is_valid(s.about->>'id','bigint')
      ) h join company_workspace w on w.company_db_id=h.id
    union all select w.company_workspace_id, 9 from company_workspace w where p_query=''
  ), homes as (
    select career_company_home_v1(h.company_workspace_id) as company_workspace_id, min(h.score) score
    from workspace_hits h group by 1
  ), directory_only as (
    select h.id, min(h.score) score from (
      select id, score from directory_hits
      union all select (s.about->>'id')::bigint, 4 from source_hits s where s.about->>'kind'='company' and pg_input_is_valid(s.about->>'id','bigint')
    ) h where not exists(select 1 from company_workspace w where w.company_db_id=h.id)
    group by h.id
  ), ranked as (
    select jsonb_build_object('kind','company_workspace','id',w.company_workspace_id::text) ref,
      coalesce(nullif(btrim(w.published_name),''),nullif(btrim(w.company_name),''),c.name,'') title,
      coalesce(nullif(split_part((select s.content from company_datas s where s.company_workspace_id=w.company_workspace_id and s.label='summary'),chr(10)||chr(10),1),''),
        c.short_description,c.description,w.company_description,'') body,
      jsonb_strip_nulls(jsonb_build_object('location',c.location,'website',coalesce(nullif(btrim(w.homepage_url),''),c.website_url))) facts,
      h.score, w.company_workspace_id::text sort_key
    from homes h join company_workspace w on w.company_workspace_id=h.company_workspace_id
      left join company_db c on c.id=w.company_db_id
    where career_company_workspace_public_v1(w)
    union all
    select jsonb_build_object('kind','company','id',c.id::text,'revision',c.public_facts_revision::text),
      coalesce(c.name,''),coalesce(c.short_description,c.description,''),
      jsonb_strip_nulls(jsonb_build_object('location',c.location,'website',c.website_url)), d.score, lpad(c.id::text,20,'0')
    from directory_only d join company_db c on c.id=d.id
  )
  select r.ref,r.title,r.body,r.facts from ranked r order by r.score, r.sort_key offset p_offset limit p_limit;
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
