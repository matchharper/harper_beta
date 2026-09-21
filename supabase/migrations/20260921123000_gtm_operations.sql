-- Complete work from the same ledgers: context, related records, child items,
-- activity history, attribution links and outreach drafts. No external delivery.
alter table gtm_view.sources add column navigation jsonb;

create view gtm_view.work_queue as
select t.entity_id::text || ':' || t.action_id as id, t.ref, t.title,
  t.action, t.owner_id, t.due_at, t.status, t.row_version, t.action_id,
  t.entity_id as record_id, s.id as record_source,
  case when t.due_at < now() then '기한 지남' when t.due_at is null then '기한 없음' else '예정' end as timing
from public.gtm_today t
join gtm_view.sources s on s.entity=to_regclass('public.' || t.entity) and s.writer='record';
insert into gtm_view.sources(id,label,relation,field_labels,navigation) values
('work_queue','할 일','gtm_view.work_queue',
 '{"ref":"원장 번호","title":"대상","action":"할 일","owner_id":"담당","due_at":"기한","timing":"기한 상태","status":"상태"}',
 '{"source_field":"record_source","id_field":"record_id","tab":"action_items"}');
update gtm_view.sources s set navigation=jsonb_build_object('source',target.id,'id_field','id')
from gtm_view.sources target where s.entity=target.entity and target.writer in ('record','pricing','review');
update gtm_view.sources set navigation='{"source":"contents","id_field":"id"}' where id='feed';
update gtm_view.sources set navigation='{"source":"creators","id_field":"id"}' where id='performance_creator';
update gtm_view.sources set navigation='{"source":"campaigns","id_field":"id"}' where id='performance_campaign';
update gtm_view.sources set navigation='{"source":"formats","id_field":"id"}' where id='performance_format';
insert into gtm_view.sheets(name,position,updated_by,definition) values('할 일',-1,'workspace seed',
 '{"source":"work_queue","columns":[{"key":"timing","label":"기한 상태","width":110,"rules":[{"operator":"eq","value":"기한 지남","color":"#fce8e6"}]},{"key":"due_at","label":"기한","width":190},{"key":"action","label":"할 일","width":360},{"key":"owner_id","label":"담당","width":140},{"key":"title","label":"대상","width":240},{"key":"ref","label":"원장 번호","width":90}],"filters":[],"sorting":[{"key":"due_at","desc":false}],"rowHeight":40,"rowHeights":{}}');

-- These schemas describe durable child-item contracts already enforced by gtm_api.
-- They are not a second task/contact/payment store.
create function gtm_view.collections(p_entity regclass) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(c),'[]') from jsonb_array_elements($contracts$[
 {"key":"contacts","label":"연락처","fields":[{"key":"channel","label":"채널","required":true},{"key":"address","label":"주소 / 계정","required":true},{"key":"role","label":"본인 / 매니저"},{"key":"source_ref","label":"확인 근거","required":true},{"key":"as_of","label":"확인 시각","type":"date","required":true},{"key":"status","label":"상태","options":[{"value":"valid","label":"유효"},{"value":"invalid","label":"유효하지 않음"},{"value":"bounced","label":"반송"},{"value":"revoked","label":"사용 중지"}]}]},
 {"key":"action_items","label":"할 일","fields":[{"key":"text","label":"할 일","required":true},{"key":"owner_id","label":"담당"},{"key":"due_at","label":"기한","type":"date"},{"key":"status","label":"상태","required":true,"options":[{"value":"open","label":"진행 중"},{"value":"done","label":"완료"},{"value":"cancelled","label":"취소"}]},{"key":"source_ref","label":"처리 근거"}]},
 {"key":"payments","label":"지급 / 환불 기록","immutable":true,"fields":[{"key":"kind","label":"구분","required":true,"options":[{"value":"payment","label":"지급"},{"value":"refund","label":"환불"}]},{"key":"amount","label":"금액 · 비용 원장의 통화","type":"number","required":true},{"key":"occurred_at","label":"실제 처리 시각","type":"date","required":true},{"key":"source_ref","label":"증빙","required":true}]},
 {"key":"allocations","label":"비용 배분","fields":[{"key":"content_id","label":"콘텐츠","reference":"contents"},{"key":"plan_id","label":"집행","reference":"plans"},{"key":"share","label":"비율 · 합계 1","type":"number","required":true}]},
 {"key":"asset_refs","label":"제작 파일","fields":[{"key":"ref","label":"파일 링크","required":true},{"key":"label","label":"이름"},{"key":"version","label":"버전"},{"key":"source_ref","label":"출처 / 사용 근거"}]}
 ]$contracts$::jsonb)c where exists(select 1 from pg_attribute where attrelid=p_entity and attname=c->>'key' and attnum>0 and not attisdropped);
$$;

create function gtm_view.record_fields(p_source text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s gtm_view.sources; result jsonb;
begin
 select * into strict s from gtm_view.sources where id=p_source;
 if s.entity is null then return '[]'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'key',a.attname,'label',coalesce(s.field_labels->>a.attname,replace(a.attname,'_',' ')),
  'type',case when t.typcategory='N' then 'number' when t.typname='bool' then 'boolean' when t.typcategory='D' then 'date' when t.typcategory='A' then 'array' when t.typname in ('json','jsonb') then 'json' else 'text' end,
  'writable',coalesce(s.writer in ('record','pricing') and a.attname<>all(array['id','ref','created_at','updated_at','created_by','updated_by','row_version','archived_at','tracking_links','contacts','action_items','payments','allocations','asset_refs'])
   and (s.writer<>'pricing' or a.attname=any(array['name','status','pricing_model','currency','base_fee','measurement_window_days','views_per_unit','amount_per_unit','notes','version'])),false),
  'required',a.attnotnull and not a.atthasdef,
  'reference',(select target.id from pg_constraint fk join gtm_view.sources target on target.entity=fk.confrelid and target.writer in ('record','pricing','review') where fk.contype='f' and fk.conrelid=s.entity and fk.conkey=array[a.attnum] order by target.id limit 1)
 ) order by a.attnum),'[]') into result from pg_attribute a join pg_type t on t.oid=a.atttypid
 where a.attrelid=s.entity and a.attnum>0 and not a.attisdropped;
 return result;
end $$;

-- Discover child relations from real FKs; common FK values carry the existing
-- creator/plan into the next record, never infer a business decision or new state.
create function gtm_view.child_relations(p_source text,p_record jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s gtm_view.sources; child record; defaults jsonb; result jsonb:='[]';
begin
 select * into strict s from gtm_view.sources where id=p_source;
 for child in select c.id,c.label,c.entity,c.writer,a.attname as key
 from pg_constraint fk join gtm_view.sources c on c.entity=fk.conrelid and c.writer in ('record','pricing','review')
 join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=fk.conkey[1]
 where fk.contype='f' and fk.confrelid=s.entity and array_length(fk.conkey,1)=1 and fk.conrelid<>s.entity
 order by c.label,a.attname loop
  select coalesce(jsonb_object_agg(a.attname,p_record->a.attname),'{}') into defaults
  from pg_constraint f join pg_attribute a on a.attrelid=f.conrelid and a.attnum=f.conkey[1]
  where f.contype='f' and f.conrelid=child.entity and array_length(f.conkey,1)=1 and p_record?a.attname
    and exists(select 1 from pg_constraint parent_fk join pg_attribute pa on pa.attrelid=parent_fk.conrelid and pa.attnum=parent_fk.conkey[1]
      where parent_fk.contype='f' and parent_fk.conrelid=s.entity and parent_fk.confrelid=f.confrelid and pa.attname=a.attname);
  result:=result||jsonb_build_array(jsonb_build_object('source',child.id,'label',child.label,'key',child.key,
   'creatable',child.writer in ('record','pricing'),'defaults',defaults||jsonb_build_object(child.key,p_record->'id')));
 end loop;
 return result;
end $$;

-- Use the original sheet/query API without duplicating its implementation.
alter function public.gtm_workspace(text,jsonb,text) set schema gtm_view;
alter function gtm_view.gtm_workspace(text,jsonb,text) rename to sheet_workspace;

-- Give the existing draft preparation function the same verified web identity.
do $migration$
declare definition text; patched text;
begin
 select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='gtm_outreach_prepare';
 patched:=regexp_replace(definition,'select \* into credential\s+from public\.gtm_access_tokens\s+where token_hash\s*=.*?and revoked_at is null\s+and expires_at\s*>\s*now\(\);','select * into credential from gtm_view.credential(p_token);','ns');
 if patched=definition and position('gtm_view.credential(p_token)' in definition)=0 then raise exception 'Outreach preparation authentication seam changed'; end if;
 execute patched;
end $migration$;

create function public.gtm_workspace(p_action text,p_data jsonb default '{}',p_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare credential public.gtm_access_tokens; s gtm_view.sources; target gtm_view.sources;
 record_data jsonb; view_data jsonb; result jsonb; field jsonb; key text; entity_name text; relation_key text;
 limit_rows integer; offset_rows integer; child jsonb; rows_data jsonb; total_rows bigint;
begin
 credential:=gtm_view.credential(p_token);
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='catalog' then
  result:=gtm_view.sheet_workspace(p_action,p_data,p_token);
  return jsonb_set(result,'{sources}',(select jsonb_agg(value||jsonb_build_object('navigation',registered.navigation,'record_fields',gtm_view.record_fields(registered.id))) from jsonb_array_elements(result->'sources') join gtm_view.sources registered on registered.id=value->>'id'));
 end if;
 if p_action='reference_options' then
  result:=gtm_view.sheet_workspace(p_action,p_data,p_token);
  if nullif(p_data->>'selected_id','') is not null and not exists(select 1 from jsonb_array_elements(result->'options')o where o->>'id'=p_data->>'selected_id') then
   select * into s from gtm_view.sources where id=p_data->>'source' and entity is not null;
   if s.entity is not null then
    execute format('select to_jsonb(t) from %s t where id=$1',s.entity) into record_data using (p_data->>'selected_id')::uuid;
    if record_data is not null then result:=jsonb_set(result,'{options}',jsonb_build_array(jsonb_build_object('id',record_data->>'id','label',concat_ws(' · ',record_data->>'ref',coalesce(record_data->>'name',record_data->>'title',record_data->>'handle',record_data->>'description'))))||(result->'options')); end if;
   end if;
  end if;
  return result;
 end if;
 if p_action=any(array['query','save_sheet','delete_sheet']) then
  return gtm_view.sheet_workspace(p_action,p_data,p_token);
 end if;
 if p_action<>all(array['get_record','related_records','activity_history','save_record','patch_items','issue_link','log_activity','archive_record','restore_record','prepare_outreach','review_outreach']) then
  raise exception 'Unknown workspace action' using errcode='22023'; end if;
 if p_data->>'source' is not null then select * into s from gtm_view.sources where id=p_data->>'source';
 else select sources.* into s from gtm_view.sources sources join gtm_view.sheets sh on sh.definition->>'source'=sources.id where sh.id=(p_data->>'sheet_id')::uuid;
 end if;
 if s.entity is null then raise exception 'Choose a registered record source' using errcode='22023'; end if;
 entity_name:=replace(s.entity::text,'public.','');
 if p_data->>'record_id' is not null then
  execute format('select to_jsonb(t) from %s t where id=$1',s.entity) into record_data using (p_data->>'record_id')::uuid;
  if record_data is null then raise exception 'Record not found' using errcode='P0002'; end if;
 elsif p_action<>'save_record' then raise exception 'Record ID is required' using errcode='22023';
 end if;
 if p_action='get_record' then
  execute format('select to_jsonb(t) from %s t where id=$1',s.relation) into view_data using (p_data->>'record_id')::uuid;
  return jsonb_build_object('record',coalesce(view_data,'{}')||record_data,'fields',gtm_view.record_fields(s.id),
   'collections',case when s.writer='record' then gtm_view.collections(s.entity) else '[]'::jsonb end,
   'relations',gtm_view.child_relations(s.id,record_data),'capabilities',jsonb_build_object(
    'write',credential.can_write and s.writer in ('record','pricing') and record_data->>'archived_at' is null,
    'archive',credential.can_write and s.writer='record' and record_data->>'archived_at' is null,
    'restore',credential.can_write and s.writer='record' and record_data->>'archived_at' is not null,
    'activity',credential.can_write and s.writer='record',
    'issue_link',credential.can_write and s.entity='public.gtm_contents'::regclass and record_data->>'archived_at' is null,
    'prepare_outreach',credential.can_write and s.entity='public.gtm_creators'::regclass and record_data->>'archived_at' is null));
 end if;
 limit_rows:=least(greatest(coalesce((p_data->>'limit')::integer,30),1),100);
 offset_rows:=greatest(coalesce((p_data->>'offset')::integer,0),0);
 if p_action='related_records' then
  select value into child from jsonb_array_elements(gtm_view.child_relations(s.id,record_data)) where value->>'source'=p_data->>'target_source' and value->>'key'=p_data->>'key';
  if child is null then raise exception 'Unknown record relation' using errcode='22023'; end if;
  select * into strict target from gtm_view.sources where id=child->>'source';
  execute format('select count(*) from %s t where %I=$1 and to_jsonb(t)->>''archived_at'' is null',target.entity,child->>'key') into total_rows using (p_data->>'record_id')::uuid;
  execute format('select coalesce(jsonb_agg(r),''[]'') from (select to_jsonb(t) r from %s t where %I=$1 and to_jsonb(t)->>''archived_at'' is null order by ref desc limit $2 offset $3)x',target.relation,child->>'key') into rows_data using (p_data->>'record_id')::uuid,limit_rows,offset_rows;
  return jsonb_build_object('rows',rows_data,'total',total_rows,'offset',offset_rows,'limit',limit_rows);
 elsif p_action='activity_history' then
  select count(*) into total_rows from public.gtm_activities where entity=entity_name and entity_id=(p_data->>'record_id')::uuid and archived_at is null and kind not like 'system.%';
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_data from (select id,ref,kind,body,source_ref,occurred_at,created_by,payload from public.gtm_activities where entity=entity_name and entity_id=(p_data->>'record_id')::uuid and archived_at is null and kind not like 'system.%' order by occurred_at desc,id limit limit_rows offset offset_rows)t;
  return jsonb_build_object('rows',rows_data,'total',total_rows,'offset',offset_rows,'limit',limit_rows);
 end if;
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if p_action='review_outreach' then
  if s.writer is distinct from 'review' then raise exception 'Not an outreach review source' using errcode='22023'; end if;
  if p_data->>'decision'=any(array['approve','revise','request_revision']) and
     (jsonb_typeof(p_data->'subject') is distinct from 'string' or jsonb_typeof(p_data->'body') is distinct from 'string'
      or coalesce(btrim(p_data->>'subject'),'')='' or coalesce(btrim(p_data->>'body'),'')='') then raise exception '제목과 본문을 입력하세요.' using errcode='22023'; end if;
  return public.gtm_outreach_review(p_token,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->>'decision',(p_data->>'request_id')::uuid,p_data->>'subject',p_data->>'body',nullif(p_data->>'scheduled_at','')::timestamptz,p_data->>'review_note',credential.name);
 end if;
 if s.writer is null or s.writer='review' then raise exception 'This source is read only' using errcode='42501'; end if;
 if p_action='save_record' then
  if jsonb_typeof(p_data->'values') is distinct from 'object' then raise exception 'values must be an object' using errcode='22023'; end if;
  for key in select jsonb_object_keys(p_data->'values') loop
   if not exists(select 1 from jsonb_array_elements(gtm_view.record_fields(s.id))f where f->>'key'=key and (f->>'writable')::boolean) then raise exception 'Read-only field: %',key using errcode='42501'; end if;
  end loop;
  if s.writer='pricing' then return public.gtm_compensation_strategy_save(p_token,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid); end if;
  return public.gtm_api(p_token,'save',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 end if;
 if s.writer<>'record' then raise exception 'Action is unavailable for this source' using errcode='42501'; end if;
 if p_action='patch_items' then
  if not exists(select 1 from jsonb_array_elements(gtm_view.collections(s.entity))c where c->>'key'=p_data->>'field') then raise exception 'Unknown child collection' using errcode='22023'; end if;
  return public.gtm_api(p_token,'patch_item',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,jsonb_build_object('field',p_data->>'field','items',p_data->'items'),(p_data->>'request_id')::uuid);
 elsif p_action='issue_link' then
  return public.gtm_api(p_token,'issue_link',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,p_data->'values',(p_data->>'request_id')::uuid);
 elsif p_action='archive_record' then
  return public.gtm_api(p_token,'archive',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,'{}',(p_data->>'request_id')::uuid);
 elsif p_action='restore_record' then
  return public.gtm_api(p_token,'save',entity_name,(p_data->>'record_id')::uuid,(p_data->>'expected_version')::bigint,'{"archived_at":null}',(p_data->>'request_id')::uuid);
 elsif p_action='log_activity' then
  if nullif(btrim(p_data->>'body'),'') is null then raise exception '기록 내용을 입력하세요.' using errcode='22023'; end if;
  if coalesce(p_data->>'kind','note')<>all(array['note','performance_review','review_adopted']) then raise exception 'Unsupported activity kind' using errcode='22023'; end if;
  if p_data->>'kind'='review_adopted' and nullif(btrim(p_data->>'direction'),'') is null then raise exception '채택한 방향을 입력하세요.' using errcode='22023'; end if;
  return public.gtm_api(p_token,'save','gtm_activities',null,null,jsonb_build_object('entity',entity_name,'entity_id',p_data->>'record_id','kind',coalesce(p_data->>'kind','note'),'body',p_data->>'body','source_ref',p_data->>'source_ref','payload',jsonb_strip_nulls(jsonb_build_object('direction',nullif(p_data->>'direction','')))),(p_data->>'request_id')::uuid);
 elsif p_action='prepare_outreach' then
  if s.entity<>'public.gtm_creators'::regclass then raise exception 'Choose a creator' using errcode='22023'; end if;
  return public.gtm_outreach_prepare(p_token,(p_data->>'record_id')::uuid,(p_data->>'template_id')::uuid,p_data->>'recipient_email','harper@matchharper.com',p_data->>'subject',p_data->>'body',p_data->>'selection_reason',(p_data->>'request_id')::uuid,null,null,p_data->>'personalization_evidence');
 end if;
 raise exception 'Unknown record operation' using errcode='22023';
end $$;
revoke all on all functions in schema gtm_view from public,anon,authenticated;
revoke all on all tables in schema gtm_view from public,anon,authenticated;
revoke all on function public.gtm_workspace(text,jsonb,text) from public;
grant execute on function public.gtm_workspace(text,jsonb,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
