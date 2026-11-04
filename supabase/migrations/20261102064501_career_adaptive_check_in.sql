-- A stable Career check-in survives pauses. Timing is data, not a lifecycle rule.
alter table public.talent_agent_schedules
 add column schedule_key text,
 add column interval_days double precision,
 add column last_operation_id uuid references public.talent_external_operations(id);
create unique index talent_agent_schedules_key on public.talent_agent_schedules(talent_id,schedule_key) where schedule_key is not null;
alter table public.talent_agent_schedules add constraint talent_agent_schedule_repetition
 check (interval_days is null or (interval_days>0 and interval_days<'Infinity'::double precision and recurrence is null));

-- Insert-only default. Never reset an existing cadence, instruction or pause.
create function public.ensure_career_check_in(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_agent_schedules; setting public.talent_setting;
 initial_interval_days constant double precision:=3;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_check_in',0));
 select * into item from public.talent_agent_schedules where talent_id=p_user_id and schedule_key='career_check_in';
 if found then return to_jsonb(item); end if;
 select * into setting from public.talent_setting where user_id=p_user_id;
 if not found or setting.is_onboarding_done is not true
   or not exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is null) then return null; end if;
 -- Adopt the identifiable legacy check-in, including a paused/completed one.
 -- Its existing settings remain authoritative; no title/instruction matching.
 select * into item from public.talent_agent_schedules where talent_id=p_user_id
   and target_refs->>'legacySchedulerReview'='true' order by created_at,id limit 1 for update;
 if found then
   update public.talent_agent_schedules set schedule_key='career_check_in' where id=item.id returning * into item;
 else
   insert into public.talent_agent_schedules(talent_id,schedule_key,title,instruction,timezone,interval_days,next_run_at,status)
   values(p_user_id,'career_check_in','Career check-in',
     'Continue useful Career work from the current Brief, conversation, pending work and contact history. Decide whether contact is useful or owed, and adjust this schedule when the context warrants. Respect current contact settings and explicit user instructions.',
     'Asia/Seoul',initial_interval_days,
     case when (coalesce(setting.get_external_recommendation,true) and coalesce(setting.status,'')<>'stopped')
       or (coalesce(setting.get_internal_recommendation,true) and coalesce(setting.profile_visibility,'')<>'dont_share')
       then now()+make_interval(secs=>initial_interval_days*86400) else null end,
     case when (coalesce(setting.get_external_recommendation,true) and coalesce(setting.status,'')<>'stopped')
       or (coalesce(setting.get_internal_recommendation,true) and coalesce(setting.profile_visibility,'')<>'dont_share')
       then 'active' else 'paused' end)
   returning * into item;
 end if;
 return to_jsonb(item);
end $$;
revoke all on function public.ensure_career_check_in(uuid) from public,anon,authenticated;
grant execute on function public.ensure_career_check_in(uuid) to service_role,harper_worker;
-- Email onboarding also writes talent_setting as the trusted Worker role.
-- Its invoker trigger may initialize a row or attach the key to a legacy row,
-- but does not need permission to edit existing instructions, timing or status.
grant select,insert on public.talent_agent_schedules to harper_worker;
grant update(schedule_key) on public.talent_agent_schedules to harper_worker;

-- Covers chat, voice and email onboarding in the same setting transaction.
-- This is a trusted server-owned table; retain invoker privileges.
create function public.initialize_career_check_in()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.is_onboarding_done is true then perform public.ensure_career_check_in(new.user_id); end if;
 return new;
end $$;
revoke all on function public.initialize_career_check_in() from public,anon,authenticated;
grant execute on function public.initialize_career_check_in() to service_role,harper_worker;
create trigger initialize_career_check_in after insert or update of is_onboarding_done on public.talent_setting
 for each row execute function public.initialize_career_check_in();

create or replace function public.write_career_schedule(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_agent_schedules; operation public.talent_external_operations; action text:=p_input->>'action'; body jsonb; operation_id uuid; future_only boolean:=false;
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
   insert into public.talent_agent_schedules(talent_id,conversation_id,source_message_id,title,instruction,target_refs,timezone,next_run_at,recurrence,interval_days)
   values(p_user_id,p_conversation_id,(p_input->>'source_message_id')::bigint,p_input->>'title',p_input->>'instruction',coalesce(p_input->'target_refs','{}'),p_input->>'timezone',(p_input->>'next_run_at')::timestamptz,p_input->>'recurrence',(p_input->>'interval_days')::double precision) returning * into item;
 else
   select * into item from public.talent_agent_schedules where id=(p_input->>'schedule_id')::uuid and talent_id=p_user_id for update;
   if not found then raise exception 'Schedule unavailable'; end if;
   if item.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Schedule revision conflict'; end if;
   if action not in ('update','pause','resume','cancel') then raise exception 'Invalid schedule action'; end if;
   -- Only an occurrence modifying its own future schedule keeps its current
   -- authority. A concurrent user edit still increments directive_revision.
   future_only:=exists(select 1 from public.opportunity_discovery_run r
     where r.id=(p_input->>'background_run_id')::uuid and r.id=item.last_run_id
       and r.talent_id=p_user_id and r.status='handed_off'
       and r.trigger_payload->'sourceEvents' @> jsonb_build_array(jsonb_build_object(
         'sourceKind','schedule','sourceId',item.id,'revision',item.directive_revision)));
   update public.talent_agent_schedules set
     title=case when p_input ? 'title' then p_input->>'title' else title end,
     instruction=case when p_input ? 'instruction' then p_input->>'instruction' else instruction end,
     target_refs=case when p_input ? 'target_refs' then p_input->'target_refs' else target_refs end,
     timezone=case when p_input ? 'timezone' then p_input->>'timezone' else timezone end,
     -- Inactive status stops collection. Retain the date so one-time work can
     -- resume without losing the user's saved time.
     next_run_at=case when p_input ? 'next_run_at' then (p_input->>'next_run_at')::timestamptz else next_run_at end,
     recurrence=case when p_input ? 'recurrence' then p_input->>'recurrence' else recurrence end,
     interval_days=case when p_input ? 'interval_days' then (p_input->>'interval_days')::double precision else interval_days end,
     status=case action when 'pause' then 'paused' when 'cancel' then 'cancelled' when 'resume' then 'active' else case when p_input->>'next_run_at' is not null and status in ('completed','triggered') then 'active' else status end end,
     revision=revision+1,
     directive_revision=directive_revision+case when future_only then 0 when action in ('pause','cancel')
       or (p_input ? 'instruction' and p_input->>'instruction' is distinct from instruction)
       or (p_input ? 'target_refs' and p_input->'target_refs' is distinct from target_refs) then 1 else 0 end,
     updated_at=now() where id=item.id returning * into item;
 end if;
 body:=to_jsonb(item);
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user_id,p_conversation_id,'career_schedule_mutation',p_request_id,'completed',
   p_input||jsonb_build_object('appliesTo',case when future_only then 'future_occurrences' else 'current_and_future' end),body)
 returning id into operation_id;
 update public.talent_agent_schedules set last_operation_id=operation_id where id=item.id returning * into item;
 body:=to_jsonb(item)||jsonb_build_object('last_change',jsonb_build_object('id',operation_id,
   'request',p_input||jsonb_build_object('appliesTo',case when future_only then 'future_occurrences' else 'current_and_future' end),'created_at',now()));
 update public.talent_external_operations set result=body where id=operation_id;
 return body;
end $$;

create or replace function public.enqueue_career_schedule_occurrence(p_id uuid,p_expected_revision bigint,p_due_at timestamptz,p_next_at timestamptz)
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
   jsonb_build_object('runContract','career_agent_v1','contactScope',case when item.schedule_key='career_check_in' then 'career_check_in' when item.target_refs->>'legacySchedulerReview'='true' then case when item.target_refs->>'internalRecommendations'='true' then 'matching' else 'external_recommendations' end else 'delegated_work' end,'instruction',item.instruction,'sourceEvents',jsonb_build_array(jsonb_build_object(
     'sourceKind','schedule','sourceId',item.id,'revision',item.directive_revision,'scheduleRevision',item.revision,'occurredAt',p_due_at,
     'title',item.title,'instruction',item.instruction,'targetRefs',item.target_refs,'timezone',item.timezone,'recurrence',item.recurrence,'intervalDays',item.interval_days,'scheduleKey',item.schedule_key))))
 on conflict do nothing returning id into run_id;
 if run_id is null then select id into run_id from public.opportunity_discovery_run where dedupe_key=identity_key; end if;
 update public.talent_agent_schedules set last_run_id=run_id,next_run_at=p_next_at,status=case when p_next_at is null then 'triggered' else 'active' end,updated_at=now() where id=item.id;
 return run_id;
end $$;


-- A surviving current occurrence can belong to a future-paused schedule.
create or replace function public.requeue_career_remaining_sources(p_run_id uuid,p_source_events jsonb,p_contact_scope text)
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
     and last_run_id=original.id;
 end loop;
 perform public.finish_career_source_events(next_id);
 return next_id;
end $$;

-- Explicit backfill remains preview-only unless the operator requests apply.
-- Existing check-ins (including pauses and one-time legacy checks) are adopted.
create or replace function public.transition_career_agent_schedules(p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item record; created integer:=0; planned integer:=0; skipped_legacy integer:=0; result jsonb; targets jsonb:='[]'::jsonb;
begin
 for item in select t.user_id from public.talent_setting t
 join public.talent_users u on u.user_id=t.user_id and u.deleted_at is null
 where t.is_onboarding_done is true and not exists(select 1 from public.talent_agent_schedules s
   where s.talent_id=t.user_id and s.schedule_key='career_check_in')
 order by t.user_id
 loop
   if exists(select 1 from public.opportunity_discovery_run r where r.talent_id=item.user_id and r.status in ('queued','running')
     and coalesce(r.trigger_payload->>'runContract','') not in ('career_agent_v1','career_internal_evaluation_v1','career_follow_external_evaluation_v1','career_external_context_v1')) then
     skipped_legacy:=skipped_legacy+1; continue;
   end if;
   planned:=planned+1;
   targets:=targets||jsonb_build_array(jsonb_build_object('talentId',item.user_id));
   if not p_dry_run then
     result:=public.ensure_career_check_in(item.user_id);
     if result is not null then created:=created+1; end if;
   end if;
 end loop;
 return jsonb_build_object('dryRun',p_dry_run,'eligible',planned,'created',created,'skippedActiveLegacy',skipped_legacy,'targets',targets);
end $$;
