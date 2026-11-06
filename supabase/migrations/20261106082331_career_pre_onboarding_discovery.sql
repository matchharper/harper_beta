-- Existing completed-user schedules and their creation contract stay unchanged.
begin;
create or replace function public.ensure_career_check_in(p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.talent_agent_schedules; t public.talent_setting; cadence double precision; next_at timestamptz; last_sent timestamptz; pending_at timestamptz;
begin
 -- Match setting writers' lock order; concurrent signup/profile updates serialize.
 select * into t from public.talent_setting where user_id=p_user_id for update;
 if not found then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_check_in',0));
 select * into s from public.talent_agent_schedules where talent_id=p_user_id and schedule_key='career_check_in';
 if found and t.is_onboarding_done is true then return to_jsonb(s); end if;
 if not exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is null) then return null; end if;
 cadence:=greatest(1,coalesce(t.periodic_interval_days,3))*case when t.status='passive' then 2 else 1 end;
 if t.is_onboarding_done is not true then
   -- A frozen/claimed legacy delivery must settle before a new sender takes over.
   begin
     perform 1 from public.contact_queue where user_id=p_user_id
       and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer')
       and status in ('queued','processing','failed') for update nowait;
   exception when lock_not_available then return null;
   end;
   if exists(select 1 from public.contact_queue where user_id=p_user_id
     and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer')
     and status in ('queued','processing','failed')
     and (status='processing' or locked_by is not null or resend_email_id is not null
       or payload ? 'runtimeDelivery' or payload ? 'runtimeCopy')) then return null; end if;
   if s.id is not null then
     update public.contact_queue set status='cancelled',cancelled_at=now(),updated_at=now(),
       last_error='superseded_by_career_schedule',payload=coalesce(payload,'{}')||jsonb_build_object('careerScheduleId',s.id)
     where user_id=p_user_id and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer')
       and status in ('queued','failed');
     return to_jsonb(s);
   end if;
   select min(scheduled_at) into pending_at from public.contact_queue where user_id=p_user_id
     and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer') and status in ('queued','failed');
   select max(occurred_at) into last_sent from public.career_email_messages
     where talent_id=p_user_id and direction='outbound' and status='sent';
   next_at:=coalesce(pending_at,last_sent+make_interval(secs=>cadence*86400),
     t.created_at+make_interval(hours=>1+floor(random()*3)::int));
   -- Old accounts have no backlog of promised messages. Keep their phase.
   if next_at<=now() then
     next_at:=next_at+make_interval(secs=>(floor(extract(epoch from(now()-next_at))/(cadence*86400))+1)*cadence*86400);
   end if;
 else
   next_at:=now()+make_interval(secs=>cadence*86400);
 end if;
 insert into public.talent_agent_schedules(talent_id,schedule_key,title,instruction,target_refs,timezone,interval_days,next_run_at,status)
 values(p_user_id,'career_check_in','External opportunity discovery',
   case when t.is_onboarding_done is true then
     'Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.'
   else
     'Help this candidate explore suitable external opportunities using the available profile, documents, Brief, conversation and actual contact history. The career interview may be incomplete. Decide what useful work or conversation can proceed with the known facts, including asking for context needed for that purpose. Decide whether contact is useful now and adjust the future reservation using current user preferences and prior outcomes.'
   end,
   jsonb_build_object('externalRecommendations',true,'flexibleTiming',t.is_onboarding_done is true,'externalPolicyPaused',t.status='stopped' or t.get_external_recommendation=false), 'Asia/Seoul',cadence,next_at,
   case when t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false then 'active' else 'paused' end) returning * into s;
 if t.is_onboarding_done is not true then
   update public.contact_queue set status='cancelled',cancelled_at=now(),updated_at=now(),
     last_error='superseded_by_career_schedule',payload=coalesce(payload,'{}')||jsonb_build_object('careerScheduleId',s.id)
   where user_id=p_user_id and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer')
     and status in ('queued','failed');
 end if;
 return to_jsonb(s);
end $$;

create or replace function public.initialize_career_check_in()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform public.ensure_career_check_in(new.user_id);
 return new;
end $$;

-- Compatibility with old web/Worker producers during rollout. The single
-- scheduler owns new reminders; committed/frozen old sends remain recoverable.
create function public.route_career_intake_contact()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer') then
   perform public.ensure_career_check_in(new.user_id);
   return null;
 end if;
 return new;
end $$;
create trigger route_career_intake_contact before insert on public.contact_queue
 for each row execute function public.route_career_intake_contact();
revoke all on function public.route_career_intake_contact() from public,anon,authenticated;
grant execute on function public.route_career_intake_contact() to service_role,harper_worker;

-- Explicit preview/apply, no mass scheduling as a migration side effect.
-- Locked/frozen deliveries are retried on a later invocation of this function.
create function public.seed_incomplete_career_schedules(p_dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t record; s jsonb; planned integer:=0; created integer:=0; deferred integer:=0;
begin
 if p_dry_run is null then raise exception 'Dry run must be explicit'; end if;
 for t in select setting.user_id from public.talent_setting setting
   join public.talent_users u on u.user_id=setting.user_id and u.deleted_at is null
   where setting.is_onboarding_done is not true and (not exists(
     select 1 from public.talent_agent_schedules where talent_id=setting.user_id and schedule_key='career_check_in')
     or exists(select 1 from public.contact_queue where user_id=setting.user_id
       and type in ('career_signup_no_profile_submit','career_profile_submitted_no_answer') and status in ('queued','processing','failed')))
   order by setting.user_id loop
   planned:=planned+1;
   if not p_dry_run then
     s:=public.ensure_career_check_in(t.user_id);
     if s is null then deferred:=deferred+1; else created:=created+1; end if;
   end if;
 end loop;
 return jsonb_build_object('dryRun',p_dry_run,'eligible',planned,'created',created,'deferred',deferred);
end $$;
revoke all on function public.seed_incomplete_career_schedules(boolean) from public,anon,authenticated;
grant execute on function public.seed_incomplete_career_schedules(boolean) to service_role;
commit;
