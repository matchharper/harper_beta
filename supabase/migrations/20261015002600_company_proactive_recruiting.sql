-- Durable external acquisition request, consumed by the existing GTM operator.
alter table public.company_internal_roles add column if not exists promotion_demand jsonb;

create unique index company_messages_batch_part_uidx on public.company_messages
 ((metadata->'companyMessageBatch'->>'batchId'), (metadata->'companyMessageBatch'->>'ref'))
 where metadata->'companyMessageBatch'->>'batchId' is not null;

create or replace function public.record_company_promotion_demand_v1(
 p_workspace_id uuid, p_role_id uuid, p_actor_id uuid, p_source_message_id bigint,
 p_demand text, p_reason text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_role public.company_roles%rowtype; v_internal public.company_internal_roles%rowtype;
 v_now timestamptz:=now(); v_value jsonb;
begin
 if p_demand not in ('sufficient','normal','more_needed','urgent') or nullif(btrim(p_reason),'') is null or length(p_reason)>1500 then
  raise exception 'invalid_promotion_request'; end if;
 select * into strict v_role from public.company_roles where role_id=p_role_id and company_workspace_id=p_workspace_id for update;
 select * into strict v_internal from public.company_internal_roles where role_id=p_role_id for update;
 if not exists(select 1 from public.company_user_workspace m where m.company_workspace_id=p_workspace_id and m.company_user_id=p_actor_id
  and (m.authority='owner' or m.access_scope='organization' or exists(select 1 from public.company_workspace_team_members t where t.membership_id=m.id and t.team_id=v_internal.team_id)))
 then raise exception 'promotion_access_denied'; end if;
 if not exists(select 1 from public.company_messages where id=p_source_message_id and company_workspace_id=p_workspace_id) then raise exception 'promotion_source_missing'; end if;
 if v_internal.is_promote is not true then return jsonb_build_object('status','promotion_not_allowed','promotionAllowed',false,'roleId',p_role_id); end if;
 if v_role.source_type<>'internal' or v_role.status<>'active' or v_role.is_expired is true or v_role.expires_at<=v_now or v_role.information->'testOnly'='true'::jsonb
 then return jsonb_build_object('status','role_unavailable','roleId',p_role_id); end if;
 v_value:=v_internal.promotion_demand;
 if v_value->>'sourceMessageId'=p_source_message_id::text then
  return jsonb_build_object('status','recorded','roleId',p_role_id,'request',v_value,'promotionAllowed',true,'anonymous',v_internal.is_anonymous,'immediatePostingPerformed',false);
 end if;
 v_value:=jsonb_build_object('level',p_demand,'reason',p_reason,'updatedAt',v_now,'validUntil',v_now+interval '7 days','sourceMessageId',p_source_message_id);
 update public.company_internal_roles set promotion_demand=v_value where role_id=p_role_id;
 return jsonb_build_object('status','recorded','roleId',p_role_id,'request',v_value,'promotionAllowed',true,'anonymous',v_internal.is_anonymous,'immediatePostingPerformed',false);
end $$;

create or replace function public.commit_company_message_batch_v1(
 p_workspace_id uuid, p_actor_id uuid, p_conversation_id uuid, p_source_message_id bigint,
 p_channel_id uuid, p_job_id uuid, p_messages jsonb, p_model text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_batch uuid:=gen_random_uuid(); v_part jsonb; v_existing jsonb; v_ids jsonb:='{}'; v_result jsonb:='[]';
 v_id bigint; v_parent bigint; v_role uuid; v_conversation uuid; v_thread uuid; v_parent_role uuid;
 v_membership public.company_user_workspace%rowtype; v_channel public.company_slack_channels%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('company-message:'||p_source_message_id::text||':'||p_channel_id::text,0));
 select * into strict v_channel from public.company_slack_channels where id=p_channel_id and company_workspace_id=p_workspace_id and is_enabled is true;
 if not exists(select 1 from public.company_messages where id=p_source_message_id and conversation_id=p_conversation_id and company_workspace_id=p_workspace_id and role='user') then raise exception 'batch_source_missing'; end if;
 select * into strict v_membership from public.company_user_workspace where company_user_id=p_actor_id and company_workspace_id=p_workspace_id;
 select jsonb_build_object('batchId',min(metadata->'companyMessageBatch'->>'batchId'),'messageIds',jsonb_agg(id order by id)) into v_existing
 from public.company_messages where company_workspace_id=p_workspace_id and metadata->'companyMessageBatch'->>'sourceMessageId'=p_source_message_id::text
 and metadata->'companyMessageBatch'->>'channelDbId'=p_channel_id::text;
 if v_existing->>'batchId' is not null then return v_existing; end if;
 if p_job_id is not null and not exists(select 1 from public.company_agent_web_action_jobs where id=p_job_id and status='processing' and anchor_message_id=p_source_message_id and actor_user_id=p_actor_id) then raise exception 'batch_job_not_owned'; end if;
 if jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages) not between 1 and 12 then raise exception 'invalid_batch'; end if;
 for v_part in select value from jsonb_array_elements(p_messages) loop
  if nullif(btrim(v_part->>'ref'),'') is null or length(v_part->>'ref')>80 or v_ids ? (v_part->>'ref') or nullif(btrim(v_part->>'text'),'') is null or length(v_part->>'text')>12000 then raise exception 'invalid_batch_part'; end if;
  v_role:=nullif(v_part->>'roleId','')::uuid; v_thread:=nullif(v_part->>'threadRef','')::uuid; v_parent:=null;
  if v_part ? 'replyTo' then
   if v_thread is not null or not v_ids ? (v_part->>'replyTo') then raise exception 'invalid_batch_parent'; end if;
   v_parent:=(v_ids->>(v_part->>'replyTo'))::bigint;
   select role_id into v_parent_role from public.company_messages where id=v_parent;
   if v_role is null then v_role:=v_parent_role; end if;
   if v_role is distinct from v_parent_role then raise exception 'batch_parent_role_mismatch'; end if;
  end if;
  if v_role is not null then
   if not exists(select 1 from public.company_roles r join public.company_internal_roles i using(role_id)
    where r.role_id=v_role and r.company_workspace_id=p_workspace_id and r.source_type='internal' and r.status not in ('deleted','ended')
     and r.is_expired is not true and (r.expires_at is null or r.expires_at>now()) and r.information->'testOnly' is distinct from 'true'::jsonb
     and (v_membership.authority='owner' or v_membership.access_scope='organization' or exists(select 1 from public.company_workspace_team_members t where t.membership_id=v_membership.id and t.team_id=i.team_id)))
   then raise exception 'batch_role_unavailable'; end if;
   insert into public.company_conversations(company_workspace_id,role_id,metadata) values(p_workspace_id,v_role,'{}') on conflict do nothing;
   select id into strict v_conversation from public.company_conversations where company_workspace_id=p_workspace_id and role_id=v_role;
  else v_conversation:=p_conversation_id; end if;
  if v_thread is not null and not exists(select 1 from public.company_slack_threads where id=v_thread and channel_id=p_channel_id and role_id is not distinct from v_role) then raise exception 'batch_thread_scope_mismatch'; end if;
  insert into public.company_messages(company_workspace_id,company_user_id,conversation_id,role_id,role,content,message_type,status,model,metadata)
   values(p_workspace_id,null,v_conversation,v_role,'assistant',v_part->>'text','slack','completed',p_model,
    jsonb_build_object('source','company_agent_batch','webActionJobId',p_job_id,'companyMessageBatch',jsonb_build_object(
     'batchId',v_batch,'ref',v_part->>'ref','sourceMessageId',p_source_message_id,'channelDbId',p_channel_id,'replyToMessageId',v_parent,'threadRef',v_thread))) returning id into v_id;
  v_ids:=v_ids||jsonb_build_object(v_part->>'ref',v_id); v_result:=v_result||jsonb_build_array(v_id);
 end loop;
 return jsonb_build_object('batchId',v_batch,'messageIds',v_result);
end $$;

create or replace function public.record_company_message_receipt_v1(p_message_id bigint,p_batch_id uuid,p_receipt jsonb)
 returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_message public.company_messages%rowtype;
begin
 select * into strict v_message from public.company_messages where id=p_message_id and metadata->'companyMessageBatch'->>'batchId'=p_batch_id::text for update;
 if nullif(p_receipt->>'slackMessageTs','') is null or not exists(select 1 from public.company_slack_threads t join public.company_slack_channels c on c.id=t.channel_id
  where t.id=(p_receipt->>'threadId')::uuid and c.id=(v_message.metadata->'companyMessageBatch'->>'channelDbId')::uuid
   and c.company_workspace_id=v_message.company_workspace_id and t.role_id is not distinct from v_message.role_id) then raise exception 'invalid_batch_receipt'; end if;
 if v_message.metadata ? 'companyMessageReceipt' and v_message.metadata->'companyMessageReceipt'<>p_receipt then raise exception 'batch_receipt_conflict'; end if;
 update public.company_messages set metadata=metadata||jsonb_build_object('companyMessageReceipt',p_receipt),
  slack_message_ts=p_receipt->>'slackMessageTs',slack_thread_id=(p_receipt->>'threadId')::uuid where id=p_message_id;
end $$;

create or replace function public.begin_company_message_delivery_v1(p_message_id bigint,p_batch_id uuid)
 returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_metadata jsonb; v_at timestamptz:=now();
begin
 select metadata into strict v_metadata from public.company_messages where id=p_message_id
  and metadata->'companyMessageBatch'->>'batchId'=p_batch_id::text for update;
 if v_metadata ? 'companyMessageAttemptedAt' then return jsonb_build_object('recoveryRequired',true,'attemptedAt',v_metadata->>'companyMessageAttemptedAt'); end if;
 update public.company_messages set metadata=metadata||jsonb_build_object('companyMessageAttemptedAt',v_at) where id=p_message_id;
 return jsonb_build_object('recoveryRequired',false,'attemptedAt',v_at);
end $$;

revoke all on function public.record_company_promotion_demand_v1(uuid,uuid,uuid,bigint,text,text),public.commit_company_message_batch_v1(uuid,uuid,uuid,bigint,uuid,uuid,jsonb,text),public.record_company_message_receipt_v1(bigint,uuid,jsonb),public.begin_company_message_delivery_v1(bigint,uuid) from public,anon,authenticated;
grant execute on function public.record_company_promotion_demand_v1(uuid,uuid,uuid,bigint,text,text),public.commit_company_message_batch_v1(uuid,uuid,uuid,bigint,uuid,uuid,jsonb,text),public.record_company_message_receipt_v1(bigint,uuid,jsonb),public.begin_company_message_delivery_v1(bigint,uuid) to service_role;
