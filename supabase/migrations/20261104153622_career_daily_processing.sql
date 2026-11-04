-- Pending source revisions and their execution receipts, not agent plans.
-- Readers: daily collector, background source fence, completed-run recovery.
create table public.career_daily_sources (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  source_kind text not null, source_id text not null, source_revision text not null,
  available_at timestamptz not null, event jsonb not null,
  run_id uuid references public.opportunity_discovery_run(id),
  finished_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(talent_id,source_kind,source_id,source_revision)
);
create index career_daily_sources_pending on public.career_daily_sources(available_at,talent_id)
  where finished_at is null and cancelled_at is null;
create index career_daily_sources_run on public.career_daily_sources(run_id) where finished_at is null;
create index career_processing_day on public.opportunity_discovery_run(talent_id,(trigger_payload->>'dailyBatchDate'))
 where trigger_payload->>'dailyBatchDate' is not null;
alter table public.career_daily_sources enable row level security;
revoke all on public.career_daily_sources from public,anon,authenticated;
grant select,insert,update on public.career_daily_sources to service_role,harper_worker;
-- The trusted email/Worker role can already append stage facts. Its invoker
-- trigger needs only these recommendation facts, not broader write access.
grant select(id,talent_id,role_id,feedback,saved_stage,processed_stage)
 on public.talent_opportunity_recommendation to harper_worker;

create function public.record_career_daily_source(p_talent uuid,p_kind text,p_id text,p_revision text,p_at timestamptz,p_event jsonb)
returns void language sql security invoker set search_path='' as $$
 insert into public.career_daily_sources(talent_id,source_kind,source_id,source_revision,available_at,event)
 values(p_talent,p_kind,p_id,p_revision,p_at,p_event||jsonb_build_object(
   'sourceKind',p_kind,'sourceId',p_id,'revision',p_revision,'occurredAt',p_at))
 on conflict(talent_id,source_kind,source_id,source_revision) do nothing;
$$;

-- Closure notices concern an existing accepted process, never every recommended
-- candidate. Privacy/recommendation opt-outs do not erase an existing process.
create function public.career_closure_recommendation_current(p_id uuid,p_talent uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.talent_opportunity_recommendation r
   join public.company_roles role on role.role_id=r.role_id
   where r.id=p_id and r.talent_id=p_talent and role.source_type='internal'
     and (r.feedback in ('like','positive') or r.saved_stage='accepted')
     and coalesce(r.saved_stage,'')<>'closed'
     and lower(btrim(coalesce(role.information->>'testOnly','false'))) not in ('true','1','yes','on'));
$$;

create function public.capture_career_daily_source()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r record; transition_id text:=gen_random_uuid()::text;
begin
 if tg_table_name='talent_progress' then
   if new.kind='org_stage_change' then
     update public.career_daily_sources d set cancelled_at=now()
     where d.talent_id=new.talent_id and d.source_kind='process_closure'
       and d.finished_at is null and d.cancelled_at is null
       and exists(select 1 from public.talent_progress prior where prior.id=d.source_id::uuid
         and prior.role_id=new.role_id and prior.id<>new.id and prior.created_at<=new.created_at);
   end if;
   if new.kind='org_stage_change' and new.metadata->>'stage' in ('process_stopped','archived')
     and new.metadata->>'notifyCandidateOnClosure' is distinct from 'false'
     and public.career_closure_recommendation_current(new.recommendation_id,new.talent_id) then
     perform public.record_career_daily_source(new.talent_id,'process_closure',new.id::text,'1',now(),
       jsonb_build_object('roleIds',jsonb_build_array(new.role_id),'recommendationId',new.recommendation_id,
         'summary','The company ended this existing candidate process. Check its current state and communicate the outcome; private company notes are not candidate-facing reasons.'));
   end if;
 elsif tg_table_name='company_roles' then
   if new.status is distinct from old.status then
     update public.career_daily_sources set cancelled_at=now()
     where source_kind='role_closure' and source_id=new.role_id::text and finished_at is null and cancelled_at is null;
   end if;
   if new.source_type='internal' and new.status in ('ended','deleted') and new.status is distinct from old.status
     and lower(btrim(coalesce(new.information->>'testOnly','false'))) not in ('true','1','yes','on') then
     for r in select rec.id,rec.talent_id from public.talent_opportunity_recommendation rec
       where rec.role_id=new.role_id and coalesce(rec.processed_stage,'') not in ('final_offer','process_stopped','archived','rejected')
         and public.career_closure_recommendation_current(rec.id,rec.talent_id)
     loop
       perform public.record_career_daily_source(r.talent_id,'role_closure',new.role_id::text,
         transition_id,now(),jsonb_build_object('roleIds',jsonb_build_array(new.role_id),
           'recommendationId',r.id,
           'summary','The Role ended while this candidate had an accepted process. Check current progress and communicate the outcome.'));
     end loop;
   end if;
 elsif tg_table_name='talent_opportunity_matching_review' then
   if tg_op='UPDATE' and (new.decision is distinct from old.decision or new.not_before is distinct from old.not_before) then
     update public.career_daily_sources set cancelled_at=now()
       where source_kind='talent_selection' and source_id=new.id::text and finished_at is null and cancelled_at is null;
   end if;
   if new.decision in ('candidate_first','both') and new.closed_at is null and new.recommendation_id is null and new.discovery_run_id is null
     and (tg_op='INSERT' or new.decision is distinct from old.decision or new.not_before is distinct from old.not_before) then
     perform public.record_career_daily_source(new.talent_id,'talent_selection',new.id::text,
       case when tg_op='INSERT' then '1' else transition_id end,greatest(now(),new.not_before),
       jsonb_build_object('roleIds',jsonb_build_array(new.opportunity_id),
         'summary','The company-side agent selected this Role for a talent-first proposal. Read this exact Role and the candidate context, then use the normal recommendation capability if appropriate. Selection is not candidate consent or an already published recommendation.'));
   end if;
 end if;
 return new;
end $$;
create trigger capture_career_process_closure after insert on public.talent_progress
 for each row execute function public.capture_career_daily_source();
create trigger capture_career_role_closure after update of status on public.company_roles
 for each row execute function public.capture_career_daily_source();
create trigger capture_career_talent_selection after insert or update of decision,not_before on public.talent_opportunity_matching_review
 for each row execute function public.capture_career_daily_source();

create function public.career_daily_source_current(p_id uuid,p_talent uuid,p_now timestamptz default now(),p_run_id uuid default null)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare s public.career_daily_sources; f public.company_talent_followups; authority jsonb;
begin
 select * into s from public.career_daily_sources where id=p_id and talent_id=p_talent;
 if not found or s.cancelled_at is not null or (p_run_id is not null and s.run_id is distinct from p_run_id) then return false; end if;
 if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then return false; end if;
 -- The invocation must be able to resume after its own delivery. This is an
 -- owned effect, not a concurrent cancellation of its input.
 if s.source_kind in ('process_closure','role_closure') and exists(
   select 1 from public.talent_opportunity_recommendation r join public.talent_progress p on p.recommendation_id=r.id
   where r.id=(s.event->>'recommendationId')::uuid and r.talent_id=p_talent and r.saved_stage='closed'
     and p.kind='internal_process_stopped_notified' and p.metadata->>'discoveryRunId'=s.run_id::text) then return true; end if;
 if s.source_kind='process_closure' then
   return public.career_closure_recommendation_current((s.event->>'recommendationId')::uuid,p_talent)
     and exists(select 1 from public.talent_progress p where p.id=s.source_id::uuid
       and p.metadata->>'notifyCandidateOnClosure' is distinct from 'false'
       and not exists(select 1 from public.talent_progress later where later.talent_id=p_talent
         and later.role_id=p.role_id and later.kind='org_stage_change' and later.created_at>p.created_at));
 elsif s.source_kind='role_closure' then
   return public.career_closure_recommendation_current((s.event->>'recommendationId')::uuid,p_talent)
     and exists(select 1 from public.company_roles r where r.role_id=s.source_id::uuid and r.status in ('ended','deleted'))
     and exists(select 1 from public.talent_opportunity_recommendation r where r.id=(s.event->>'recommendationId')::uuid
       and coalesce(r.processed_stage,'') not in ('final_offer','process_stopped','archived','rejected'));
 elsif s.source_kind='talent_selection' then
   return exists(select 1 from public.talent_opportunity_matching_review m
     join public.company_roles r on r.role_id=m.opportunity_id
     join public.talent_setting t on t.user_id=m.talent_id
     where m.id=s.source_id::uuid and m.talent_id=p_talent and m.decision in ('candidate_first','both')
       and (m.discovery_run_id is null or m.discovery_run_id=s.run_id)
       and r.source_type='internal' and m.closed_at is null and (m.recommendation_id is null or exists(select 1 from public.talent_opportunity_recommendation rec
         join public.opportunity_discovery_run run on run.id=s.run_id
         where rec.id=m.recommendation_id and rec.kind='career_agent' and rec.created_at>=run.created_at)) and r.status='active' and not coalesce(r.is_expired,false)
       and (r.expires_at is null or r.expires_at>p_now)
       and lower(btrim(coalesce(r.information->>'testOnly','false'))) not in ('true','1','yes','on')
       and t.get_internal_recommendation is distinct from false and t.profile_visibility is distinct from 'dont_share'
       and not exists(select 1 from unnest(coalesce(t.blocked_companies,'{}')) blocked
         join public.company_workspace w on w.company_workspace_id=r.company_workspace_id
         where lower(btrim(blocked)) in (lower(btrim(w.company_name)),lower(btrim(w.published_name)),lower(w.company_workspace_id::text))));
 elsif s.source_kind='appointment' then
   return exists(select 1 from public.meeting_schedules m where m.id=s.source_id::uuid and m.talent_id=p_talent
     and m.version::text=s.source_revision and m.status='confirmed'
     and (m.confirmed_start_at>p_now or (m.confirmed_start_at is null
       and m.source_refs->>'calendarDate'=(p_now at time zone 'Asia/Seoul')::date::text)));
 elsif s.source_kind='company_followup' then
   select * into f from public.company_talent_followups where id=s.source_id::uuid and talent_id=p_talent;
   if not found or f.revision::text<>s.source_revision then return false; end if;
   if f.status='delivered' and f.delivery_run_id=s.run_id then return true; end if;
   if f.status<>'pending' then return false; end if;
   authority:=public.company_followup_source_v1(f.source_kind,f.source_id);
   return coalesce((authority->>'active')::boolean,false) and authority->>'originalSentAt' is not null;
 end if;
 return false;
end $$;

-- Only actual appointments and stored follow-up dates are scanned. No LLM, no
-- all-user check-in, and no scan of historical rejections during cutover.
create function public.collect_career_daily_sources(p_now timestamptz default now())
returns void language plpgsql security invoker set search_path='' as $$
declare f record; m record; day_end timestamptz:=((p_now at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul';
begin
 for f in select * from public.company_talent_followups where status='pending' and due_at<day_end and delivery_run_id is null
   and not exists(select 1 from public.career_daily_sources s where s.talent_id=company_talent_followups.talent_id
     and s.source_kind='company_followup' and s.source_id=company_talent_followups.id::text and s.source_revision=company_talent_followups.revision::text)
   and not exists(select 1 from public.opportunity_discovery_run r where r.talent_id=company_talent_followups.talent_id
     and r.status in ('queued','running','handed_off','completed') and r.trigger_payload->'sourceEvents' @>
       jsonb_build_array(jsonb_build_object('sourceKind','company_followup','sourceId',company_talent_followups.id,'revision',company_talent_followups.revision)))
 loop
   perform public.record_career_daily_source(f.talent_id,'company_followup',f.id::text,f.revision::text,f.due_at,'{}');
 end loop;
 for m in select * from public.meeting_schedules where status='confirmed'
   and ((confirmed_start_at>p_now and confirmed_start_at<day_end)
     or (confirmed_start_at is null and source_refs->>'calendarDate'=(p_now at time zone 'Asia/Seoul')::date::text))
 loop
   perform public.record_career_daily_source(m.talent_id,'appointment',m.id::text,m.version::text,
     ((p_now at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul',
     jsonb_build_object('targetRefs',jsonb_build_object('meetingScheduleIds',jsonb_build_array(m.id)),
       'startsAt',m.confirmed_start_at,'summary','The candidate has an actual appointment today. Read current details and recent preparation/contact before deciding whether help is useful.'));
 end loop;
 update public.career_daily_sources s set cancelled_at=p_now
   where finished_at is null and cancelled_at is null
     and not public.career_daily_source_current(s.id,s.talent_id,p_now);
end $$;

create function public.list_career_processing_candidates(p_now timestamptz,p_limit integer,p_after uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 with candidates as (
   select talent_id,min(available_at) due from public.career_daily_sources d
   where finished_at is null and cancelled_at is null and available_at<=p_now
     and (p_now at time zone 'Asia/Seoul')::time>='09:00'::time
     and (run_id is null or exists(select 1 from public.opportunity_discovery_run r where r.id=d.run_id and r.status in ('cancelled','failed')))
     and not exists(select 1 from public.opportunity_discovery_run r where r.talent_id=d.talent_id
       and r.trigger_payload->>'dailyBatchDate'=(p_now at time zone 'Asia/Seoul')::date::text)
   group by talent_id
   union all
   select s.talent_id,min(s.next_run_at) from public.talent_agent_schedules s
   join public.talent_setting t on t.user_id=s.talent_id
   where s.status='active' and s.next_run_at<=p_now
     and (s.schedule_key is distinct from 'career_check_in' or (t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false))
   group by s.talent_id
 ), owners as (
   select c.talent_id,min(c.due) due from candidates c join public.talent_users u on u.user_id=c.talent_id and u.deleted_at is null
   where (p_after is null or c.talent_id>p_after) and not exists(select 1 from public.opportunity_discovery_run r where r.talent_id=c.talent_id
     and r.trigger_payload->>'runContract'='career_agent_v1' and r.status in ('queued','running','handed_off'))
   group by c.talent_id order by c.talent_id limit p_limit
 ) select coalesce(jsonb_agg(jsonb_build_object('talentId',o.talent_id,
   'sources',(select coalesce(jsonb_agg(to_jsonb(d) order by available_at,id),'[]') from public.career_daily_sources d
     where d.talent_id=o.talent_id and d.finished_at is null and d.cancelled_at is null and d.available_at<=p_now
       and (d.run_id is null or exists(select 1 from public.opportunity_discovery_run r where r.id=d.run_id and r.status in ('failed','cancelled')))),
   'schedules',(select coalesce(jsonb_agg(to_jsonb(s) order by next_run_at,id),'[]') from public.talent_agent_schedules s
     join public.talent_setting t on t.user_id=s.talent_id
     where s.talent_id=o.talent_id and s.status='active' and s.next_run_at<((p_now at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul'
       and (s.schedule_key is distinct from 'career_check_in' or (t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false)))) order by o.talent_id),'[]') from owners o;
$$;

create function public.enqueue_career_processing(p_talent uuid,p_sources uuid[],p_schedules jsonb,p_now timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_run_id uuid; s public.talent_agent_schedules; d public.career_daily_sources; item jsonb;
 events jsonb:='[]'; included uuid[]:='{}'; batch_day text; external_only boolean:=true;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_talent::text||':career_processing',0));
 if not exists(select 1 from public.talent_users where user_id=p_talent and deleted_at is null) then return null; end if;
 if exists(select 1 from public.opportunity_discovery_run where talent_id=p_talent and status in ('queued','running','handed_off')
   and trigger_payload->>'runContract'='career_agent_v1') then return null; end if;
 for d in select * from public.career_daily_sources where id=any(p_sources) and talent_id=p_talent
   and finished_at is null and cancelled_at is null and available_at<=p_now for update loop
   if d.run_id is not null and exists(select 1 from public.opportunity_discovery_run where id=d.run_id and status not in ('failed','cancelled')) then continue; end if;
   if not public.career_daily_source_current(d.id,p_talent,p_now) then continue; end if;
   events:=events||jsonb_build_array(d.event||jsonb_build_object('dailySourceId',d.id)); included:=array_append(included,d.id); external_only:=false;
 end loop;
 for item in select value from jsonb_array_elements(p_schedules) loop
   select * into s from public.talent_agent_schedules where id=(item->>'id')::uuid and talent_id=p_talent for update;
   if not found or s.status<>'active' or s.revision<>(item->>'revision')::bigint or s.next_run_at is distinct from (item->>'dueAt')::timestamptz then return null; end if;
   if s.next_run_at>p_now and not (s.target_refs->>'flexibleTiming'='true'
     and (s.next_run_at at time zone 'Asia/Seoul')::date=(p_now at time zone 'Asia/Seoul')::date) then return null; end if;
   if s.schedule_key='career_check_in' and not exists(select 1 from public.talent_setting where user_id=p_talent
     and status is distinct from 'stopped' and get_external_recommendation is distinct from false) then return null; end if;
   if s.schedule_key is distinct from 'career_check_in' then external_only:=false; end if;
   events:=events||jsonb_build_array(jsonb_build_object('sourceKind','schedule','sourceId',s.id,'revision',s.directive_revision,
     'scheduleRevision',s.revision,'occurredAt',s.next_run_at,'title',s.title,'instruction',s.instruction,
     'targetRefs',s.target_refs,'timezone',s.timezone,'recurrence',s.recurrence,'intervalDays',s.interval_days,'scheduleKey',s.schedule_key));
 end loop;
 if jsonb_array_length(events)=0 then return null; end if;
 if cardinality(included)>0 then
   batch_day:=(p_now at time zone 'Asia/Seoul')::date::text;
   -- A fixed user reservation may still run after today's batch, but it must
   -- not create another daily batch merely because more low-priority work arrived.
   if exists(select 1 from public.opportunity_discovery_run where talent_id=p_talent and trigger_payload->>'dailyBatchDate'=batch_day) then
     if jsonb_array_length(p_schedules)=0 then return null; end if;
     batch_day:=null;
   end if;
 end if;
 insert into public.opportunity_discovery_run(talent_id,trigger,run_mode,status,dedupe_key,trigger_payload)
 values(p_talent,case when cardinality(included)>0 then 'career_daily_due' else 'career_schedule_due' end,'refresh','queued',
   'career_processing:'||p_talent||':'||(p_now at time zone 'Asia/Seoul')::date::text||':'||md5(events::text),jsonb_build_object('runContract','career_agent_v1',
     'contactScope',case when external_only then 'external_recommendations' else 'delegated_work' end,
     'dailyBatchDate',batch_day,'sourceEvents',events,
     'instruction','Handle these current sources together using the candidate context and recent contact history. Combine useful candidate-facing updates in one contact when appropriate. Do not start unrelated periodic discovery.'))
 on conflict do nothing returning id into v_run_id;
 if v_run_id is null then return null; end if;
 for d in select * from public.career_daily_sources where id=any(included) loop
   update public.career_daily_sources set run_id=v_run_id where id=d.id;
 end loop;
 for item in select value from jsonb_array_elements(p_schedules) loop
   update public.talent_agent_schedules set last_run_id=v_run_id,next_run_at=(item->>'nextAt')::timestamptz,
     status=case when item->>'nextAt' is null then 'triggered' else 'active' end,updated_at=p_now where id=(item->>'id')::uuid;
 end loop;
 return v_run_id;
end $$;

-- During DB-first rollout, the old web collector still calls this entrypoint.
-- Enforce the same consent and candidate serialization at the execution boundary.
alter function public.enqueue_career_schedule_occurrence(uuid,bigint,timestamptz,timestamptz)
 rename to enqueue_career_schedule_occurrence_before_daily;
create function public.enqueue_career_schedule_occurrence(p_id uuid,p_expected_revision bigint,p_due_at timestamptz,p_next_at timestamptz)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.talent_agent_schedules; v_talent uuid; v_run uuid;
begin
 select talent_id into v_talent from public.talent_agent_schedules where id=p_id;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_talent::text||':career_processing',0));
 select * into s from public.talent_agent_schedules where id=p_id for update;
 if s.schedule_key='career_check_in' and not exists(select 1 from public.talent_setting t where t.user_id=s.talent_id
   and t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false) then return null; end if;
 if exists(select 1 from public.opportunity_discovery_run where talent_id=v_talent and status in ('queued','running','handed_off')
   and trigger_payload->>'runContract'='career_agent_v1') then return null; end if;
 v_run:=public.enqueue_career_schedule_occurrence_before_daily(p_id,p_expected_revision,p_due_at,p_next_at);
 if s.schedule_key='career_check_in' and v_run is not null then
   update public.opportunity_discovery_run set trigger_payload=trigger_payload||'{"contactScope":"external_recommendations"}'
     where id=v_run and status='queued';
 end if;
 return v_run;
end $$;
revoke all on function public.enqueue_career_schedule_occurrence(uuid,bigint,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.enqueue_career_schedule_occurrence(uuid,bigint,timestamptz,timestamptz) to service_role,harper_worker;

-- Preserve the existing completion/reconciliation semantics and add ownership
-- of the exact source receipts to those same transactions.
alter function public.finish_career_source_events(uuid) rename to finish_career_source_events_before_daily;
create function public.finish_career_source_events(p_run_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare done boolean;
begin
 if exists(select 1 from public.opportunity_discovery_run where id=p_run_id and coverage->>'agentOutcome'='delivery_pending') then return false; end if;
 done:=public.finish_career_source_events_before_daily(p_run_id);
 if done then
   update public.talent_opportunity_matching_review m set discovery_run_id=p_run_id,
     closed_at=case when m.recommendation_id is null then now() else m.closed_at end
   where m.closed_at is null and exists(select 1 from public.career_daily_sources d
     where d.run_id=p_run_id and d.source_kind='talent_selection' and d.source_id=m.id::text and d.cancelled_at is null);
   update public.career_daily_sources set finished_at=now() where run_id=p_run_id and cancelled_at is null;
 end if;
 return done;
end $$;
alter function public.requeue_career_remaining_sources(uuid,jsonb,text) rename to requeue_career_remaining_sources_before_daily;
create function public.requeue_career_remaining_sources(p_run_id uuid,p_source_events jsonb,p_contact_scope text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare next_id uuid;
begin
 next_id:=public.requeue_career_remaining_sources_before_daily(p_run_id,p_source_events,p_contact_scope);
 update public.career_daily_sources set run_id=next_id where run_id=p_run_id
   and id in (select (e->>'dailySourceId')::uuid from jsonb_array_elements(p_source_events) e where e ? 'dailySourceId');
 return next_id;
end $$;

-- The historical key is retained for client compatibility, but its ONLY
-- automatic purpose is opted-in external discovery. Explicit schedules survive.
create or replace function public.ensure_career_check_in(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.talent_agent_schedules; t public.talent_setting; cadence double precision;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_check_in',0));
 select * into s from public.talent_agent_schedules where talent_id=p_user_id and schedule_key='career_check_in';
 if found then return to_jsonb(s); end if;
 select * into t from public.talent_setting where user_id=p_user_id;
 if not found or t.is_onboarding_done is not true or not exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is null) then return null; end if;
 cadence:=greatest(1,coalesce(t.periodic_interval_days,3))*case when t.status='passive' then 2 else 1 end;
 insert into public.talent_agent_schedules(talent_id,schedule_key,title,instruction,target_refs,timezone,interval_days,next_run_at,status)
 values(p_user_id,'career_check_in','External opportunity discovery',
   'Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.',
   jsonb_build_object('externalRecommendations',true,'flexibleTiming',true,'externalPolicyPaused',t.status='stopped' or t.get_external_recommendation=false), 'Asia/Seoul',cadence,now()+make_interval(secs=>cadence*86400),
   case when t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false then 'active' else 'paused' end) returning * into s;
 return to_jsonb(s);
end $$;
-- A directly user-authored purpose is an explicit reservation. An agent edit
-- merely citing a user message is NOT proof of a separate scheduling request:
-- older agents also copied ordinary profile replies into this automatic key.
update public.talent_agent_schedules s set schedule_key=null
where schedule_key='career_check_in' and exists(select 1 from public.talent_external_operations op
 where op.user_id=s.talent_id and op.kind='career_schedule_mutation' and op.status='completed'
   and op.request->>'schedule_id'=s.id::text and op.request->>'instruction'=s.instruction
   and op.request->>'actor'='user');
update public.talent_agent_schedules s set title='External opportunity discovery',
 instruction='Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.',
 target_refs=(target_refs-'legacySchedulerReview'-'internalRecommendations')||'{"externalRecommendations":true,"flexibleTiming":true}',revision=revision+1,directive_revision=directive_revision+1
 where schedule_key='career_check_in';

-- Coverage is supplied with the sealed message, then committed only after a
-- real delivery receipt. A batched email must not mark every follow-up sent.
create function public.record_career_daily_contact(p_run uuid,p_ids jsonb,p_channel text,p_receipt text)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.career_daily_sources; rec public.talent_opportunity_recommendation; role public.company_roles; company_name text; audit jsonb;
begin
 if p_channel='email' then
   if not exists(select 1 from public.talent_opportunity_delivery where id=p_receipt::uuid and discovery_run_id=p_run
     and payload->>'resendEmailId' is not null and payload->'sourceIds'=p_ids) then raise exception 'Email receipt unavailable'; end if;
 elsif p_channel='chat' then
   if not exists(select 1 from public.talent_messages where id=p_receipt::bigint
     and payload->>'backgroundRunId'=p_run::text and payload->'sourceIds'=p_ids) then raise exception 'Chat receipt unavailable'; end if;
 else raise exception 'Unsupported receipt channel'; end if;
 for d in select * from public.career_daily_sources where id in (select value::uuid from jsonb_array_elements_text(p_ids)) and run_id=p_run loop
   if d.source_kind in ('process_closure','role_closure') then
     select * into rec from public.talent_opportunity_recommendation where id=(d.event->>'recommendationId')::uuid and talent_id=d.talent_id for update;
     if not found then continue; end if;
     if exists(select 1 from public.talent_progress p where p.recommendation_id=rec.id
       and p.kind='internal_process_stopped_notified' and p.metadata->>'receiptId'=p_receipt and p.metadata->>'sentChannel'=p_channel) then continue; end if;
     select * into role from public.company_roles where role_id=rec.role_id;
     select w.company_name into company_name from public.company_workspace w where w.company_workspace_id=role.company_workspace_id;
     audit:=jsonb_build_object('closureKind',d.source_kind,'currentStage',rec.processed_stage,
       'companyName',company_name,'roleName',role.name,'sentChannel',p_channel,'discoveryRunId',p_run,'receiptId',p_receipt,
       'dailySourceId',d.id,'sourceOccurredAt',d.available_at);
     if public.career_daily_source_current(d.id,d.talent_id,now(),p_run) then
       perform public.commit_internal_process_closure_notice_v1(p_metadata=>audit,
         p_recommendation_id=>rec.id,p_talent_id=>d.talent_id,p_text=>'Process closure communicated by the Career agent.',p_user_id=>'harper');
     else
       -- The provider receipt is a fact even if the process was reopened while
       -- sending. Audit it without closing the newer process again.
       insert into public.talent_progress(talent_id,role_id,recommendation_id,user_id,kind,text,metadata)
       values(d.talent_id,rec.role_id,rec.id,'harper','internal_process_stopped_notified',
         'Process closure message delivered; the process changed before its receipt was recorded.',audit||'{"stateChangedAfterSend":true}');
     end if;
   end if;
 end loop;
end $$;
revoke all on function public.record_career_daily_contact(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.record_career_daily_contact(uuid,jsonb,text,text) to service_role;

create or replace function public.finish_career_agent_email(p_delivery_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery; m bigint; e jsonb; c uuid; target jsonb;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1' for update;
 if not found or d.payload->>'resendEmailId' is null then raise exception 'Provider receipt required'; end if;
 e:=d.payload->'emailPayload'; c:=(d.payload->>'conversationId')::uuid;
 select talent_message_id into m from public.career_email_messages where id=d.id;
 if not found then
  perform 1 from public.talent_conversations where id=c and user_id=d.talent_id;
  if found then
   insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
   values(d.talent_id,c,'assistant','mail',d.payload->>'bodyMarkdown',jsonb_build_object('deliveryId',d.id,'discoveryRunId',d.discovery_run_id,'subject',e->>'subject','sentAt',coalesce(d.sent_at,now()))) returning id into m;
  end if;
  insert into public.career_email_messages(id,talent_id,talent_message_id,direction,mail_type,status,from_email,to_email,subject,body_text,occurred_at,metadata)
  values(d.id,d.talent_id,m,'outbound','career_agent','sent',e->>'from',e->>'to',e->>'subject',e->>'text',coalesce(d.sent_at,now()),
   jsonb_build_object('discoveryRunId',d.discovery_run_id,'replyTo',e->>'replyTo','resendEmailId',d.payload->>'resendEmailId'));
 end if;
 for target in select value from jsonb_array_elements(coalesce((select trigger_payload->'companyRequestFollowups' from public.opportunity_discovery_run where id=d.discovery_run_id),'[]')) source_target(value) where not exists(
    select 1 from public.opportunity_discovery_run run, jsonb_array_elements(run.trigger_payload->'sourceEvents') source
    where run.id=d.discovery_run_id and source->>'sourceKind'='company_followup'
      and source->>'sourceId'=source_target.value->>'followupId' and source ? 'dailySourceId'
      and not coalesce(d.payload->'sourceIds','[]') ? (source->>'dailySourceId')) loop
  if not exists(select 1 from public.talent_progress where metadata->>'followupId'=target->>'followupId'
    and metadata->>'eventType'='email_sent' and metadata->>'discoveryRunId'=d.discovery_run_id::text) then
   perform public.record_company_followup_event_v1((target->>'followupId')::uuid,'email_sent',jsonb_build_object('discoveryRunId',d.discovery_run_id));
  end if;
  update public.company_talent_followups set status='delivered',updated_at=now()
   where id=(target->>'followupId')::uuid and delivery_run_id=d.discovery_run_id and status='pending';
 end loop;
 update public.talent_opportunity_delivery set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now(),error_message=null,
  payload=payload||jsonb_build_object('auditCompletedAt',now()) where id=d.id returning * into d;
 update public.opportunity_discovery_run set coverage=coalesce(coverage,'{}')||jsonb_build_object('agentOutcome','sent') where id=d.discovery_run_id;
 if d.payload ? 'sourceIds' then perform public.record_career_daily_contact(d.discovery_run_id,d.payload->'sourceIds','email',d.id::text); end if;
 return to_jsonb(d);
end $$;

-- A settings pause is distinct from an explicitly paused reservation. Restore
-- only the former when external discovery is enabled again.
update public.talent_agent_schedules s set status='paused',target_refs=target_refs||'{"externalPolicyPaused":true}'
from public.talent_setting t where t.user_id=s.talent_id and s.schedule_key='career_check_in' and s.status='active'
 and (t.status='stopped' or t.get_external_recommendation=false);
create function public.sync_career_external_discovery_setting()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='stopped' or new.get_external_recommendation=false then
   update public.talent_agent_schedules set status='paused',target_refs=target_refs||'{"externalPolicyPaused":true}',
     revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
   where talent_id=new.user_id and schedule_key='career_check_in' and status='active';
 elsif old.status='stopped' or old.get_external_recommendation=false then
   update public.talent_agent_schedules set status='active',target_refs=target_refs-'externalPolicyPaused',
     next_run_at=greatest(next_run_at,now()+make_interval(secs=>coalesce(interval_days,3)*86400)),
     revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
   where talent_id=new.user_id and schedule_key='career_check_in' and status='paused'
     and target_refs->>'externalPolicyPaused'='true';
 end if;
 return new;
end $$;
create trigger sync_career_external_discovery_setting after update of status,get_external_recommendation on public.talent_setting
 for each row execute function public.sync_career_external_discovery_setting();
revoke all on function public.sync_career_external_discovery_setting() from public,anon,authenticated;
grant execute on function public.sync_career_external_discovery_setting() to service_role,harper_worker;
grant update(status,target_refs,next_run_at,revision,directive_revision,updated_at) on public.talent_agent_schedules to harper_worker;

-- Pending company selections are current undelivered work, unlike historic
-- closure backfill. Capture them once; validity is rechecked before collection.
insert into public.career_daily_sources(talent_id,source_kind,source_id,source_revision,available_at,event)
select talent_id,'talent_selection',id::text,'1',greatest(now(),not_before),jsonb_build_object('sourceKind','talent_selection',
 'sourceId',id,'revision','1','occurredAt',now(),'roleIds',jsonb_build_array(opportunity_id),
 'summary','The company-side agent selected this exact Role for a talent-first proposal. Read its current public facts and candidate context; publish if appropriate. No introduction consent is implied.')
from public.talent_opportunity_matching_review where decision in ('candidate_first','both') and closed_at is null and recommendation_id is null and discovery_run_id is null
on conflict do nothing;

-- Every new function is server-only. Trigger callers use the same invoker role.
revoke all on function public.record_career_daily_source(uuid,text,text,text,timestamptz,jsonb),
 public.career_closure_recommendation_current(uuid,uuid),public.capture_career_daily_source(),
 public.career_daily_source_current(uuid,uuid,timestamptz,uuid),public.collect_career_daily_sources(timestamptz),
 public.list_career_processing_candidates(timestamptz,integer,uuid),public.enqueue_career_processing(uuid,uuid[],jsonb,timestamptz),
 public.finish_career_source_events(uuid),public.requeue_career_remaining_sources(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_career_daily_source(uuid,text,text,text,timestamptz,jsonb),
 public.career_closure_recommendation_current(uuid,uuid),public.capture_career_daily_source(),
 public.career_daily_source_current(uuid,uuid,timestamptz,uuid),public.collect_career_daily_sources(timestamptz),
 public.list_career_processing_candidates(timestamptz,integer,uuid),public.enqueue_career_processing(uuid,uuid[],jsonb,timestamptz),
 public.finish_career_source_events(uuid),public.requeue_career_remaining_sources(uuid,jsonb,text) to service_role,harper_worker;
