-- Role anonymity (company_internal_roles.is_anonymous) applies to LinkedIn promotion.
-- In the candidate's Harper conversation the internal Role is read with its real title,
-- description and company, through the same GTM naming rule as other candidate reads.
-- The GTM naming rule from 20261117110000, identical, so this applies before or after it.
create or replace function public.candidate_company_name_v1(p_workspace_name text, p_role_information jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role_information ->> 'purpose' = 'gtm_outreach'
      and nullif(btrim(p_role_information #>> '{gtm,companyName}'), '') is not null
    then btrim(p_role_information #>> '{gtm,companyName}')
    else p_workspace_name
  end;
$$;

create or replace function public.candidate_role_title_v1(p_role_name text, p_role_information jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_role_information ->> 'purpose' = 'gtm_outreach'
      and nullif(btrim(p_role_information #>> '{gtm,companyName}'), '') is not null
      and lower(left(btrim(p_role_name), length(btrim(p_role_information #>> '{gtm,companyName}')) + 3))
        = lower(btrim(p_role_information #>> '{gtm,companyName}') || ' · ')
      and length(btrim(p_role_name)) > length(btrim(p_role_information #>> '{gtm,companyName}')) + 3
    then btrim(substr(btrim(p_role_name), length(btrim(p_role_information #>> '{gtm,companyName}')) + 4))
    else p_role_name
  end;
$$;

CREATE OR REPLACE FUNCTION public.read_career_internal_role_v1(p_talent uuid, p_role uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not public.career_internal_role_is_readable_v1(p_talent,p_role) then raise exception 'internal_role_unavailable'; end if;
 select jsonb_build_object(
   'roleId',r.role_id,
   'name',public.candidate_role_title_v1(r.name, r.information),
   'description',r.description,
   'companyName',public.candidate_company_name_v1(w.company_name, r.information),
   'companyDescription',coalesce(w.company_description,''),
   'factsSource',jsonb_build_object('kind','role'),
   'publicPostings','[]'::jsonb,
   'location',coalesce(nullif(btrim(r.location_text),''),nullif(j.location,'')),
   'workMode',r.work_mode,
   'compensation',coalesce(nullif(btrim(r.salary_range),''),nullif(j.compensation,'')),
   'publicJobSlug',j.slug)
 into result from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 left join lateral(select * from public.official_jobs where role_id=r.role_id and is_published order by updated_at desc,id limit 1) j on true
 where r.role_id=p_role;
 return result;
end $function$;
