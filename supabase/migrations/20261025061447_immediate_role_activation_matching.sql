-- Local implementation; no production backfill. Registration queues one immediate
-- regular search. Existing role/contract activation uniqueness survives retries/resume.
create or replace function public.enqueue_activated_role_matching_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role public.company_roles; v_internal public.company_internal_roles;
  v_now timestamptz := now();
begin
  select * into v_role from public.company_roles where role_id = new.role_id;
  select * into v_internal from public.company_internal_roles where role_id = new.role_id;
  if v_internal.role_id is null or nullif(btrim(v_internal.request),'') is null
     or lower(btrim(coalesce(v_role.source_type,''))) <> 'internal'
     or lower(btrim(coalesce(v_role.status,''))) <> 'active'
     or coalesce(v_role.is_expired,false)
     or (v_role.expires_at is not null and v_role.expires_at <= v_now)
     or coalesce(lower(btrim(v_role.information->>'testOnly')),'') in ('true','1','yes','on') then
    return new;
  end if;
  if public.role_matching_slot_type_v1(v_role.role_id,v_now) not in ('free','paid') then return new; end if;
  insert into public.company_first_search_runs (
    company_workspace_id, role_id, scheduled_slot, trigger_reason, contract_version,
    status, available_at, scheduled_role_ids
  ) values (v_role.company_workspace_id,v_role.role_id,v_now,'role_activated',
            'unified_role_matching_v6','queued',v_now,array[v_role.role_id])
  on conflict do nothing;
  return new;
end $$;

create or replace function public.company_matching_activation_is_valid_v1(p_run uuid,p_workspace uuid,p_role uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
  select exists(select 1 from public.company_first_search_runs
    where id=p_run and company_workspace_id=p_workspace and role_id=p_role
      and trigger_reason='role_activated' and contract_version='unified_role_matching_v6')
$$;
revoke all on function public.company_matching_activation_is_valid_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_matching_activation_is_valid_v1(uuid,uuid,uuid) to service_role;

-- Extend the common scheduled entry point; only a durable activation receipt
-- authorizes the one-off calendar exception. Ordinary periodic slots are unchanged.
drop function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid);
create or replace function public.enqueue_company_scheduled_matching_v1(
  p_workspace uuid,p_role uuid,p_slot timestamptz,p_actor uuid,p_conversation uuid,p_activation_run uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare key text; prior record; role_row record; kind text; local_slot timestamp; weekday text; job record;
begin
  if p_slot is null or (p_activation_run is null and p_slot<>date_trunc('hour',p_slot)) then raise exception 'invalid_scheduled_slot'; end if;
  if p_activation_run is not null and not public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)
    then raise exception 'invalid_role_activation'; end if;
  if p_activation_run is not null then
    select scheduled_slot into p_slot from public.company_first_search_runs where id=p_activation_run;
  end if;
  key:=case when p_activation_run is null then public.company_scheduled_matching_key_v1(p_workspace,p_role,p_slot)
    else 'role-activation-matching:'||p_activation_run::text end;
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||p_workspace::text,0));
  select id into prior from public.company_agent_web_action_jobs where idempotency_key=key;
  if found then return jsonb_build_object('status','already_queued','jobId',prior.id); end if;
  select id,status into prior from public.company_first_search_runs
    where company_workspace_id=p_workspace and role_id=p_role and scheduled_slot=p_slot
      and trigger_reason='scheduled' and p_activation_run is null order by created_at limit 1;
  if found then return jsonb_build_object('status','existing_legacy_run','runId',prior.id,'runStatus',prior.status); end if;
  if not exists(select 1 from public.company_user_workspace where company_workspace_id=p_workspace
      and company_user_id=p_actor and authority in ('owner','admin'))
    or not public.company_memory_scope_allowed_v1(p_workspace,p_actor,'role',null,p_role)
    then raise exception 'scheduled_actor_forbidden' using errcode='42501'; end if;
  select r.*,i.request,i.is_company_first_search,i.intro_search_date,i.intro_search_time,
    i.email_notifications_enabled into role_row
    from public.company_roles r join public.company_internal_roles i using(role_id)
    where r.role_id=p_role and r.company_workspace_id=p_workspace;
  if not found or role_row.source_type<>'internal' or role_row.status<>'active' or coalesce(role_row.is_expired,false)
    or role_row.expires_at<=now() or nullif(btrim(role_row.request),'') is null
    or lower(coalesce(role_row.information->>'testOnly','false')) in ('true','1','yes','on')
    then raise exception 'scheduled_role_unavailable'; end if;
  local_slot:=p_slot at time zone 'Asia/Seoul'; weekday:=to_char(local_slot,'Dy');
  kind:=public.role_matching_slot_type_v1(p_role,now());
  if kind not in ('free','paid') then raise exception 'scheduled_role_unavailable'; end if;
  if p_activation_run is null and (local_slot::date<>(now() at time zone 'Asia/Seoul')::date or p_slot>now()
    or not ((kind='paid' and weekday in ('Mon','Wed','Fri') and extract(hour from local_slot)=9)
      or (kind in ('free','paid') and role_row.is_company_first_search
        and weekday=any(coalesce(role_row.intro_search_date,array['Mon','Wed','Fri']))
        and extract(hour from local_slot)=coalesce(role_row.intro_search_time,9)
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (role_row.email_notifications_enabled and exists(select 1 from public.company_role_email_recipients_v1(p_role))))))
   ) then raise exception 'scheduled_slot_not_due'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(p_workspace,p_conversation,p_role,p_actor,
    'scheduled_matching_review',jsonb_build_object('roleId',p_role,'scheduledSlot',p_slot,'activationRunId',p_activation_run),key);
  return jsonb_build_object('status','queued','jobId',job.job_id,'created',job.created);
end $$;

create or replace function public.enqueue_scheduled_matching_search_v1(p_parent uuid,p_call_id text,p_options jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare parent public.company_agent_web_action_jobs%rowtype; root public.company_agent_web_action_jobs%rowtype;
  prior public.company_first_search_runs%rowtype; command jsonb; brief jsonb; version text; request_id text;
begin
  select * into parent from public.company_agent_web_action_jobs where id=p_parent and action_name='scheduled_matching_review';
  if not found or parent.status<>'processing' then raise exception 'scheduled_parent_not_processing'; end if;
  select * into root from public.company_agent_web_action_jobs
    where id=coalesce((parent.action_context->>'rootJobId')::uuid,parent.id) and action_name='scheduled_matching_review';
  if not found or root.role_id is distinct from parent.role_id or root.company_workspace_id<>parent.company_workspace_id
    then raise exception 'scheduled_root_mismatch'; end if;
  if not public.company_memory_scope_allowed_v1(parent.company_workspace_id,parent.actor_user_id,'role',null,parent.role_id)
    or not exists(select 1 from public.company_user_workspace where company_workspace_id=parent.company_workspace_id
      and company_user_id=parent.actor_user_id and authority in ('owner','admin'))
    then raise exception 'scheduled_actor_forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_options)<>'object' or nullif(btrim(p_call_id),'') is null
    or (p_options->>'roleId')::uuid is distinct from root.role_id then raise exception 'invalid_scheduled_search'; end if;
  command:=(p_options-array['rootJobId','parentJobId','scheduledSlot','origin','inputContractVersion','requestId','briefVersion','activationRunId'])||
    jsonb_build_object('roleId',root.role_id,'rootJobId',root.id,'parentJobId',parent.id,
      'scheduledSlot',root.action_context->>'scheduledSlot','origin','scheduled','inputContractVersion','worker_behavior_v1') ||
    case when nullif(root.action_context->>'activationRunId','') is not null
      then jsonb_build_object('activationRunId',root.action_context->>'activationRunId') else '{}'::jsonb end;
  if nullif(command->>'activationRunId','') is not null and not public.company_matching_activation_is_valid_v1(
      (command->>'activationRunId')::uuid,root.company_workspace_id,root.role_id)
    then raise exception 'invalid_role_activation'; end if;
  request_id:=parent.id::text||':'||p_call_id;
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||root.company_workspace_id::text,0));
  select * into prior from public.company_first_search_runs where company_workspace_id=root.company_workspace_id
    and request_options->>'requestId'=request_id order by created_at limit 1;
  if found then
    if prior.request_options-array['briefVersion','requestId']<>command then raise exception 'scheduled_search_conflict'; end if;
    return jsonb_build_object('status',case prior.status when 'running' then 'already_running' when 'queued' then 'already_queued' else 'already_completed' end,'runId',prior.id);
  end if;
  if not exists(select 1 from public.company_roles r join public.company_internal_roles i using(role_id)
      where r.role_id=root.role_id and r.status='active' and not coalesce(r.is_expired,false)
        and (r.expires_at is null or r.expires_at>now()) and nullif(btrim(i.request),'') is not null
        and lower(coalesce(r.information->>'testOnly','false')) not in ('true','1','yes','on')
        and public.role_matching_slot_type_v1(r.role_id,now()) in ('free','paid')) then raise exception 'scheduled_role_unavailable'; end if;
  brief:=public.company_role_search_brief_snapshot_v1(root.role_id); version:=md5(brief::text);
  insert into public.company_first_search_runs(company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,scheduled_role_ids,request_options,source_snapshot)
  values(root.company_workspace_id,root.role_id,(root.action_context->>'scheduledSlot')::timestamptz,'scheduled',
    'scheduled_agentic_role_search_v1','queued',array[root.role_id],command||jsonb_build_object('requestId',request_id,'briefVersion',version),
    jsonb_build_object('roleSearchBrief',brief||jsonb_build_object('version',version))) returning * into prior;
  return jsonb_build_object('status','queued','runId',prior.id,'briefVersion',version,'inputContractVersion','worker_behavior_v1');
end $$;

drop function public.company_scheduled_accepted_inventory_v1(uuid,uuid);
create or replace function public.company_scheduled_accepted_inventory_v1(p_workspace uuid,p_role uuid,p_activation_run uuid default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('acceptedUnintroduced',(select count(*) from public.talent_opportunity_recommendation rec
      where rec.role_id=p_role and public.accepted_role_pair_is_available_v1(rec.id)),
    'readyCompanyWide',(select count(distinct talent_id) from public.company_intro_candidates
      where company_workspace_id=p_workspace and status='ready'),
    'pendingForRole',(select count(*) from (select distinct on(talent_id) tag
      from public.talent_opportunity_tag where opportunity_id=p_role
      order by talent_id,updated_at desc,created_at desc,id desc) latest where tag='내부:연결대기'),
    'newRegistrations',case when exists(select 1 from public.company_first_search_runs where role_id=p_role
      and status='succeeded' and source_cutoff is not null) then (select count(*) from public.talent_users where deleted_at is null
      and created_at>(select max(source_cutoff) from public.company_first_search_runs
        where role_id=p_role and status='succeeded')) else null end,
    'newRegistrationsDenominator','All non-deleted accounts after the last completed Role cutoff; not role-retrieved or compatible unassessed people',
    'currentRoutes',to_jsonb(array_remove(array[
      case when public.role_matching_slot_type_v1(p_role,now())='paid'
        and (to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role)) then 'candidate_first' end,
      case when public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and ((i.is_company_first_search and to_char(now() at time zone 'Asia/Seoul','Dy')=any(coalesce(i.intro_search_date,array['Mon','Wed','Fri'])))
          or public.company_matching_activation_is_valid_v1(p_activation_run,p_workspace,p_role))
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (i.email_notifications_enabled and exists(select 1 from public.company_role_email_recipients_v1(p_role))))
        then 'company_first' end],null)))
  from public.company_roles r join public.company_internal_roles i using(role_id)
  where r.role_id=p_role and r.company_workspace_id=p_workspace
$$;

create or replace function public.scheduled_candidate_delivery_is_current_v1(p_talent uuid,p_role uuid,p_delivery uuid)
returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
select exists(
  select 1 from public.talent_opportunity_matching_review selected
  join public.company_first_search_runs search on search.id=selected.run_id
  join public.opportunity_discovery_run delivery on delivery.id=selected.discovery_run_id
  join public.company_roles role on role.role_id=selected.opportunity_id
  join public.company_workspace company on company.company_workspace_id=role.company_workspace_id
  join public.talent_users talent on talent.user_id=selected.talent_id
  join public.talent_setting setting on setting.user_id=talent.user_id
  where selected.talent_id=p_talent and selected.opportunity_id=p_role and selected.discovery_run_id=p_delivery
    and delivery.talent_id=p_talent
    and delivery.trigger_payload->'manualInternalRecommendation'->>'matchingReviewId'=selected.id::text
    and selected.decision in ('candidate_first','both') and selected.closed_at is null and selected.recommendation_id is null
    and search.contract_version='scheduled_agentic_role_search_v1'
    and selected.evaluation_ref->>'inputContractVersion'='worker_behavior_v1'
    and selected.evaluation_ref->>'briefVersion'=public.company_role_search_brief_version_v1(p_role)
    and selected.evaluation_ref->>'talentSourceFingerprint'=public.scheduled_talent_source_fingerprint_v1(p_talent)
    and selected.evaluation_ref->>'companyMemoryFingerprint'=public.scheduled_company_memory_fingerprint_v1(p_role)
    and selected.evaluation_ref->>'inputFingerprint'=selected.input_fingerprint
    and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
    and (role.expires_at is null or role.expires_at>now())
    and lower(coalesce(role.information->>'testOnly','false')) not in ('true','1','yes','on')
    and public.role_matching_slot_type_v1(p_role,now())='paid'
    and (to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
      or public.company_matching_activation_is_valid_v1((search.request_options->>'activationRunId')::uuid,search.company_workspace_id,p_role))
    and talent.deleted_at is null and setting.get_internal_recommendation is not false
    and setting.profile_visibility in ('open_to_matches','exceptional_only')
    and not exists(select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
      where lower(btrim(blocked.name)) in (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))
);
$$;
revoke all on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid),
  public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid,uuid),
  public.company_scheduled_accepted_inventory_v1(uuid,uuid,uuid) to service_role;
