-- Reuse the discovery ledger and existing email outbox. These are execution
-- receipts, not conversation plans. Only server callers can use the RPCs.
create unique index if not exists career_agent_email_per_run
 on public.talent_opportunity_delivery(discovery_run_id,channel)
 where payload->>'runContract'='career_agent_v1';

create function public.accept_career_agent_run(p_run_id uuid,p_lease_token text,p_conversation_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run; cursor_id bigint; invocation jsonb;
begin
 select * into r from public.opportunity_discovery_run where id=p_run_id for update;
 if not found or r.trigger_payload->>'runContract' is distinct from 'career_agent_v1' then raise exception 'Career invocation unavailable'; end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=r.talent_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 if r.status in ('handed_off','completed','failed','cancelled') then return to_jsonb(r); end if;
 if r.status<>'running' or r.lease_token::text is distinct from p_lease_token then raise exception 'Worker lease lost'; end if;
 select coalesce(max(id),0) into cursor_id from public.talent_messages where conversation_id=p_conversation_id and user_id=r.talent_id and role='user';
 invocation:=jsonb_build_object('replyId','background:'||r.id,'sourceMessageCursor',cursor_id,'acceptedAt',now());
 update public.opportunity_discovery_run set status='handed_off',conversation_id=p_conversation_id,
  lease_token=null,lease_heartbeat_at=null,updated_at=now(),
  trigger_payload=trigger_payload||jsonb_build_object('agentInvocation',invocation)
 where id=r.id returning * into r;
 return to_jsonb(r);
end $$;

create function public.finish_career_background_reply(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text,p_run_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s jsonb; outcome text; run_status text;
begin
 select status into run_status from public.opportunity_discovery_run where id=p_run_id and talent_id=p_user_id and conversation_id=p_conversation_id
  and trigger_payload#>>'{agentInvocation,replyId}'=p_reply_id for update;
 if not found then return false; end if;
 select state into s from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id for update;
 if not found then return false; end if;
 if coalesce(s->'completedReplyIds','{}') ? p_reply_id then return true; end if;
 if s#>>'{activeReply,replyId}' is distinct from p_reply_id or s#>>'{activeReply,claimId}' is distinct from p_claim_id
   or coalesce((s#>>'{activeReply,expiresAt}')::timestamptz,'-infinity')<=now() then return false; end if;
 select case when d.status in ('queued','retry','sending') then 'delivery_pending' else d.status end into outcome from public.talent_opportunity_delivery d
  where discovery_run_id=p_run_id and payload->>'runContract'='career_agent_v1' limit 1;
 if run_status='handed_off' then
  update public.opportunity_discovery_run set status='completed',completed_at=now(),updated_at=now(),
   coverage=coalesce(coverage,'{}')||jsonb_build_object('agentOutcome',coalesce(outcome,'no_send')) where id=p_run_id;
 end if;
 -- An independent background invocation does not consume chat handbook leases.
 update public.talent_agent_runtime set state=(case when s#>>'{checkpoint,replyId}'=p_reply_id then s-'checkpoint' else s end)||jsonb_build_object('activeReply',null,
  'checkpoints',coalesce(s->'checkpoints','{}')-p_reply_id,
  'completedReplyIds',coalesce(s->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,coalesce((s->>'completedSequence')::bigint,0)))
 where conversation_id=p_conversation_id;
 return true;
end $$;

create function public.reserve_career_agent_email(p_user_id uuid,p_conversation_id uuid,p_run_id uuid,p_reply_id text,p_claim_id text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 perform 1 from public.opportunity_discovery_run where id=p_run_id and talent_id=p_user_id and conversation_id=p_conversation_id
  and status='handed_off' and trigger_payload#>>'{agentInvocation,replyId}'=p_reply_id for update;
 if not found then raise exception 'Career invocation unavailable'; end if;
 perform 1 from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id
  and state#>>'{activeReply,replyId}'=p_reply_id and state#>>'{activeReply,claimId}'=p_claim_id
  and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
 if not found then raise exception 'Career reply lease lost'; end if;
 select * into d from public.talent_opportunity_delivery where discovery_run_id=p_run_id and channel='email' and payload->>'runContract'='career_agent_v1';
 if found then return to_jsonb(d); end if;
 insert into public.talent_opportunity_delivery(talent_id,discovery_run_id,channel,status,payload)
 values(p_user_id,p_run_id,'email','queued',p_payload||jsonb_build_object('runContract','career_agent_v1','conversationId',p_conversation_id)) returning * into d;
 return to_jsonb(d);
end $$;

-- A cancelled source cannot keep publishing its old continuation. Clear only
-- this invocation's checkpoint/claim; unrelated conversation work survives.
create function public.cancel_career_background_run(p_run_id uuid,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.opportunity_discovery_run; s jsonb; reply text;
begin
 select * into r from public.opportunity_discovery_run where id=p_run_id and trigger_payload->>'runContract'='career_agent_v1' for update;
 if not found then return; end if;
 update public.opportunity_discovery_run set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),error_message=p_reason where id=r.id and status='handed_off';
 reply:=r.trigger_payload#>>'{agentInvocation,replyId}';
 if reply is null then return; end if;
 select state into s from public.talent_agent_runtime where conversation_id=r.conversation_id and user_id=r.talent_id for update;
 if not found then return; end if;
 s:=s||jsonb_build_object('checkpoints',coalesce(s->'checkpoints','{}')-reply,
  'completedReplyIds',coalesce(s->'completedReplyIds','{}')||jsonb_build_object(reply,coalesce((s->>'completedSequence')::bigint,0)));
 if s#>>'{activeReply,replyId}'=reply then s:=s||'{"activeReply":null}'::jsonb; end if;
 if s#>>'{checkpoint,replyId}'=reply then s:=s-'checkpoint'; end if;
 update public.talent_agent_runtime set state=s where conversation_id=r.conversation_id;
end $$;

create function public.claim_career_agent_email(p_delivery_id uuid,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1';
 if not found then return null; end if;
 -- Serialize provider attempts across conversations of the same candidate.
 perform pg_advisory_xact_lock(hashtextextended('career-email:'||d.talent_id,0));
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id for update;
 if d.status in ('sent','cancelled','context_changed','delivery_unknown') or d.payload->>'resendEmailId' is not null then return to_jsonb(d); end if;
 if exists(select 1 from public.talent_opportunity_delivery other where other.talent_id=d.talent_id and other.payload->>'runContract'='career_agent_v1'
  and other.status='sending' and (other.payload->>'claimExpiresAt')::timestamptz>now()) then return null; end if;
 if d.payload->>'cancelRequested'='true' then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now() where id=d.id returning * into d;
  return to_jsonb(d);
 end if;
 -- Resend retains idempotency keys for 24 hours. Beyond that boundary an
 -- unknown attempt must be reconciled, never retried with a fresh key.
 if (d.payload->>'firstProviderAttemptAt')::timestamptz <= now()-interval '24 hours' then
  update public.talent_opportunity_delivery set status='delivery_unknown',updated_at=now() where id=d.id returning * into d;
  return to_jsonb(d);
 end if;
 update public.talent_opportunity_delivery set status='sending',updated_at=now(),payload=payload||jsonb_build_object(
  'claimId',p_claim_id,'claimExpiresAt',now()+interval '5 minutes')
 where id=d.id returning * into d;
 return to_jsonb(d);
end $$;

-- Admission happens immediately before the provider request, after current
-- context checks. Merely claiming a delivery is not a provider attempt.
create function public.begin_career_agent_email_attempt(p_delivery_id uuid,p_claim_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1' for update;
 if not found or d.status<>'sending' or d.payload->>'claimId' is distinct from p_claim_id
   or coalesce((d.payload->>'claimExpiresAt')::timestamptz,'-infinity')<=now() or d.payload->>'resendEmailId' is not null then return false; end if;
 if d.payload->>'cancelRequested'='true' then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now() where id=d.id;
  return false;
 end if;
 if not exists(select 1 from public.opportunity_discovery_run r where r.id=d.discovery_run_id and r.talent_id=d.talent_id and r.status in ('handed_off','completed')) then
  update public.talent_opportunity_delivery set status='cancelled',updated_at=now() where id=d.id;
  return false;
 end if;
 if exists(select 1 from public.talent_messages m where m.user_id=d.talent_id and m.conversation_id=(d.payload->>'conversationId')::uuid and m.role='user'
   and m.id>coalesce((d.payload->>'sourceMessageCursor')::bigint,0)) then
  update public.talent_opportunity_delivery set status='context_changed',updated_at=now(),error_message='New user messages arrived before provider admission' where id=d.id;
  return false;
 end if;
 if (d.payload->>'firstProviderAttemptAt')::timestamptz<=now()-interval '24 hours' then
  update public.talent_opportunity_delivery set status='delivery_unknown',updated_at=now() where id=d.id;
  return false;
 end if;
 update public.talent_opportunity_delivery set payload=payload||jsonb_build_object('firstProviderAttemptAt',coalesce(payload->>'firstProviderAttemptAt',now()::text)),updated_at=now() where id=d.id;
 return true;
end $$;

-- A real receipt remains authoritative even when cancellation or lease expiry
-- raced the response. Match the immutable provider key and merge current facts;
-- never overwrite a newer cancellation request with an old payload snapshot.
create function public.record_career_agent_email_receipt(p_delivery_id uuid,p_idempotency_key text,p_provider_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 select * into d from public.talent_opportunity_delivery where id=p_delivery_id and payload->>'runContract'='career_agent_v1' for update;
 if not found or p_idempotency_key is null or d.payload#>>'{emailPayload,idempotencyKey}' is distinct from p_idempotency_key then raise exception 'Sealed delivery unavailable'; end if;
 if nullif(p_provider_id,'') is null then raise exception 'Provider receipt required'; end if;
 if d.payload->>'resendEmailId' is not null and d.payload->>'resendEmailId'<>p_provider_id then raise exception 'Provider receipt conflict'; end if;
 update public.talent_opportunity_delivery set status='sent',sent_at=coalesce(sent_at,now()),updated_at=now(),
   payload=payload||jsonb_build_object('resendEmailId',p_provider_id) where id=d.id returning * into d;
 return to_jsonb(d);
end $$;

-- Continue or stop the same sealed delivery after the original agent has read
-- newer user context. This never changes its body or its provider key.
create function public.control_career_agent_email(p_user_id uuid,p_conversation_id uuid,p_run_id uuid,p_reply_id text,p_claim_id text,p_action text,p_source_message_cursor bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.talent_opportunity_delivery;
begin
 perform 1 from public.opportunity_discovery_run where id=p_run_id and talent_id=p_user_id and conversation_id=p_conversation_id
  and status='handed_off' and trigger_payload#>>'{agentInvocation,replyId}'=p_reply_id for update;
 if not found then raise exception 'Career invocation unavailable'; end if;
 perform 1 from public.talent_agent_runtime where conversation_id=p_conversation_id and user_id=p_user_id
  and state#>>'{activeReply,replyId}'=p_reply_id and state#>>'{activeReply,claimId}'=p_claim_id
  and (state#>>'{activeReply,expiresAt}')::timestamptz>now();
 if not found then raise exception 'Career reply lease lost'; end if;
 select * into d from public.talent_opportunity_delivery where discovery_run_id=p_run_id and channel='email' and payload->>'runContract'='career_agent_v1' for update;
 if not found then return null; end if;
 if p_action='read' or d.payload->>'resendEmailId' is not null or d.status in ('sent','cancelled','delivery_unknown') then return to_jsonb(d); end if;
 if p_action='retry' then
  if d.status='context_changed' then
   update public.talent_opportunity_delivery set status='retry',updated_at=now(),
    payload=payload||jsonb_build_object('sourceMessageCursor',p_source_message_cursor) where id=d.id returning * into d;
  end if;
 elsif p_action='cancel' then
  update public.talent_opportunity_delivery set status=case when status='sending' and (payload->>'claimExpiresAt')::timestamptz>now() then 'sending' else 'cancelled' end,
   payload=payload||'{"cancelRequested":true}'::jsonb,updated_at=now() where id=d.id returning * into d;
 else raise exception 'Unknown email control action';
 end if;
 return to_jsonb(d);
end $$;

create function public.finish_career_agent_email(p_delivery_id uuid)
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
 for target in select value from jsonb_array_elements(coalesce((select trigger_payload->'companyRequestFollowups' from public.opportunity_discovery_run where id=d.discovery_run_id),'[]')) loop
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
 return to_jsonb(d);
end $$;

revoke all on function public.accept_career_agent_run(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.finish_career_background_reply(uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.reserve_career_agent_email(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_career_agent_email(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_career_agent_email(uuid) from public,anon,authenticated;
grant execute on function public.accept_career_agent_run(uuid,text,uuid) to service_role;
grant execute on function public.finish_career_background_reply(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.reserve_career_agent_email(uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.claim_career_agent_email(uuid,text) to service_role;
grant execute on function public.finish_career_agent_email(uuid) to service_role;
revoke all on function public.begin_career_agent_email_attempt(uuid,text) from public,anon,authenticated;
revoke all on function public.record_career_agent_email_receipt(uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_career_agent_email_attempt(uuid,text) to service_role;
grant execute on function public.record_career_agent_email_receipt(uuid,text,text) to service_role;
revoke all on function public.control_career_agent_email(uuid,uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.control_career_agent_email(uuid,uuid,uuid,text,text,text,bigint) to service_role;
revoke all on function public.cancel_career_background_run(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_career_background_run(uuid,text) to service_role;

create function public.career_checkpoint_work_ready(p_user_id uuid,p_checkpoint jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare work jsonb; state text;
begin
 for work in select value from jsonb_array_elements(coalesce(p_checkpoint->'waitFor','[]')) loop
  state:=null;
  if work->>'kind'='external_evaluation' then
   select status into state from public.external_recommendation_runs where id=(work->>'id')::uuid and talent_id=p_user_id;
  elsif work->>'kind'='internal_evaluation' then
   select status into state from public.opportunity_discovery_run where id=(work->>'id')::uuid and talent_id=p_user_id;
  elsif work->>'kind'='email_delivery' then
   select status into state from public.talent_opportunity_delivery where id=(work->>'id')::uuid and talent_id=p_user_id;
  else return false;
  end if;
  if state in ('queued','running','pending','retry','handed_off','sending') then return false; end if;
 end loop;
 return true;
end $$;

create function public.claim_career_agent_checkpoint_recovery(p_limit integer default 20)
returns table ("userId" uuid,"conversationId" uuid,checkpoint jsonb)
language plpgsql security invoker set search_path='' as $$
declare runtime_row record; item record; next_state jsonb; claimed integer:=0;
begin
 for runtime_row in select r.* from public.talent_agent_runtime r
  where coalesce((r.state#>>'{activeReply,expiresAt}')::timestamptz,'-infinity'::timestamptz)<=now()
   and exists(select 1 from jsonb_each(coalesce(r.state->'checkpoints','{}')) c
    where coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
     and public.career_checkpoint_work_ready(r.user_id,c.value)
     and (c.value#>>'{continuation,channel}' in ('career','background') or c.value#>>'{continuation,emailReplyJobId}' is not null)
     and not (coalesce(r.state->'completedReplyIds','{}') ? c.key))
  order by r.conversation_id limit p_limit for update skip locked
 loop
  next_state:=runtime_row.state;
  for item in select c.key,c.value from jsonb_each(coalesce(next_state->'checkpoints','{}')) c
   where coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
    and public.career_checkpoint_work_ready(runtime_row.user_id,c.value)
    and not (coalesce(next_state->'completedReplyIds','{}') ? c.key)
    and (c.value#>>'{continuation,channel}' in ('career','background') or c.value#>>'{continuation,emailReplyJobId}' is not null)
   order by c.key limit p_limit-claimed
  loop
   next_state:=jsonb_set(next_state,array['checkpoints',item.key,'recoveryAfter'],to_jsonb(now()+interval '2 minutes'));
   "userId":=runtime_row.user_id; "conversationId":=runtime_row.conversation_id; checkpoint:=item.value;
   claimed:=claimed+1; return next;
  end loop;
  update public.talent_agent_runtime set state=next_state where conversation_id=runtime_row.conversation_id;
  exit when claimed>=p_limit;
 end loop;
end $$;
revoke all on function public.career_checkpoint_work_ready(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_career_agent_checkpoint_recovery(integer) from public,anon,authenticated;
grant execute on function public.career_checkpoint_work_ready(uuid,jsonb) to service_role;
grant execute on function public.claim_career_agent_checkpoint_recovery(integer) to service_role;

create function public.enqueue_career_onboarding_invocation(p_user_id uuid,p_conversation_id uuid,p_payload jsonb)
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
  p_payload||jsonb_build_object('runContract','career_agent_v1','instruction','Onboarding has completed. Continue the candidate''s Career purpose using their current Brief and profile. Decide useful initial work and save future checks if warranted. No fixed recommendation count or start email is required.')) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_career_onboarding_invocation(uuid,uuid,jsonb) to service_role;
