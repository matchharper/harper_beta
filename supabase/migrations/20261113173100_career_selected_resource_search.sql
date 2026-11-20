-- This reader combines already selected unpublished Roles and the candidate's
-- published history. It never searches the unselected private Role inventory.
create function public.career_selected_internal_resources_v1(p_user uuid,p_query text,p_offset integer,p_limit integer)
returns table(ref jsonb,title text,body text,facts jsonb)
language sql stable security invoker set search_path=public,pg_temp as $$
 with selected as (
  select r.role_id from talent_opportunity_recommendation r join company_roles role on role.role_id=r.role_id
   where r.talent_id=p_user and role.source_type='internal'
  union select m.opportunity_id from talent_opportunity_matching_review m where m.talent_id=p_user
   and career_internal_selection_available_v1(p_user,m.id)
 ), allowed as (
  select role_id,read_career_internal_role_v1(p_user,role_id) value from selected
 ), projected as (
  select role_id,value,coalesce(value->>'companyName','') company,
   coalesce(value->>'name',(select string_agg(p->>'name',' / ') from jsonb_array_elements(value->'publicPostings') p),'Career opportunity') name
   from allowed where value is not null
 )
 select jsonb_build_object('kind','role','id',role_id::text),concat_ws(' · ',nullif(company,''),name),
  'Previously selected Harper-connected opportunity.',jsonb_build_object('company',company,'name',name)
 from projected where p_query='' or strpos(lower(company||' '||name),lower(p_query))>0
 order by role_id offset greatest(p_offset,0) limit greatest(p_limit,1)
$$;
revoke all on function public.career_selected_internal_resources_v1(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.career_selected_internal_resources_v1(uuid,text,integer,integer) to service_role;
