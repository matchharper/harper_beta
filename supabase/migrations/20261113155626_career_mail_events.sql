-- Account lifecycle and execution facts live beside the existing integration.
-- Message events and their per-responsibility deliveries use the existing outbox.
alter table public.talent_integrations add column if not exists career_mail_sync jsonb not null default '{}';
create function public.career_mail_generation_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.provider='gmail' and (tg_op='INSERT' or new.composio_connected_account_id is distinct from old.composio_connected_account_id
   or (new.status='active' and old.status<>'active')) then
  new.career_mail_sync:=jsonb_build_object('generation',gen_random_uuid(),'next_sync_at',now());
  if tg_op='UPDATE' and new.composio_connected_account_id=old.composio_connected_account_id and nullif(old.career_mail_sync->>'trigger_id','') is not null then
   new.career_mail_sync:=new.career_mail_sync||jsonb_build_object('trigger_id',old.career_mail_sync->>'trigger_id','trigger_needs_refresh',true);
  end if;
 end if;
 return new;
end $$;
create trigger career_mail_generation before insert or update of composio_connected_account_id,status on public.talent_integrations
 for each row execute function public.career_mail_generation_v1();
update public.talent_integrations
set career_mail_sync=career_mail_sync||jsonb_build_object('generation',gen_random_uuid(),'next_sync_at',now())
where provider='gmail' and nullif(career_mail_sync->>'generation','') is null;

create function public.career_mail_waiters_v1(p_user uuid,p_account text,p_generation text,p_after uuid default null,p_limit integer default 50)
returns setof public.talent_external_operations language sql stable security invoker set search_path=public,pg_temp as $$
 select w.* from talent_external_operations w join talent_integrations i on i.talent_id=w.user_id and i.provider='gmail'
 where w.user_id=p_user and w.kind='delegated_work' and w.status not in ('completed','cancelled')
  and i.status='active' and i.composio_connected_account_id=p_account and i.career_mail_sync->>'generation'=p_generation
  and w.request#>>'{waiting_on,kind}'='gmail_thread' and w.request#>>'{waiting_on,account_id}'=p_account
  and w.request#>>'{waiting_on,account_generation}'=p_generation
  and coalesce(w.request->>'execution_environment','production')=career_execution_environment()
  and (p_after is null or w.id>p_after) order by w.id limit greatest(1,least(p_limit,500))
$$;

create function public.career_record_mail_event_v1(p_user uuid,p_account text,p_generation text,p_message text,p_thread text,p_trigger text default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i talent_integrations; e talent_external_operations; w talent_external_operations; delivery talent_external_operations; invocation uuid; admitted jsonb:='[]';
begin
 -- Lock the account before checking its generation. A late webhook cannot join
 -- a reconnected account or cause a read under someone else's connection.
 select * into i from talent_integrations where talent_id=p_user and provider='gmail' for update;
 if not found or i.status<>'active' or i.composio_connected_account_id<>p_account or i.career_mail_sync->>'generation' is distinct from p_generation
   or (p_trigger is not null and i.career_mail_sync->>'trigger_id' is distinct from p_trigger)
   or exists(select 1 from talent_users where user_id=p_user and deleted_at is not null) then return '{"ignored":true}'; end if;
 if coalesce(p_message,'')='' or coalesce(p_thread,'')='' then raise exception 'Missing Gmail identity'; end if;
 for w in select * from talent_external_operations where user_id=p_user and kind='delegated_work' and status not in ('completed','cancelled')
  and request#>>'{waiting_on,kind}'='gmail_thread' and request#>>'{waiting_on,account_id}'=p_account
  and request#>>'{waiting_on,account_generation}'=p_generation and request#>>'{waiting_on,thread_id}'=p_thread
  and not coalesce(request#>'{waiting_on,baseline_message_ids}','[]') ? p_message
  and coalesce(request->>'execution_environment','production')=career_execution_environment() order by id for update loop
  if e.id is null then
   insert into talent_external_operations(user_id,kind,idempotency_key,status,request)
    values(p_user,'mail_event','gmail:'||p_account||':'||p_generation||':'||p_message,'completed',jsonb_build_object(
      'account_id',p_account,'account_generation',p_generation,'message_id',p_message,'thread_id',p_thread,
      'resource_ref',jsonb_build_object('kind','email_message','id',p_account||'/'||p_message,'revision',p_generation)))
    on conflict(user_id,kind,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into e;
  end if;
  insert into talent_external_operations(user_id,conversation_id,parent_id,kind,idempotency_key,status,request)
   values(p_user,w.conversation_id,w.id,'mail_event','deliver:'||e.id||':'||w.id,'completed',jsonb_build_object(
    'event_id',e.id,'account_id',p_account,'account_generation',p_generation,'message_id',p_message,'thread_id',p_thread))
   on conflict(user_id,kind,idempotency_key) do nothing returning * into delivery;
  if delivery.id is null then continue; end if;
  update talent_external_operations set status='ready',revision=revision+1,updated_at=now() where id=w.id returning * into w;
  if w.request->>'execution_route'='origin' then
   invocation:=queue_career_event(p_user,w.conversation_id,(w.request->'source_refs'->>0)::bigint,'mail_event',delivery.id,w.revision);
  else
   invocation:=queue_career_invocation(p_user,w.conversation_id,(w.request->'source_refs'->>0)::bigint,w.id,'mail:'||delivery.id);
  end if;
  admitted:=admitted||jsonb_build_array(jsonb_build_object('conversation_id',w.conversation_id,'invocation_id',invocation));
 end loop;
 return jsonb_build_object('event_id',e.id,'deliveries',admitted);
end $$;

create function public.career_claim_mail_sync_v1(p_user uuid,p_generation text,p_lease uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare i talent_integrations;
begin
 update talent_integrations set career_mail_sync=career_mail_sync||jsonb_build_object('lease_id',p_lease,'lease_until',now()+interval '12 minutes')
 where talent_id=p_user and provider='gmail' and status='active' and career_mail_sync->>'generation'=p_generation
   and coalesce((career_mail_sync->>'lease_until')::timestamptz,'-infinity')<now()
 returning * into i;
 if not found then return null; end if;
 return to_jsonb(i);
end $$;
create function public.career_finish_mail_sync_v1(p_user uuid,p_generation text,p_lease uuid,p_patch jsonb)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update talent_integrations set career_mail_sync=(career_mail_sync||p_patch)-'lease_id'-'lease_until'
 where talent_id=p_user and provider='gmail' and career_mail_sync->>'generation'=p_generation and career_mail_sync->>'lease_id'=p_lease::text;
 return found;
end $$;

create function public.career_pending_mail_sync_v1(p_limit integer default 50)
returns setof public.talent_integrations language sql stable security invoker set search_path=public,pg_temp as $$
 select i.* from talent_integrations i where provider='gmail' and status='active'
  and coalesce((career_mail_sync->>'next_sync_at')::timestamptz,'-infinity')<=now()
  and coalesce((career_mail_sync->>'lease_until')::timestamptz,'-infinity')<now()
  and (nullif(career_mail_sync->>'trigger_id','') is not null or exists(select 1 from career_mail_waiters_v1(i.talent_id,i.composio_connected_account_id,i.career_mail_sync->>'generation',null,1)))
 order by coalesce((career_mail_sync->>'next_sync_at')::timestamptz,'-infinity'),talent_id limit greatest(1,least(p_limit,500))
$$;

-- Keep provider cleanup durable through reconnect/delete. No email contents are
-- copied into this cleanup receipt, and revoked accounts cannot create events.
create function public.career_cleanup_mail_trigger_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if old.provider='gmail' and old.career_mail_sync ? 'trigger_id' and (tg_op='DELETE' or new.status<>'active'
   or new.composio_connected_account_id is distinct from old.composio_connected_account_id) then
  insert into talent_external_operations(user_id,kind,idempotency_key,status,request)
   values(old.talent_id,'mail_trigger_cleanup',old.career_mail_sync->>'trigger_id','reserved',
    jsonb_build_object('trigger_id',old.career_mail_sync->>'trigger_id','account_id',old.composio_connected_account_id,'execution_environment',career_execution_environment()))
   on conflict(user_id,kind,idempotency_key) do nothing;
 end if;
 return old;
end $$;
create trigger career_cleanup_mail_trigger after update of status,composio_connected_account_id or delete on public.talent_integrations
 for each row execute function public.career_cleanup_mail_trigger_v1();

create function public.career_reconnected_mail_waits_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.provider='gmail' and new.status='active' and new.composio_connected_account_id=old.composio_connected_account_id
  and new.career_mail_sync->>'generation' is distinct from old.career_mail_sync->>'generation' then
  update talent_external_operations set request=jsonb_set(request,'{waiting_on,account_generation}',new.career_mail_sync->'generation'),
   revision=revision+1,updated_at=now()
  where user_id=new.talent_id and kind='delegated_work' and status not in ('completed','cancelled')
   and request#>>'{waiting_on,kind}'='gmail_thread' and request#>>'{waiting_on,account_id}'=new.composio_connected_account_id
   and request#>>'{waiting_on,account_generation}'=old.career_mail_sync->>'generation';
 end if;
 return new;
end $$;
create trigger career_reconnected_mail_waits after update of status on public.talent_integrations
 for each row execute function public.career_reconnected_mail_waits_v1();

revoke all on function public.career_mail_generation_v1(),public.career_mail_waiters_v1(uuid,text,text,uuid,integer),
 public.career_record_mail_event_v1(uuid,text,text,text,text,text),public.career_claim_mail_sync_v1(uuid,text,uuid),
 public.career_finish_mail_sync_v1(uuid,text,uuid,jsonb),public.career_pending_mail_sync_v1(integer),public.career_cleanup_mail_trigger_v1(),public.career_reconnected_mail_waits_v1() from public,anon,authenticated;
grant execute on function public.career_mail_waiters_v1(uuid,text,text,uuid,integer),public.career_record_mail_event_v1(uuid,text,text,text,text,text),
 public.career_claim_mail_sync_v1(uuid,text,uuid),public.career_finish_mail_sync_v1(uuid,text,uuid,jsonb),public.career_pending_mail_sync_v1(integer) to service_role;
