-- One-time repair for #60. Reviewed against public Role records on 2026-11-13.
-- Preserve published URLs. Abort if a target posting changed after review.
-- No candidate messages, consent, recommendations or canonical Role are changed.
do $$
declare target record; current_job public.official_jobs%rowtype; source_role record;
begin
 for target in select * from (values
   ('2ba95910-7a9d-4fcc-b3d0-53dbe7c3e4bb'::uuid,'f58d6945-86ce-4292-bd09-e86e5ea4f775'::uuid,'2026-11-11 02:49:22.031539+00'::timestamptz,'aggregate'),
   ('7360af12-402b-4175-b36c-8dbab2beeff8'::uuid,'e1657263-3369-48c9-8e1b-812834e79037'::uuid,'2026-11-11 02:49:22.031539+00'::timestamptz,'aggregate'),
   ('12b0131c-c3a3-4f96-b9bf-ca8d2b97d043'::uuid,'e1657263-3369-48c9-8e1b-812834e79037'::uuid,'2026-11-11 04:17:07.094643+00'::timestamptz,'role')
 ) v(id,role_id,reviewed_at,kind) loop
   -- Lock source facts before the public row, matching Role-driven writes.
   select r.name,r.description,w.company_name,w.company_description,i.is_anonymous into source_role
   from public.company_roles r
   join public.company_internal_roles i using(role_id)
   join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
   where r.role_id=target.role_id for share of r,i,w;
   select * into current_job from public.official_jobs where id=target.id for update;
   if not found then continue; end if; -- Fresh/local databases have no incident rows.
   if current_job.role_id is distinct from target.role_id or current_job.updated_at is distinct from target.reviewed_at then
     raise exception 'incident_60_posting_changed: %; review current public content before repair',target.id;
   end if;
   if target.kind='aggregate' then
     -- A multi-company entry must not submit the candidate to one arbitrary Role.
     update public.official_jobs set role_id=null where id=target.id;
   else
     if source_role.is_anonymous is distinct from false or nullif(btrim(source_role.description),'') is null then
       raise exception 'incident_60_public_role_unavailable: %',target.role_id;
     end if;
     update public.official_jobs set role_title=source_role.name,
       company_name=source_role.company_name,
       company_description_markdown=coalesce(source_role.company_description,''),
       short_description='고객의 업무 환경에서 AI Agent를 설계·구현·운영하는 Forward Deployed Engineer 역할입니다.',
       role_description_markdown=source_role.description
     where id=target.id;
   end if;
 end loop;
end $$;
