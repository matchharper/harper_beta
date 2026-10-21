-- Ops-only correspondence reuses candidate contact delivery, never company delivery.
-- This flag is a sharing boundary read by the contact readers and transport guards.
alter table public.company_talent_requests add column ops_only boolean not null default false;
alter table public.company_talent_requests alter column source_company_message_id drop not null;

-- Only decision tools use this lookup. An ordinary company message never uses it.
create or replace function public.ops_private_contact_for_recommendation_v1(p_recommendation_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select r.id from public.company_talent_requests r
  join public.talent_opportunity_recommendation rec on rec.id=r.recommendation_id
  where r.recommendation_id=p_recommendation_id and r.ops_only
    and r.workflow_status <> 'cancelled' and r.expires_at>now() and rec.feedback='like'
    and exists(select 1 from public.contact_queue q where q.company_talent_request_id=r.id
      and q.type='company_request_candidate_delivery' and q.status='sent' and q.sent_at is not null)
    and exists(select 1 from public.talent_opportunity_tag t where t.talent_id=r.talent_id and t.opportunity_id=r.role_id
      and ((t.tag='내부:아카이브' and greatest(t.created_at,t.updated_at)<=r.created_at)
        or (t.tag='내부:수락' and rec.saved_stage='connected' and r.response_disposition='positive'
          and greatest(t.created_at,t.updated_at)<=r.updated_at)))
    and not exists(select 1 from public.company_talent_requests newer
      where newer.recommendation_id=r.recommendation_id and newer.created_at>r.created_at
        and (newer.ops_only or newer.approved_at is not null))
  order by r.created_at desc,r.id desc limit 1;
$$;

-- The current inbound message, not the lifetime of a candidate/company pair,
-- is the durable boundary for private correspondence.
create or replace function public.ops_private_contact_for_message_v1(p_message_id bigint,p_talent_id uuid)
returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select r.id from public.talent_messages m join public.company_talent_requests r
    on r.id::text=m.payload->>'opsContactRequestId' and r.talent_id=m.user_id and r.ops_only
  where m.id=p_message_id and m.user_id=p_talent_id and m.role='user';
$$;

create or replace function public.bind_ops_candidate_reply_v1(p_request_id uuid,p_talent_id uuid,p_source_message_id bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.company_talent_requests; m public.talent_messages;
begin
  select * into r from public.company_talent_requests where id=p_request_id and talent_id=p_talent_id and ops_only;
  if r.id is null then raise exception 'ops_contact_not_found'; end if;
  select * into m from public.talent_messages where id=p_source_message_id and user_id=p_talent_id and role='user' for update;
  if m.id is null or m.created_at<r.created_at then raise exception 'candidate_message_evidence_not_found'; end if;
  if m.payload->>'opsContactRequestId' is not null and m.payload->>'opsContactRequestId'<>r.id::text
    then raise exception 'ops_contact_reply_scope_mismatch'; end if;
  if not exists(select 1 from public.contact_queue where company_talent_request_id=r.id
    and type='company_request_candidate_delivery' and status='sent' and sent_at is not null)
    then raise exception 'ops_contact_not_delivered'; end if;
  if exists(select 1 from public.company_talent_relays where source_talent_message_id=m.id)
    then raise exception 'candidate_message_already_shared'; end if;
  update public.talent_messages set payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object('opsContactRequestId',r.id)
    where id=m.id;
end $$;

create or replace function public.record_ops_candidate_reply_v1(
  p_request_id uuid,p_talent_id uuid,p_source_message_id bigint,p_content text,p_resume boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.company_talent_requests; rec public.talent_opportunity_recommendation;
  event_id uuid; prior public.talent_progress; restored boolean:=false; already_restored boolean:=false;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
  perform public.bind_ops_candidate_reply_v1(p_request_id,p_talent_id,p_source_message_id);
  select * into r from public.company_talent_requests where id=p_request_id and talent_id=p_talent_id and ops_only for update;
  if r.id is null then raise exception 'ops_contact_not_found'; end if;
  event_id:=md5('ops-contact:'||r.id::text||':'||p_source_message_id::text)::uuid;
  select * into prior from public.talent_progress where id=event_id;
  if found then return jsonb_build_object('status','recorded','idempotent',true,'restored',coalesce((prior.metadata->>'restored')::boolean,false)); end if;
  if not exists(select 1 from public.talent_messages where id=p_source_message_id and user_id=p_talent_id and role='user' and created_at>=r.created_at)
    then raise exception 'candidate_message_evidence_not_found'; end if;
  if r.workflow_status='cancelled' or r.expires_at<=now()
    then raise exception 'ops_contact_no_longer_current'; end if;
  if not exists(select 1 from public.contact_queue where company_talent_request_id=r.id and type='company_request_candidate_delivery' and status='sent' and sent_at is not null)
    then raise exception 'ops_contact_not_delivered'; end if;
  select * into rec from public.talent_opportunity_recommendation where id=r.recommendation_id and talent_id=p_talent_id and role_id=r.role_id for update;
  if rec.id is null then raise exception 'recommendation_not_found'; end if;
  select exists(select 1 from public.talent_progress where recommendation_id=rec.id and metadata->>'requestId'=r.id::text
    and kind='ops_candidate_reply' and metadata->>'restored'='true') into already_restored;
  if p_resume and not already_restored then
    if public.ops_private_contact_for_recommendation_v1(rec.id) is distinct from r.id then raise exception 'candidate_stage_changed'; end if;
    if not public.company_talent_pair_is_contactable_v1(r.company_workspace_id,r.role_id,p_talent_id,rec.id)
      then raise exception 'candidate_not_contactable'; end if;
    -- Never overwrite a later company/Ops stage decision or candidate withdrawal.
    if rec.feedback is distinct from 'like' or not exists(select 1 from public.talent_opportunity_tag
      where talent_id=p_talent_id and opportunity_id=r.role_id and tag='내부:아카이브' and greatest(created_at,updated_at)<=r.created_at)
      then raise exception 'candidate_stage_changed'; end if;
    delete from public.talent_opportunity_tag where talent_id=p_talent_id and opportunity_id=r.role_id and tag='내부:아카이브';
    insert into public.talent_opportunity_tag(talent_id,opportunity_id,tag) values(p_talent_id,r.role_id,'내부:수락');
    -- Record the private decision before updating the canonical acceptance state.
    -- The handoff trigger below recognizes this request and does not introduce it.
    update public.company_talent_requests set talent_source_message_id=p_source_message_id,
      response_disposition='positive',workflow_status='closed',updated_at=now() where id=r.id;
    update public.talent_opportunity_recommendation
      set saved_stage='connected',processed_stage='accepted',feedback_at=now(),updated_at=now() where id=rec.id;
    -- The new explicit consent permits a fresh review. Preserve the old decision
    -- as history, and never supersede a decision made after this outreach began.
    update public.talent_opportunity_matching_review
      set closed_at=now(),close_reason='ops_reengagement_confirmed'
      where recommendation_id=rec.id and decision='reject' and closed_at is null
        and reviewed_at<=r.created_at;
    restored:=true;
  end if;
  insert into public.talent_progress(id,talent_id,role_id,recommendation_id,user_id,kind,text,metadata,open_to_company,open_to_talent)
    values(event_id,p_talent_id,r.role_id,rec.id,p_talent_id::text,'ops_candidate_reply',p_content,
      jsonb_build_object('requestId',r.id,'sourceMessageId',p_source_message_id,'restored',restored,'opsOnly',true),false,false);
  update public.company_talent_requests set talent_source_message_id=p_source_message_id,
    response_disposition=case when restored or already_restored then 'positive' else 'other' end,
    workflow_status=case when restored then 'closed' else workflow_status end,updated_at=now() where id=r.id;
  return jsonb_build_object('status','recorded','idempotent',false,'restored',restored,'alreadyRestored',already_restored);
end $$;

-- A private reengagement restores consent for the next normal role review.
-- It must not execute the ready-card handoff during this reply transaction.
do $$
declare definition text; patched text;
begin
  select pg_get_functiondef('public.handoff_ready_company_candidate_on_acceptance_v1()'::regprocedure) into definition;
  patched:=regexp_replace(definition, E'\n[Bb][Ee][Gg][Ii][Nn]\n', E'\nbegin\n  if public.ops_private_contact_for_recommendation_v1(new.id) is not null then\n    return new;\n  end if;\n');
  if patched=definition then raise exception 'private_handoff_guard_anchor_missing'; end if;
  execute patched;
end $$;

-- Fail closed even if an older worker or a mistaken tool chooses ordinary relay.
create or replace function public.guard_ops_private_relay_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.ops_private_contact_for_message_v1(new.source_talent_message_id,new.talent_id) is not null
    or exists(select 1 from public.company_talent_requests where id=new.company_talent_request_id and ops_only) then
    raise exception 'ops_private_contact_requires_internal_reply';
  end if;
  return new;
end $$;
create trigger guard_ops_private_relay before insert on public.company_talent_relays
for each row execute function public.guard_ops_private_relay_v1();

create or replace function public.guard_ops_private_contact_delivery_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.type in ('company_contact_company_delivery','company_request_company_delivery') and (
    exists(select 1 from public.company_talent_requests where id=new.company_talent_request_id and ops_only)
    or exists(select 1 from public.company_talent_relays relay where relay.id=new.company_talent_relay_id
      and public.ops_private_contact_for_message_v1(relay.source_talent_message_id,relay.talent_id) is not null)
  ) then raise exception 'ops_private_contact_company_delivery_forbidden'; end if;
  return new;
end $$;
create trigger guard_ops_private_contact_delivery before insert or update on public.contact_queue
for each row execute function public.guard_ops_private_contact_delivery_v1();

create or replace function public.ops_private_progress_audience_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.metadata->>'opsOnly'='true' or exists(select 1 from public.company_talent_requests
    where id::text=new.metadata->>'requestId' and ops_only) then
    new.open_to_company:=false; new.open_to_talent:=false;
  end if;
  return new;
end $$;
create trigger zzz_ops_private_progress_audience before insert or update on public.talent_progress
for each row execute function public.ops_private_progress_audience_v1();

-- Existing company followup scheduler must not turn an Ops contact into company activity.
create or replace function public.guard_ops_private_followup_v1() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.source_kind='contact' and exists(select 1 from public.company_talent_requests where id=new.source_id and ops_only)
    then return null; end if;
  return new;
end $$;
create trigger guard_ops_private_followup before insert on public.company_talent_followups
for each row execute function public.guard_ops_private_followup_v1();

revoke all on function public.ops_private_contact_for_recommendation_v1(uuid) from public,anon,authenticated;
revoke all on function public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.ops_private_contact_for_recommendation_v1(uuid) to service_role;
grant execute on function public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean) to service_role;
revoke all on function public.guard_ops_private_relay_v1(),public.guard_ops_private_contact_delivery_v1(),public.ops_private_progress_audience_v1(),public.guard_ops_private_followup_v1() from public,anon,authenticated;

create or replace function public.prepare_ops_candidate_contact_v1(
  p_id uuid,p_role_id uuid,p_talent_id uuid,p_actor text,p_subject text,p_body text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rec public.talent_opportunity_recommendation; r public.company_talent_requests; w uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ops-contact:'||p_role_id::text||':'||p_talent_id::text,0));
  select * into r from public.company_talent_requests where id=p_id;
  if found then
    if not r.ops_only or r.role_id<>p_role_id or r.talent_id<>p_talent_id then raise exception 'contact_identity_mismatch'; end if;
    return jsonb_build_object('requestId',r.id,'workspaceId',r.company_workspace_id,'status',r.workflow_status);
  end if;
  if nullif(btrim(p_subject),'') is null or nullif(btrim(p_body),'') is null or length(p_subject)>180 or length(p_body)>5000 then raise exception 'invalid_contact_copy'; end if;
  select * into rec from public.talent_opportunity_recommendation where role_id=p_role_id and talent_id=p_talent_id
    and opportunity_type='internal_recommendation' order by created_at desc limit 1 for update;
  select company_workspace_id into w from public.company_roles where role_id=p_role_id and source_type='internal';
  if rec.id is null or rec.feedback is distinct from 'like' or not exists(select 1 from public.talent_opportunity_tag
    where talent_id=p_talent_id and opportunity_id=p_role_id and tag='내부:아카이브')
    or not public.company_talent_pair_is_contactable_v1(w,p_role_id,p_talent_id,rec.id) then raise exception 'candidate_not_archived_or_contactable'; end if;
  select * into r from public.company_talent_requests where recommendation_id=rec.id and ops_only
    and workflow_status in ('draft','queued','awaiting_talent') and expires_at>now() order by created_at desc limit 1;
  if found then return jsonb_build_object('requestId',r.id,'workspaceId',w,'status',r.workflow_status); end if;
  insert into public.company_talent_requests(id,company_workspace_id,role_id,talent_id,recommendation_id,
    source_company_message_id,contact_kind,contact_purpose,delivery_subject,delivery_body,request_context,
    draft_revision,expects_document,intent,workflow_status,expires_at,ops_only)
  values(p_id,w,p_role_id,p_talent_id,rec.id,null,'contact','request',btrim(p_subject),btrim(p_body),
    '채용 재개에 따른 해당 역할의 현재 관심 여부 확인',1,false,'ordinary','draft','infinity',true);
  insert into public.talent_progress(talent_id,role_id,recommendation_id,user_id,kind,text,metadata,open_to_company,open_to_talent)
  values(p_talent_id,p_role_id,rec.id,p_actor,'ops_candidate_contact','내부 채용 재개 관심 확인 연락을 준비했습니다.',
    jsonb_build_object('requestId',p_id,'opsOnly',true),false,false);
  return jsonb_build_object('requestId',p_id,'workspaceId',w,'status','draft');
end $$;
revoke all on function public.prepare_ops_candidate_contact_v1(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_ops_candidate_contact_v1(uuid,uuid,uuid,text,text,text) to service_role;

grant execute on function public.ops_private_contact_for_recommendation_v1(uuid), public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean) to harper_worker;

revoke all on function public.ops_private_contact_for_message_v1(bigint,uuid),public.bind_ops_candidate_reply_v1(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.ops_private_contact_for_message_v1(bigint,uuid),public.bind_ops_candidate_reply_v1(uuid,uuid,bigint) to service_role,harper_worker;

-- The normal acceptance executor must not turn an Ops consent into a company intro.
-- Candidate tools record the answer through record_ops_candidate_reply_v1 instead.
do $$
declare definition text; patched text;
begin
  select pg_get_functiondef('public.accept_talent_internal_role_recommendation_v1(uuid,uuid,uuid,text,jsonb,jsonb)'::regprocedure) into definition;
  patched:=regexp_replace(definition, E'\n[Bb][Ee][Gg][Ii][Nn]\n', E'\nbegin\n  if public.ops_private_contact_for_recommendation_v1(p_recommendation_id) is not null then\n    raise exception ''ops_contact_reply_required'';\n  end if;\n');
  if patched=definition then raise exception 'acceptance_guard_anchor_missing'; end if;
  execute patched;
end $$;
