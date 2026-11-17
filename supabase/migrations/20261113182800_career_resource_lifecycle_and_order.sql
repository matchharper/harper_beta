create function public.career_resolve_opportunity_id_v1(p_user uuid,p_id text) returns uuid
language sql stable security invoker set search_path=public,pg_temp as $$
 with recursive aliases(id,merged_into_id,seen) as (
  select id,merged_into_id,array[id] from career_opportunities where talent_id=p_user and id::text=p_id and deleted_at is null
  union all select o.id,o.merged_into_id,a.seen||o.id from aliases a join career_opportunities o on o.id=a.merged_into_id
   where o.talent_id=p_user and o.deleted_at is null and not o.id=any(a.seen)
 ) select id from aliases where merged_into_id is null limit 1
$$;
create function public.career_opportunity_work_v1(p_user uuid,p_id text,p_active boolean default false,p_offset integer default 0,p_limit integer default 50)
returns setof public.talent_external_operations language sql stable security invoker set search_path=public,pg_temp as $$
 select w.* from talent_external_operations w where w.user_id=p_user and w.kind='delegated_work'
  and (not p_active or w.status not in ('completed','cancelled'))
  and exists(select 1 from career_json_resource_refs_v1(w.request->'resource_refs') ref where ref->>'kind'='opportunity'
   and career_resolve_opportunity_id_v1(p_user,ref->>'id')=career_resolve_opportunity_id_v1(p_user,p_id))
 order by w.updated_at desc,w.id offset greatest(0,p_offset) limit greatest(1,least(p_limit,100))
$$;
create or replace function public.career_list_opportunities_v1(p_user uuid,p_saved boolean,p_archived boolean,p_offset integer,p_limit integer,p_unbound boolean default false)
returns table(id uuid,total_count bigint) language sql stable security invoker set search_path=public,pg_temp as $$
 select o.id,count(*) over() from career_opportunities o left join talent_opportunity_recommendation r on r.id=o.recommendation_id and r.talent_id=o.talent_id
 where o.talent_id=p_user and o.deleted_at is null and o.merged_into_id is null and (not p_unbound or o.recommendation_id is null)
  and ((p_archived and o.archived_at is not null) or (not p_archived and o.archived_at is null))
  and (p_saved is null or p_saved=(case when o.recommendation_id is null then o.saved_at is not null or exists(select 1 from career_opportunity_work_v1(p_user,o.id::text,false,0,1))
    else r.saved_stage is not null and r.saved_stage<>'hidden' end))
 order by o.display_order,o.id offset p_offset limit p_limit
$$;
revoke all on function public.career_resolve_opportunity_id_v1(uuid,text),public.career_opportunity_work_v1(uuid,text,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.career_resolve_opportunity_id_v1(uuid,text),public.career_opportunity_work_v1(uuid,text,boolean,integer,integer) to service_role;

-- Move one step in the owner's current list, atomically even when existing
-- display_order values tie. The original agent cannot overwrite this ordering.
create function public.career_move_resource_v1(p_user uuid,p_kind text,p_id uuid,p_revision bigint,p_direction text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare table_name text; ids uuid[]; at_index integer; other_index integer; current_revision bigint; archived boolean; saved boolean; swap uuid;
begin
 if p_direction not in ('up','down') then raise exception 'Invalid move direction';end if;
 if p_kind='view' then table_name:='career_views';
 elsif p_kind='opportunity' then table_name:='career_opportunities';
 else raise exception 'Invalid sortable resource';end if;
 perform pg_advisory_xact_lock(hashtextextended('career-order:'||p_user::text||':'||p_kind,0));
 execute format('select revision,archived_at is not null from %I where id=$1 and talent_id=$2 for update',table_name)
 into current_revision,archived using p_id,p_user;
 if current_revision is null then raise exception 'Resource unavailable';end if;
 if current_revision<>p_revision then raise exception 'Resource revision conflict' using errcode='40001';end if;
 if p_kind='opportunity' then
  select saved_at is not null or exists(select 1 from career_opportunity_work_v1(p_user,p_id::text,false,0,1)) into saved from career_opportunities where id=p_id and talent_id=p_user and recommendation_id is null and merged_into_id is null and deleted_at is null;
  if not found then raise exception 'Use the existing recommendation order for a bound opportunity';end if;
 end if;
 execute format('select array_agg(id order by display_order,id) from (select id,display_order from %I
  where talent_id=$1 and (archived_at is not null)=$2 %s order by id for update) locked',table_name,
  case when p_kind='opportunity' then 'and recommendation_id is null and merged_into_id is null and deleted_at is null and (saved_at is not null or exists(select 1 from career_opportunity_work_v1($1,id::text,false,0,1)))=$3' else '' end)
 into ids using p_user,archived,saved;
 at_index:=array_position(ids,p_id);
 other_index:=at_index+case when p_direction='up' then -1 else 1 end;
 if other_index<1 or other_index>array_length(ids,1) then return;end if;
 swap:=ids[other_index];ids[other_index]:=p_id;ids[at_index]:=swap;
 execute format('update %I t set display_order=n.ordinality,order_source=''user'',revision=t.revision+1,updated_at=now()
  from unnest($1::uuid[]) with ordinality n(id,ordinality) where t.id=n.id and t.talent_id=$2
  and (t.display_order<>n.ordinality or t.order_source<>''user'')',table_name) using ids,p_user;
end $$;
revoke all on function public.career_move_resource_v1(uuid,text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.career_move_resource_v1(uuid,text,uuid,bigint,text) to service_role;

-- Hard deletion of these private originals has the same cache boundary as a
-- document deletion. Account soft deletion deliberately preserves its history.
create function public.career_deleted_private_original_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_table_name='talent_profiles' then perform career_purge_resource_copies_v1(old.talent_id,'profile',old.id::text);
 else perform career_purge_resource_copies_v1(old.user_id,'message',old.id::text);end if;
 return old;
end $$;
create trigger career_deleted_profile_copies after delete on talent_profiles for each row execute function career_deleted_private_original_v1();
create trigger career_deleted_message_copies after delete on talent_messages for each row execute function career_deleted_private_original_v1();

create function public.career_closed_account_resources_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.deleted_at is null and new.deleted_at is not null then
  delete from career_resource_index where owner_id=new.user_id;
  update talent_external_operations set status='cancelled',revision=revision+1,updated_at=now()
   where user_id=new.user_id and kind in ('resource_search','resource_research','resource_evaluation','resource_item','public_discovery_event')
    and status in ('reserved','running','ready');
 end if;
 return new;
end $$;
create trigger career_closed_account_resources after update of deleted_at on talent_users for each row execute function career_closed_account_resources_v1();
revoke all on function public.career_deleted_private_original_v1(),public.career_closed_account_resources_v1() from public,anon,authenticated;

create function public.career_index_owner_active_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id is not null then
  perform 1 from talent_users where user_id=new.owner_id and deleted_at is null for share;
  if not found then return null;end if;
 end if;
 return new;
end $$;
create trigger career_index_owner_active before insert or update on career_resource_index for each row execute function career_index_owner_active_v1();
revoke all on function public.career_index_owner_active_v1() from public,anon,authenticated;

-- Only fields actually written from this observation are cleared. Independently
-- acquired directory facts and existing personal progress retain their owners.
create function public.career_revoked_public_directory_facts_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c company_db; r company_roles; fields text[];
begin
 if tg_op='UPDATE' and (new.deleted_at is null or old.deleted_at is not null) then return new;end if;
 for c in select * from company_db where exists(select 1 from career_json_resource_refs_v1(public_context->'fieldSources') ref
   where ref->>'kind'='observation' and ref->>'id'=old.id::text) for update loop
  select array_agg(key) into fields from jsonb_each(c.public_context->'fieldSources') f where exists(
   select 1 from jsonb_array_elements(f.value) ref where ref->>'kind'='observation' and ref->>'id'=old.id::text);
  update company_db set name=case when 'name'=any(fields) then '' else name end,
   description=case when 'description'=any(fields) then null else description end,
   website_url=case when 'website_url'=any(fields) then null else website_url end,
   location=case when 'location'=any(fields) then null else location end,
   public_context=public_context||jsonb_build_object('revokedThroughRevision',c.public_facts_revision,'fieldSources',(public_context->'fieldSources')-fields,
    'sourceRefs',coalesce((select jsonb_agg(ref) from jsonb_array_elements(public_context->'sourceRefs') ref where ref->>'id'<>old.id::text),'[]'))
   where id=c.id;
  perform career_purge_resource_copies_v1(null,'company',c.id::text);
 end loop;
 for r in select * from company_roles where source_provider='career_public_discovery' and information->'publicDiscovery'->>'observationId'=old.id::text for update loop
  update company_roles set name='',description='',description_summary=null,summary='{}',title_embedding=null,title_embedding_text=null,
   location_text=null,salary_range=null,salary_min=null,salary_max=null,salary_currency=null,salary_period=null,
   is_expired=true,expired_at=now(),updated_at=now() where role_id=r.role_id;
  perform career_purge_resource_copies_v1(null,'role',r.role_id::text);
 end loop;
 return old;
end $$;
create trigger career_revoked_public_directory_facts after update of deleted_at or delete on career_public_observations
 for each row execute function career_revoked_public_directory_facts_v1();
revoke all on function public.career_revoked_public_directory_facts_v1() from public,anon,authenticated;
