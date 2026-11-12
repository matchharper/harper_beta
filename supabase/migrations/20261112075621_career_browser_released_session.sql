-- A delayed cleanup can only target the retired provider session. Resuming after
-- release creates a fresh provider session in the same retained file workspace.
-- Serialize provider-resource release with resuming an undispatched browser run.
-- The logical run and its effect identity survive release of the provider browser.
begin;
create or replace function public.claim_career_browser_resource(
  p_user_id uuid, p_conversation_id uuid, p_session_id uuid, p_action text,
  p_execution_id uuid default null, p_execution_revision bigint default null,
  p_reply_id text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare session public.talent_external_operations; run public.talent_external_operations;
begin
  perform 1 from public.talent_conversations
    where id=p_conversation_id and user_id=p_user_id for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  select * into session from public.talent_external_operations
    where id=p_session_id and user_id=p_user_id and conversation_id=p_conversation_id
      and kind='browser_session' for update;
  if not found then raise exception 'Browser session unavailable'; end if;
  select * into run from public.talent_external_operations
    where id=(session.provider_refs->>'current_execution_id')::uuid
      and parent_id=session.id and user_id=p_user_id and conversation_id=p_conversation_id
      and kind='browser_run' for update;
  if p_action='release' then
    -- Human control and a pending control-return continuation retain their page.
    if session.status not in ('idle','running','releasing') or
      (session.provider_refs#>>'{control_return,invocation_id}' is not null
       and p_reply_id is distinct from 'invocation:'||(session.provider_refs#>>'{control_return,invocation_id}')
       and exists(select 1 from public.talent_external_operations
         where id=(session.provider_refs#>>'{control_return,invocation_id}')::uuid
           and user_id=p_user_id and status<>'completed')) then
      return jsonb_build_object('claimed',false,'session',to_jsonb(session));
    end if;
    if run.id is not null and run.status not in ('completed','failed','cancelled') and not coalesce((
      session.status in ('idle','releasing') and run.provider_refs->>'run_id' is null and
      (run.status='reserved' or (run.status='capacity_wait' and run.result->>'dispatch_rejected_http'='429'))
    ),false) then
      return jsonb_build_object('claimed',false,'session',to_jsonb(session));
    end if;
    if session.status='idle' and session.result->>'browser_availability'='stopped' then
      return jsonb_build_object('claimed',false,'session',to_jsonb(session));
    end if;
    update public.talent_external_operations set status='releasing',revision=revision+1,updated_at=now()
      where id=session.id returning * into session;
  elsif p_action='prepare' then
    if run.id is distinct from p_execution_id or run.revision is distinct from p_execution_revision
      or session.status not in ('idle','running') or run.status not in ('reserved','capacity_wait') then
      raise exception 'Browser execution changed; inspect its current state';
    end if;
    if run.provider_refs->>'run_id' is not null or
      (run.status='capacity_wait' and (run.result->>'dispatch_rejected_http' is distinct from '429'
        or (run.provider_refs->>'retry_after')::timestamptz>now())) then
      raise exception 'Browser execution cannot be dispatched yet';
    end if;
    update public.talent_external_operations set status='running',revision=revision+1,updated_at=now(),
      provider_refs=case when result->>'browser_availability'='stopped' then provider_refs-'session_id' else provider_refs end,
      result=result-'browser_availability' where id=session.id returning * into session;
    update public.talent_external_operations set status='preparing',revision=revision+1,updated_at=now()
      where id=run.id returning * into run;
  else raise exception 'Unknown browser resource action';
  end if;
  return jsonb_build_object('claimed',true,'session',to_jsonb(session),'operation',to_jsonb(run));
end $$;
revoke all on function public.claim_career_browser_resource(uuid,uuid,uuid,text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_career_browser_resource(uuid,uuid,uuid,text,uuid,bigint,text) to service_role;
commit;
