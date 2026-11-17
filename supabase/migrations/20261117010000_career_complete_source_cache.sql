create or replace function public.career_capture_public_source_v1(
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
 -- A search observation is versioned and returned to its caller, even if the
 -- same URL has a page-reader body. Search text has a provider character
 -- limit; publishing it as a new full read would discard the tail and reset
 -- the freshness and index of the independently collected page.
 if p_provenance->>'contract' = 'exa-search-text-v1'
    and doc.current_observation_id is not null
    and doc.provenance->>'provider' in ('exa_public_contents', 'public_job_page')
    and exists (select from career_public_observations where id = doc.current_observation_id and deleted_at is null) then
  return jsonb_build_object('documentId',doc.id,'observationId',obs.id,'observedAt',obs.observed_at,
   'lastSuccessfulCheckAt',doc.last_successful_check_at,'sourceFetchedAt',p_fetched_at,'indexState','not_current');
 end if;
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
