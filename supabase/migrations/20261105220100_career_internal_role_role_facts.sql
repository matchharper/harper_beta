-- The candidate side reads a Role's location and compensation from the Role
-- first (E3b, D18 B).
--
-- read_career_internal_role_v1 took them from the Role's latest published
-- posting first, so a posting's own copy won over the Role. Postings now keep
-- those facts equal to the Role's whenever the Role has them
-- (20261105220000); this function states the same rule itself: the Role's
-- value, the posting's only where the Role is empty. Unchanged otherwise
-- (title, descriptions and company name still prefer the posting).

create or replace function public.read_career_internal_role_v1(p_talent uuid,p_role uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.career_internal_role_is_readable_v1(p_talent,p_role) then raise exception 'internal_role_unavailable'; end if;
 select jsonb_build_object('roleId',r.role_id,'name',coalesce(nullif(j.role_title,''),r.name),
   'description',coalesce(nullif(j.role_description_markdown,''),r.description),
   'companyName',case when i.is_anonymous then coalesce(nullif(j.company_name,''),'Company') else coalesce(nullif(j.company_name,''),nullif(w.published_name,''),w.company_name) end,
   'companyDescription',case when i.is_anonymous then coalesce(j.company_description_markdown,'') else coalesce(nullif(j.company_description_markdown,''),w.company_description,'') end,
   'location',coalesce(nullif(btrim(r.location_text),''),nullif(j.location,'')),'workMode',r.work_mode,
   'compensation',coalesce(nullif(btrim(r.salary_range),''),nullif(j.compensation,'')),'publicJobSlug',j.slug)
 into result from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 left join lateral(select * from public.official_jobs where role_id=r.role_id and is_published order by updated_at desc,id limit 1) j on true
 where r.role_id=p_role;
 return result;
end $$;
