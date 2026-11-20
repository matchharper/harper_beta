-- Shared public imports are separate from a user's recommendation/feedback.
create function public.career_index_public_job_v1(p_existing_role uuid,p_workspace_id uuid,p_role jsonb,p_workspace jsonb,p_observation uuid)
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
revoke all on function public.career_index_public_job_v1(uuid,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.career_index_public_job_v1(uuid,uuid,jsonb,jsonb,uuid) to service_role;

create function public.career_upsert_public_company_v1(p_id bigint,p_revision bigint,p_fields jsonb,p_source_refs jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c company_db; ref jsonb; ids uuid[]:='{}'; field_sources jsonb;
begin
 for ref in select value from jsonb_array_elements(p_source_refs) loop
  perform 1 from career_public_observations where id::text=ref->>'id' and deleted_at is null and provenance->>'scope'='public' for share;
  if ref->>'kind'<>'observation' or not found then
   raise exception 'Company facts require public observation references';
  end if;
  ids:=array_append(ids,(ref->>'id')::uuid);
 end loop;
 if cardinality(ids)=0 then raise exception 'Public evidence required'; end if;
 select coalesce(jsonb_object_agg(key,p_source_refs),'{}') into field_sources from jsonb_each(p_fields)
  where key in ('name','description','website_url','location') and value<>'null'::jsonb;
 perform pg_advisory_xact_lock(hashtextextended('company-directory:'||coalesce(p_id::text,p_fields->>'website_url',p_fields->>'name'),0));
 if p_id is not null then
  select * into c from company_db where id=p_id for update;
  if not found then raise exception 'Company unavailable'; end if;
  if c.public_facts_revision<>p_revision then raise exception 'Company revision conflict' using errcode='40001'; end if;
 else
  if nullif(p_fields->>'website_url','') is null then raise exception 'New company requires a canonical public website'; end if;
  select * into c from company_db where website_url=p_fields->>'website_url' order by id limit 1 for update;
  if found then raise exception 'Company already exists; read and update its revision' using errcode='40001'; end if;
 end if;
 if c.id is null then
  if nullif(trim(p_fields->>'name'),'') is null then raise exception 'New company requires its public name'; end if;
  insert into company_db(name,description,website_url,location,public_context)
  values(p_fields->>'name',p_fields->>'description',p_fields->>'website_url',p_fields->>'location',jsonb_build_object('sourceRefs',p_source_refs,'fieldSources',field_sources)) returning * into c;
 else
  update company_db set name=coalesce(p_fields->>'name',name),description=coalesce(p_fields->>'description',description),
   website_url=coalesce(p_fields->>'website_url',website_url),location=coalesce(p_fields->>'location',location),
   public_context=public_context||jsonb_build_object('sourceRefs',p_source_refs,'fieldSources',coalesce(public_context->'fieldSources','{}')||field_sources)
  where id=p_id returning * into c;
 end if;
 update career_public_observations set about_refs=about_refs||jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text))
 where id=any(ids) and not about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text));
 select * into c from company_db where id=c.id;
 return jsonb_build_object('companyId',c.id,'revision',c.public_facts_revision);
end $$;
revoke all on function public.career_upsert_public_company_v1(bigint,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.career_upsert_public_company_v1(bigint,bigint,jsonb,jsonb) to service_role;
