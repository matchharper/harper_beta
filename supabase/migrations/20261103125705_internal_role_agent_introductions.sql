begin;

-- Ensure the default exists in a previous SQL command: a SELECT's snapshot
-- cannot see a row lazily inserted by a function in its own WHERE expression.
create or replace function public.read_talent_profile_v1(p_talent_id uuid,p_profile_id uuid default null,p_revision bigint default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare profile public.talent_profiles; snapshot jsonb; selected_id uuid;
begin
 if not exists(select 1 from public.talent_users where user_id=p_talent_id and deleted_at is null) then raise exception 'profile_owner_not_found'; end if;
 selected_id:=coalesce(p_profile_id,public.ensure_talent_profile_v1(p_talent_id));
 select * into profile from public.talent_profiles where id=selected_id and talent_id=p_talent_id;
 if not found then raise exception 'profile_not_found'; end if;
 select r.snapshot into snapshot from public.talent_profile_revisions r where r.profile_id=profile.id and r.revision=coalesce(p_revision,profile.current_revision);
 if not found then raise exception 'profile_revision_not_found'; end if;
 return jsonb_build_object('profileId',profile.id,'revision',coalesce(p_revision,profile.current_revision),'title',profile.title,'purpose',profile.purpose,'isDefault',profile.is_default,'isArchived',profile.is_archived,'snapshot',snapshot);
end $$;

-- A private opportunity is not a recommendation delivery or company consent.
-- Browser voice tools run before the turn transcript is saved. Preserve the
-- authenticated tool request as an execution fact, never invent a user utterance.
create function public.record_career_voice_tool_request_v1(p_talent uuid,p_conversation uuid,p_call text,p_name text,p_arguments jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.talent_external_operations; result uuid; identity text;
begin
 if nullif(btrim(p_call),'') is null or p_name not in ('apply_to_internal_role','contact_company') then raise exception 'voice_request_identity_required'; end if;
 if not exists(select 1 from public.talent_conversations c join public.talent_users t on t.user_id=c.user_id and t.deleted_at is null where c.id=p_conversation and c.user_id=p_talent) then raise exception 'conversation_unavailable'; end if;
 identity:=p_conversation||':'||p_call;
 perform pg_advisory_xact_lock(hashtextextended('voice-tool:'||p_talent||':'||identity,0));
 select * into existing from public.talent_external_operations where user_id=p_talent and conversation_id=p_conversation and kind='voice_tool_request' and idempotency_key=identity;
 if found then
   if existing.request->>'toolName' is distinct from p_name or existing.request->'arguments' is distinct from p_arguments then raise exception 'voice_request_identity_changed'; end if;
   return existing.id;
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request)
 values(p_talent,p_conversation,'voice_tool_request',identity,'recorded',jsonb_build_object('toolCallId',p_call,'toolName',p_name,'arguments',p_arguments)) returning id into result;
 return result;
end $$;
revoke all on function public.record_career_voice_tool_request_v1(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_career_voice_tool_request_v1(uuid,uuid,text,text,jsonb) to service_role;

create function public.career_internal_role_is_readable_v1(p_talent uuid,p_role uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.company_roles r
 join public.company_internal_roles i on i.role_id=r.role_id
 join public.talent_users t on t.user_id=p_talent and t.deleted_at is null
 where r.role_id=p_role and r.source_type='internal'
   and r.status in ('active','paused','top_priority') and not coalesce(r.is_expired,false)
   and (r.expires_at is null or r.expires_at>now())
   and (case when lower(coalesce(r.information->>'testOnly','false')) in ('true','1','yes','on')
     then nullif(r.information->>'testFixture','') is not null and coalesce(r.information->'testTalentIds','[]') ? p_talent::text
     else (coalesce(i.is_promote,false) and exists(select 1 from public.official_jobs j where j.role_id=r.role_id and j.is_published))
       or exists(select 1 from public.talent_opportunity_recommendation o where o.talent_id=p_talent and o.role_id=r.role_id)
   end))
$$;

create function public.read_career_internal_role_v1(p_talent uuid,p_role uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.career_internal_role_is_readable_v1(p_talent,p_role) then raise exception 'internal_role_unavailable'; end if;
 select jsonb_build_object('roleId',r.role_id,'name',coalesce(nullif(j.role_title,''),r.name),
   'description',coalesce(nullif(j.role_description_markdown,''),r.description),
   'companyName',case when i.is_anonymous then coalesce(nullif(j.company_name,''),'Company') else coalesce(nullif(j.company_name,''),nullif(w.published_name,''),w.company_name) end,
   'companyDescription',case when i.is_anonymous then coalesce(j.company_description_markdown,'') else coalesce(nullif(j.company_description_markdown,''),w.company_description,'') end,
   'location',coalesce(nullif(j.location,''),r.location_text),'workMode',r.work_mode,
   'compensation',coalesce(nullif(j.compensation,''),r.salary_range),'publicJobSlug',j.slug)
 into result from public.company_roles r join public.company_internal_roles i on i.role_id=r.role_id
 join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
 left join lateral(select * from public.official_jobs where role_id=r.role_id and is_published order by updated_at desc,id limit 1) j on true
 where r.role_id=p_role;
 return result;
end $$;

create function public.ensure_requested_internal_role_v1(p_talent uuid,p_role uuid,p_operation text,p_source jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rec public.talent_opportunity_recommendation; created boolean:=false; role_info jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent,0));
 role_info:=public.read_career_internal_role_v1(p_talent,p_role);
 if not exists(select 1 from public.talent_conversations c where c.user_id=p_talent and c.id=(p_source->>'conversationId')::uuid) then raise exception 'conversation_unavailable'; end if;
 if p_source->>'userMessageId' is not null and not exists(select 1 from public.talent_messages m where m.id=(p_source->>'userMessageId')::bigint
   and m.user_id=p_talent and m.conversation_id=(p_source->>'conversationId')::uuid and m.role='user') then raise exception 'source_message_unavailable'; end if;
 if p_source->>'userMessageId' is null and not exists(select 1 from public.opportunity_discovery_run run where run.id=(p_source->>'backgroundRunId')::uuid
   and run.talent_id=p_talent and run.trigger_payload->>'runContract'='career_agent_v1' and run.status='handed_off')
   and not exists(select 1 from public.talent_external_operations e where e.id=(p_source->>'voiceEventId')::uuid and e.user_id=p_talent and e.conversation_id=(p_source->>'conversationId')::uuid
     and e.kind='voice_tool_request' and e.request->>'toolName'='apply_to_internal_role' and e.request#>>'{arguments,roleId}'=p_role::text)
   then raise exception 'request_source_required'; end if;
 select * into rec from public.talent_opportunity_recommendation where talent_id=p_talent and role_id=p_role order by created_at desc,id desc limit 1 for update;
 if not found then
   insert into public.talent_opportunity_recommendation(talent_id,role_id,opportunity_type,kind,evidence,fit_reasons,preference_fit,tradeoffs)
   values(p_talent,p_role,'internal_recommendation','match',jsonb_build_array(jsonb_build_object('source','candidate_request','operationId',p_operation,'request',p_source)),'[]','{}','[]') returning * into rec;
   created:=true;
   insert into public.talent_opportunity_tag(talent_id,opportunity_id,tag) values(p_talent,p_role,'내부:추천') on conflict do nothing;
 end if;
 -- Older writers have a membership trigger; ON CONFLICT also handles those.
 insert into public.talent_opportunity_memberships(talent_id,recommendation_id,role_id,explanation,rank,archived_at)
 values(p_talent,rec.id,p_role,'',coalesce(rec.rank,0),case when rec.feedback='dislike' or rec.saved_stage='hidden' then now() else null end) on conflict do nothing;
 return jsonb_build_object('recommendationId',rec.id,'created',created,'role',role_info,'feedback',rec.feedback,'savedStage',rec.saved_stage,'introductionRootId',to_jsonb(rec)->>'agent_introduction_root_id',
   'visible',exists(select 1 from public.talent_opportunity_memberships where recommendation_id=rec.id and talent_id=p_talent and archived_at is null));
end $$;

-- Career evaluations read private Brief/Behavior even when the profile is default.
-- Sharing that profile does not grant access to the private assessment.
create or replace view public.company_readable_role_evaluations_v1 with (security_invoker=true) as
select e.* from public.company_role_candidate_evaluations e
where coalesce(e.evidence_scope,'default') not in ('candidate_private_context','candidate_private')
 and not exists(select 1 from public.opportunity_discovery_run d where d.id=e.discovery_run_id and d.trigger='career_internal_evaluation')
 and (coalesce(e.evidence_scope,'default')='default' or (e.evidence_scope='role_shared' and exists(
   select 1 from public.talent_opportunity_recommendation r join public.talent_role_materials m on m.id=r.shared_material_id
   where r.talent_id=e.talent_id and r.role_id=e.role_id and m.profile_id=e.source_profile_id and m.profile_revision=e.source_profile_revision
     and (e.source_material_id is null or m.id=e.source_material_id))));
revoke all on public.company_readable_role_evaluations_v1 from public,anon,authenticated;
grant select on public.company_readable_role_evaluations_v1 to service_role;

revoke all on function public.career_internal_role_is_readable_v1(uuid,uuid),public.read_career_internal_role_v1(uuid,uuid),public.ensure_requested_internal_role_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.career_internal_role_is_readable_v1(uuid,uuid),public.read_career_internal_role_v1(uuid,uuid),public.ensure_requested_internal_role_v1(uuid,uuid,text,jsonb) to service_role;

-- Immutable agent-to-agent content is distinct from human delivery receipts.
create table public.agent_contact_messages (
 id uuid primary key default gen_random_uuid(),
 root_id uuid not null references public.agent_contact_messages(id) on delete cascade deferrable initially deferred,
 reply_to_id uuid references public.agent_contact_messages(id) on delete set null,
 company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
 role_id uuid not null references public.company_roles(role_id) on delete cascade,
 talent_id uuid not null references public.talent_users(user_id) on delete cascade,
 recommendation_id uuid not null references public.talent_opportunity_recommendation(id) on delete cascade,
 direction text not null check(direction in ('to_company','to_talent')),
 body text not null,
 material_id uuid references public.talent_role_materials(id),
 document_refs jsonb not null default '[]',
 source jsonb not null,
 operation_key text not null,
 contract_version text not null default 'agent_contact_v1',
 receiver_job_id uuid,
 receiver_kind text,
 created_at timestamptz not null default now(),
 cancelled_at timestamptz,
 revision bigint not null default 1,
 execution_usage jsonb not null default '{}',
 unique(talent_id,direction,operation_key)
);
create index agent_contact_messages_root on public.agent_contact_messages(root_id,created_at,id);
create index agent_contact_messages_pair on public.agent_contact_messages(company_workspace_id,role_id,talent_id,created_at desc);
create index agent_contact_messages_undispatched on public.agent_contact_messages(created_at,id) where receiver_job_id is null and cancelled_at is null;
alter table public.agent_contact_messages enable row level security;
revoke all on public.agent_contact_messages from public,anon,authenticated;
grant all on public.agent_contact_messages to service_role;

alter table public.talent_opportunity_recommendation add column agent_introduction_root_id uuid references public.agent_contact_messages(id) on delete set null;
alter table public.company_intro_candidates add column agent_introduction_root_id uuid references public.agent_contact_messages(id) on delete set null;

create table public.company_agent_schedules (
 id uuid primary key default gen_random_uuid(),
 company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
 role_id uuid not null references public.company_roles(role_id) on delete cascade,
 title text not null, instruction text not null, target_refs jsonb not null default '{}',
 timezone text not null, next_run_at timestamptz, recurrence text, interval_days numeric,
 status text not null default 'active', revision bigint not null default 1, directive_revision bigint not null default 1,
 source jsonb not null, operation_key text not null,
 last_job_id uuid references public.company_agent_web_action_jobs(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_workspace_id,operation_key)
);
create index company_agent_schedules_due on public.company_agent_schedules(next_run_at,id) where status='active';
alter table public.company_agent_schedules enable row level security;
revoke all on public.company_agent_schedules from public,anon,authenticated;
grant all on public.company_agent_schedules to service_role;

-- A snapshot made by acceptance is not a new user-authored assignment.
create function public.pin_agent_contact_material_v1(p_talent uuid,p_role uuid,p_operation text,p_selection jsonb,p_source jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare prepared public.talent_role_materials; last_revision bigint; result jsonb; profile jsonb; docs jsonb; expected_docs jsonb; saved uuid;
begin
 p_selection:=nullif(p_selection,'null'::jsonb);
 perform pg_advisory_xact_lock(hashtextextended('talent-material:'||p_talent||':'||p_role,0));
 select id into saved from public.talent_role_materials where talent_id=p_talent and role_id=p_role and operation_id=p_operation;
 if found then return saved; end if;
 select coalesce(max(revision),0) into last_revision from public.talent_role_materials where talent_id=p_talent and role_id=p_role;
 select * into prepared from public.talent_role_materials where talent_id=p_talent and role_id=p_role
   and coalesce(source->'defaultAcceptance','false')<>'true'::jsonb and coalesce(source->'agentSnapshot','false')<>'true'::jsonb order by revision desc limit 1;
 if p_selection is not null and (p_selection->>'assignmentRevision')::bigint is distinct from last_revision then raise exception 'role_assignment_revision_conflict'; end if;
 if prepared.action='set' then
   if p_selection is not null and (p_selection->>'materialId')::uuid is distinct from prepared.id then raise exception 'role_assignment_revision_conflict'; end if;
   if exists(select 1 from jsonb_array_elements(prepared.documents) d where coalesce(d->>'origin_type','')<>'legacy_upload'
     and not exists(select 1 from public.talent_documents doc where doc.id=(d->>'id')::uuid and doc.talent_id=p_talent and not doc.is_deleted)) then raise exception 'shared_document_unavailable'; end if;
   return prepared.id;
 end if;
 if p_selection->>'materialId' is not null then raise exception 'role_assignment_revision_conflict'; end if;
 profile:=public.read_talent_profile_v1(p_talent,null,null);
 select coalesce(jsonb_agg(jsonb_build_object('documentId',id,'revision',coalesce(revision,1)) order by id),'[]') into docs
   from public.talent_documents where talent_id=p_talent and is_public and not is_deleted;
 if p_selection is not null then
   if (p_selection->>'profileId') is distinct from (profile->>'profileId') or (p_selection->>'profileRevision')::bigint is distinct from (profile->>'revision')::bigint then raise exception 'default_profile_revision_conflict'; end if;
   select coalesce(jsonb_agg(value order by value->>'documentId'),'[]') into expected_docs from jsonb_array_elements(coalesce(p_selection->'documents','[]'));
   if expected_docs is distinct from docs then raise exception 'default_documents_revision_conflict'; end if;
 end if;
 result:=public.assign_talent_role_materials_v1(p_talent,p_role,'set',last_revision,(profile->>'profileId')::uuid,(profile->>'revision')::bigint,docs,p_operation,
   p_source||jsonb_build_object('defaultAcceptance',true,'agentSnapshot',true));
 return (result->>'id')::uuid;
end $$;
revoke all on function public.pin_agent_contact_material_v1(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.pin_agent_contact_material_v1(uuid,uuid,text,jsonb,jsonb) to service_role;

-- These are service events, never fabricated company-user messages.
create function public.enqueue_agent_company_event_v1(p_workspace uuid,p_role uuid,p_key text,p_context jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare job_id uuid; conversation_id uuid; anchor_id bigint; action text;
begin
 if not exists(select 1 from public.company_roles where role_id=p_role and company_workspace_id=p_workspace and source_type='internal') then raise exception 'company_event_role_mismatch'; end if;
 perform pg_advisory_xact_lock(hashtextextended('agent-event:'||p_workspace||':'||p_key,0));
 select id into job_id from public.company_agent_web_action_jobs where idempotency_key='agent-event:'||p_workspace||':'||p_key;
 if found then return job_id; end if;
 action:=case when p_context ? 'scheduleId' then 'agent_schedule_due' else 'agent_contact_received' end;
 insert into public.company_conversations(company_workspace_id,role_id,metadata)
 values(p_workspace,p_role,'{"phase":"completed","scope":"role_creation"}') on conflict do nothing;
 select id into strict conversation_id from public.company_conversations where company_workspace_id=p_workspace and role_id=p_role;
 job_id:=gen_random_uuid();
 insert into public.company_messages(company_workspace_id,conversation_id,role_id,company_user_id,role,content,message_type,status,metadata)
 values(p_workspace,conversation_id,p_role,null,'system',action,'web_action','completed',jsonb_build_object('source','agent_contact','webActionJobId',job_id)) returning id into anchor_id;
 insert into public.company_agent_web_action_jobs(id,company_workspace_id,conversation_id,role_id,actor_user_id,anchor_message_id,action_name,action_context,idempotency_key,status,queue_dispatch_status)
 values(job_id,p_workspace,conversation_id,p_role,null,anchor_id,action,p_context,'agent-event:'||p_workspace||':'||p_key,'queued','pending');
 return job_id;
end $$;
revoke all on function public.enqueue_agent_company_event_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_agent_company_event_v1(uuid,uuid,text,jsonb) to service_role;

-- Preserve the existing Worker eligibility contract, adding only delivery ownership.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.accepted_role_pair_is_available_v1(uuid)'::regprocedure);
 if position('where rec.id=p_recommendation_id' in definition)=0 then raise exception 'accepted_pair_contract_changed'; end if;
 execute replace(definition,'where rec.id=p_recommendation_id','where rec.agent_introduction_root_id is null and rec.id=p_recommendation_id');
end $$;

create function public.cancel_withdrawn_agent_introduction_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.agent_introduction_root_id is not null and
   (new.feedback is distinct from 'like' or new.saved_stage='closed' or new.agent_introduction_root_id is distinct from old.agent_introduction_root_id) then
   update public.agent_contact_messages set cancelled_at=coalesce(cancelled_at,now()),revision=revision+1
   where id=old.agent_introduction_root_id and cancelled_at is null;
 end if;
 return new;
end $$;
create trigger cancel_withdrawn_agent_introduction after update of feedback,saved_stage,agent_introduction_root_id
on public.talent_opportunity_recommendation for each row execute function public.cancel_withdrawn_agent_introduction_v1();
revoke all on function public.cancel_withdrawn_agent_introduction_v1() from public,anon,authenticated;

create unique index company_email_outbox_agent_contact_receipt
on public.company_email_outbox(recipient_id,(snapshot->>'agentContactDeliveryKey')) where topic='agent_contact_v1';

-- A legacy delivery already prepared before rollout must also check the current owner.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.company_first_outbox_is_deliverable_v1(uuid)'::regprocedure);
 if position('or rec.id is null' in definition)=0 then raise exception 'accepted_outbox_contract_changed'; end if;
 execute replace(definition,'or rec.id is null','or rec.agent_introduction_root_id is not null or rec.id is null');
end $$;

commit;
