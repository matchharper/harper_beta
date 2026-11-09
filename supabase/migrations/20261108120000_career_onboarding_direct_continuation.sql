-- A separate server RPC preserves deployed callers of the Worker admission.
-- Admit the first Career continuation directly to the web executor.
-- Preserve the independent internal evaluation; it does not gate this reply.
create or replace function public.enqueue_career_onboarding_continuation(p_user_id uuid,p_conversation_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run; cursor_id bigint;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended('career-onboarding:'||p_user_id,0));
 insert into public.talent_setting(user_id,is_onboarding_done) values(p_user_id,true)
 on conflict(user_id) do update set is_onboarding_done=true,updated_at=now();
 select * into r from public.opportunity_discovery_run where talent_id=p_user_id and trigger='conversation_completed' order by created_at limit 1;
 if found then return to_jsonb(r); end if;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
 values(p_user_id,p_conversation_id,'conversation_completed','initial','handed_off','career-onboarding:'||p_user_id,0,
  p_payload||jsonb_build_object('runContract','career_agent_v1','instruction','Onboarding is complete. Continue the candidate''s current Career purpose in this conversation.')) returning * into r;

 select coalesce(max(id),0) into cursor_id from public.talent_messages
 where conversation_id=p_conversation_id and user_id=p_user_id and role='user';
 update public.opportunity_discovery_run
 set trigger_payload=trigger_payload||jsonb_build_object('agentInvocation',jsonb_build_object(
   'replyId','background:'||r.id,'sourceMessageCursor',cursor_id,'acceptedAt',now()))
 where id=r.id returning * into r;
 insert into public.opportunity_discovery_run(talent_id,conversation_id,trigger,run_mode,status,dedupe_key,target_recommendation_count,trigger_payload)
 values(p_user_id,p_conversation_id,'onboarding_internal_evaluation','initial','queued','career-onboarding-internal:'||p_user_id,0,
   jsonb_build_object('runContract','career_onboarding_internal_evaluation_v1','onboardingRunId',r.id))
 on conflict do nothing;
 return to_jsonb(r);
end $$;

revoke all on function public.enqueue_career_onboarding_continuation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_career_onboarding_continuation(uuid,uuid,jsonb) to service_role;
