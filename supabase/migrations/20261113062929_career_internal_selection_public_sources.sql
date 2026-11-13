-- The proposal index consumes the same candidate-safe Role projection. A
-- posting URL identifies its actual Role even when it is not the newest ad.
create or replace function public.read_career_internal_selections_v1(p_talent uuid,p_offset integer default 0,p_limit integer default 8,p_companies text[] default null,p_posting_url text default null)
returns table(selection_id uuid,role_id uuid,selected_at timestamptz,company_name text,role_name text,total_count bigint)
language sql stable security invoker set search_path='' as $$
 with available as (
   select distinct on (m.opportunity_id) m.id,m.opportunity_id,m.reviewed_at,
     public.read_career_internal_role_v1(p_talent,m.opportunity_id) facts
   from public.talent_opportunity_matching_review m
   where m.talent_id=p_talent and public.career_internal_selection_available_v1(p_talent,m.id)
     and not exists(select 1 from public.talent_opportunity_recommendation r where r.talent_id=p_talent and r.role_id=m.opportunity_id)
   order by m.opportunity_id,m.reviewed_at desc,m.id desc
 ), filtered as (
   select * from available a where
     (coalesce(cardinality(p_companies),0)=0 or exists(
       select 1 from unnest(p_companies) name where strpos(lower(a.facts->>'companyName'),lower(name))>0
         or exists(select 1 from public.official_jobs j where j.role_id=a.opportunity_id and j.is_published
           and strpos(lower(j.company_name),lower(name))>0)))
     and (p_posting_url is null or exists(select 1 from public.official_jobs j
       where j.role_id=a.opportunity_id and j.is_published
         and p_posting_url in ('https://matchharper.com/jobs/'||j.slug,'https://matchharper.com/jobs/'||j.id::text)))
 )
 select id,opportunity_id,reviewed_at,facts->>'companyName',
   coalesce(facts->>'name',
     'Public advertisements: '||(select string_agg(p->>'name',' / ') from jsonb_array_elements(facts->'publicPostings') p),
     'Anonymous Role'),count(*) over()
 from filtered order by reviewed_at desc,id desc offset greatest(p_offset,0) limit greatest(p_limit,1)
$$;
