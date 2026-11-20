-- Only regenerable, unreferenced cache is eligible. Published and archived
-- proposals/views, user material, pending work and actual effect receipts root
-- the reference graph. There is no parent->child cascade for shared results.
create function public.career_cache_reference_keys_v1(p_value jsonb) returns setof text
language sql immutable security invoker set search_path=public,pg_temp as $$
 with recursive parts(value) as (
  select p_value union all select c.value from parts p cross join lateral (
   select value from jsonb_each(case when jsonb_typeof(p.value)='object' then p.value else '{}' end)
   union all select value from jsonb_array_elements(case when jsonb_typeof(p.value)='array' then p.value else '[]' end)
  ) c
 ) select distinct key from parts cross join lateral (
  select case when value->>'kind'='operation' then 'operation:'||(value->>'id')
   when value->>'kind'='observation' then 'observation:'||(value->>'id')
   when value->>'kind'='web_resource' and value ? 'revision' then 'observation:'||(value->>'revision') end key
  union all select 'set:'||(value->>'setId')||':'||coalesce(value->>'revision','*') where value ? 'setId'
  union all select 'operation:'||(value->>'operationId') where value ? 'operationId'
  union all select 'operation:'||(value->>'operation_id') where value ? 'operation_id'
  union all select 'operation:'||(value->>'parent_id') where value ? 'parent_id'
  union all select 'observation:'||(value->>'observationId') where value ? 'observationId'
 ) refs where key is not null
$$;

create function public.career_retire_resource_cache_v1(p_before timestamptz,p_limit integer default 1000)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='25s' as $$
declare sets_removed integer;ops_removed integer;observations_removed integer;
begin
 if p_before>now()-interval '30 days' or p_limit<1 or p_limit>1000 then raise exception 'Invalid cache retention batch';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('career-resource-retention',0)) then return '{"busy":true}';end if;
 -- A root cannot change between marking and deletion. NOWAIT keeps maintenance
 -- from waiting behind user work; the next daily run retries a busy snapshot.
 begin
  lock table career_opportunities,career_views,career_result_sets,career_result_items,career_public_observations,
   documents,talent_external_operations,talent_agent_schedules,talent_documents,talent_contexts,talent_messages,
   talent_profile_revisions,talent_role_materials,career_action_items,company_db,company_roles in share row exclusive mode nowait;
 exception when lock_not_available then return '{"busy":true}';end;
 create temporary table career_retention_edges(parent text,child text) on commit drop;
 create temporary table career_retention_roots(key text primary key) on commit drop;
 insert into career_retention_edges
 select 'operation:'||o.id,r from talent_external_operations o cross join lateral career_cache_reference_keys_v1(to_jsonb(o)) r
 union select 'set:'||s.id||':'||s.revision,r from career_result_sets s cross join lateral career_cache_reference_keys_v1(to_jsonb(s)) r
 union select 'set:'||i.set_id||':'||i.set_revision,r from career_result_items i cross join lateral career_cache_reference_keys_v1(to_jsonb(i)) r
 union select 'set:'||s.id||':*','set:'||s.id||':'||s.revision from career_result_sets s;
 create index on career_retention_edges(parent);
 insert into career_retention_roots
 select distinct key from (
  select r key from career_opportunities o cross join lateral career_cache_reference_keys_v1(to_jsonb(o)) r where o.deleted_at is null
  union select r from career_views v cross join lateral career_cache_reference_keys_v1(to_jsonb(v)) r
  union select 'operation:'||id from talent_external_operations where
   status in ('reserved','running','dispatching','uncertain','waiting','waiting_user','waiting_external','ready')
   or kind not in ('resource_item','resource_research','resource_evaluation','resource_search','public_discovery_event','delegated_work')
  union select r from talent_agent_schedules s cross join lateral career_cache_reference_keys_v1(to_jsonb(s)) r where s.status='active'
  union select r from talent_documents d cross join lateral career_cache_reference_keys_v1(to_jsonb(d)) r where not d.is_deleted
  union select r from talent_contexts c cross join lateral career_cache_reference_keys_v1(to_jsonb(c)) r where c.deleted_at is null
  union select r from talent_messages m cross join lateral career_cache_reference_keys_v1(m.payload) r
  union select r from talent_profile_revisions p cross join lateral career_cache_reference_keys_v1(to_jsonb(p)) r
  union select r from talent_role_materials m cross join lateral career_cache_reference_keys_v1(to_jsonb(m)) r
  union select r from career_action_items a cross join lateral career_cache_reference_keys_v1(to_jsonb(a)) r
  union select 'observation:'||current_observation_id from documents where current_observation_id is not null
  union select r from company_db c cross join lateral career_cache_reference_keys_v1(c.public_context) r
  union select r from company_roles role cross join lateral career_cache_reference_keys_v1(role.information) r
  -- New intermediate artifacts can be resumed and are themselves roots until
  -- their cache window elapses, preserving the old evidence they reference.
  union select 'set:'||id||':'||revision from career_result_sets where created_at>=p_before
  union select 'operation:'||id from talent_external_operations where created_at>=p_before
 ) roots where key is not null on conflict do nothing;
 create temporary table career_retention_live(key text primary key) on commit drop;
 insert into career_retention_live with recursive live(key) as (
  select key from career_retention_roots union select e.child from live l join career_retention_edges e on e.parent=l.key
 ) select key from live;
 delete from career_result_sets where (id,revision) in (
  select id,revision from career_result_sets s where created_at<p_before and not exists(select 1 from career_retention_live l where l.key='set:'||s.id||':'||s.revision)
  order by created_at,id,revision limit p_limit);
 get diagnostics sets_removed=row_count;
 delete from talent_external_operations where id in (
  select o.id from talent_external_operations o where kind in ('resource_item','resource_research','resource_evaluation','resource_search')
   and created_at<p_before and not exists(select 1 from career_retention_live l where l.key='operation:'||o.id)
   and not exists(select 1 from talent_external_operations child where child.parent_id=o.id)
  order by created_at,id limit p_limit);
 get diagnostics ops_removed=row_count;
 delete from career_public_observations where id in (
  select o.id from career_public_observations o where observed_at<p_before
   and not exists(select 1 from career_retention_live l where l.key='observation:'||o.id)
  order by observed_at,id limit p_limit);
 get diagnostics observations_removed=row_count;
 return jsonb_build_object('sets',sets_removed,'operations',ops_removed,'observations',observations_removed,'before',p_before);
end $$;
revoke all on function public.career_cache_reference_keys_v1(jsonb),public.career_retire_resource_cache_v1(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.career_cache_reference_keys_v1(jsonb),public.career_retire_resource_cache_v1(timestamptz,integer) to service_role;
