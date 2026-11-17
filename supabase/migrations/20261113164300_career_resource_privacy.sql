create function public.career_json_resource_refs_v1(p_value jsonb) returns setof jsonb
language sql immutable security invoker set search_path=public,pg_temp as $$
 with recursive parts(value) as (
  select p_value union all select c.value from parts p cross join lateral (
   select value from jsonb_each(case when jsonb_typeof(p.value)='object' then p.value else '{}' end)
   union all select value from jsonb_array_elements(case when jsonb_typeof(p.value)='array' then p.value else '[]' end)
  ) c
 ) select distinct value from parts where jsonb_typeof(value)='object' and value ? 'kind' and value ? 'id'
$$;

-- Original readers still enforce native ownership. Cached calculations also
-- require every source they actually consumed, including private context.
alter function public.career_resource_available_v1(uuid,jsonb) rename to career_resource_direct_available_v1;
create function public.career_resource_access_path_v1(p_user uuid,p_ref jsonb,p_seen text[] default '{}') returns boolean
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare key text:=(p_ref->>'kind')||':'||(p_ref->>'id'); source jsonb; refs jsonb; op talent_external_operations;
begin
 if exists(select 1 from talent_users where user_id=p_user and deleted_at is not null) then return false; end if;
 if not career_resource_direct_available_v1(p_user,p_ref) then return false; end if;
 if p_ref->>'kind'='web_resource' and p_ref->>'revision' is not null and not exists(select 1 from career_public_observations where id::text=p_ref->>'revision' and deleted_at is null and resource_ref->>'id'=p_ref->>'id') then return false; end if;
 if key=any(p_seen) then return true; end if;
 if p_ref->>'kind'='operation' then
  select * into op from talent_external_operations where id::text=p_ref->>'id' and user_id=p_user;
  if op.result->>'source_unavailable'='true' then return false; end if;
  if op.kind in ('resource_item','resource_research','resource_evaluation','resource_search') then
   refs:=jsonb_build_array(op.request->'sourceRefs',op.request->'contextRefs',op.request->'knownSourceRefs');
  end if;
 elsif p_ref->>'kind'='opportunity' then
  select jsonb_build_array(primary_ref,related_refs,evidence_refs,presentation) into refs from career_opportunities
   where id::text=p_ref->>'id' and talent_id=p_user and deleted_at is null;
 end if;
 for source in select * from career_json_resource_refs_v1(refs) loop
  if not career_resource_access_path_v1(p_user,source,p_seen||key) then return false; end if;
 end loop;
 return true;
end $$;
create function public.career_resource_available_v1(p_user uuid,p_ref jsonb) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select career_resource_access_path_v1(p_user,p_ref)
$$;

-- Source deletion removes cached extracts immediately, including transitive
-- evaluation results. Stable opportunity/work/receipt identities are retained.
create function public.career_purge_resource_copies_v1(p_user uuid,p_kind text,p_id text) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare affected jsonb:=jsonb_build_array(jsonb_build_object('kind',p_kind,'id',p_id)); expanded jsonb; count_removed integer:=0; affected_sets uuid[];
begin
 loop
  select coalesce(jsonb_agg(distinct n.ref),'[]') into expanded from (
   select jsonb_build_object('kind','operation','id',o.id::text) ref,
    jsonb_build_array(case when o.kind in ('resource_research','resource_evaluation') then o.request-'selection' else o.request end,o.result) body
    from talent_external_operations o where (p_user is null or o.user_id=p_user) and o.kind in ('resource_item','resource_research','resource_evaluation','resource_search')
   union all select jsonb_build_object('kind','opportunity','id',o.id::text),jsonb_build_array(primary_ref,related_refs,evidence_refs,presentation)
    from career_opportunities o where p_user is null or o.talent_id=p_user
  ) n where not affected @> jsonb_build_array(n.ref) and exists(
    select 1 from career_json_resource_refs_v1(n.body) r,jsonb_array_elements(affected) gone
    where (r->>'kind'=gone->>'kind' and r->>'id'=gone->>'id')
      or (gone->>'kind'='observation' and r->>'kind'='web_resource' and r->>'revision'=gone->>'id'));
  exit when jsonb_array_length(expanded)=0;
  affected:=affected||expanded;
 end loop;
 update talent_external_operations o set request=jsonb_build_object('execution_environment',request->>'execution_environment','sourceRefs',
   (select coalesce(jsonb_agg(r),'[]') from career_json_resource_refs_v1(request) r)),
   result='{"source_unavailable":true}',provider_refs='{}',status=case when status in ('reserved','running') then 'cancelled' else status end,
   revision=revision+1,updated_at=now() where affected @> jsonb_build_array(jsonb_build_object('kind','operation','id',o.id::text));
 get diagnostics count_removed=row_count;
 select array_agg(distinct i.set_id) into affected_sets from career_result_items i
 where (p_user is null or i.talent_id=p_user) and exists(
  select 1 from career_json_resource_refs_v1(jsonb_build_array(resource_ref,evaluation_ref,projection)) r,jsonb_array_elements(affected) gone
   where (r->>'kind'=gone->>'kind' and r->>'id'=gone->>'id')
    or (gone->>'kind'='observation' and r->>'kind'='web_resource' and r->>'revision'=gone->>'id'));
 update career_result_items i set projection='{}',evaluation_ref=null
 where (p_user is null or i.talent_id=p_user) and exists(
  select 1 from career_json_resource_refs_v1(jsonb_build_array(resource_ref,evaluation_ref,projection)) r,jsonb_array_elements(affected) gone
   where (r->>'kind'=gone->>'kind' and r->>'id'=gone->>'id')
    or (gone->>'kind'='observation' and r->>'kind'='web_resource' and r->>'revision'=gone->>'id'));
 update career_opportunities o set body='',title='',presentation='{}',revision=revision+1,updated_at=now()
 where affected @> jsonb_build_array(jsonb_build_object('kind','opportunity','id',o.id::text));
 update career_views v set title='',description='',definition=jsonb_build_object('blocks',coalesce((select jsonb_agg(
   case when b->>'type'='narrative' and exists(select 1 from career_json_resource_refs_v1(b) r,jsonb_array_elements(affected) gone
    where (r->>'kind'=gone->>'kind' and r->>'id'=gone->>'id') or (gone->>'kind'='observation' and r->>'kind'='web_resource' and r->>'revision'=gone->>'id'))
    or (b->>'type'='narrative' and exists(select 1 from jsonb_array_elements(v.definition->'blocks') c where c->'selection'->>'setId'=any(affected_sets::text[])))
    then b||'{"markdown":""}' else b end) from jsonb_array_elements(v.definition->'blocks') b),'[]')),revision=revision+1,updated_at=now()
 where (p_user is null or v.talent_id=p_user) and (exists(select 1 from career_json_resource_refs_v1(v.definition) r,jsonb_array_elements(affected) gone
  where (r->>'kind'=gone->>'kind' and r->>'id'=gone->>'id') or (gone->>'kind'='observation' and r->>'kind'='web_resource' and r->>'revision'=gone->>'id'))
  or exists(select 1 from jsonb_array_elements(v.definition->'blocks') c where c->'selection'->>'setId'=any(affected_sets::text[])));
 update career_result_sets set title='',manifest='{"source_unavailable":true}' where id=any(affected_sets);
 delete from career_resource_index where resource_kind=p_kind and resource_id=p_id and (p_user is null or owner_id=p_user);
 if p_kind='observation' then
  update career_public_observations set content='',provenance='{}' where id::text=p_id and deleted_at is not null;
  delete from career_resource_index where scope='public' and resource_kind='web_resource' and source_revision=p_id;
  update documents set markdown=null,excerpt=null,current_observation_id=null where current_observation_id::text=p_id;
 end if;
 return count_removed;
end $$;

create function public.career_deleted_source_copies_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner uuid; kind text; target text; removed boolean;
begin
 target:=old.id::text;
 if tg_table_name='talent_documents' then owner:=old.talent_id;kind:='document';removed:=tg_op='DELETE' or new.is_deleted;
 elsif tg_table_name='talent_contexts' then owner:=old.talent_id;kind:='memory';removed:=tg_op='DELETE' or new.deleted_at is not null;
 elsif tg_table_name='career_public_observations' then kind:='observation';removed:=tg_op='DELETE' or new.deleted_at is not null;
 end if;
 if removed then perform career_purge_resource_copies_v1(owner,kind,target);end if;
 return old;
end $$;
create trigger career_deleted_document_copies after update of is_deleted or delete on public.talent_documents for each row execute function public.career_deleted_source_copies_v1();
create trigger career_deleted_memory_copies after update of deleted_at or delete on public.talent_contexts for each row execute function public.career_deleted_source_copies_v1();
create trigger career_deleted_public_copies after update of deleted_at or delete on public.career_public_observations for each row execute function public.career_deleted_source_copies_v1();

create function public.career_public_scope_revoked_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.source_scope='public' and new.source_scope is distinct from 'public' then
  update career_public_observations set deleted_at=now() where resource_ref->>'id'=old.id::text and deleted_at is null;
  perform career_purge_resource_copies_v1(null,'web_resource',old.id::text);
 end if;
 return new;
end $$;
create trigger career_public_scope_revoked after update of source_scope on public.documents for each row execute function public.career_public_scope_revoked_v1();
revoke all on function public.career_public_scope_revoked_v1() from public,anon,authenticated;

create function public.career_discovery_context_changed_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;kind text;
begin
 kind:=case tg_table_name when 'talent_contexts' then 'memory' when 'talent_profiles' then 'profile' end;
 update career_resource_index h set source_revision=s.directive_revision::text||':'||extract(epoch from clock_timestamp())::text,
  index_state='pending',dispatch_state=null,lease_owner=null,lease_until=null,updated_at=now()
 from talent_agent_schedules s where h.owner_id=s.talent_id and h.resource_kind='discovery_request' and h.resource_id=s.id::text and h.chunk_key='@source'
  and s.status='active' and s.talent_id::text=row_data->>'talent_id'
  and (coalesce(s.target_refs->'discovery'->'context_refs','[]')||coalesce(s.target_refs->'discovery'->'source_refs','[]'))
   @> jsonb_build_array(jsonb_build_object('kind',kind,'id',row_data->>'id'));
 return coalesce(new,old);
end $$;
create trigger career_discovery_memory_changed after insert or update or delete on talent_contexts for each row execute function career_discovery_context_changed_v1();
create trigger career_discovery_profile_changed after insert or update or delete on talent_profiles for each row execute function career_discovery_context_changed_v1();
revoke all on function public.career_discovery_context_changed_v1() from public,anon,authenticated;

revoke all on function public.career_json_resource_refs_v1(jsonb),public.career_resource_access_path_v1(uuid,jsonb,text[]),public.career_resource_available_v1(uuid,jsonb),
 public.career_purge_resource_copies_v1(uuid,text,text),public.career_deleted_source_copies_v1() from public,anon,authenticated;
grant execute on function public.career_json_resource_refs_v1(jsonb),public.career_resource_access_path_v1(uuid,jsonb,text[]),public.career_resource_available_v1(uuid,jsonb),
 public.career_purge_resource_copies_v1(uuid,text,text) to service_role;
