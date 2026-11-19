-- Public evidence is independent of a researching user. Personal selections,
-- explanations and views remain owned by the authenticated candidate.
create table public.career_opportunities (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  revision bigint not null default 1,
  primary_ref jsonb not null,
  related_refs jsonb not null default '[]',
  title text not null,
  body text not null default '',
  evidence_refs jsonb not null default '[]',
  presentation jsonb not null default '{}',
  recommendation_id uuid references public.talent_opportunity_recommendation(id),
  merged_into_id uuid,
  display_order numeric not null default 0,
  order_source text not null default 'agent',
  published_at timestamptz not null default now(),
  saved_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,talent_id),
  foreign key(merged_into_id,talent_id) references public.career_opportunities(id,talent_id),
  check(merged_into_id is distinct from id)
);
create unique index career_opportunities_recommendation on public.career_opportunities(talent_id,recommendation_id) where recommendation_id is not null;
create index career_opportunities_list on public.career_opportunities(talent_id,display_order,id) where deleted_at is null and merged_into_id is null;
create index career_opportunities_saved on public.career_opportunities(talent_id,saved_at,archived_at) where deleted_at is null;

create table public.career_result_sets (
  id uuid not null default gen_random_uuid(),
  revision bigint not null default 1,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  operation_id uuid references public.talent_external_operations(id) on delete set null,
  title text,
  manifest jsonb not null default '{}',
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key(id,revision),
  unique(id,revision,talent_id)
);
create index career_result_sets_owner on public.career_result_sets(talent_id,created_at,id);
create table public.career_result_items (
  set_id uuid not null,
  set_revision bigint not null,
  item_id uuid not null default gen_random_uuid(),
  talent_id uuid not null,
  ordinal bigint not null,
  resource_ref jsonb not null,
  source_revision text,
  projection jsonb not null default '{}',
  evaluation_ref jsonb,
  primary key(set_id,set_revision,item_id),
  unique(set_id,set_revision,ordinal),
  foreign key(set_id,set_revision,talent_id) references public.career_result_sets(id,revision,talent_id) on delete cascade
);
create index career_result_items_owner on public.career_result_items(talent_id,set_id,set_revision);
create index career_result_items_refs on public.career_result_items using gin(resource_ref);

create table public.career_views (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  revision bigint not null default 1,
  title text not null,
  description text not null default '',
  definition jsonb not null default '{}',
  display_order numeric not null default 0,
  order_source text not null default 'agent',
  published_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index career_views_owner on public.career_views(talent_id,display_order,id);

create table public.career_public_observations (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  resource_ref jsonb,
  about_refs jsonb not null default '[]',
  source_url text not null,
  content_hash text not null,
  content text not null,
  observed_at timestamptz not null default now(),
  source_fetched_at timestamptz,
  published_at timestamptz,
  locator jsonb not null default '{}',
  provenance jsonb not null,
  deleted_at timestamptz,
  unique(source_key,content_hash)
);
create index career_observation_source on public.career_public_observations(source_key,observed_at desc);
create index career_observation_about on public.career_public_observations using gin(about_refs);

create table public.career_resource_index (
  scope text not null,
  owner_id uuid references public.talent_users(user_id) on delete cascade,
  resource_kind text not null,
  resource_id text not null,
  source_revision text not null,
  chunk_key text not null,
  body text not null default '',
  tsv tsvector generated always as (to_tsvector('simple',body)) stored,
  embedding public.vector(1536),
  embedding_model text,
  index_state text not null default 'pending',
  dispatch_state jsonb,
  lease_owner uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  unique nulls not distinct(scope,owner_id,resource_kind,resource_id,chunk_key),
  check ((scope='public' and owner_id is null) or (scope='private' and owner_id is not null))
);
create index career_resource_index_scope on public.career_resource_index(scope,owner_id,resource_kind,resource_id);
create index career_resource_index_text on public.career_resource_index using gin(tsv) where chunk_key<>'@source';
create index career_resource_index_vector on public.career_resource_index using hnsw(embedding public.vector_cosine_ops) where chunk_key<>'@source';
create index career_resource_index_pending on public.career_resource_index(updated_at) where chunk_key='@source';

alter table public.documents add column resource_key text;
alter table public.documents add column current_observation_id uuid references public.career_public_observations(id);
alter table public.documents add column source_scope text not null default 'unknown';
alter table public.documents add column provenance jsonb not null default '{}';
alter table public.documents add column fetch_lease_owner uuid;
alter table public.documents add column fetch_lease_until timestamptz;
alter table public.documents add column last_attempt_at timestamptz;
alter table public.documents add column last_successful_check_at timestamptz;
alter table public.documents add column source_fetched_at timestamptz;
create unique index documents_resource_key on public.documents(resource_key) where resource_key is not null;
alter table public.company_db add column public_context jsonb not null default '{}';
alter table public.company_db add column public_facts_revision bigint not null default 1;

-- All new readers/writers are authenticated server services. Direct client
-- reads have an owner predicate; public evidence is also resolved server-side.
alter table public.career_opportunities enable row level security;
alter table public.career_result_sets enable row level security;
alter table public.career_result_items enable row level security;
alter table public.career_views enable row level security;
alter table public.career_public_observations enable row level security;
alter table public.career_resource_index enable row level security;
revoke all on public.career_opportunities, public.career_result_sets, public.career_result_items,
 public.career_views, public.career_public_observations, public.career_resource_index from anon,authenticated;
grant all on public.career_opportunities, public.career_result_sets, public.career_result_items,
 public.career_views, public.career_public_observations, public.career_resource_index to service_role;
-- Source-dependent projections are served only after current source resolution.
-- Granting client SELECT on a cached body would bypass later source deletion.

create function public.career_capture_public_source_v1(
 p_resource_key text,p_url text,p_title text,p_content text,p_hash text,
 p_provenance jsonb,p_published_at timestamptz default null,p_fetched_at timestamptz default null,
 p_lease_owner uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare doc public.documents; obs public.career_public_observations; source text; state text;
begin
 if p_provenance->>'scope' is distinct from 'public' or nullif(p_content,'') is null then
  raise exception 'Independent public source content required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('career-source:'||p_resource_key,0));
 select * into doc from public.documents where resource_key=p_resource_key for update;
 if found and p_lease_owner is not null and (doc.fetch_lease_owner is distinct from p_lease_owner or doc.fetch_lease_until<=now()) then
  raise exception 'Source lease lost' using errcode='40001';
 end if;
 if not found then
  insert into public.documents(url,title,markdown,resource_key,source_scope) values(p_url,p_title,p_content,p_resource_key,'public') returning * into doc;
 end if;
 -- Search metadata must never replace a previously collected page body, even
 -- when a concurrent metadata request finishes after the full fetch.
 if p_provenance->>'contract'='exa-search-metadata-v1' and doc.current_observation_id is not null
    and doc.provenance->>'contract' is distinct from 'exa-search-metadata-v1' then
  select * into obs from career_public_observations where id=doc.current_observation_id and deleted_at is null;
  if found then return jsonb_build_object('documentId',doc.id,'observationId',obs.id,'observedAt',obs.observed_at,
    'lastSuccessfulCheckAt',doc.last_successful_check_at,'sourceFetchedAt',doc.source_fetched_at,'indexState','unchanged');end if;
 end if;
 source:=p_resource_key||':'||coalesce(p_provenance->>'contract','public-text-v1');
 insert into public.career_public_observations(source_key,resource_ref,source_url,content_hash,content,source_fetched_at,published_at,provenance)
 values(source,jsonb_build_object('kind','web_resource','id',doc.id::text),p_url,p_hash,p_content,p_fetched_at,p_published_at,p_provenance)
 on conflict(source_key,content_hash) do nothing;
 select * into obs from public.career_public_observations where source_key=source and content_hash=p_hash and deleted_at is null;
 if not found then raise exception 'Source is unavailable'; end if;
 -- A slow old search and a concurrent unleased read cannot move the latest
 -- pointer backwards or release another collector's active lease.
 if p_lease_owner is null and ((doc.fetch_lease_until>now()) or
   coalesce((doc.provenance->>'requestedAt')::timestamptz,'-infinity') > coalesce((p_provenance->>'requestedAt')::timestamptz,now())) then
  return jsonb_build_object('documentId',doc.id,'observationId',obs.id,'observedAt',obs.observed_at,
   'lastSuccessfulCheckAt',doc.last_successful_check_at,'sourceFetchedAt',p_fetched_at,'indexState','not_current');
 end if;
 update public.documents set title=p_title,markdown=p_content,url=p_url,source_scope='public',current_observation_id=obs.id,
  provenance=p_provenance,last_attempt_at=now(),last_successful_check_at=now(),
  source_fetched_at=coalesce(p_fetched_at,case when current_observation_id=obs.id then source_fetched_at end),
  fetch_lease_owner=null,fetch_lease_until=null where id=doc.id returning * into doc;
 insert into public.career_resource_index(scope,resource_kind,resource_id,source_revision,chunk_key,index_state)
 values('public','web_resource',doc.id::text,obs.id::text,'@source','pending')
 on conflict(scope,owner_id,resource_kind,resource_id,chunk_key) do update
 set source_revision=excluded.source_revision,index_state='pending',dispatch_state=null,lease_owner=null,lease_until=null,updated_at=now()
 where career_resource_index.source_revision is distinct from excluded.source_revision;
 select index_state into state from career_resource_index where scope='public' and resource_kind='web_resource' and resource_id=doc.id::text and chunk_key='@source';
 return jsonb_build_object('documentId',doc.id,'observationId',obs.id,'observedAt',obs.observed_at,
  'lastSuccessfulCheckAt',now(),'sourceFetchedAt',doc.source_fetched_at,'indexState',state);
end $$;
revoke all on function public.career_capture_public_source_v1(text,text,text,text,text,jsonb,timestamptz,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.career_capture_public_source_v1(text,text,text,text,text,jsonb,timestamptz,timestamptz,uuid) to service_role;

-- Owner/visibility checks apply to exact IDs as well as search and saved projections.
-- The resource reader checks the revision of a connected email source even
-- when the separate mail-event worker has not been enabled.
alter table public.talent_integrations add column if not exists career_mail_sync jsonb not null default '{}';
create function public.career_resource_available_v1(p_user uuid,p_ref jsonb)
returns boolean language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare target text:=p_ref->>'id'; role_row public.company_roles;
begin
 case p_ref->>'kind'
 when 'company' then return exists(select 1 from company_db where id::text=target and
  (p_ref->>'revision' is null or (p_ref->>'revision')::bigint>coalesce((public_context->>'revokedThroughRevision')::bigint,0)));
 when 'web_resource' then return exists(select 1 from documents d join career_public_observations o on o.id=d.current_observation_id where d.id::text=target and d.source_scope='public' and o.deleted_at is null);
 when 'observation' then return exists(select 1 from career_public_observations o join documents d on d.id::text=o.resource_ref->>'id'
   where o.id::text=target and o.deleted_at is null and d.source_scope='public');
 when 'document' then return exists(select 1 from talent_documents where id::text=target and talent_id=p_user and not is_deleted);
 when 'memory' then return exists(select 1 from talent_contexts where id::text=target and talent_id=p_user and deleted_at is null);
 when 'message' then return exists(select 1 from talent_messages where id::text=target and user_id=p_user);
 when 'email_message' then return exists(select 1 from talent_integrations where talent_id=p_user and provider='gmail' and status='active'
   and composio_connected_account_id=split_part(target,'/',1) and split_part(target,'/',2)<>'' and split_part(target,'/',3)=''
   and (p_ref->>'revision' is null or career_mail_sync->>'generation'=p_ref->>'revision'));
 when 'profile' then return exists(select 1 from talent_profiles where id::text=target and talent_id=p_user);
 when 'operation' then return exists(select 1 from talent_external_operations where id::text=target and user_id=p_user);
 when 'opportunity' then return exists(select 1 from career_opportunities where id::text=target and talent_id=p_user and deleted_at is null);
 when 'posting' then return exists(select 1 from official_jobs where id::text=target and is_published);
 when 'role' then
  select * into role_row from company_roles where role_id::text=target;
  if not found then return false; end if;
  if role_row.source_provider='career_public_discovery' and not exists(select 1 from career_public_observations o join documents d on d.id::text=o.resource_ref->>'id'
   where o.id::text=role_row.information->'publicDiscovery'->>'observationId' and o.deleted_at is null and d.source_scope='public') then return false;end if;
  if lower(coalesce(role_row.information->>'testOnly','false'))='true' and not coalesce(role_row.information->'testTalentIds','[]') ? p_user::text then return false; end if;
  if role_row.source_type='internal' then
   begin return read_career_internal_role_v1(p_user,role_row.role_id) is not null;
   exception when others then return false; end;
  end if;
  return coalesce(role_row.source_provider,'')<>'user_submitted' or coalesce(role_row.information->'submittedTalentIds','[]') ? p_user::text;
 else return false;
 end case;
end $$;
revoke all on function public.career_resource_available_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.career_resource_available_v1(uuid,jsonb) to service_role;

create function public.career_publish_result_set_v1(
 p_user_id uuid,p_id uuid,p_expected_revision bigint,p_title text,p_manifest jsonb,p_items jsonb,p_operation_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare next_revision bigint; item jsonb; n bigint:=0;
begin
 perform pg_advisory_xact_lock(hashtextextended('career-set:'||p_id::text,0));
 if exists(select 1 from public.career_result_sets where id=p_id and talent_id<>p_user_id) then raise exception 'Set unavailable'; end if;
 select coalesce(max(revision),0) into next_revision from public.career_result_sets where id=p_id and talent_id=p_user_id;
 if next_revision<>p_expected_revision then raise exception 'Set revision conflict' using errcode='40001'; end if;
 if p_operation_id is not null and not exists(select 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id) then raise exception 'Operation unavailable'; end if;
 next_revision:=next_revision+1;
 insert into public.career_result_sets(id,revision,talent_id,operation_id,title,manifest)
 values(p_id,next_revision,p_user_id,p_operation_id,p_title,p_manifest);
 for item in select value from jsonb_array_elements(p_items) loop
  if not public.career_resource_available_v1(p_user_id,item->'ref') then
   -- A source can disappear after a batch starts. Keep only the identity that
   -- was already admitted into this owner's immutable input, never its cache.
   if p_operation_id is null or not exists(select 1 from career_result_items i join career_result_sets s on s.id=i.set_id and s.revision=i.set_revision
     where s.operation_id=p_operation_id and s.talent_id=p_user_id and s.manifest->>'purpose'='operation_input' and i.resource_ref=item->'ref')
     then raise exception 'Source unavailable'; end if;
   item:=item||jsonb_build_object('projection',jsonb_build_object('status','unavailable'),'evaluationRef',null);
  end if;
  if item ? 'evaluationRef' and item->'evaluationRef'<>'null'::jsonb and not public.career_resource_available_v1(p_user_id,item->'evaluationRef') then
   if p_operation_id is null then raise exception 'Evaluation unavailable'; end if;
   item:=item||jsonb_build_object('projection',jsonb_build_object('status','unavailable'),'evaluationRef',null);
  end if;
  insert into public.career_result_items(set_id,set_revision,item_id,talent_id,ordinal,resource_ref,source_revision,projection,evaluation_ref)
  values(p_id,next_revision,coalesce((item->>'itemId')::uuid,gen_random_uuid()),p_user_id,n,item->'ref',item->'ref'->>'revision',coalesce(item->'projection','{}'),item->'evaluationRef');
  n:=n+1;
 end loop;
 return jsonb_build_object('setId',p_id,'revision',next_revision,'count',n);
end $$;
revoke all on function public.career_publish_result_set_v1(uuid,uuid,bigint,text,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.career_publish_result_set_v1(uuid,uuid,bigint,text,jsonb,jsonb,uuid) to service_role;

create function public.career_company_resource_changed_v1() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then new.public_facts_revision:=old.public_facts_revision+1; end if;
 insert into public.career_resource_index(scope,resource_kind,resource_id,source_revision,chunk_key,index_state)
 values('public','company',new.id::text,new.public_facts_revision::text,'@source','pending')
 on conflict(scope,owner_id,resource_kind,resource_id,chunk_key) do update
 set source_revision=excluded.source_revision,index_state='pending',dispatch_state=null,lease_owner=null,lease_until=null,updated_at=now();
 return new;
end $$;
revoke all on function public.career_company_resource_changed_v1() from public,anon,authenticated;
create trigger career_company_resource_changed before insert or update of name,description,short_description,website_url,location,specialities,public_context
 on public.company_db for each row execute function public.career_company_resource_changed_v1();

create index career_company_text_search on public.company_db using gin(to_tsvector('simple',
 coalesce(name,'')||' '||coalesce(description,'')||' '||coalesce(short_description,'')||' '||coalesce(specialities,'')||' '||coalesce(location,'')||' '||public_context::text));
create function public.career_search_resources_v1(p_user uuid,p_source text,p_query text,p_offset integer default 0,p_limit integer default 50)
returns table(ref jsonb,title text,body text,facts jsonb) language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
 if p_offset<0 or p_limit<1 or p_limit>501 then raise exception 'Invalid transport page'; end if;
 if p_source='companies' then
  return query select jsonb_build_object('kind','company','id',c.id::text,'revision',c.public_facts_revision::text),
    coalesce(c.name,''),coalesce(c.short_description,c.description,''),
    jsonb_build_object('location',c.location,'website',c.website_url)
  from company_db c where p_query='' or c.name ilike '%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%'
   or to_tsvector('simple',coalesce(c.name,'')||' '||coalesce(c.description,'')||' '||coalesce(c.short_description,'')||' '||coalesce(c.specialities,'')||' '||coalesce(c.location,'')||' '||c.public_context::text) @@ websearch_to_tsquery('simple',p_query)
   or exists(select 1 from career_public_observations linked join documents d on d.id::text=linked.resource_ref->>'id'
     join career_public_observations o on o.id=d.current_observation_id
     where o.deleted_at is null and linked.deleted_at is null and d.source_scope='public' and linked.about_refs @> jsonb_build_array(jsonb_build_object('kind','company','id',c.id::text))
       and to_tsvector('simple',o.content) @@ websearch_to_tsquery('simple',p_query))
  order by c.id offset p_offset limit p_limit;
 elsif p_source='documents' then
  return query select jsonb_build_object('kind','document','id',d.id::text,'revision',d.revision::text),d.file_name,
    coalesce(d.description,''),jsonb_build_object('kind',d.kind,'updatedAt',d.updated_at)
  from talent_documents d where d.talent_id=p_user and not d.is_deleted
    and (p_query='' or to_tsvector('simple',d.file_name||' '||coalesce(d.description,'')||' '||coalesce(d.extracted_text,'')) @@ websearch_to_tsquery('simple',p_query))
  order by d.id offset p_offset limit p_limit;
 elsif p_source='public_resources' then
  return query select jsonb_build_object('kind','web_resource','id',d.id::text,'revision',o.id::text),coalesce(d.title,d.url,''),
    coalesce(d.excerpt,''),jsonb_build_object('url',o.source_url,'observedAt',o.observed_at,'publishedAt',o.published_at,'sourceFetchedAt',o.source_fetched_at)
  from documents d join career_public_observations o on o.id=d.current_observation_id
  where d.source_scope='public' and o.deleted_at is null
    and (p_query='' or to_tsvector('simple',coalesce(d.title,'')||' '||o.content) @@ websearch_to_tsquery('simple',p_query))
  order by d.id offset p_offset limit p_limit;
 else raise exception 'Unsupported resource search source'; end if;
end $$;
revoke all on function public.career_search_resources_v1(uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.career_search_resources_v1(uuid,text,text,integer,integer) to service_role;

create function public.career_write_opportunity_v1(p_user uuid,p_id uuid,p_expected_revision bigint,p_patch jsonb,p_actor text default 'agent')
returns public.career_opportunities language plpgsql security invoker set search_path=public,pg_temp as $$
declare item public.career_opportunities; ref jsonb; rec uuid; legacy talent_opportunity_recommendation; internal_role boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('career-opportunity:'||p_id::text,0));
 if p_patch->'primary_ref'->>'kind'='role' then
  perform pg_advisory_xact_lock(hashtextextended('career-role-opportunity:'||p_user::text||':'||(p_patch->'primary_ref'->>'id'),0));
 end if;
 select * into item from career_opportunities where id=p_id for update;
 if found and item.talent_id<>p_user then raise exception 'Opportunity unavailable'; end if;
 if item.id is null then
  if p_expected_revision<>0 then raise exception 'Opportunity unavailable'; end if;
 else
  if item.revision<>p_expected_revision then raise exception 'Opportunity revision conflict' using errcode='40001'; end if;
 end if;
 for ref in select value from jsonb_array_elements(coalesce(p_patch->'evidence_refs','[]')||coalesce(p_patch->'related_refs','[]')||
  case when p_patch ? 'primary_ref' then jsonb_build_array(p_patch->'primary_ref') else '[]'::jsonb end) loop
  if not career_resource_available_v1(p_user,ref) then raise exception 'Source unavailable'; end if;
 end loop;
 rec:=coalesce((p_patch->>'recommendation_id')::uuid,item.recommendation_id);
 if rec is null and coalesce(p_patch->'primary_ref',item.primary_ref)->>'kind'='role' then
  select id into rec from talent_opportunity_recommendation where talent_id=p_user
   and role_id::text=coalesce(p_patch->'primary_ref',item.primary_ref)->>'id' order by recommended_at desc,id desc limit 1;
  if rec is null and exists(select 1 from company_roles where role_id::text=coalesce(p_patch->'primary_ref',item.primary_ref)->>'id' and source_type='internal') then
   raise exception 'Publish this selected internal Role through the existing recommendation writer first';
  end if;
 end if;
 if rec is not null and not exists(select 1 from talent_opportunity_recommendation where id=rec and talent_id=p_user) then raise exception 'Recommendation unavailable'; end if;
 if rec is not null then rec:=current_talent_recommendation_id_v1(rec);end if;
 if item.id is null and rec is not null then
  select * into item from career_opportunities where talent_id=p_user and recommendation_id=rec and merged_into_id is null and deleted_at is null for update;
  if found then return item;end if;
 end if;
 if rec is not null then
  select * into legacy from talent_opportunity_recommendation where id=rec and talent_id=p_user for update;
  if not (jsonb_build_array(coalesce(p_patch->'primary_ref',item.primary_ref))||coalesce(p_patch->'related_refs',item.related_refs,'[]'))
    @> jsonb_build_array(jsonb_build_object('kind','role','id',legacy.role_id::text)) then raise exception 'Recommendation Role does not match opportunity references'; end if;
  if p_patch ? 'saved' then
   if not (p_patch->>'saved')::boolean and legacy.saved_stage is not null and legacy.saved_stage<>'saved' then
    raise exception 'Opportunity has existing progress' using errcode='40001';
   end if;
   if not (p_patch->>'saved')::boolean or legacy.saved_stage is null then
    select source_type='internal' into internal_role from company_roles where role_id=legacy.role_id;
    perform update_talent_role_feedback_v2(p_user,rec,case when not (p_patch->>'saved')::boolean then null when internal_role then 'keep' else 'like' end,
     null,case when (p_patch->>'saved')::boolean then 'saved' else null end,now(),legacy.updated_at,'career');
   end if;
  end if;
 end if;
 if item.id is null then
  insert into career_opportunities(id,talent_id,primary_ref,title,body,related_refs,evidence_refs,presentation,recommendation_id,display_order,saved_at,archived_at)
  values(p_id,p_user,p_patch->'primary_ref',p_patch->>'title',coalesce(p_patch->>'body',''),coalesce(p_patch->'related_refs','[]'),
   coalesce(p_patch->'evidence_refs','[]'),coalesce(p_patch->'presentation','{}'),rec,coalesce((p_patch->>'display_order')::numeric,0),case when rec is null and (p_patch->>'saved')::boolean then now() else null end,case when (p_patch->>'archived')::boolean then now() else null end) returning * into item;
 else
  update career_opportunities set revision=revision+1,updated_at=now(),
   primary_ref=coalesce(p_patch->'primary_ref',primary_ref),title=coalesce(p_patch->>'title',title),body=coalesce(p_patch->>'body',body),
   related_refs=coalesce(p_patch->'related_refs',related_refs),evidence_refs=coalesce(p_patch->'evidence_refs',evidence_refs),
   presentation=coalesce(p_patch->'presentation',presentation),recommendation_id=rec,
   display_order=case when p_patch ? 'display_order' and (p_actor='user' or order_source<>'user') then (p_patch->>'display_order')::numeric else display_order end,
   order_source=case when p_patch ? 'display_order' and p_actor='user' then 'user' else order_source end,
   saved_at=case when p_patch ? 'saved' and rec is null then case when (p_patch->>'saved')::boolean then coalesce(saved_at,now()) else null end else saved_at end,
   archived_at=case when p_patch ? 'archived' then case when (p_patch->>'archived')::boolean then now() else null end else archived_at end
  where id=p_id and talent_id=p_user returning * into item;
 end if;
 return item;
end $$;
revoke all on function public.career_write_opportunity_v1(uuid,uuid,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.career_write_opportunity_v1(uuid,uuid,bigint,jsonb,text) to service_role;

create function public.career_read_result_items_v1(p_user uuid,p_set uuid,p_revision bigint,p_selector jsonb,p_offset integer,p_limit integer)
returns table(item_id uuid,resource_ref jsonb,projection jsonb,evaluation_ref jsonb,ordinal bigint,total_count bigint)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare fields jsonb; clause text:=''; entry jsonb;
begin
 if p_offset<0 or p_limit<1 or p_limit>501 then raise exception 'Invalid transport page'; end if;
 select manifest->'fields' into fields from career_result_sets where id=p_set and revision=p_revision and talent_id=p_user;
 if not found then raise exception 'Set unavailable'; end if;
 for entry in select value from jsonb_array_elements(coalesce(p_selector->'where','[]')) loop
  if not coalesce(fields,'[]') ? (entry->>'field') or entry->>'op' not in ('eq','in','gte','lte','exists') then raise exception 'Unknown selected field or operation'; end if;
 end loop;
 for entry in select value from jsonb_array_elements(coalesce(p_selector->'orderBy','[]')) loop
  if not coalesce(fields,'[]') ? (entry->>'field') or entry->>'direction' not in ('asc','desc') then raise exception 'Unknown sort field or direction'; end if;
  clause:=clause||format('i.projection->%L %s nulls last,',entry->>'field',entry->>'direction');
 end loop;
 return query execute 'select i.item_id,i.resource_ref,
  case when career_resource_available_v1($1,i.resource_ref) then i.projection else ''{}''::jsonb end,i.evaluation_ref,i.ordinal,count(*) over()
  from career_result_items i where i.talent_id=$1 and i.set_id=$2 and i.set_revision=$3
  and (not $4 ? ''itemIds'' or $4->''itemIds'' ? i.item_id::text)
  and not coalesce($4->''excludeItemIds'',''[]''::jsonb) ? i.item_id::text
  and not exists(select 1 from jsonb_array_elements(coalesce($4->''where'',''[]'')) p where not coalesce(case p->>''op''
   when ''eq'' then i.projection->(p->>''field'')=p->''value''
   when ''in'' then p->''value'' @> jsonb_build_array(i.projection->(p->>''field''))
   when ''gte'' then i.projection->(p->>''field'')>=p->''value''
   when ''lte'' then i.projection->(p->>''field'')<=p->''value''
   when ''exists'' then i.projection ? (p->>''field'') and i.projection->(p->>''field'')<>''null''::jsonb
   else false end,false)) order by '||clause||'i.ordinal offset $5 limit $6'
 using p_user,p_set,p_revision,p_selector,p_offset,p_limit;
end $$;
revoke all on function public.career_read_result_items_v1(uuid,uuid,bigint,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.career_read_result_items_v1(uuid,uuid,bigint,jsonb,integer,integer) to service_role;

create function public.career_merge_opportunities_v1(p_user uuid,p_from uuid,p_to uuid,p_from_revision bigint,p_to_revision bigint)
returns public.career_opportunities language plpgsql security invoker set search_path=public,pg_temp as $$
declare a career_opportunities; b career_opportunities; cursor_id uuid; seen uuid[]:='{}';
begin
 perform pg_advisory_xact_lock(hashtextextended('career-alias:'||p_user::text,0));
 select * into a from career_opportunities where id=p_from and talent_id=p_user for update;
 if not found then raise exception 'Opportunity unavailable'; end if;
 select * into b from career_opportunities where id=p_to and talent_id=p_user for update;
 if not found then raise exception 'Opportunity unavailable'; end if;
 if a.revision<>p_from_revision or b.revision<>p_to_revision then raise exception 'Opportunity revision conflict' using errcode='40001'; end if;
 cursor_id:=p_to;
 while cursor_id is not null loop
  if cursor_id=p_from or cursor_id=any(seen) then raise exception 'Opportunity alias cycle'; end if;
  seen:=array_append(seen,cursor_id);
  select merged_into_id into cursor_id from career_opportunities where id=cursor_id and talent_id=p_user;
 end loop;
 if b.merged_into_id is not null then raise exception 'Read the canonical target before merging'; end if;
 if a.recommendation_id is not null and b.recommendation_id is not null and a.recommendation_id<>b.recommendation_id then raise exception 'Resolve current legacy recommendation before merging'; end if;
 update career_opportunities set merged_into_id=p_to,recommendation_id=null,revision=revision+1,updated_at=now() where id=p_from;
 update career_opportunities set recommendation_id=coalesce(b.recommendation_id,a.recommendation_id),
  related_refs=(select coalesce(jsonb_agg(distinct r),'[]') from jsonb_array_elements(b.related_refs||a.related_refs||jsonb_build_array(a.primary_ref)) r where r<>b.primary_ref),
  evidence_refs=(select coalesce(jsonb_agg(distinct r),'[]') from jsonb_array_elements(b.evidence_refs||a.evidence_refs) r),
  saved_at=coalesce(b.saved_at,a.saved_at),revision=revision+1,updated_at=now() where id=p_to returning * into b;
 return b;
end $$;
revoke all on function public.career_merge_opportunities_v1(uuid,uuid,uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.career_merge_opportunities_v1(uuid,uuid,uuid,bigint,bigint) to service_role;

-- Durable claims share the existing operation store. The lease protects provider
-- execution; the revision protects every completion and stale queue delivery.
create or replace function public.career_claim_resource_operation_v1(
  p_user uuid,p_id uuid,p_revision bigint,p_environment text,p_lease uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r talent_external_operations;
begin
  select * into r from talent_external_operations where id=p_id and user_id=p_user for update;
  if not found or r.kind not in ('resource_evaluation','resource_research','resource_item')
    or r.revision<>p_revision or r.status not in ('reserved','running')
    or r.request->>'execution_environment' is distinct from p_environment
    or (r.provider_refs->>'lease_until')::timestamptz>now() then return null; end if;
  update talent_external_operations set status='running',revision=revision+1,updated_at=now(),
    provider_refs=provider_refs||jsonb_build_object('lease_owner',p_lease,'lease_until',now()+interval '15 minutes')
    where id=p_id returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.career_claim_resource_operation_v1(uuid,uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.career_claim_resource_operation_v1(uuid,uuid,bigint,text,uuid) to service_role;
create index career_resource_operations_pending on public.talent_external_operations(updated_at,id)
  where kind in ('resource_evaluation','resource_research') and status in ('reserved','running');
create index career_result_items_evaluation on public.career_result_items((evaluation_ref->>'id')) where evaluation_ref is not null;

create function public.career_claim_public_fetch_v1(p_key text,p_owner uuid) returns boolean
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update documents set fetch_lease_owner=p_owner,fetch_lease_until=now()+interval '3 minutes',last_attempt_at=now()
 where resource_key=p_key and source_scope='public' and (fetch_lease_until is null or fetch_lease_until<=now());
 return found;
end $$;
revoke all on function public.career_claim_public_fetch_v1(text,uuid) from public,anon,authenticated;
grant execute on function public.career_claim_public_fetch_v1(text,uuid) to service_role;
