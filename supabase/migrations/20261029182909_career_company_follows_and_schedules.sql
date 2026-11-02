-- Durable user promises and exact company subscriptions. No model judgment state.
create table public.talent_agent_schedules (
 id uuid primary key default gen_random_uuid(),
 talent_id uuid not null references public.talent_users(user_id) on delete cascade,
 conversation_id uuid references public.talent_conversations(id) on delete set null,
 source_message_id bigint,
 title text not null,
 instruction text not null,
 target_refs jsonb not null default '{}'::jsonb,
 timezone text not null default 'Asia/Seoul',
 next_run_at timestamptz,
 recurrence text,
 status text not null default 'active',
 revision bigint not null default 1,
 directive_revision bigint not null default 1,
 last_run_id uuid references public.opportunity_discovery_run(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index talent_agent_schedules_due on public.talent_agent_schedules(next_run_at,id) where status='active';
create index talent_agent_schedules_owner on public.talent_agent_schedules(talent_id,created_at desc,id);
alter table public.talent_agent_schedules enable row level security;
revoke all on public.talent_agent_schedules from public,anon,authenticated;
grant all on public.talent_agent_schedules to service_role;

-- Existing follows denote the company_db identity, including every linked workspace.
-- company_workspace_id on these old rows remains only a display hint.
alter table public.talent_company_follow alter column company_db_id drop not null;
alter table public.talent_company_follow add column scope text not null default 'company';
alter table public.talent_company_follow add column revision bigint not null default 1;
alter table public.talent_company_follow add column instruction text not null default '';
alter table public.talent_company_follow add column scan_state jsonb not null default '{}'::jsonb;
alter table public.talent_company_follow add column scope_key text generated always as
 (case when scope='workspace' then 'workspace:'||company_workspace_id::text else 'company:'||company_db_id::text end) stored;
do $$ declare item record; begin
 for item in select conname from pg_constraint where conrelid='public.talent_company_follow'::regclass and contype='u'
 and (select array_agg(attname::text order by attname) from pg_attribute where attrelid=conrelid and attnum=any(conkey))=array['company_db_id','talent_id']
 loop execute format('alter table public.talent_company_follow drop constraint %I',item.conname); end loop;
 -- Some installations created the original uniqueness as a standalone index.
 for item in select ci.relname from pg_index i join pg_class ci on ci.oid=i.indexrelid
 where i.indrelid='public.talent_company_follow'::regclass and i.indisunique and not i.indisprimary
 and not exists(select 1 from pg_constraint c where c.conindid=i.indexrelid)
 and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid=i.indrelid and a.attnum=any(i.indkey))=array['company_db_id','talent_id']
 loop execute format('drop index public.%I',item.relname); end loop;
end $$;
create unique index talent_company_follow_scope on public.talent_company_follow(talent_id,scope_key);
create index talent_company_follow_active on public.talent_company_follow(updated_at,id) where unfollowed_at is null;
alter table public.talent_company_follow enable row level security;
revoke all on public.talent_company_follow from public,anon,authenticated;
grant all on public.talent_company_follow to service_role;
-- The existing trusted Worker evaluates exact follow deltas and records only
-- their consumption cursor; user subscription mutations remain server-owned.
grant select,update(scan_state) on public.talent_company_follow to harper_worker;

create function public.write_career_schedule(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_agent_schedules; operation public.talent_external_operations; action text:=p_input->>'action'; body jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_schedule:'||p_request_id,0));
 select * into operation from public.talent_external_operations where user_id=p_user_id and kind='career_schedule_mutation' and idempotency_key=p_request_id;
 if found then return operation.result; end if;
 if p_conversation_id is not null and not exists(select 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'Conversation unavailable'; end if;
 if p_input#>'{target_refs,companyFollowupIds}' is not null then
   if jsonb_typeof(p_input#>'{target_refs,companyFollowupIds}')<>'array' then raise exception 'companyFollowupIds must be an array'; end if;
   if exists(select 1 from jsonb_array_elements_text(p_input#>'{target_refs,companyFollowupIds}') target(id)
     where not exists(select 1 from public.company_talent_followups f where f.id=target.id::uuid and f.talent_id=p_user_id)) then
     raise exception 'Company follow-up unavailable';
   end if;
 end if;
 if action='create' then
   insert into public.talent_agent_schedules(talent_id,conversation_id,source_message_id,title,instruction,target_refs,timezone,next_run_at,recurrence)
   values(p_user_id,p_conversation_id,(p_input->>'source_message_id')::bigint,p_input->>'title',p_input->>'instruction',coalesce(p_input->'target_refs','{}'),p_input->>'timezone',(p_input->>'next_run_at')::timestamptz,p_input->>'recurrence') returning * into item;
 else
   select * into item from public.talent_agent_schedules where id=(p_input->>'schedule_id')::uuid and talent_id=p_user_id for update;
   if not found then raise exception 'Schedule unavailable'; end if;
   if item.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Schedule revision conflict'; end if;
   if action not in ('update','pause','resume','cancel') then raise exception 'Invalid schedule action'; end if;
   update public.talent_agent_schedules set
     title=case when p_input ? 'title' then p_input->>'title' else title end,
     instruction=case when p_input ? 'instruction' then p_input->>'instruction' else instruction end,
     target_refs=case when p_input ? 'target_refs' then p_input->'target_refs' else target_refs end,
     timezone=case when p_input ? 'timezone' then p_input->>'timezone' else timezone end,
     next_run_at=case when p_input ? 'next_run_at' then (p_input->>'next_run_at')::timestamptz else next_run_at end,
     recurrence=case when p_input ? 'recurrence' then p_input->>'recurrence' else recurrence end,
     status=case action when 'pause' then 'paused' when 'cancel' then 'cancelled' when 'resume' then 'active' else case when p_input->>'next_run_at' is not null and status in ('completed','triggered') then 'active' else status end end,
     revision=revision+1,
     directive_revision=directive_revision+case when action in ('pause','cancel')
       or (p_input ? 'instruction' and p_input->>'instruction' is distinct from instruction)
       or (p_input ? 'target_refs' and p_input->'target_refs' is distinct from target_refs) then 1 else 0 end,
     updated_at=now() where id=item.id returning * into item;
 end if;
 body:=to_jsonb(item);
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user_id,p_conversation_id,'career_schedule_mutation',p_request_id,'completed',p_input,body);
 return body;
end $$;

create function public.enqueue_career_schedule_occurrence(p_id uuid,p_expected_revision bigint,p_due_at timestamptz,p_next_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item public.talent_agent_schedules; run_id uuid; identity_key text;
begin
 select * into item from public.talent_agent_schedules where id=p_id for update;
 if not found or item.status<>'active' or item.revision<>p_expected_revision or item.next_run_at is distinct from p_due_at or p_due_at>now() then return null; end if;
 if not exists(select 1 from public.talent_users where user_id=item.talent_id and deleted_at is null) then return null; end if;
 if exists(select 1 from public.opportunity_discovery_run where id=item.last_run_id and status in ('queued','running','handed_off')) then return null; end if;
 identity_key:='career_schedule:'||item.id::text||':'||item.revision::text||':'||p_due_at::text;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
 values(item.talent_id,item.conversation_id,'career_schedule_due','refresh','queued',identity_key,
   jsonb_build_object('runContract','career_agent_v1','contactScope',case when item.target_refs->>'legacySchedulerReview'='true' then case when item.target_refs->>'internalRecommendations'='true' then 'matching' else 'external_recommendations' end else 'delegated_work' end,'instruction',item.instruction,'sourceEvents',jsonb_build_array(jsonb_build_object(
     'sourceKind','schedule','sourceId',item.id,'revision',item.directive_revision,'scheduleRevision',item.revision,'occurredAt',p_due_at,
     'title',item.title,'instruction',item.instruction,'targetRefs',item.target_refs,'timezone',item.timezone,'recurrence',item.recurrence))))
 on conflict do nothing returning id into run_id;
 if run_id is null then select id into run_id from public.opportunity_discovery_run where dedupe_key=identity_key; end if;
 update public.talent_agent_schedules set last_run_id=run_id,next_run_at=p_next_at,status=case when p_next_at is null then 'triggered' else 'active' end,updated_at=now() where id=item.id;
 return run_id;
end $$;

create function public.write_career_company_follow(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_company_follow; operation public.talent_external_operations; scope_value text:=coalesce(p_input->>'scope','company');
 db_id bigint:=(p_input->>'company_db_id')::bigint; workspace_id uuid:=(p_input->>'company_workspace_id')::uuid; key_value text; action text:=coalesce(p_input->>'action','follow'); body jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_follow:'||p_request_id,0));
 select * into operation from public.talent_external_operations where user_id=p_user_id and kind='career_follow_mutation' and idempotency_key=p_request_id;
 if found then return operation.result; end if;
 if p_conversation_id is not null and not exists(select 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'Conversation unavailable'; end if;
 if scope_value='company' then
   if not exists(select 1 from public.company_db where id=db_id) then raise exception 'Company unavailable'; end if;
   if workspace_id is not null and not exists(select 1 from public.company_workspace where company_workspace_id=workspace_id and company_db_id=db_id) then raise exception 'Workspace does not belong to company'; end if;
   key_value:='company:'||db_id::text;
 elsif scope_value='workspace' then
   select company_db_id into db_id from public.company_workspace where company_workspace_id=workspace_id;
   if not found then raise exception 'Company workspace unavailable'; end if;
   key_value:='workspace:'||workspace_id::text;
 else raise exception 'Invalid company scope'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':follow:'||key_value,0));
 select * into item from public.talent_company_follow where talent_id=p_user_id and scope_key=key_value for update;
 if action not in ('follow','update','unfollow') then raise exception 'Invalid follow action'; end if;
 if action='update' and item.id is null then raise exception 'Follow unavailable'; end if;
 if p_input ? 'expected_revision' and item.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Follow revision conflict'; end if;
 if item.id is null and action='unfollow' then body:='{"following":false}'::jsonb;
 else
   insert into public.talent_company_follow(talent_id,company_db_id,company_workspace_id,scope,conversation_id,source,instruction,tracking_summary,discovery_channel_summary)
   values(p_user_id,db_id,workspace_id,scope_value,p_conversation_id,coalesce(p_input->>'source','career_agent'),coalesce(p_input->>'instruction',''),null,null)
   on conflict(talent_id,scope_key) do update set
     unfollowed_at=case when action='unfollow' then coalesce(talent_company_follow.unfollowed_at,now()) when action='follow' then null else talent_company_follow.unfollowed_at end,
     followed_at=case when action='follow' and talent_company_follow.unfollowed_at is not null then now() else talent_company_follow.followed_at end,
     instruction=case when p_input ? 'instruction' then p_input->>'instruction' else talent_company_follow.instruction end,
     conversation_id=coalesce(p_conversation_id,talent_company_follow.conversation_id),
     scan_state=case when (p_input ? 'instruction' and p_input->>'instruction' is distinct from talent_company_follow.instruction) or (action='follow' and talent_company_follow.unfollowed_at is not null) then '{}'::jsonb else talent_company_follow.scan_state end,
     revision=talent_company_follow.revision+case when (p_input ? 'instruction' and p_input->>'instruction' is distinct from talent_company_follow.instruction)
       or (action='unfollow' and talent_company_follow.unfollowed_at is null) or (action='follow' and talent_company_follow.unfollowed_at is not null) then 1 else 0 end,
     tracking_summary=null,discovery_channel_summary=null,updated_at=now()
   returning * into item;
   body:=to_jsonb(item);
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user_id,p_conversation_id,'career_follow_mutation',p_request_id,'completed',p_input,body);
 return body;
end $$;
revoke all on function public.write_career_schedule(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.enqueue_career_schedule_occurrence(uuid,bigint,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.write_career_company_follow(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_career_schedule(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.enqueue_career_schedule_occurrence(uuid,bigint,timestamptz,timestamptz) to service_role;
grant execute on function public.write_career_company_follow(uuid,uuid,text,jsonb) to service_role;

-- Read each source once per collector page. These hashes are change detection,
-- not fit assessments; the canonical evaluator independently owns its input cache.
create function public.read_career_follow_scan(p_limit integer default 100)
returns jsonb language sql stable security invoker set search_path='' as $$
 with follows as materialized (
   select f.* from public.talent_company_follow f join public.talent_users t on t.user_id=f.talent_id and t.deleted_at is null
   where f.unfollowed_at is null order by coalesce((f.scan_state->>'checkedAt')::timestamptz,'epoch'::timestamptz),f.id limit p_limit
 ), owners as materialized (
   select t.user_id,md5(jsonb_build_object('profile',jsonb_build_array(t.name,t.headline,t.bio,t.location,t.current_location),
     'experience',(select jsonb_agg(to_jsonb(e) order by e.id) from public.talent_experiences e where e.talent_id=t.user_id),
     'education',(select jsonb_agg(to_jsonb(e) order by e.id) from public.talent_educations e where e.talent_id=t.user_id),
     'extras',(select e.content from public.talent_extras e where e.talent_id=t.user_id),
     'context',(select jsonb_agg(jsonb_build_array(c.ref,c.revision,c.collection) order by c.ref) from public.talent_contexts c where c.talent_id=t.user_id and c.deleted_at is null),
     'behaviorSource',(select max(b.id) from public.talent_behavior_context_changes b where b.talent_id=t.user_id),
     'settings',(select jsonb_build_array(s.profile_visibility,s.get_external_recommendation,s.get_internal_recommendation,s.blocked_companies,s.status) from public.talent_setting s where s.user_id=t.user_id)
   )::text) as fingerprint from public.talent_users t where t.user_id in(select talent_id from follows)
 ), workspaces as materialized (
   select w.company_workspace_id,w.company_db_id from public.company_workspace w
   where exists(select 1 from follows f where (f.scope='company' and f.company_db_id=w.company_db_id) or (f.scope='workspace' and f.company_workspace_id=w.company_workspace_id))
 ), roles as materialized (
   select r.role_id,r.company_workspace_id,r.source_type,r.name,md5(jsonb_build_object('role',to_jsonb(r),
     'brief',case when r.source_type='internal' then public.company_role_search_brief_version_v1(r.role_id)::text else null end,
     'company',(select jsonb_build_array(w.company_description,w.brief,w.pitch) from public.company_workspace w where w.company_workspace_id=r.company_workspace_id),
     'memory',(select jsonb_agg(jsonb_build_array(m.id,m.revision) order by m.id) from public.company_memory_entries m where m.company_workspace_id=r.company_workspace_id and m.deleted_at is null),
     'legacyMemory',(select jsonb_agg(jsonb_build_array(m.id,m.updated_at) order by m.id) from public.company_memories m where m.company_workspace_id=r.company_workspace_id)
   )::text) as fingerprint from public.company_roles r join workspaces w using(company_workspace_id)
   where r.status='active' and not coalesce(r.is_expired,false) and (r.expires_at is null or r.expires_at>now())
   and coalesce(lower(btrim(r.information->>'testOnly')),'') not in ('true','1','yes','on')
 )
 select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('candidateFingerprint',o.fingerprint,
   'externalEnabled',(select coalesce(s.get_external_recommendation,true) and coalesce(s.status,'')<>'stopped' from public.talent_setting s where s.user_id=f.talent_id),
   'internalEnabled',(select coalesce(s.get_internal_recommendation,true) and coalesce(s.profile_visibility,'')<>'dont_share' from public.talent_setting s where s.user_id=f.talent_id),'roles',
   coalesce((select jsonb_agg(jsonb_build_object('roleId',r.role_id,'workspaceId',r.company_workspace_id,'sourceType',r.source_type,'name',r.name,'fingerprint',r.fingerprint) order by r.role_id)
     from roles r join workspaces w using(company_workspace_id) where (f.scope='company' and w.company_db_id=f.company_db_id) or (f.scope='workspace' and w.company_workspace_id=f.company_workspace_id)),'[]'::jsonb))), '[]'::jsonb)
 from follows f join owners o on o.user_id=f.talent_id
$$;

create function public.record_career_follow_scan(p_id uuid,p_revision bigint,p_state jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.talent_company_follow set scan_state=scan_state||p_state where id=p_id and revision=p_revision and unfollowed_at is null
 and coalesce((scan_state->>'checkedAt')::timestamptz,'epoch'::timestamptz)<=coalesce((p_state->>'checkedAt')::timestamptz,now());
 return found;
end $$;

-- Completion is independent of delivery: a successful no-send turn consumes its
-- exact source revision too. A newer revision remains available to the collector.
create function public.finish_career_follow_source(p_id uuid,p_revision bigint,p_source_key text,p_run_id uuid,p_occurred_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.talent_company_follow set scan_state=scan_state||jsonb_build_object('processedSourceKey',p_source_key,'processedRunId',p_run_id,'processedAt',now())
 where id=p_id and revision=p_revision and unfollowed_at is null
 and (scan_state->>'latestSourceKey' is null or scan_state->>'latestSourceKey'=p_source_key or (scan_state->>'checkedAt')::timestamptz<=p_occurred_at);
 return found;
end $$;

-- Explicit one-time cutover, never called by the periodic collector. Dry run is
-- the default; stopped suppresses only the external-recommendation scope.
create function public.transition_career_agent_schedules(p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item record; created integer:=0; planned integer:=0; skipped_legacy integer:=0; scope_refs jsonb; result jsonb; targets jsonb:='[]'::jsonb;
begin
 for item in select s.talent_id,s.next_check_at,t.profile_visibility,t.get_internal_recommendation,t.get_external_recommendation,t.status
 from public.opportunity_scheduler_state s join public.talent_users u on u.user_id=s.talent_id and u.deleted_at is null
 join public.talent_setting t on t.user_id=s.talent_id
 where s.next_check_at is not null
 and not exists(select 1 from public.talent_external_operations o where o.user_id=s.talent_id and o.kind='career_schedule_mutation' and o.idempotency_key='career_scheduler_transition:'||s.talent_id::text)
 loop
   -- Legacy executors still own their original scheduler cursor until they end.
   -- Moving it now would race their final lifecycle update and duplicate contact.
   if exists(select 1 from public.opportunity_discovery_run r where r.talent_id=item.talent_id and r.status in ('queued','running')
     and coalesce(r.trigger_payload->>'runContract','') not in ('career_agent_v1','career_internal_evaluation_v1','career_follow_external_evaluation_v1','career_external_context_v1')) then
     skipped_legacy:=skipped_legacy+1;
     continue;
   end if;
   scope_refs:=jsonb_build_object('legacySchedulerReview',true,'externalRecommendations',coalesce(item.get_external_recommendation,true) and coalesce(item.status,'')<>'stopped',
     'internalRecommendations',coalesce(item.get_internal_recommendation,true) and coalesce(item.profile_visibility,'')<>'dont_share');
   if scope_refs->>'externalRecommendations'='false' and scope_refs->>'internalRecommendations'='false' then continue; end if;
   planned:=planned+1;
   targets:=targets||jsonb_build_array(jsonb_build_object('talentId',item.talent_id,'nextRunAt',item.next_check_at,'targetRefs',scope_refs));
   if not p_dry_run then
     result:=public.write_career_schedule(item.talent_id,null,'career_scheduler_transition:'||item.talent_id::text,
       jsonb_build_object('action','create','title','Career check-in','instruction','Review the current Career context and prior contact. Decide whether useful contact is warranted and set an appropriate next check or recurring schedule if the continuing delegation still applies. Preserve the user''s recommendation and contact settings.',
         'target_refs',scope_refs,'timezone','Asia/Seoul','next_run_at',item.next_check_at));
     created:=created+1;
   end if;
 end loop;
 return jsonb_build_object('dryRun',p_dry_run,'eligible',planned,'created',created,'skippedActiveLegacy',skipped_legacy,'targets',targets);
end $$;
revoke all on function public.read_career_follow_scan(integer) from public,anon,authenticated;
revoke all on function public.record_career_follow_scan(uuid,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.finish_career_follow_source(uuid,bigint,text,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.transition_career_agent_schedules(boolean) from public,anon,authenticated;
grant execute on function public.read_career_follow_scan(integer) to service_role;
grant execute on function public.record_career_follow_scan(uuid,bigint,jsonb) to service_role;
grant execute on function public.finish_career_follow_source(uuid,bigint,text,uuid,timestamptz) to service_role;
grant execute on function public.finish_career_follow_source(uuid,bigint,text,uuid,timestamptz) to harper_worker;
grant execute on function public.transition_career_agent_schedules(boolean) to service_role;

create function public.complete_career_follow_evaluation(p_evaluation_id text,p_talent_id uuid,p_conversation_id uuid,p_source_events jsonb,p_role_ids jsonb,p_evidence jsonb default '{}')
returns uuid language plpgsql security invoker set search_path='' as $$
declare events jsonb; run_id uuid; event jsonb;
begin
 select coalesce(jsonb_agg(e),'[]') into events from jsonb_array_elements(coalesce(p_source_events,'[]')) e
 where e->>'sourceKind'='company_follow' and exists(select 1 from public.talent_company_follow f where f.id=(e->>'sourceId')::uuid and f.talent_id=p_talent_id and f.revision=(e->>'revision')::bigint and f.unfollowed_at is null
   and (f.scan_state->>'latestSourceKey' is null or f.scan_state->>'latestSourceKey'=e->>'sourceKey' or (f.scan_state->>'checkedAt')::timestamptz<=(e->>'occurredAt')::timestamptz));
 if jsonb_array_length(events)=0 then return null; end if;
 select coalesce(jsonb_agg(distinct candidate.role_id),'[]') into p_role_ids
 from jsonb_array_elements_text(coalesce(p_role_ids,'[]')) candidate(role_id)
 where exists(select 1 from jsonb_array_elements(events) source_event where coalesce(source_event->'roleIds','[]') ? candidate.role_id);
 if jsonb_array_length(coalesce(p_role_ids,'[]'))=0 then
   for event in select value from jsonb_array_elements(events) loop
     perform public.finish_career_follow_source((event->>'sourceId')::uuid,(event->>'revision')::bigint,event->>'sourceKey',null,(event->>'occurredAt')::timestamptz);
   end loop;
   return null;
 end if;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
 values(p_talent_id,p_conversation_id,'career_company_follow_changed','refresh','queued','career_follow_wake:'||p_evaluation_id,
   jsonb_build_object('runContract','career_agent_v1','contactScope',case when exists(select 1 from public.company_roles where role_id::text in(select jsonb_array_elements_text(p_role_ids)) and source_type='internal') then 'matching' else 'external_recommendations' end,'sourceEvents',events,'roleIds',p_role_ids,'evaluationId',p_evaluation_id,'evaluationEvidence',p_evidence,
     'instruction','Review the newly assessed roles from followed companies in the user''s current context. Decide whether useful contact is warranted; no-send is valid. Read relevant details before deciding.'))
 on conflict do nothing returning id into run_id;
 if run_id is null then select id into run_id from public.opportunity_discovery_run where dedupe_key='career_follow_wake:'||p_evaluation_id; end if;
 return run_id;
end $$;
revoke all on function public.complete_career_follow_evaluation(text,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_career_follow_evaluation(text,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.complete_career_follow_evaluation(text,uuid,uuid,jsonb,jsonb,jsonb) to harper_worker;

create function public.finish_career_source_events(p_run_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare run public.opportunity_discovery_run; event jsonb;
begin
 select * into run from public.opportunity_discovery_run where id=p_run_id for update;
 if not found or run.status<>'completed' then return false; end if;
 for event in select value from jsonb_array_elements(coalesce(run.trigger_payload->'sourceEvents','[]')) loop
   if event->>'sourceKind'='company_follow' then
     update public.talent_company_follow set scan_state=scan_state||jsonb_build_object('processedSourceKey',event->>'sourceKey','processedRunId',run.id,'processedAt',now())
     where id=(event->>'sourceId')::uuid and talent_id=run.talent_id and revision=(event->>'revision')::bigint and unfollowed_at is null
       and (scan_state->>'latestSourceKey' is null or scan_state->>'latestSourceKey'=event->>'sourceKey' or (scan_state->>'checkedAt')::timestamptz<=(event->>'occurredAt')::timestamptz);
   elsif event->>'sourceKind'='schedule' then
     update public.talent_agent_schedules set status='completed',updated_at=now()
     where id=(event->>'sourceId')::uuid and talent_id=run.talent_id and directive_revision=(event->>'revision')::bigint
       and last_run_id=run.id and status='triggered' and next_run_at is null;
   end if;
 end loop;
 update public.opportunity_discovery_run set coverage=coalesce(coverage,'{}')||jsonb_build_object('sourceEventsFinishedAt',now()) where id=run.id;
 return true;
end $$;
revoke all on function public.finish_career_source_events(uuid) from public,anon,authenticated;
grant execute on function public.finish_career_source_events(uuid) to service_role;

-- The source continuation and schedule owner must move together. Otherwise a
-- reconciled one-time occurrence could complete while its schedule still points
-- at the cancelled predecessor, preventing its completion reader from advancing.
create function public.requeue_career_remaining_sources(p_run_id uuid,p_source_events jsonb,p_contact_scope text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare original public.opportunity_discovery_run; next_id uuid; event jsonb; dedupe text;
begin
 select * into original from public.opportunity_discovery_run where id=p_run_id for update;
 if not found then raise exception 'Career invocation unavailable'; end if;
 if jsonb_array_length(coalesce(p_source_events,'[]'))=0 then return null; end if;
 dedupe:='career_remaining_sources:'||original.id::text||':'||md5(p_source_events::text);
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
 values(original.talent_id,original.conversation_id,'career_source_reconciled','refresh','queued',dedupe,
   (coalesce(original.trigger_payload,'{}')-'agentInvocation'-'evaluationEvidence')||jsonb_build_object(
     'runContract','career_agent_v1','sourceEvents',p_source_events,'contactScope',p_contact_scope,
     'roleIds',(select coalesce(jsonb_agg(distinct role_id),'[]') from jsonb_array_elements(p_source_events) source_event cross join lateral jsonb_array_elements_text(coalesce(source_event->'roleIds','[]')) role_id),
     'companyRequestFollowups',(select coalesce(jsonb_agg(target),'[]') from jsonb_array_elements(coalesce(original.trigger_payload->'companyRequestFollowups','[]')) target
       where exists(select 1 from jsonb_array_elements(p_source_events) source_event where source_event->>'sourceKind'='company_followup'
         and source_event->>'sourceId'=target->>'followupId' and source_event->>'revision'=target->>'revision')),
     'instruction','Some earlier grouped work was changed or cancelled. Review only the remaining current source facts and the user''s latest context.'))
 on conflict do nothing returning id into next_id;
 if next_id is null then select id into next_id from public.opportunity_discovery_run where dedupe_key=dedupe; end if;
 for event in select value from jsonb_array_elements(p_source_events) where value->>'sourceKind'='schedule' loop
   update public.talent_agent_schedules set last_run_id=next_id,updated_at=now()
   where id=(event->>'sourceId')::uuid and talent_id=original.talent_id and directive_revision=(event->>'revision')::bigint
     and last_run_id=original.id and status not in ('paused','cancelled');
 end loop;
 perform public.finish_career_source_events(next_id);
 return next_id;
end $$;
revoke all on function public.requeue_career_remaining_sources(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.requeue_career_remaining_sources(uuid,jsonb,text) to service_role;

-- Company readers receive only this obligation's review receipt and next date,
-- never a candidate's private schedule instructions or bundled email contents.
create function public.read_career_company_followup_execution(p_ids uuid[])
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('followupId',f.id,'nextCheckAt',next_check.next_run_at,
   'reviewedAt',reviewed.completed_at,'reviewOutcome',reviewed.coverage->>'agentOutcome')),'[]')
 from public.company_talent_followups f
 left join lateral (
   select s.next_run_at from public.talent_agent_schedules s where s.talent_id=f.talent_id and s.status='active' and s.next_run_at is not null
     and coalesce(s.target_refs->'companyFollowupIds','[]') ? f.id::text
   order by s.next_run_at,s.id limit 1
 ) next_check on true
 left join lateral (
   select r.completed_at,r.coverage from public.opportunity_discovery_run r where r.talent_id=f.talent_id and r.status='completed'
     and r.coverage ? 'sourceEventsFinishedAt'
     and r.trigger_payload->'sourceEvents' @> jsonb_build_array(jsonb_build_object('sourceKind','company_followup','sourceId',f.id,'revision',f.revision))
   order by r.completed_at desc nulls last,r.id limit 1
 ) reviewed on true
 where f.id=any(p_ids);
$$;
revoke all on function public.read_career_company_followup_execution(uuid[]) from public,anon,authenticated;
grant execute on function public.read_career_company_followup_execution(uuid[]) to service_role;

-- Transport/provider failures are retried on the same evaluation owner. Partial
-- results stay available for the original agent's explicit resume decision.
create function public.recover_career_follow_evaluations(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare ids jsonb;
begin
 with candidates as (
   select r.id from public.opportunity_discovery_run r
   where r.trigger in ('career_internal_evaluation','career_follow_external_evaluation') and r.status='failed'
     and r.updated_at<now()-interval '15 minutes'
     and exists(select 1 from jsonb_array_elements(coalesce(r.trigger_payload->'sourceEvents','[]')) event
       join public.talent_company_follow f on f.id=(event->>'sourceId')::uuid and f.talent_id=r.talent_id
       where event->>'sourceKind'='company_follow' and f.unfollowed_at is null and f.revision=(event->>'revision')::bigint
       and (f.scan_state->>'latestSourceKey' is null or f.scan_state->>'latestSourceKey'=event->>'sourceKey'))
   order by r.updated_at,r.id for update skip locked limit p_limit
 ), updated as (
   update public.opportunity_discovery_run r set status='queued',lease_token=null,lease_heartbeat_at=null,not_before=now(),updated_at=now()
   from candidates c where r.id=c.id returning r.id
 ) select coalesce(jsonb_agg(id),'[]') into ids from updated;
 return ids;
end $$;
revoke all on function public.recover_career_follow_evaluations(integer) from public,anon,authenticated;
grant execute on function public.recover_career_follow_evaluations(integer) to service_role;
