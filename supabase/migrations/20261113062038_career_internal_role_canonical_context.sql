-- Public ads are entry points, not overrides of a company's hiring Role.
-- Anonymous Roles expose their reviewed advertisements as separate sources:
-- raw Role/company prose may identify the company, and no single ad defines
-- the requirements shared by every variant.
create or replace function public.read_career_internal_role_v1(p_talent uuid,p_role uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.career_internal_role_is_readable_v1(p_talent,p_role) then raise exception 'internal_role_unavailable'; end if;
 select jsonb_build_object(
   'roleId',r.role_id,
   'name',case when i.is_anonymous then null else r.name end,
   'description',case when i.is_anonymous then null else r.description end,
   'companyName',case when i.is_anonymous then 'Company' else w.company_name end,
   'companyDescription',case when i.is_anonymous then '' else coalesce(w.company_description,'') end,
   'factsSource',case when i.is_anonymous then jsonb_build_object('kind','public_postings')
     else jsonb_build_object('kind','role') end,
   'publicPostings',case when i.is_anonymous then coalesce((
     select jsonb_agg(jsonb_build_object('id',p.id,'slug',p.slug,'name',p.role_title,
       'description',p.role_description_markdown,'companyName',p.company_name,
       'companyDescription',p.company_description_markdown) order by p.updated_at desc,p.id)
     from public.official_jobs p where p.role_id=r.role_id and p.is_published
   ),'[]'::jsonb) else '[]'::jsonb end,
   'location',coalesce(nullif(btrim(r.location_text),''),nullif(j.location,'')),
   'workMode',r.work_mode,
   'compensation',coalesce(nullif(btrim(r.salary_range),''),nullif(j.compensation,'')),
   'publicJobSlug',j.slug)
 into result from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 left join lateral(select * from public.official_jobs where role_id=r.role_id and is_published order by updated_at desc,id limit 1) j on true
 where r.role_id=p_role;
 return result;
end $$;
