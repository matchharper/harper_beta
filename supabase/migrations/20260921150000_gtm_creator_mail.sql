-- A draft is still one exact, reviewed dispatch. Manual messages and replies
-- reuse that ledger; an email template is optional only for explicit composition.
alter table public.gtm_outreach_dispatches
  alter column outreach_template_id drop not null,
  add column reply_to_activity_id uuid references public.gtm_activities(id),
  add column in_reply_to text,
  add column email_references text,
  add column first_attempt_at timestamptz;

-- Keep deployed pricing, triage, and approval behavior; change only the template
-- gate for manual mail and bound provider retries to its idempotency window.
do $migration$
declare definition text; patched text; old_block text;
begin
 select pg_get_functiondef('public.gtm_outreach_review(text,uuid,bigint,text,uuid,text,text,timestamptz,text,text)'::regprocedure) into definition;
 old_block := $old$    select * into template
    from public.gtm_outreach_templates
    where id = dispatch.outreach_template_id and archived_at is null;
    if not found or template.status <> 'active'
      or lower(template.channel) <> 'email' then
      raise exception 'Outreach template is no longer active for email';
    end if;$old$;
 patched := replace(definition,old_block,'    if dispatch.outreach_template_id is not null then' || chr(10) || old_block || chr(10) || '    end if;');
 if patched=definition then raise exception 'Review template gate changed'; end if;
 patched:=replace(patched,'  -- The scoped credential',$guard$
  if dispatch.attempt_count>0 and (
    (p_subject is not null and btrim(p_subject)<>dispatch.subject) or
    (p_body is not null and p_body<>dispatch.body)) then
    raise exception 'An attempted email cannot change its content; compose a new draft' using errcode='22023';
  end if;
  -- The scoped credential$guard$);
 execute patched;
 select pg_get_functiondef('public.gtm_outreach_worker_claim(uuid,integer)'::regprocedure) into definition;
 old_block := $old$      or not exists (
        select 1
        from public.gtm_outreach_templates template
        where template.id = dispatch.outreach_template_id
          and template.archived_at is null
          and template.status = 'active'
          and lower(template.channel) = 'email'
      )$old$;
 patched := replace(definition,old_block,replace(old_block,'or not exists (','or (dispatch.outreach_template_id is not null and not exists (') || ')');
 if patched=definition then raise exception 'Worker template gate changed'; end if;
 patched := replace(patched,'attempt_count = dispatch.attempt_count + 1,','attempt_count = dispatch.attempt_count + 1,' || chr(10) || '        first_attempt_at = coalesce(dispatch.first_attempt_at,now()),');
 -- Expired uncertain sends must be reconciled, never blindly resent after 24h.
 patched := replace(patched,'  with candidates as (',$guard$
  update public.gtm_outreach_dispatches set status='failed',next_attempt_at=null,
    sending_started_at=null,failed_at=now(),last_error='Delivery needs reconciliation: retry window expired'
  where status in ('approved','sending') and first_attempt_at < now()-interval '23 hours'
    and provider_message_id is null and archived_at is null
    and (p_dispatch_id is null or id=p_dispatch_id);
  with candidates as ($guard$);
  execute patched;
end $migration$;

-- Manual drafts must be visible in the same review sheet as template drafts.
do $migration$
declare definition text; patched text;
begin
 definition:=pg_get_viewdef('public.gtm_outreach_review_sheet_v1'::regclass,true);
 patched:=regexp_replace(definition,'JOIN (public\.)?gtm_outreach_templates template','LEFT JOIN public.gtm_outreach_templates template');
 if patched=definition then raise exception 'Review view template join changed'; end if;
 execute 'create or replace view public.gtm_outreach_review_sheet_v1 as ' || patched;
end $migration$;

create function gtm_view.prepare_email(p_data jsonb,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare credential public.gtm_access_tokens; creator public.gtm_creators;
 dispatch public.gtm_outreach_dispatches; reply public.gtm_activities;
 request_id uuid := (p_data->>'request_id')::uuid; input_hash text;
 creator_id uuid := (p_data->>'record_id')::uuid; recipient text := lower(btrim(p_data->>'recipient_email'));
 collaboration_id uuid; reply_header text; references_header text; activity_id uuid;
begin
 credential:=gtm_view.credential(p_token);
 if not credential.can_write then raise exception 'GTM access is read only' using errcode='42501'; end if;
 if request_id is null then raise exception 'request_id is required' using errcode='22023'; end if;
 input_hash:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 -- Serializing the same request makes concurrent retries return the same draft.
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into dispatch from public.gtm_outreach_dispatches where prepare_request_id=request_id;
 if found then
  if dispatch.prepare_input_hash<>input_hash or dispatch.created_by is distinct from credential.name then raise exception 'Idempotency key reused with different email input' using errcode='22023'; end if;
  return to_jsonb(dispatch);
 end if;
 select * into creator from public.gtm_creators where id=creator_id and archived_at is null;
 if not found or creator.do_not_contact then raise exception 'Creator is unavailable or marked do_not_contact' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_array_elements(creator.contacts)c where lower(c->>'channel')='email' and lower(c->>'address')=recipient and lower(coalesce(c->>'status','')) not in ('invalid','bounced','revoked')) then
  raise exception 'Recipient must be a current email contact on the creator' using errcode='22023';
 end if;
 if nullif(btrim(p_data->>'subject'),'') is null or nullif(btrim(p_data->>'body'),'') is null then raise exception 'Subject and body are required' using errcode='22023'; end if;
 if length(p_data->>'subject')>998 or p_data->>'subject' ~ E'[\r\n]' or octet_length(p_data->>'body')>150000 then raise exception 'Email is too large or contains invalid headers' using errcode='22023'; end if;
 if nullif(p_data->>'reply_to_activity_id','') is not null then
  select a.* into reply from public.gtm_activities a
  where a.id=(p_data->>'reply_to_activity_id')::uuid and a.archived_at is null
    and a.kind in ('message_sent','message_received')
    and ((a.entity='gtm_creators' and a.entity_id=creator.id) or
      (a.entity='gtm_collaborations' and exists(select 1 from public.gtm_collaborations c where c.id=a.entity_id and c.creator_id=creator.id)));
  if not found then raise exception 'Reply must belong to this creator' using errcode='42501'; end if;
  if reply.entity='gtm_collaborations' then collaboration_id:=reply.entity_id; end if;
  if reply.kind='message_received' then
   reply_header:=reply.payload->>'rfc_message_id';
   if recipient is distinct from lower(reply.payload->>'from') then raise exception 'Reply recipient differs from the selected message' using errcode='22023'; end if;
  else
   select coalesce(d.provider_rfc_message_id,case when d.provider='gmail' then d.rfc_message_id end) into reply_header
    from public.gtm_outreach_dispatches d where d.id=(reply.payload->>'dispatch_id')::uuid;
   if recipient is distinct from lower(reply.payload->>'recipient') then raise exception 'Reply recipient differs from the selected message' using errcode='22023'; end if;
  end if;
  if reply_header is null or reply_header !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$' then raise exception 'Message-ID is unavailable; refresh the conversation or compose a new email' using errcode='22023'; end if;
  references_header:=concat_ws(' ',nullif(reply.payload->>'references',''),reply_header);
 end if;
 perform set_config('gtm.actor',credential.name,true);
 insert into public.gtm_outreach_dispatches(creator_id,collaboration_id,outreach_template_id,template_version,
  recipient_email,sender_email,subject,body,selection_reason,prepare_request_id,prepare_input_hash,rfc_message_id,
  reply_to_activity_id,in_reply_to,email_references)
 values(creator.id,collaboration_id,null,'manual',recipient,'harper@matchharper.com',btrim(p_data->>'subject'),p_data->>'body',
  '팀원 직접 작성',request_id,input_hash,'<gtm-'||replace(gen_random_uuid()::text,'-','')||'@matchharper.com>',reply.id,reply_header,references_header)
 returning * into dispatch;
 insert into public.gtm_activities(entity,entity_id,kind,body,payload,request_id)
 values(case when collaboration_id is null then 'gtm_creators' else 'gtm_collaborations' end,coalesce(collaboration_id,creator.id),'message_draft',dispatch.body,
  jsonb_build_object('dispatch_id',dispatch.id,'subject',dispatch.subject,'recipient',recipient,'sender',dispatch.sender_email,'reply_to_activity_id',reply.id),request_id)
 returning id into activity_id;
 update public.gtm_outreach_dispatches set draft_activity_id=activity_id where id=dispatch.id returning * into dispatch;
 return to_jsonb(dispatch);
end $$;

-- Only actual send/receive facts form the conversation. Current drafts are
-- returned separately, so editing a draft never creates a fictitious conversation.
create function gtm_view.creator_conversation(p_data jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_creator_id uuid := (p_data->>'record_id')::uuid; messages jsonb; drafts jsonb; total bigint;
 page_size integer:=least(greatest(coalesce((p_data->>'limit')::integer,30),1),100);
 page_offset integer:=greatest(coalesce((p_data->>'offset')::integer,0),0);
begin
 if not exists(select 1 from public.gtm_creators where id=v_creator_id) then raise exception 'Creator not found' using errcode='P0002'; end if;
 select count(*) into total from public.gtm_activities a where a.archived_at is null and a.kind in ('message_sent','message_received') and
  ((a.entity='gtm_creators' and a.entity_id=v_creator_id) or (a.entity='gtm_collaborations' and a.entity_id in (select id from public.gtm_collaborations where gtm_collaborations.creator_id=v_creator_id)));
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into messages from (
  select a.id,a.ref,a.kind,a.body,a.payload,a.occurred_at,a.provider,a.thread_id,
   case when a.kind='message_received' then a.payload->>'rfc_message_id' else coalesce(d.provider_rfc_message_id,case when d.provider='gmail' then d.rfc_message_id end) end as rfc_message_id
  from public.gtm_activities a left join public.gtm_outreach_dispatches d on d.id::text=a.payload->>'dispatch_id'
  where a.archived_at is null and a.kind in ('message_sent','message_received') and
   ((a.entity='gtm_creators' and a.entity_id=v_creator_id) or (a.entity='gtm_collaborations' and a.entity_id in (select id from public.gtm_collaborations where gtm_collaborations.creator_id=v_creator_id)))
  order by a.occurred_at desc,a.id desc limit page_size offset page_offset)t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into drafts from (
  select id,ref,subject,status,scheduled_at,sent_at,last_error,row_version,recipient_email from public.gtm_outreach_dispatches d
  where d.creator_id=v_creator_id and archived_at is null and status not in ('sent','replied','skipped') order by created_at desc limit 100)t;
 return jsonb_build_object('messages',messages,'dispatches',drafts,'total',total,'limit',page_size,'offset',page_offset);
end $$;

alter function public.gtm_workspace(text,jsonb,text) set schema gtm_view;
alter function gtm_view.gtm_workspace(text,jsonb,text) rename to record_workspace;
create function public.gtm_workspace(p_action text,p_data jsonb default '{}',p_token text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform gtm_view.credential(p_token);
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>262144 then raise exception 'Invalid request' using errcode='22023'; end if;
 if p_action='prepare_email' then return gtm_view.prepare_email(p_data,p_token);
 elsif p_action='creator_conversation' then return gtm_view.creator_conversation(p_data);
 else return gtm_view.record_workspace(p_action,p_data,p_token); end if;
end $$;

-- Explicit provider identity: a Resend UUID is never a Gmail thread or RFC ID.
create function public.gtm_outreach_worker_record_delivery(p_dispatch_id uuid,p_provider text,p_provider_message_id text,p_rfc_message_id text default null,p_thread_id text default null,p_sent_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare dispatch public.gtm_outreach_dispatches;
begin
 if p_provider not in ('gmail','resend') or nullif(btrim(p_provider_message_id),'') is null then raise exception 'Provider identity is required'; end if;
 if p_rfc_message_id is not null and p_rfc_message_id !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$' then raise exception 'Invalid RFC Message-ID'; end if;
 select * into dispatch from public.gtm_outreach_dispatches where id=p_dispatch_id and archived_at is null for update;
 if not found or dispatch.status not in ('sending','sent','replied') then raise exception 'Dispatch was not claimed for delivery'; end if;
 if dispatch.provider_message_id is not null and dispatch.provider_message_id<>p_provider_message_id then raise exception 'Dispatch already has a different provider message ID'; end if;
 perform set_config('gtm.actor',p_provider||'-outreach-worker',true);
 insert into public.gtm_activities(entity,entity_id,kind,body,payload,occurred_at,source_ref,provider,connection_ref,external_id,thread_id,request_id,outreach_template_id)
 values(case when dispatch.collaboration_id is null then 'gtm_creators' else 'gtm_collaborations' end,coalesce(dispatch.collaboration_id,dispatch.creator_id),'message_sent',dispatch.body,
 jsonb_build_object('dispatch_id',dispatch.id,'subject',dispatch.subject,'recipient',dispatch.recipient_email,'sender',dispatch.sender_email,'rfc_message_id',dispatch.rfc_message_id,'provider_rfc_message_id',p_rfc_message_id,'approved_by',dispatch.approved_by,'in_reply_to',dispatch.in_reply_to,'references',dispatch.email_references),
 coalesce(dispatch.sent_at,p_sent_at,now()),p_provider||':'||p_provider_message_id,p_provider,dispatch.sender_email,p_provider_message_id,p_thread_id,dispatch.send_request_id,dispatch.outreach_template_id)
 on conflict(provider,connection_ref,external_id) do nothing;
 update public.gtm_outreach_dispatches set status=case when replied_at is null then 'sent' else 'replied' end,
 provider=p_provider,connection_ref=sender_email,provider_message_id=p_provider_message_id,
 provider_thread_id=case when p_provider='gmail' then p_thread_id else null end,
 provider_rfc_message_id=coalesce(p_rfc_message_id,provider_rfc_message_id),sent_at=coalesce(sent_at,p_sent_at,now()),next_attempt_at=null,sending_started_at=null,failed_at=null,last_error=null
 where id=dispatch.id returning * into dispatch;
 return to_jsonb(dispatch);
end $$;

-- The previous worker signature remains valid while new application code is
-- prepared. Its UUID fallback must no longer classify Resend messages as Gmail.
create or replace function public.gtm_outreach_worker_mark_sent(p_dispatch_id uuid,p_provider_message_id text,p_provider_thread_id text,p_sent_at timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resend boolean:=p_provider_message_id ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or p_provider_thread_id ~ '^<[^>]+>$';
begin
 return public.gtm_outreach_worker_record_delivery(p_dispatch_id,case when resend then 'resend' else 'gmail' end,p_provider_message_id,
 case when resend and p_provider_thread_id ~ '^<[^>]+>$' then p_provider_thread_id end,
 case when not resend then p_provider_thread_id end,p_sent_at);
end $$;

-- Reconstruct pending notifications from durable replies and delivery receipts.
create function public.gtm_outreach_pending_reply_notifications(p_limit integer default 30) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select a.id as activity_id,a.ref as activity_ref,a.body,a.occurred_at as received_at,
 a.payload->>'subject' as subject,a.payload->>'from' as from_email,d.id as dispatch_id,d.ref as dispatch_ref,
 c.id as creator_id,c.ref as creator_ref,c.name as creator_name
 from public.gtm_activities a join public.gtm_outreach_dispatches d on d.id::text=a.payload->>'dispatch_id'
 join public.gtm_creators c on c.id=d.creator_id
 where a.kind='message_received' and a.archived_at is null and not exists(
 select 1 from public.gtm_activities n where n.kind='notification_sent' and n.provider='slack' and n.external_id=a.id::text)
 order by a.occurred_at,a.id limit least(greatest(p_limit,1),100))t;
$$;
revoke all on all functions in schema gtm_view from public,anon,authenticated;
revoke all on function public.gtm_workspace(text,jsonb,text) from public;
grant execute on function public.gtm_workspace(text,jsonb,text) to anon,authenticated,service_role;
revoke all on function public.gtm_outreach_worker_record_delivery(uuid,text,text,text,text,timestamptz),public.gtm_outreach_pending_reply_notifications(integer) from public,anon,authenticated;
grant execute on function public.gtm_outreach_worker_record_delivery(uuid,text,text,text,text,timestamptz),public.gtm_outreach_pending_reply_notifications(integer) to service_role;

-- A mailbox lease prevents simultaneous push/cron/UI recovery from notifying
-- the same reply concurrently. Existing reply activities remain append-only.
alter table public.gtm_outreach_mailboxes add column notification_lease_id uuid,
 add column notification_lease_until timestamptz,add column notification_error text;
create function public.gtm_outreach_claim_notifications(p_mailbox text,p_lease_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_lease_id is null or nullif(btrim(p_mailbox),'') is null then raise exception 'Notification lease identity is required'; end if;
 insert into public.gtm_outreach_mailboxes(email) values(lower(btrim(p_mailbox))) on conflict do nothing;
 update public.gtm_outreach_mailboxes set notification_lease_id=p_lease_id,notification_lease_until=now()+interval '5 minutes'
 where email=lower(btrim(p_mailbox)) and (notification_lease_until is null or notification_lease_until<now());
 if not found then return jsonb_build_object('claimed',false,'replies','[]'::jsonb); end if;
 return jsonb_build_object('claimed',true,'replies',public.gtm_outreach_pending_reply_notifications(30));
end $$;
create function public.gtm_outreach_release_notifications(p_mailbox text,p_lease_id uuid,p_error text default null) returns void
language sql security definer set search_path='' as $$
 update public.gtm_outreach_mailboxes set notification_lease_id=null,notification_lease_until=null,notification_error=left(p_error,2000)
 where email=lower(btrim(p_mailbox)) and notification_lease_id=p_lease_id;
$$;
revoke all on function public.gtm_outreach_claim_notifications(text,uuid),public.gtm_outreach_release_notifications(text,uuid,text) from public,anon,authenticated;
grant execute on function public.gtm_outreach_claim_notifications(text,uuid),public.gtm_outreach_release_notifications(text,uuid,text) to service_role;
notify pgrst,'reload schema';
