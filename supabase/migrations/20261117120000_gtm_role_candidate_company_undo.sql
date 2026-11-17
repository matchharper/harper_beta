-- 후보자 아웃바운드 (#4): undo 20261117110000_gtm_role_candidate_company.sql. A 'Harper GTM' Role is no longer read
-- with a company of its own: every candidate screen reads the workspace's name ("Harper 고객사") as for any Role, and
-- the Role's own name says which company it is ("<설명> · <직함>", written by the GTM screen when the Role is made).
-- So the two Career readers go back to the production definitions of 2026-11-17 (before 20261117110000), and the
-- two rule functions are dropped. The guard stops when either reader is neither the 20261117110000 version nor the
-- original, so a later change is never silently reverted.

do $$
declare
  copied record;
  current_md5 text;
begin
  for copied in
    select * from (values
      ('public.read_career_internal_role_v1(uuid,uuid)', '28e6b227b8ecf2c9c3d5427f5a5773d2', '275ef61b93de7fc3b2cdd21832924b97'),
      ('public.read_company_talent_connections_v1(uuid,text,integer)', 'fc2429efa2884a49dce5c32a61ab31fd', '6bd4bf6a8d917d13028c776f389e3f6e')
    ) as copied(signature, changed_md5, original_md5)
  loop
    current_md5 := md5(pg_get_functiondef(to_regprocedure(copied.signature)));
    if current_md5 not in (copied.changed_md5, copied.original_md5) then
      raise exception 'gtm_role_candidate_company_undo: % changed since 2026-11-17 (md5 %); re-copy it without candidate_company_name_v1', copied.signature, current_md5;
    end if;
  end loop;
end;
$$;

-- 1. Career reading one internal Role: the production definition before 20261117110000.
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
end $function$;

-- 2. The person's company connections: the production definition before 20261117110000.
CREATE OR REPLACE FUNCTION public.read_company_talent_connections_v1(p_talent_id uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(to_jsonb(connection)), '[]'::jsonb) from (
    select 'recommendation:' || recommendation.id::text as "connectionId",
      recommendation.id as "recommendationId", role.role_id as "roleId",
      role.name as "roleName", workspace.company_name as "companyName",
      contact.delivery_body as "latestCompanyContact",
      recommendation.saved_stage as "positionState",
      latest_relay.relay_content as "latestCandidateContact",
      latest_relay.delivery_status as "deliveryStatus"
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role on role.role_id = recommendation.role_id
    join public.company_workspace workspace on workspace.company_workspace_id = role.company_workspace_id
    left join lateral (
      select request.id, request.delivery_body, request.created_at
      from public.company_talent_requests request
      where request.recommendation_id = recommendation.id and exists (
        select 1 from public.contact_queue delivery
        where delivery.company_talent_request_id = request.id
          and delivery.type = 'company_request_candidate_delivery'
          and delivery.status = 'sent' and delivery.sent_at is not null
      ) order by request.created_at desc limit 1
    ) contact on true
    left join lateral (
      select relay.relay_content, delivery.status as delivery_status
      from public.company_talent_relays relay
      left join public.contact_queue delivery on delivery.company_talent_relay_id = relay.id
        and delivery.type = 'company_contact_company_delivery'
      where relay.recommendation_id = recommendation.id
      order by relay.created_at desc limit 1
    ) latest_relay on true
    where recommendation.talent_id = p_talent_id
      and (recommendation.feedback = 'like' or (
        contact.id is not null
        and public.company_talent_pair_is_contactable_v1(role.company_workspace_id, role.role_id, p_talent_id, recommendation.id)
      ))
      and (not coalesce((role.information ->> 'testOnly')::boolean, false)
        or coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false))
      and (contact.id is not null or exists (
        select 1 from public.company_intro_candidates intro
        where intro.recommendation_id = recommendation.id
          and intro.talent_id = p_talent_id and intro.status in ('connecting', 'connected')
      ) or exists (
        select 1 from public.talent_opportunity_tag tag
        where tag.talent_id = p_talent_id and tag.opportunity_id = role.role_id
          and (tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼') or tag.tag like '내부단계:%')
      ) or exists (
        select 1 from public.talent_progress progress
        where progress.recommendation_id = recommendation.id and progress.talent_id = p_talent_id
          and progress.role_id = role.role_id and progress.kind = 'org_stage_change'
          and (progress.metadata ->> 'stage' in ('pending_connection', 'connected', 'final_offer')
            or progress.metadata ->> 'stage' like 'custom:%')
      ))
      and not exists (
        select 1 from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') term
        where term <> '' and strpos(lower(workspace.company_name || ' ' || role.name), term) = 0
      )
    order by coalesce(contact.created_at, recommendation.updated_at) desc, recommendation.id
    limit least(30, greatest(1, coalesce(p_limit, 20)))
  ) connection;
$function$;

drop function if exists public.candidate_company_name_v1(text, jsonb);
drop function if exists public.candidate_role_title_v1(text, jsonb);
