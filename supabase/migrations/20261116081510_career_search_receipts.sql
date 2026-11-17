-- A search receipt records the scope and outcome of one actual tool call, including silence and zero matches.
create index career_search_receipts_by_owner
  on public.talent_external_operations(user_id, created_at desc, id desc) where kind='resource_search';

create function public.career_record_search_receipt_v1(p_user uuid, p_conversation uuid, p_key text,
  p_request jsonb, p_status text, p_result jsonb)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare origin opportunity_discovery_run; purpose text;
begin
  perform 1 from talent_users where user_id=p_user and deleted_at is null for share;
  if not found then raise exception 'Account unavailable'; end if;
  perform 1 from talent_conversations where user_id=p_user and id=p_conversation for share;
  if not found then raise exception 'Conversation unavailable'; end if;
  if p_request->>'mailboxGeneration' is not null then
    perform 1 from talent_integrations where talent_id=p_user and provider='gmail' and status='active'
      and career_mail_sync->>'generation'=p_request->>'mailboxGeneration' for share;
    if not found then raise exception 'Gmail connection changed before search completion'; end if;
  end if;
  if p_request->>'backgroundRunId' is not null then
    select * into origin from opportunity_discovery_run where id=(p_request->>'backgroundRunId')::uuid and talent_id=p_user;
    if found then
      select string_agg(e->>'instruction', E'\n') into purpose
        from jsonb_array_elements(case when jsonb_typeof(origin.trigger_payload->'sourceEvents')='array'
          then origin.trigger_payload->'sourceEvents' else '[]' end) e where e ? 'instruction';
      p_request := p_request || jsonb_build_object('trigger',origin.trigger,'purpose',
        coalesce(p_request->'scope'->>'purpose',origin.trigger_payload->>'purpose',origin.trigger_payload->>'instruction',purpose));
    end if;
  end if;
  insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
    values(p_user,p_conversation,'resource_search',p_key,p_status,p_request,p_result)
    on conflict(user_id,kind,idempotency_key) do nothing;
end $$;

create function public.career_search_history_v1(p_user uuid, p_query text, p_since timestamptz, p_offset int, p_limit int)
returns table(id uuid, created_at timestamptz, status text, request jsonb, result jsonb)
language sql stable security invoker set search_path=public,pg_temp as $$
  with terms as (
    select distinct word from regexp_split_to_table(lower(trim(coalesce(p_query,''))),'[[:space:]]+') word
    where word<>''
  )
  select o.id,o.created_at,o.status,o.request-'sourceRefs'-'mailboxGeneration'-'execution_environment',o.result
  from talent_external_operations o
  cross join lateral (
    select count(*) matched from terms t where strpos(lower(concat_ws(' ',o.request->>'source',o.request->>'purpose',o.request->>'scope')),t.word)>0
  ) hits
  where o.user_id=p_user and o.kind='resource_search' and o.request->>'searchReceipt'='true'
    and (p_since is null or o.created_at>=p_since)
    and (coalesce(trim(p_query),'')='' or hits.matched>0)
    and career_resource_available_v1(p_user,jsonb_build_object('kind','operation','id',o.id))
    and (o.request->>'mailboxGeneration' is null or exists(select 1 from talent_integrations g
      where g.talent_id=p_user and g.provider='gmail' and g.status='active' and g.career_mail_sync->>'generation'=o.request->>'mailboxGeneration'))
  order by case when coalesce(trim(p_query),'')='' then 0 else hits.matched end desc,
    o.created_at desc,o.id desc limit p_limit offset p_offset
$$;

-- Query-only Gmail searches can return zero messages. Remove their private scope when that grant ends too.
create function public.clear_career_mail_search_receipts_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.provider='gmail' and (tg_op='DELETE' or new.status is distinct from old.status
      or new.career_mail_sync->>'generation' is distinct from old.career_mail_sync->>'generation') then
    update talent_external_operations set request=jsonb_build_object('execution_environment',request->>'execution_environment'),
      result='{"source_unavailable":true}',revision=revision+1,updated_at=now()
      where user_id=old.talent_id and kind='resource_search' and request->>'mailboxGeneration'=old.career_mail_sync->>'generation';
  end if;
  return null;
end $$;
create trigger clear_career_mail_search_receipts after update or delete on public.talent_integrations
  for each row execute function public.clear_career_mail_search_receipts_v1();

revoke all on function public.career_record_search_receipt_v1(uuid,uuid,text,jsonb,text,jsonb),
  public.career_search_history_v1(uuid,text,timestamptz,int,int),public.clear_career_mail_search_receipts_v1() from public,anon,authenticated;
grant execute on function public.career_record_search_receipt_v1(uuid,uuid,text,jsonb,text,jsonb),
  public.career_search_history_v1(uuid,text,timestamptz,int,int) to service_role;

-- Keep the lightweight execution facts when intermediate research caches age out.
-- They are not retention roots for copied results or observations.
create or replace function public.career_retire_resource_cache_v1(p_before timestamptz,p_limit integer default 1000)
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
   and o.request->>'searchReceipt' is distinct from 'true'
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
