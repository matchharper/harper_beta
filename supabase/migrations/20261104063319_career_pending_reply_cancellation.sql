-- Let the general work tool cancel old inline requests, without cancelling its
-- current conversation invocation or exposing their private saved transcripts.
create function public.cancel_career_pending_reply(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_checkpoint_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved jsonb; checkpoint jsonb; source_id bigint; cleanup uuid;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 select state into saved from public.talent_agent_runtime where user_id=p_user_id and conversation_id=p_conversation_id for update;
 if coalesce(saved->'completedReplyIds','{}') ? p_reply_id then return jsonb_build_object('replyId',p_reply_id,'status','already_completed'); end if;
 checkpoint:=saved->'checkpoints'->p_reply_id;
 if checkpoint is null or checkpoint->>'checkpointId' is distinct from p_checkpoint_id then raise exception 'Pending request changed; list again'; end if;
 if p_reply_id like 'invocation:%' then raise exception 'Use the owning work for this invocation'; end if;
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
