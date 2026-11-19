create function public.career_claim_resource_source_v1(p_scope text,p_owner uuid,p_kind text,p_id text,p_revision text,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare h career_resource_index;
begin
 select * into h from career_resource_index where scope=p_scope and owner_id is not distinct from p_owner
  and resource_kind=p_kind and resource_id=p_id and chunk_key='@source' for update skip locked;
 if not found or h.source_revision<>p_revision or h.lease_until>now() then return null; end if;
 update career_resource_index set lease_owner=p_lease,lease_until=now()+interval '15 minutes',updated_at=now()
 where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id and chunk_key='@source'
 returning * into h;
 return to_jsonb(h);
end $$;

create function public.career_write_resource_chunk_v1(p_scope text,p_owner uuid,p_kind text,p_id text,p_revision text,p_lease uuid,
 p_chunk text,p_body text,p_embedding vector,p_model text) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform 1 from career_resource_index where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id
  and chunk_key='@source' and source_revision=p_revision and lease_owner=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 if p_chunk='@source' then raise exception 'Invalid body chunk key'; end if;
 insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key,body,embedding,embedding_model,index_state)
 values(p_scope,p_owner,p_kind,p_id,p_revision,p_chunk,p_body,p_embedding,p_model,'building')
 on conflict(scope,owner_id,resource_kind,resource_id,chunk_key) do update set source_revision=excluded.source_revision,
  body=excluded.body,embedding=excluded.embedding,embedding_model=excluded.embedding_model,index_state='building',updated_at=now();
 return true;
end $$;

create function public.career_finish_resource_source_v1(p_scope text,p_owner uuid,p_kind text,p_id text,p_revision text,p_lease uuid,p_count integer,p_complete boolean)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare h career_resource_index;
begin
 select * into h from career_resource_index where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id
  and chunk_key='@source' and source_revision=p_revision and lease_owner=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 if p_complete then
  if (select count(*) from career_resource_index where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id
    and chunk_key<>'@source' and source_revision=p_revision)<>p_count then raise exception 'Incomplete source chunks'; end if;
  delete from career_resource_index where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id
    and chunk_key<>'@source' and source_revision<>p_revision;
  update career_resource_index set index_state='ready' where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id and source_revision=p_revision;
 end if;
 update career_resource_index set index_state=case when p_complete then 'ready' else 'pending' end,lease_owner=null,lease_until=null,updated_at=now(),
  dispatch_state=case when p_complete and (p_scope='public' or p_kind='discovery_request') then coalesce(dispatch_state,jsonb_build_object('revision',p_revision,'cursor',null,'complete',false)) when p_complete then jsonb_build_object('complete',true) else dispatch_state end
 where scope=p_scope and owner_id is not distinct from p_owner and resource_kind=p_kind and resource_id=p_id and chunk_key='@source';
 return true;
end $$;

-- Search combines this ranked candidate source with the native lexical reader.
-- Every candidate still passes the owner-aware exact reader before disclosure.
create function public.career_resource_neighbors_v1(p_user uuid,p_kind text,p_embedding vector,p_offset integer,p_limit integer)
returns table(kind text,id text,revision text,distance double precision)
language sql stable security invoker set search_path=public,pg_temp as $$
 select i.resource_kind,i.resource_id,i.source_revision,min(i.embedding<=>p_embedding)
 from career_resource_index i join career_resource_index h on h.scope=i.scope and h.owner_id is not distinct from i.owner_id
  and h.resource_kind=i.resource_kind and h.resource_id=i.resource_id and h.chunk_key='@source' and h.source_revision=i.source_revision
 where i.chunk_key<>'@source' and i.index_state='ready' and i.embedding is not null
  and i.resource_kind=p_kind and (i.scope='public' or i.owner_id=p_user)
  and career_resource_available_v1(p_user,jsonb_build_object('kind',i.resource_kind,'id',i.resource_id))
 group by i.resource_kind,i.resource_id,i.source_revision
 order by min(i.embedding<=>p_embedding),i.resource_id offset p_offset limit p_limit
$$;

create function public.career_backfill_resource_headers_v1(p_limit integer default 500) returns integer
language plpgsql security invoker set search_path=public,pg_temp as $$
declare inserted integer;
begin
 insert into career_resource_index(scope,resource_kind,resource_id,source_revision,chunk_key,index_state)
 select 'public','company',c.id::text,c.public_facts_revision::text,'@source','pending' from company_db c
 where not exists(select 1 from career_resource_index h where h.scope='public' and h.resource_kind='company' and h.resource_id=c.id::text and h.chunk_key='@source')
 order by c.id limit p_limit on conflict do nothing;
 get diagnostics inserted=row_count; return inserted;
end $$;

create function public.career_private_document_index_changed_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.is_deleted then
  delete from career_resource_index where scope='private' and owner_id=new.talent_id and resource_kind='document' and resource_id=new.id::text;
 else
  insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key,index_state)
  values('private',new.talent_id,'document',new.id::text,new.revision::text,'@source','pending')
  on conflict(scope,owner_id,resource_kind,resource_id,chunk_key) do update set source_revision=excluded.source_revision,index_state='pending',lease_owner=null,lease_until=null,updated_at=now();
 end if;
 return new;
end $$;
create trigger career_private_document_index_changed after insert or update of revision,is_deleted on public.talent_documents
 for each row execute function public.career_private_document_index_changed_v1();

revoke all on function public.career_claim_resource_source_v1(text,uuid,text,text,text,uuid),public.career_write_resource_chunk_v1(text,uuid,text,text,text,uuid,text,text,vector,text),
 public.career_finish_resource_source_v1(text,uuid,text,text,text,uuid,integer,boolean),public.career_resource_neighbors_v1(uuid,text,vector,integer,integer),
 public.career_backfill_resource_headers_v1(integer),public.career_private_document_index_changed_v1() from public,anon,authenticated;
grant execute on function public.career_claim_resource_source_v1(text,uuid,text,text,text,uuid),public.career_write_resource_chunk_v1(text,uuid,text,text,text,uuid,text,text,vector,text),
 public.career_finish_resource_source_v1(text,uuid,text,text,text,uuid,integer,boolean),public.career_resource_neighbors_v1(uuid,text,vector,integer,integer),
 public.career_backfill_resource_headers_v1(integer) to service_role;
