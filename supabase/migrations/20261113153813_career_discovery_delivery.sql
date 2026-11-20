-- The existing operation ledger is the durable inbox. Shared headers contain
-- dispatch cursors only; recipient instructions and evidence stay private.
create index career_discovery_event_pending on talent_external_operations(user_id,created_at)
 where kind='public_discovery_event' and status='reserved';
create index career_active_discovery_schedule on talent_agent_schedules(id)
 where status='active' and target_refs ? 'discovery';

create function career_discovery_schedule_index_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
  delete from career_resource_index where owner_id=old.talent_id and resource_kind='discovery_request' and resource_id=old.id::text;
  return old;
 end if;
 if new.status<>'active' or not (new.target_refs ? 'discovery') then
  delete from career_resource_index where owner_id=new.talent_id and resource_kind='discovery_request' and resource_id=new.id::text;
 elsif tg_op='INSERT' or old.status is distinct from new.status or old.directive_revision is distinct from new.directive_revision then
  insert into career_resource_index(scope,owner_id,resource_kind,resource_id,source_revision,chunk_key,index_state)
  values('private',new.talent_id,'discovery_request',new.id::text,new.directive_revision::text||':'||extract(epoch from clock_timestamp())::text,'@source','pending')
  on conflict(scope,owner_id,resource_kind,resource_id,chunk_key) do update set source_revision=excluded.source_revision,
   index_state='pending',dispatch_state=null,lease_owner=null,lease_until=null,updated_at=now();
 end if;
 return new;
end $$;
create trigger career_discovery_schedule_index after insert or update or delete on talent_agent_schedules
 for each row execute function career_discovery_schedule_index_v1();

create function career_discovery_document_index_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update career_resource_index h set source_revision=s.directive_revision::text||':'||extract(epoch from clock_timestamp())::text,
  index_state='pending',dispatch_state=null,lease_owner=null,lease_until=null,updated_at=now()
 from talent_agent_schedules s where h.owner_id=s.talent_id and h.resource_kind='discovery_request' and h.resource_id=s.id::text and h.chunk_key='@source'
 and s.status='active' and s.talent_id=new.talent_id
 and (s.target_refs->'discovery'->'context_refs' @> jsonb_build_array(jsonb_build_object('kind','document','id',new.id::text))
   or s.target_refs->'discovery'->'source_refs' @> jsonb_build_array(jsonb_build_object('kind','document','id',new.id::text)));
 return new;
end $$;
create trigger career_discovery_document_index after insert or update of revision,is_deleted on talent_documents
 for each row execute function career_discovery_document_index_v1();

create function career_discovery_event_current_v1(p_user uuid,p_event jsonb) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select exists(select 1 from talent_agent_schedules s join talent_users u on u.user_id=s.talent_id
  left join talent_setting t on t.user_id=s.talent_id
  where s.id::text=p_event->>'sourceId' and s.talent_id=p_user and s.status='active'
   and s.directive_revision::text=p_event->>'revision' and s.target_refs ? 'discovery' and u.deleted_at is null
   and t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false
   and not exists(select 1 from jsonb_array_elements(coalesce(p_event->'resourceRefs','[]')) r
     where not career_resource_available_v1(p_user,r))
   and not exists(select 1 from jsonb_array_elements(coalesce(s.target_refs->'discovery'->'context_refs','[]')||coalesce(s.target_refs->'discovery'->'source_refs','[]')) r
     where not career_resource_available_v1(p_user,r))
   and not exists(select 1 from jsonb_array_elements(coalesce(p_event->'resourceRefs','[]')) r
     left join career_resource_index h on h.scope='public' and h.resource_kind=r->>'kind' and h.resource_id=r->>'id' and h.chunk_key='@source'
     where h.source_revision is distinct from r->>'revision'))
$$;

-- Candidate retrieval is approximate, not a fit decision. The semantic window
-- is the dispatcher's bounded retrieval page, supplemented by exact/lexical
-- subscriptions and each delegated schedule's regular broad search.
create function career_dispatch_public_source_v1(p_kind text,p_id text,p_revision text,p_lease uuid,p_limit integer default 50)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare h career_resource_index; s record; event jsonb; last_id text; processed integer:=0; has_more boolean;
begin
 select * into h from career_resource_index where scope='public' and resource_kind=p_kind and resource_id=p_id and chunk_key='@source'
  and source_revision=p_revision and index_state='ready' and lease_owner=p_lease and lease_until>now() for update;
 if not found then return null; end if;
 last_id:=h.dispatch_state->>'cursor';
 for s in
  with source_chunks as (select body,embedding from career_resource_index where scope='public' and resource_kind=p_kind and resource_id=p_id
    and source_revision=p_revision and chunk_key<>'@source' and index_state='ready'),
  semantic as (select d.resource_id,min(d.embedding<=>c.embedding) distance from career_resource_index d join career_resource_index dh on dh.scope='private' and dh.owner_id=d.owner_id and dh.resource_kind='discovery_request'
      and dh.resource_id=d.resource_id and dh.chunk_key='@source' and dh.source_revision=d.source_revision and dh.index_state='ready' cross join source_chunks c
    where d.resource_kind='discovery_request' and d.chunk_key<>'@source' and d.index_state='ready' and d.embedding is not null and c.embedding is not null
    group by d.resource_id order by min(d.embedding<=>c.embedding),d.resource_id limit 100),
  candidates as (select a.* from talent_agent_schedules a where a.status='active' and a.target_refs ? 'discovery'
    and (exists(select 1 from semantic n where n.resource_id=a.id::text)
      or a.target_refs->'discovery'->'source_refs' @> jsonb_build_array(jsonb_build_object('kind',p_kind,'id',p_id))
      or exists(select 1 from jsonb_array_elements_text(coalesce(a.target_refs->'discovery'->'queries','[]')) q,source_chunks c
         where to_tsvector('simple',c.body) @@ websearch_to_tsquery('simple',q))))
  select * from candidates where last_id is null or id::text>last_id order by id limit p_limit
 loop
  event:=jsonb_build_object('sourceKind','public_discovery','sourceId',s.id,'revision',s.directive_revision,
    'resourceRefs',jsonb_build_array(jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision)),
    'occurredAt',now(),'title',s.title,'instruction',s.instruction,'targetRefs',s.target_refs,
    'batchIdentity',p_kind||':'||p_id||':'||p_revision);
  if career_discovery_event_current_v1(s.talent_id,event) then
   insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
    values(s.talent_id,s.conversation_id,'public_discovery_event','discovery:'||s.id||':'||s.directive_revision||':'||p_kind||':'||p_id||':'||p_revision,
      'reserved',jsonb_build_object('event',event,'delivery_mode',s.target_refs->'discovery'->>'delivery_mode'),'{}') on conflict do nothing;
  end if;
  last_id:=s.id::text;processed:=processed+1;
 end loop;
 has_more:=processed=p_limit;
 update career_resource_index set dispatch_state=jsonb_build_object('revision',p_revision,'cursor',last_id,'complete',not has_more,
   'checkedAt',now()),lease_owner=null,lease_until=null,updated_at=now()
 where scope='public' and resource_kind=p_kind and resource_id=p_id and chunk_key='@source' and source_revision=p_revision and lease_owner=p_lease;
 return jsonb_build_object('processed',processed,'complete',not has_more);
end $$;

create function career_admit_discovery_events_v1(p_user uuid,p_run uuid default null) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare op record; events jsonb:='[]'; ids uuid[]:='{}'; run_id uuid:=p_run; current_run opportunity_discovery_run; event jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':career_processing',0));
 if p_run is not null then
  select * into current_run from opportunity_discovery_run where id=p_run and talent_id=p_user and status in ('queued','running','handed_off') for update;
  if not found then return null; end if;
 elsif exists(select 1 from opportunity_discovery_run where talent_id=p_user and trigger_payload->>'runContract'='career_agent_v1' and status in ('queued','running','handed_off')) then return null;
 end if;
 for op in select * from talent_external_operations where user_id=p_user and kind='public_discovery_event' and status='reserved' order by created_at,id for update skip locked loop
  event:=op.request->'event';
  if not career_discovery_event_current_v1(p_user,event) then
   update talent_external_operations set status='cancelled',revision=revision+1,updated_at=now() where id=op.id;
   continue;
  end if;
  if op.request->>'delivery_mode'='scheduled' and (p_run is null or not exists(select 1 from jsonb_array_elements(coalesce(current_run.trigger_payload->'sourceEvents','[]')) e
     where e->>'sourceKind'='schedule' and e->>'sourceId'=event->>'sourceId')) then continue; end if;
  events:=events||jsonb_build_array(event||jsonb_build_object('inboxOperationId',op.id));ids:=array_append(ids,op.id);
 end loop;
 if cardinality(ids)=0 then return p_run; end if;
 if p_run is null then
  insert into opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
   select p_user,s.conversation_id,'career_public_discovery','refresh','queued','discovery-inbox:'||md5(ids::text),
    jsonb_build_object('runContract','career_agent_v1','contactScope','delegated_work','sourceEvents',events,
     'instruction','Review these public source changes against the active delegated instructions. Read current private context and decide whether any action or user update is warranted.')
   from talent_agent_schedules s where s.id::text=events->0->>'sourceId'
   returning id into run_id;
 else
  update opportunity_discovery_run set trigger_payload=jsonb_set(trigger_payload,'{sourceEvents}',coalesce(trigger_payload->'sourceEvents','[]')||events),updated_at=now() where id=p_run;
 end if;
 update talent_external_operations set status='completed',revision=revision+1,result=jsonb_build_object('discoveryRunId',run_id),updated_at=now() where id=any(ids);
 return run_id;
end $$;

create function career_pending_discovery_owners_v1(p_limit integer default 50) returns table(user_id uuid)
language sql stable security invoker set search_path=public,pg_temp as $$
 select o.user_id from talent_external_operations o where o.kind='public_discovery_event' and o.status='reserved' and o.request->>'delivery_mode'='on_change'
 and not exists(select 1 from opportunity_discovery_run r where r.talent_id=o.user_id and r.trigger_payload->>'runContract'='career_agent_v1' and r.status in ('queued','running','handed_off'))
 group by o.user_id order by min(o.created_at),o.user_id limit p_limit
$$;

-- A newly created/resumed/edited request consumes existing indexed public assets
-- through the same inbox. This does not copy private query text to public rows.
create function career_backfill_discovery_request_v1(p_user uuid,p_id uuid,p_revision text,p_lease uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s talent_agent_schedules; h career_resource_index; source record; event jsonb; last_key text; processed integer:=0;
begin
 select * into h from career_resource_index where owner_id=p_user and resource_kind='discovery_request' and resource_id=p_id::text and chunk_key='@source'
 and source_revision=p_revision and index_state='ready' and lease_owner=p_lease and lease_until>now() for update;
 if not found then return false; end if;
 select * into s from talent_agent_schedules where id=p_id and talent_id=p_user and status='active';
 if not found then return false; end if;
 last_key:=h.dispatch_state->>'cursor';
 for source in
  with semantic as (
  select c.resource_kind,c.resource_id,c.source_revision,min(c.embedding<=>d.embedding) distance
  from career_resource_index c join career_resource_index ch on ch.scope='public' and ch.resource_kind=c.resource_kind and ch.resource_id=c.resource_id
    and ch.chunk_key='@source' and ch.source_revision=c.source_revision and ch.index_state='ready'
  cross join career_resource_index d
  where c.scope='public' and c.chunk_key<>'@source' and c.index_state='ready' and c.embedding is not null
    and d.owner_id=p_user and d.resource_kind='discovery_request' and d.resource_id=p_id::text and d.source_revision=p_revision and d.chunk_key<>'@source' and d.embedding is not null
  group by c.resource_kind,c.resource_id,c.source_revision order by min(c.embedding<=>d.embedding),c.resource_kind,c.resource_id limit 100
  ), candidates as (
   select resource_kind,resource_id,source_revision from semantic
   union select ph.resource_kind,ph.resource_id,ph.source_revision from career_resource_index ph
   where ph.scope='public' and ph.chunk_key='@source' and ph.index_state='ready' and (
    s.target_refs->'discovery'->'source_refs' @> jsonb_build_array(jsonb_build_object('kind',ph.resource_kind,'id',ph.resource_id))
    or exists(select 1 from career_resource_index c,jsonb_array_elements_text(coalesce(s.target_refs->'discovery'->'queries','[]')) q
     where c.scope='public' and c.resource_kind=ph.resource_kind and c.resource_id=ph.resource_id and c.source_revision=ph.source_revision
      and c.chunk_key<>'@source' and c.index_state='ready' and c.tsv @@ websearch_to_tsquery('simple',q)))
  ) select * from candidates c where last_key is null or c.resource_kind||':'||c.resource_id>last_key
   order by c.resource_kind||':'||c.resource_id limit 50
 loop
  event:=jsonb_build_object('sourceKind','public_discovery','sourceId',s.id,'revision',s.directive_revision,'title',s.title,'instruction',s.instruction,'targetRefs',s.target_refs,
   'resourceRefs',jsonb_build_array(jsonb_build_object('kind',source.resource_kind,'id',source.resource_id,'revision',source.source_revision)),
   'occurredAt',now(),'batchIdentity',source.resource_kind||':'||source.resource_id||':'||source.source_revision);
  if career_discovery_event_current_v1(p_user,event) then
   insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
    values(p_user,s.conversation_id,'public_discovery_event','discovery:'||s.id||':'||s.directive_revision||':'||source.resource_kind||':'||source.resource_id||':'||source.source_revision,
      'reserved',jsonb_build_object('event',event,'delivery_mode',s.target_refs->'discovery'->>'delivery_mode'),'{}') on conflict do nothing;
  end if;
  last_key:=source.resource_kind||':'||source.resource_id;processed:=processed+1;
 end loop;
 update career_resource_index set dispatch_state=jsonb_build_object('revision',p_revision,'cursor',last_key,'complete',processed<50,'checkedAt',now()),lease_owner=null,lease_until=null,updated_at=now()
  where owner_id=p_user and resource_kind='discovery_request' and resource_id=p_id::text and chunk_key='@source' and source_revision=p_revision and lease_owner=p_lease;
 return true;
end $$;

revoke all on function career_discovery_schedule_index_v1(),career_discovery_document_index_v1(),career_discovery_event_current_v1(uuid,jsonb),
 career_dispatch_public_source_v1(text,text,text,uuid,integer),career_admit_discovery_events_v1(uuid,uuid),career_pending_discovery_owners_v1(integer),career_backfill_discovery_request_v1(uuid,uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function career_discovery_event_current_v1(uuid,jsonb),career_dispatch_public_source_v1(text,text,text,uuid,integer),
 career_admit_discovery_events_v1(uuid,uuid),career_pending_discovery_owners_v1(integer),career_backfill_discovery_request_v1(uuid,uuid,text,uuid) to service_role;
