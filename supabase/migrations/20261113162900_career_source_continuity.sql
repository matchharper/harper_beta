-- A company reader/index consumes the latest independently public observation
-- for each linked source. Historical observations remain exact evidence refs.
create function public.career_company_observations_v1(p_company bigint,p_offset integer default 0,p_limit integer default 100)
returns setof public.career_public_observations language sql stable security invoker set search_path=public,pg_temp as $$
 select distinct o.* from career_public_observations linked join documents d on d.id::text=linked.resource_ref->>'id'
 join career_public_observations o on o.id=d.current_observation_id
 where d.source_scope='public' and o.deleted_at is null and linked.deleted_at is null
 and linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',p_company::text))
 order by o.observed_at,o.id offset greatest(0,p_offset) limit greatest(1,least(p_limit,500))
$$;
create function public.career_public_company_sources_changed_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare refs jsonb;
begin
 if tg_table_name='documents' then
  if new.current_observation_id is not distinct from old.current_observation_id then return new; end if;
  select coalesce(jsonb_agg(distinct r),'[]') into refs from career_public_observations o,
   lateral jsonb_array_elements(o.about_refs) r where o.resource_ref->>'id'=new.id::text and o.resource_ref->>'kind'='web_resource' and o.deleted_at is null;
  -- Carry source identity links onto the current version before historical
  -- unreferenced observations are retired. These are references, not facts.
  update career_public_observations set about_refs=(select coalesce(jsonb_agg(distinct r),'[]') from jsonb_array_elements(about_refs||refs) r)
   where id=new.current_observation_id and not about_refs @> refs;
 else
  if not exists(select 1 from documents where current_observation_id=new.id and source_scope='public') then return new; end if;
  refs:=coalesce(old.about_refs,'[]')||coalesce(new.about_refs,'[]');
 end if;
 -- Updating the existing fact revision also invalidates an in-flight index
 -- worker through its normal source CAS. No private research payload is copied.
 update company_db set public_context=public_context where id::text in (
  select r->>'id' from jsonb_array_elements(refs) r where r->>'kind'='company');
 return new;
end $$;
create trigger career_public_company_source_pointer after update of current_observation_id on public.documents
 for each row execute function public.career_public_company_sources_changed_v1();
create trigger career_public_company_source_links after update of about_refs,deleted_at on public.career_public_observations
 for each row execute function public.career_public_company_sources_changed_v1();

create or replace function public.career_backfill_resource_headers_v1(p_limit integer default 500) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare inserted integer:=0; n integer;
begin
 insert into career_resource_index(scope,resource_kind,resource_id,source_revision,chunk_key,index_state)
 select 'public','company',c.id::text,c.public_facts_revision::text,'@source','pending' from company_db c
 where not exists(select 1 from career_resource_index h where h.scope='public' and h.resource_kind='company' and h.resource_id=c.id::text and h.chunk_key='@source')
 order by c.id limit p_limit on conflict do nothing;
 get diagnostics n=row_count;inserted:=inserted+n;
 insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key,index_state)
 select 'private',d.talent_id,'document',d.id::text,d.revision::text,'@source','pending' from talent_documents d
 where not d.is_deleted and exists(select 1 from talent_users u where u.user_id=d.talent_id and u.deleted_at is null)
 and not exists(select 1 from career_resource_index h where h.scope='private' and h.owner_id=d.talent_id and h.resource_kind='document' and h.resource_id=d.id::text and h.chunk_key='@source')
 order by d.id limit p_limit on conflict do nothing;
 get diagnostics n=row_count;inserted:=inserted+n;
 insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key,index_state)
 select 'private',s.talent_id,'discovery_request',s.id::text,s.directive_revision::text||':backfill','@source','pending' from talent_agent_schedules s
 where s.status='active' and s.target_refs ? 'discovery' and exists(select 1 from talent_users u where u.user_id=s.talent_id and u.deleted_at is null)
 and not exists(select 1 from career_resource_index h where h.scope='private' and h.owner_id=s.talent_id and h.resource_kind='discovery_request' and h.resource_id=s.id::text and h.chunk_key='@source')
 order by s.id limit p_limit on conflict do nothing;
 get diagnostics n=row_count;return inserted+n;
end $$;
revoke all on function public.career_company_observations_v1(bigint,integer,integer),public.career_public_company_sources_changed_v1() from public,anon,authenticated;
grant execute on function public.career_company_observations_v1(bigint,integer,integer) to service_role;
