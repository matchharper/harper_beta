-- Hold private source rows through each cache write. A concurrent deletion
-- either finishes first (this write fails), or waits and purges the just-written
-- copy. A stale worker cannot restore private text after the purge committed.
create function public.career_lock_cache_sources_v1(p_user uuid,p_value jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb;
begin
 for r in select value from career_json_resource_refs_v1(p_value) value
  where value->>'kind' in ('company','role','document','memory','profile','message','operation','opportunity','observation','web_resource')
  order by value->>'kind',value->>'id' loop
  case r->>'kind'
   when 'company' then perform 1 from company_db where id::text=r->>'id' for share;
   when 'role' then perform 1 from company_roles where role_id::text=r->>'id' for share;
   when 'document' then perform 1 from talent_documents where id::text=r->>'id' and talent_id=p_user for share;
   when 'memory' then perform 1 from talent_contexts where id::text=r->>'id' and talent_id=p_user for share;
   when 'profile' then perform 1 from talent_profiles where id::text=r->>'id' and talent_id=p_user for share;
   when 'message' then perform 1 from talent_messages where id::text=r->>'id' and user_id=p_user for share;
   when 'operation' then perform 1 from talent_external_operations where id::text=r->>'id' and user_id=p_user for share;
   when 'opportunity' then perform 1 from career_opportunities where id::text=r->>'id' and talent_id=p_user for share;
   when 'observation' then perform 1 from career_public_observations where id::text=r->>'id' for share;
   when 'web_resource' then perform 1 from documents where id::text=r->>'id' for share;
  end case;
  if not career_resource_available_v1(p_user,r) then raise exception 'Source unavailable while saving cached content' using errcode='42501'; end if;
 end loop;
end $$;

create function public.career_guard_cached_content_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare sources jsonb; owner uuid; b jsonb;
begin
 if tg_table_name='talent_external_operations' then
  if new.kind not in ('resource_item','resource_research','resource_evaluation','resource_search') or new.result->>'source_unavailable'='true' then return new;end if;
  owner:=new.user_id;
  sources:=jsonb_build_array(new.request->'sourceRefs',new.request->'contextRefs',new.request->'knownSourceRefs',new.request->'contextSnapshot',new.request->'inputSnapshot');
 elsif tg_table_name='career_result_items' then
  if new.projection='{}' and new.evaluation_ref is null then return new;end if;
  owner:=new.talent_id;sources:=jsonb_build_array(new.resource_ref,new.evaluation_ref,new.projection);
 elsif tg_table_name='career_opportunities' then
  if new.title='' and new.body='' and new.presentation='{}' then return new;end if;
  owner:=new.talent_id;sources:=jsonb_build_array(new.primary_ref,new.related_refs,new.evidence_refs,new.presentation);
 elsif tg_table_name='career_views' then
  if new.title='' and new.description='' and not exists(select 1 from jsonb_array_elements(new.definition->'blocks') v where v->>'type'='narrative' and coalesce(v->>'markdown','')<>'') then return new;end if;
  owner:=new.talent_id;sources:=new.definition;
  for b in select value from jsonb_array_elements(new.definition->'blocks') where value->>'type'='collection' and value->'selection' ? 'setId' loop
   perform 1 from career_result_sets where id::text=b->'selection'->>'setId' and revision=(b->'selection'->>'revision')::bigint and talent_id=owner for share;
   if not found then raise exception 'View set unavailable' using errcode='42501';end if;
  end loop;
 end if;
 perform career_lock_cache_sources_v1(owner,sources);
 return new;
end $$;
create trigger career_guard_resource_operation before insert or update of request,result on public.talent_external_operations for each row execute function public.career_guard_cached_content_v1();
create trigger career_guard_result_item before insert or update of resource_ref,evaluation_ref,projection on public.career_result_items for each row execute function public.career_guard_cached_content_v1();
create trigger career_guard_opportunity before insert or update of primary_ref,related_refs,evidence_refs,body,presentation on public.career_opportunities for each row execute function public.career_guard_cached_content_v1();
create trigger career_guard_view before insert or update of definition,title,description on public.career_views for each row execute function public.career_guard_cached_content_v1();
revoke all on function public.career_lock_cache_sources_v1(uuid,jsonb),public.career_guard_cached_content_v1() from public,anon,authenticated;
grant execute on function public.career_lock_cache_sources_v1(uuid,jsonb),public.career_guard_cached_content_v1() to service_role;
