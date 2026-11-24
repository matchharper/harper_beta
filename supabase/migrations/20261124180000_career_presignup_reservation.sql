-- The reservation made when an account is created is Harper's own default. The
-- person has not asked for it, and before they finish signing up its text said
-- "Help this candidate explore suitable external opportunities", which the
-- scheduled agent read as an agreed recurring search ("외부 기회 탐색을
-- 주기적으로 해드리기로 했는데"). It now says where it came from.
--
-- When signup finishes, the same row becomes the regular external discovery
-- reservation. Before this, the pre-signup text stayed after signup (543 rows
-- on 2026-11-24). A pre-signup reservation is the one with flexibleTiming=false;
-- only this function writes that value.
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
 cadence:=greatest(1,coalesce(t.periodic_interval_days,3))*case when t.status='passive' then 2 else 1 end;
 if s.id is not null and t.is_onboarding_done is true then
   -- Finishing signup starts the regular discovery, as a new reservation would.
   if s.target_refs->>'flexibleTiming'='false' and s.status in ('active','paused') then
     update public.talent_agent_schedules set title='External opportunity discovery',
       instruction='Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.',
       target_refs=target_refs||jsonb_build_object('externalRecommendations',true,'flexibleTiming',true,
         'externalPolicyPaused',t.status='stopped' or t.get_external_recommendation=false),
       interval_days=cadence,next_run_at=now()+make_interval(secs=>cadence*86400),
       status=case when t.status is distinct from 'stopped' and t.get_external_recommendation is distinct from false then 'active' else 'paused' end,
       revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
     where id=s.id returning * into s;
   end if;
   return to_jsonb(s);
 end if;
 if not exists(select 1 from public.talent_users where user_id=p_user_id and deleted_at is null) then return null; end if;
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
     'Harper set this up by default when the account was created, before the person finished signing up; they have not asked Harper for anything. Decide whether contacting them now would help them start with Harper, and adjust later occurrences from their response and prior contacts.'
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

-- Existing pre-signup reservations that still carry the default text. Text the
-- scheduled agent rewrote is Harper's own record and stays.
update public.talent_agent_schedules s set
 instruction='Harper set this up by default when the account was created, before the person finished signing up; they have not asked Harper for anything. Decide whether contacting them now would help them start with Harper, and adjust later occurrences from their response and prior contacts.',
 revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
from public.talent_setting t
where t.user_id=s.talent_id and t.is_onboarding_done is not true and s.schedule_key='career_check_in'
 and s.instruction='Help this candidate explore suitable external opportunities using the available profile, documents, Brief, conversation and actual contact history. The career interview may be incomplete. Decide what useful work or conversation can proceed with the known facts, including asking for context needed for that purpose. Decide whether contact is useful now and adjust the future reservation using current user preferences and prior outcomes.';

-- People who already finished signing up keep their current timing and status;
-- only the stale pre-signup purpose is replaced.
update public.talent_agent_schedules s set title='External opportunity discovery',
 instruction='Review suitable external opportunities using the current Brief, saved evaluations and contact history. Respect external recommendation settings; no generic Career check-in is requested.',
 target_refs=target_refs||'{"flexibleTiming":true}',
 revision=revision+1,directive_revision=directive_revision+1,updated_at=now()
from public.talent_setting t
where t.user_id=s.talent_id and t.is_onboarding_done is true and s.schedule_key='career_check_in'
 and s.target_refs->>'flexibleTiming'='false' and s.status in ('active','paused');

commit;
