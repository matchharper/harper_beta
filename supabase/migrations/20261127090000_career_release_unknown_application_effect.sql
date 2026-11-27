-- An application whose earlier attempt ended without a receipt stayed bound to that attempt for good, so every later
-- submit of the same application was refused as "already dispatched", and the person had no way to clear it
-- (11/27 local test: company A; production 11/19~26: 7 submit runs cut off mid-run, none by a user Stop, all left bound,
-- 1 of them later submitted).
--
-- 1. A run that never reached Browser Use (cancelled or failed with no provider run id) entered and submitted
--    nothing, so it releases its effect like a finished run that reported no submission.
-- 2. A run whose outcome is unknown (cancelled or failed after dispatch, or finished with an unclear receipt)
--    releases only for a later message of the person in the conversation that submits again: the agent passes it
--    after telling them the earlier attempt may have gone in. That conversation can be another one than the
--    attempt's, since an application's effect is shared across conversations by its opportunity. A run that reported
--    a submission never releases. "uncertain" (dispatch itself unresolved) is left as it is: Browser Use may still be
--    running that task.
create or replace function public.release_unsubmitted_career_effect_v1(p_user_id uuid,p_effect_id uuid,p_operation_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.talent_external_operations where id=p_operation_id and user_id=p_user_id
   and kind='browser_run' and jsonb_typeof(request->'role_refs')='array' and jsonb_array_length(request->'role_refs')>0
   and ((status='completed' and lower(btrim(coalesce(result->>'submitted','')))='no')
     or (status in ('cancelled','failed') and not coalesce(provider_refs,'{}'::jsonb) ? 'run_id'))
   for update;
 if not found then return false; end if;
 update public.talent_external_operations set status='reserved',result='{}',revision=revision+1,updated_at=now()
   where id=p_effect_id and user_id=p_user_id and kind='work_effect' and status='dispatching' and result->>'operation_id'=p_operation_id::text;
 return found;
end $$;
revoke all on function public.release_unsubmitted_career_effect_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_unsubmitted_career_effect_v1(uuid,uuid,uuid) to service_role;

create function public.release_confirmed_career_effect_v1(p_user_id uuid,p_effect_id uuid,p_operation_id uuid,p_message_id bigint,
  p_conversation_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare run public.talent_external_operations;
begin
 select * into run from public.talent_external_operations where id=p_operation_id and user_id=p_user_id
   and kind='browser_run' and jsonb_typeof(request->'role_refs')='array' and jsonb_array_length(request->'role_refs')>0
   and lower(btrim(coalesce(result->>'submitted','')))<>'yes'
   and (status in ('cancelled','failed') or (status='completed' and lower(btrim(coalesce(result->>'submitted','')))<>'no'))
   for update;
 if not found then return false; end if;
 perform 1 from public.talent_messages where id=p_message_id and user_id=p_user_id and conversation_id=p_conversation_id
   and role='user' and created_at>run.updated_at;
 if not found then return false; end if;
 -- The released effect keeps which attempt it left and on whose word.
 update public.talent_external_operations set status='reserved',revision=revision+1,updated_at=now(),
   result=jsonb_build_object('released_from',p_operation_id,'resubmit_confirmed_by',p_message_id)
   where id=p_effect_id and user_id=p_user_id and kind='work_effect' and status='dispatching' and result->>'operation_id'=p_operation_id::text;
 return found;
end $$;
revoke all on function public.release_confirmed_career_effect_v1(uuid,uuid,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.release_confirmed_career_effect_v1(uuid,uuid,uuid,bigint,uuid) to service_role;
