-- Keep cancellation and scheduler ownership in one transaction.
create or replace function public.stop_career_conversation(p_user_id uuid,p_conversation_id uuid,p_client_request_ids jsonb default '[]',p_source_message_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sources jsonb; replies jsonb; receipt public.talent_messages; item record; cleanup uuid; stopped jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_source_message_id is not null and not exists(select 1 from public.talent_messages where id=p_source_message_id
   and user_id=p_user_id and conversation_id=p_conversation_id and role='user') then raise exception 'Chat turn unavailable'; end if;
 select coalesce(jsonb_agg(distinct id),'[]') into sources from (
   select (i.request->>'source_message_id')::bigint id from public.talent_external_operations i
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind in ('career_invocation','career_dependency','career_event') and i.status not in ('completed','cancelled')
   union select coalesce((r.request->>'source_message_id')::bigint,(i.request->>'source_message_id')::bigint)
     from public.talent_external_operations i left join public.talent_external_operations r
       on r.id=(i.provider_refs->>'current_execution_id')::uuid and r.parent_id=i.id
       and r.user_id=i.user_id and r.conversation_id=i.conversation_id and r.kind='browser_run'
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind='browser_session' and i.status='human'
   union select value::text::bigint from public.talent_external_operations i,
     jsonb_array_elements(coalesce(i.request->'input_message_ids',i.request->'source_refs','[]'))
     where i.user_id=p_user_id and i.conversation_id=p_conversation_id and i.kind in ('career_invocation','delegated_work') and i.status not in ('completed','cancelled')
   union select m.id from public.talent_messages m where m.user_id=p_user_id and m.conversation_id=p_conversation_id
     and m.role='user' and m.message_type<>'career_turn_stop' and p_client_request_ids ? (m.payload->>'clientRequestId')
   union select (c.value#>>'{continuation,sourceMessageId}')::bigint from public.talent_agent_runtime r,jsonb_each(coalesce(r.state->'checkpoints','{}')) c
     where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select substring(r.state#>>'{activeReply,replyId}' from '^message:([0-9]+)$')::bigint from public.talent_agent_runtime r
     where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select p_source_message_id
 ) s where id is not null;
 select coalesce(jsonb_agg(distinct reply),'[]') into replies from (
   select 'invocation:'||id reply from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation' and status<>'completed'
   union select 'message:'||value::text from jsonb_array_elements(sources)
   union select c.key from public.talent_agent_runtime r,jsonb_each(coalesce(r.state->'checkpoints','{}')) c where r.user_id=p_user_id and r.conversation_id=p_conversation_id
   union select r.state#>>'{activeReply,replyId}' from public.talent_agent_runtime r where r.user_id=p_user_id and r.conversation_id=p_conversation_id
 ) r where reply is not null;
 -- Close scheduler ownership before releasing the runtime claim. Match the
 -- discovery-run -> runtime lock order of background completion/cancellation.
 update public.opportunity_discovery_run
   set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),
     error_message='User stopped the conversation work'
   where talent_id=p_user_id and conversation_id=p_conversation_id
     and status='handed_off' and trigger_payload->>'runContract'='career_agent_v1'
     and replies ? (trigger_payload#>>'{agentInvocation,replyId}');
 insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
 values(p_user_id,p_conversation_id,'user','career_turn_stop','',jsonb_build_object('hidden',true,'clientRequestIds',p_client_request_ids,'sourceMessageIds',sources)) returning * into receipt;
 update public.talent_messages set payload=coalesce(payload,'{}')||'{"careerTurnStopped":true}'
   where user_id=p_user_id and conversation_id=p_conversation_id and role='user' and sources @> jsonb_build_array(id);
 -- Resolve visible questions before closing their owning work. Old approvals
 -- then fail the existing resolved-form/revision checks instead of restarting it.
 for item in select * from public.read_open_career_forms(p_user_id,p_conversation_id) loop
   perform public.write_career_form(p_user_id,p_conversation_id,'resolve',(item.payload->>'formId')::bigint,
     (item.payload->>'revision')::integer,null,'{"reason":"User stopped the conversation work"}','', 'stop:'||receipt.id||':'||item.id);
 end loop;
 update public.talent_external_operations set status='cancelled',revision=revision+1,updated_at=now(),result=result||'{"note":"User stopped the conversation work"}'
   where user_id=p_user_id and conversation_id=p_conversation_id and kind='delegated_work' and status not in ('completed','cancelled');
 update public.talent_external_operations set status='completed',updated_at=now(),result=result||'{"cancelled":true}'
   where user_id=p_user_id and conversation_id=p_conversation_id and kind='career_invocation' and status<>'completed'
     and coalesce(request->>'cleanup','false')<>'true' and not request ? 'cleanup_browser_session';
 -- Release leases immediately, retaining guide state and completed effects.
 update public.talent_agent_runtime set state=(state-'checkpoint')||jsonb_build_object('activeReply',null,'checkpoints','{}'::jsonb,
   'completedReplyIds',coalesce(state->'completedReplyIds','{}')||coalesce((select jsonb_object_agg(value,coalesce((state->>'completedSequence')::bigint,0)) from jsonb_array_elements_text(replies)),'{}'))
   where user_id=p_user_id and conversation_id=p_conversation_id;
 update public.talent_agent_work_runtime r set state=(r.state-'checkpoint')||'{"activeReply":null,"checkpoints":{}}'
   where r.user_id=p_user_id and exists(select 1 from public.talent_external_operations w where w.id=r.work_id and w.conversation_id=p_conversation_id and w.status='cancelled');
 -- Persist remote cleanup with the Stop, so a disconnected tab cannot lose it.
 if jsonb_array_length(replies)>0 then
   cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,null,null,'stop-cleanup:'||receipt.id);
   update public.talent_external_operations set request=request||jsonb_build_object('cleanup',true,'cancel_reply_ids',replies) where id=cleanup;
 end if;
 for item in select id from public.talent_external_operations where user_id=p_user_id and conversation_id=p_conversation_id and kind='browser_session' and status<>'closed' loop
   cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,null,null,'stop-browser-cleanup:'||receipt.id||':'||item.id);
   update public.talent_external_operations set request=request||jsonb_build_object('cleanup_browser_session',item.id) where id=cleanup;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') into stopped from public.talent_messages m
   where user_id=p_user_id and conversation_id=p_conversation_id and sources @> jsonb_build_array(id);
 update public.talent_external_operations set status='cancelled',updated_at=now() where user_id=p_user_id and conversation_id=p_conversation_id
   and kind in ('career_dependency','career_event') and status not in ('completed','cancelled');
 return jsonb_build_object('userMessages',stopped);
end $$;
revoke all on function public.stop_career_conversation(uuid,uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.stop_career_conversation(uuid,uuid,jsonb,bigint) to service_role;

create or replace function public.cancel_career_pending_reply(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_checkpoint_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; checkpoint jsonb; source_id bigint; cleanup uuid; background_run uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 -- Take the discovery lock before the runtime lock, as completion does.
 select id into background_run from public.opportunity_discovery_run
   where talent_id=p_user_id and conversation_id=p_conversation_id
     and status='handed_off' and trigger_payload->>'runContract'='career_agent_v1'
     and trigger_payload#>>'{agentInvocation,replyId}'=p_reply_id
   for update;
 select state into saved from public.talent_agent_runtime where user_id=p_user_id and conversation_id=p_conversation_id for update;
 if coalesce(saved->'completedReplyIds','{}') ? p_reply_id then return jsonb_build_object('replyId',p_reply_id,'status','already_completed'); end if;
 checkpoint:=saved->'checkpoints'->p_reply_id;
 if checkpoint is null or checkpoint->>'checkpointId' is distinct from p_checkpoint_id then raise exception 'Pending request changed; list again'; end if;
 if p_reply_id like 'invocation:%' then raise exception 'Use the owning work for this invocation'; end if;
 if background_run is not null then
   update public.opportunity_discovery_run
     set status='cancelled',completed_at=coalesce(completed_at,now()),updated_at=now(),
       error_message='User cancelled the pending request'
     where id=background_run and status='handed_off';
 end if;
 source_id:=(checkpoint#>>'{continuation,sourceMessageId}')::bigint;
 update public.talent_messages set payload=coalesce(payload,'{}')||'{"careerTurnStopped":true}'
   where id=source_id and user_id=p_user_id and conversation_id=p_conversation_id and role='user';
 saved:=jsonb_set(saved,'{checkpoints}',(saved->'checkpoints')-p_reply_id);
 saved:=jsonb_set(saved,'{completedReplyIds}',coalesce(saved->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,coalesce((saved->>'completedSequence')::bigint,0)));
 if saved#>>'{activeReply,replyId}'=p_reply_id then saved:=jsonb_set(saved,'{activeReply}','null'); end if;
 if saved#>>'{checkpoint,replyId}'=p_reply_id then saved:=saved-'checkpoint'; end if;
 update public.talent_agent_runtime set state=saved where user_id=p_user_id and conversation_id=p_conversation_id;
 cleanup:=public.queue_career_invocation(p_user_id,p_conversation_id,null,null,'cancel-reply:'||p_reply_id);
 update public.talent_external_operations set request=request||jsonb_build_object('cleanup',true,'cancel_reply_ids',jsonb_build_array(p_reply_id)) where id=cleanup;
 return jsonb_build_object('replyId',p_reply_id,'status','cancelled');
end $$;
revoke all on function public.cancel_career_pending_reply(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cancel_career_pending_reply(uuid,uuid,text,text) to service_role;

-- Repair only runs with both a retired runtime reply and a completed
-- cancellation cleanup receipt. Do not infer cancellation from elapsed time,
-- retry work, alter schedules or recreate deliveries.
update public.opportunity_discovery_run run
 set status='cancelled',completed_at=coalesce(run.completed_at,now()),updated_at=now(),
   error_message='Recovered previously cancelled conversation work'
 where run.status='handed_off' and run.trigger_payload->>'runContract'='career_agent_v1'
   and exists (
     select 1 from public.talent_agent_runtime runtime
     where runtime.user_id=run.talent_id and runtime.conversation_id=run.conversation_id
       and coalesce(runtime.state->'completedReplyIds','{}') ? (run.trigger_payload#>>'{agentInvocation,replyId}')
   )
   and exists (
     select 1 from public.talent_external_operations cleanup
     where cleanup.user_id=run.talent_id and cleanup.conversation_id=run.conversation_id
       and cleanup.kind='career_invocation' and cleanup.status='completed'
       and cleanup.request->>'cleanup'='true'
       and cleanup.request->'cancel_reply_ids' ? (run.trigger_payload#>>'{agentInvocation,replyId}')
       and cleanup.created_at>=run.created_at
   );
