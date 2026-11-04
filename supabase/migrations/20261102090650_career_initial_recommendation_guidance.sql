-- Only new onboarding invocations receive this guidance; existing runs are unchanged.
-- The reference range is model guidance, not an execution quota or limit.
create or replace function public.enqueue_career_onboarding_invocation(p_user_id uuid,p_conversation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career-onboarding:'||p_user_id,0));
 insert into public.talent_setting(user_id,is_onboarding_done) values(p_user_id,true)
 on conflict(user_id) do update set is_onboarding_done=true,updated_at=now();
 select * into r from public.opportunity_discovery_run where talent_id=p_user_id and trigger='conversation_completed' order by created_at limit 1;
 if found then return to_jsonb(r); end if;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
 values(p_user_id,p_conversation_id,'conversation_completed','initial','queued','career-onboarding:'||p_user_id,0,
  p_payload||jsonb_build_object('runContract','career_agent_v1','instruction','This is a newly joined candidate who has just completed their first onboarding. Continue the candidate''s Career purpose using their current Brief and profile. For this first recommendation, offer a somewhat fuller selection of useful opportunities to help them explore their options and give feedback. Use roughly 10-15 opportunities as a reference range when enough suitable options are available, not as a quota, minimum or maximum. Decide the actual number from their goals, preferences, available opportunities and actual usefulness; recommend fewer or more when the context warrants it, and do not pad the selection just to reach the range. Decide useful initial work and save future checks if warranted. No fixed recommendation count or start email is required.')) returning * into r;
 return to_jsonb(r);
end $$;

revoke all on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) to service_role;
