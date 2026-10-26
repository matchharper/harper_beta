-- Local implementation only. Apply in a separately authorized release.
-- Existing ledgers own durable effects; no transient reasoning table is added.
alter table public.talent_opportunity_matching_review
  add column if not exists evaluation_ref jsonb;
alter table public.company_role_candidate_evaluations
  add column if not exists input_contract_version text;
comment on column public.company_role_candidate_evaluations.input_contract_version is
  'Consumed input projection, so readers do not combine private-Memory and Worker Behavior evaluations. Null historical values remain unspecified.';
comment on column public.talent_opportunity_matching_review.evaluation_ref is
  'Original Decisions evaluation/run/input reference consumed by scheduled selection; delivery/review readers must not require a fabricated legacy fit row.';

-- A Role-slot root may issue several different child searches. Their durable
-- request IDs replace the legacy one-run-per-slot uniqueness only for this contract.
drop index public.company_first_search_runs_role_slot_unique_idx;
create unique index company_first_search_runs_role_slot_unique_idx
  on public.company_first_search_runs(role_id,scheduled_slot,contract_version,trigger_reason)
  where role_id is not null and contract_version<>'scheduled_agentic_role_search_v1';
create unique index company_first_search_runs_scheduled_request_unique_idx
  on public.company_first_search_runs(company_workspace_id,(request_options->>'requestId'))
  where contract_version='scheduled_agentic_role_search_v1';

create or replace function public.company_scheduled_matching_key_v1(p_workspace uuid,p_role uuid,p_slot timestamptz)
returns text language sql immutable set search_path=public,pg_temp as $$
  select 'scheduled-matching:'||p_workspace::text||':'||p_role::text||':'||
    to_char(p_slot at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

create or replace function public.enqueue_company_scheduled_matching_v1(
  p_workspace uuid,p_role uuid,p_slot timestamptz,p_actor uuid,p_conversation uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare key text; prior record; role_row record; kind text; local_slot timestamp; weekday text; job record;
begin
  if p_slot is null or p_slot<>date_trunc('hour',p_slot) then raise exception 'invalid_scheduled_slot'; end if;
  key:=public.company_scheduled_matching_key_v1(p_workspace,p_role,p_slot);
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||p_workspace::text,0));
  select id into prior from public.company_agent_web_action_jobs where idempotency_key=key;
  if found then return jsonb_build_object('status','already_queued','jobId',prior.id); end if;
  select id,status into prior from public.company_first_search_runs
    where company_workspace_id=p_workspace and role_id=p_role and scheduled_slot=p_slot
      and trigger_reason='scheduled' order by created_at limit 1;
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
  if local_slot::date<>(now() at time zone 'Asia/Seoul')::date or p_slot>now()
    or not ((kind='paid' and weekday in ('Mon','Wed','Fri') and extract(hour from local_slot)=9)
      or (kind in ('free','paid') and role_row.is_company_first_search
        and weekday=any(coalesce(role_row.intro_search_date,array['Mon','Wed','Fri']))
        and extract(hour from local_slot)=coalesce(role_row.intro_search_time,9)
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (role_row.email_notifications_enabled and exists(select 1 from public.company_role_email_recipients_v1(p_role))))))
    then raise exception 'scheduled_slot_not_due'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(p_workspace,p_conversation,p_role,p_actor,
    'scheduled_matching_review',jsonb_build_object('roleId',p_role,'scheduledSlot',p_slot),key);
  return jsonb_build_object('status','queued','jobId',job.job_id,'created',job.created);
end $$;

-- The shared lock closes the old/new scheduler race even during a staged rollout.
create or replace function public.guard_scheduled_matching_slot_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.trigger_reason='scheduled' and new.contract_version<>'scheduled_agentic_role_search_v1' then
    perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||new.company_workspace_id::text,0));
    if exists(select 1 from public.company_agent_web_action_jobs where idempotency_key=
        public.company_scheduled_matching_key_v1(new.company_workspace_id,new.role_id,new.scheduled_slot))
      then return null; end if;
  end if;
  return new;
end $$;
create trigger guard_scheduled_matching_slot before insert on public.company_first_search_runs
  for each row execute function public.guard_scheduled_matching_slot_v1();

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
  command:=(p_options-array['rootJobId','parentJobId','scheduledSlot','origin','inputContractVersion','requestId','briefVersion'])||
    jsonb_build_object('roleId',root.role_id,'rootJobId',root.id,'parentJobId',parent.id,
      'scheduledSlot',root.action_context->>'scheduledSlot','origin','scheduled','inputContractVersion','worker_behavior_v1');
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

create or replace function public.resume_scheduled_matching_v1(p_run uuid)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare run public.company_first_search_runs%rowtype; root public.company_agent_web_action_jobs%rowtype; job record; actor uuid;
begin
  select * into run from public.company_first_search_runs where id=p_run and contract_version='scheduled_agentic_role_search_v1' for update;
  if not found or run.status not in ('succeeded','skipped','failed') then return null; end if;
  if run.result->'scheduledContinuation'->>'jobId' is not null then return (run.result->'scheduledContinuation'->>'jobId')::uuid; end if;
  if exists(select 1 from public.company_first_slack_outbox where run_id=p_run and status not in ('sent','canceled')) then return null; end if;
  select * into root from public.company_agent_web_action_jobs where id=(run.request_options->>'rootJobId')::uuid;
  if not found then raise exception 'scheduled_root_missing'; end if;
  select membership.company_user_id into actor from public.company_user_workspace membership
    where membership.company_workspace_id=root.company_workspace_id and membership.authority in ('owner','admin')
      and public.company_memory_scope_allowed_v1(root.company_workspace_id,membership.company_user_id,'role',null,root.role_id)
    order by (membership.company_user_id=root.actor_user_id) desc,(membership.authority='owner') desc,membership.created_at
    limit 1;
  if actor is null then raise exception 'scheduled_actor_forbidden' using errcode='42501'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(root.company_workspace_id,root.conversation_id,root.role_id,actor,
    'scheduled_matching_review',root.action_context||jsonb_build_object('rootJobId',root.id,'completedRunId',run.id),
    'scheduled-matching-result:'||run.id::text);
  update public.company_first_search_runs set result=jsonb_set(coalesce(result,'{}'::jsonb),'{scheduledContinuation}',
    jsonb_build_object('jobId',job.job_id),true) where id=run.id;
  return job.job_id;
end $$;

create or replace function public.company_scheduled_accepted_inventory_v1(p_workspace uuid,p_role uuid)
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
        and to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri') then 'candidate_first' end,
      case when i.is_company_first_search and public.role_matching_slot_type_v1(p_role,now()) in ('free','paid')
        and to_char(now() at time zone 'Asia/Seoul','Dy')=any(coalesce(i.intro_search_date,array['Mon','Wed','Fri']))
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (i.email_notifications_enabled and exists(select 1 from public.company_role_email_recipients_v1(p_role))))
        then 'company_first' end],null)))
  from public.company_roles r join public.company_internal_roles i using(role_id)
  where r.role_id=p_role and r.company_workspace_id=p_workspace
$$;

revoke all on function public.company_scheduled_matching_key_v1(uuid,uuid,timestamptz),
  public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid),
  public.guard_scheduled_matching_slot_v1(),public.enqueue_scheduled_matching_search_v1(uuid,text,jsonb),
  public.resume_scheduled_matching_v1(uuid) from public,anon,authenticated;
grant execute on function public.company_scheduled_matching_key_v1(uuid,uuid,timestamptz),
  public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamptz,uuid,uuid),
  public.guard_scheduled_matching_slot_v1(),public.enqueue_scheduled_matching_search_v1(uuid,text,jsonb),
  public.resume_scheduled_matching_v1(uuid) to service_role;
revoke all on function public.company_scheduled_accepted_inventory_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_scheduled_accepted_inventory_v1(uuid,uuid) to service_role;

create or replace function public.company_scheduled_accepted_relationships_v1(p_workspace uuid,p_role uuid)
returns table(talent_id uuid,recommendation_id uuid,accepted_at timestamptz)
language sql stable security invoker set search_path=public,pg_temp as $$
  select rec.talent_id,rec.id,rec.feedback_at from public.talent_opportunity_recommendation rec
  join public.company_roles r on r.role_id=rec.role_id
  where r.role_id=p_role and r.company_workspace_id=p_workspace
    and public.accepted_role_pair_is_available_v1(rec.id)
  order by rec.feedback_at,rec.id
$$;
revoke all on function public.company_scheduled_accepted_relationships_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.company_scheduled_accepted_relationships_v1(uuid,uuid) to service_role;

-- New scheduled results resume their original restricted service delegation.
create or replace function public.enqueue_matching_presentation_followup_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role uuid;
begin
  if exists(select 1 from public.company_first_search_runs where id=new.run_id and contract_version='scheduled_agentic_role_search_v1') then return new; end if;
  if new.status not in ('sent','canceled') or old.status = new.status then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('matching-presentation:'||new.run_id::text,0));
  if exists(select 1 from company_first_slack_outbox where run_id=new.run_id and status in ('pending','failed','sending')) then return new; end if;
  for v_role in select distinct unnest(role_ids) from company_first_slack_outbox where run_id=new.run_id and status='sent' loop
    perform enqueue_company_update_v1(new.company_workspace_id,v_role,
      'candidate-presentation:'||new.run_id::text||':'||v_role::text,
      'The candidate presentation is already delivered. Continue only for useful authorized work or a consequential suggestion; otherwise finish silently. Do not repeat the presentation.',
      jsonb_build_object('companyMessageAlreadyDelivered',true,'selectionRunId',new.run_id,'candidatePresentationDelivered',true));
  end loop;
  return new;
end; $$;
revoke all on function public.enqueue_matching_presentation_followup_v1() from public,anon,authenticated;

create or replace function public.scheduled_talent_source_fingerprint_v1(p_talent uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$

        SELECT md5(jsonb_build_object(
          'profile', (
            SELECT to_jsonb(profile_row)
            FROM (
              SELECT user_id, name, headline, bio, location, current_location,
                     resume_text, resume_links, updated_at
              FROM public.talent_users
              WHERE user_id = p_talent
            ) profile_row
          ),
          'experiences', coalesce((
            SELECT jsonb_agg(to_jsonb(experience_row) ORDER BY experience_row.id)
            FROM (
              SELECT id, company_name, role, start_date, end_date, description,
                     memo, employment_type, months, created_at
              FROM public.talent_experiences
              WHERE talent_id = p_talent
            ) experience_row
          ), '[]'::jsonb),
          'educations', coalesce((
            SELECT jsonb_agg(to_jsonb(education_row) ORDER BY education_row.id)
            FROM (
              SELECT id, school, degree, field, start_date, end_date,
                     description, memo, created_at
              FROM public.talent_educations
              WHERE talent_id = p_talent
            ) education_row
          ), '[]'::jsonb),
          'extras', (
            SELECT content FROM public.talent_extras WHERE talent_id = p_talent
          ),
          'brief', coalesce((
            SELECT jsonb_agg(to_jsonb(brief_row) ORDER BY brief_row.ref)
            FROM (
              SELECT id, ref, label, key, content, revision, updated_at
              FROM public.talent_contexts
              WHERE talent_id = p_talent
                AND collection = 'brief'
                AND deleted_at IS NULL
            ) brief_row
          ), '[]'::jsonb),
          'behavior', (
            SELECT jsonb_build_object(
              'version', context_version,
              'hash', context_hash,
              'builderVersion', builder_version,
              'updatedAt', updated_at
            )
            FROM public.talent_behavior_contexts
            WHERE talent_id = p_talent
          )
        )::text) AS source_fingerprint
        
$$;
create or replace function public.scheduled_company_memory_fingerprint_v1(p_role uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
select md5(jsonb_build_object(
  'entries',(select jsonb_agg(to_jsonb(m) order by m.id) from public.company_memory_entries m
    where m.company_workspace_id=r.company_workspace_id and m.deleted_at is null
      and (m.scope='company' or (m.scope='role' and m.role_id=r.role_id) or (m.scope='team' and m.team_id=i.team_id))),
  'legacy',(select jsonb_agg(to_jsonb(m) order by m.id) from public.company_memories m
    where m.company_workspace_id=r.company_workspace_id and (m.role_id is null or m.role_id=r.role_id)),
  'legacyRole',i.memory)::text)
from public.company_roles r join public.company_internal_roles i using(role_id) where r.role_id=p_role
$$;
revoke all on function public.scheduled_talent_source_fingerprint_v1(uuid),public.scheduled_company_memory_fingerprint_v1(uuid) from public,anon,authenticated;
grant execute on function public.scheduled_talent_source_fingerprint_v1(uuid),public.scheduled_company_memory_fingerprint_v1(uuid) to service_role;

-- Internal exclusions are current only while their consumed source is unchanged.
create or replace function public.accepted_role_pair_is_available_v1(p_recommendation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.talent_opportunity_recommendation rec
    join public.company_roles role on role.role_id=rec.role_id
    join public.company_internal_roles internal_role on internal_role.role_id=role.role_id
    join public.company_workspace workspace on workspace.company_workspace_id=role.company_workspace_id
    join public.talent_users talent on talent.user_id=rec.talent_id
    join public.talent_setting setting on setting.user_id=rec.talent_id
    where rec.id=p_recommendation_id and rec.feedback='like' and rec.saved_stage='connected'
      and coalesce(rec.opportunity_type,'') <> 'intro_request'
      and public.current_talent_recommendation_id_v1(rec.id)=rec.id
      and role.source_type='internal' and role.status='active' and not coalesce(role.is_expired,false)
      and (role.expires_at is null or role.expires_at>now())
      and coalesce(lower(btrim(role.information->>'testOnly')),'') not in ('true','1','yes','on')
      and public.role_matching_slot_type_v1(role.role_id,now()) in ('free','paid')
      and talent.deleted_at is null and setting.is_onboarding_done is true
      and setting.profile_visibility in ('open_to_matches','exceptional_only')
      and setting.get_internal_recommendation is not false
      and not exists (select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
      and not exists (select 1 from public.talent_opportunity_recommendation newer
        where newer.talent_id=rec.talent_id and newer.role_id=rec.role_id
          and (newer.created_at,newer.id)>(rec.created_at,rec.id))
      and not exists (select 1 from public.company_intro_candidates intro
        where intro.talent_id=rec.talent_id and intro.role_id=rec.role_id)
      and not exists (select 1 from public.talent_opportunity_tag tag
        where tag.talent_id=rec.talent_id and tag.opportunity_id=rec.role_id
          and (tag.tag in ('내부:연결대기','내부:연결됨','내부:최종오퍼','내부:프로세스중단','내부:거절','내부:아카이브')
            or tag.tag like '내부단계:%'))
      and not exists (select 1 from public.talent_progress progress
        where progress.talent_id=rec.talent_id and progress.role_id=rec.role_id
          and progress.kind='intro_to_company'
          and (progress.metadata->>'slackSent'='true' or progress.metadata->>'deliveryStatus' in ('pending','sent')))
      and not exists (select 1 from public.talent_opportunity_matching_review review
        join public.talent_opportunity_fit fit on fit.talent_id=review.talent_id and fit.opportunity_id=review.opportunity_id
        where review.recommendation_id=rec.id and review.decision='reject' and review.closed_at is null
          and review.evaluation_ref is null and fit.expires_at>now() and review.input_fingerprint=fit.input_fingerprint)
      and not exists(select 1 from public.talent_opportunity_matching_review review
        where review.recommendation_id=rec.id and review.decision='reject' and review.closed_at is null
          and review.evaluation_ref->>'inputContractVersion'='worker_behavior_v1'
          and review.evaluation_ref->>'briefVersion'=public.company_role_search_brief_version_v1(rec.role_id)
          and review.evaluation_ref->>'talentSourceFingerprint'=public.scheduled_talent_source_fingerprint_v1(rec.talent_id)
          and review.evaluation_ref->>'companyMemoryFingerprint'=public.scheduled_company_memory_fingerprint_v1(rec.role_id))
  );
$$;
revoke all on function public.accepted_role_pair_is_available_v1(uuid) from public,anon,authenticated;
grant execute on function public.accepted_role_pair_is_available_v1(uuid) to service_role;

-- The exact queued delivery owns this reservation. Its Decisions evidence
-- replaces the legacy fit dependency in the executor and insertion guard.
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
    and to_char(now() at time zone 'Asia/Seoul','Dy') in ('Mon','Wed','Fri')
    and talent.deleted_at is null and setting.get_internal_recommendation is not false
    and setting.profile_visibility in ('open_to_matches','exceptional_only')
    and not exists(select 1 from unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
      where lower(btrim(blocked.name)) in (lower(btrim(company.company_name)),lower(btrim(coalesce(company.published_name,'')))))
);
$$;
revoke all on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.scheduled_candidate_delivery_is_current_v1(uuid,uuid,uuid) to service_role;

create or replace function public.guard_candidate_first_against_company_intro_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = new.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal';

  if v_workspace_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_talent_route:' || v_workspace_id::text || ':' || new.talent_id::text,
      0
    )
  );

  if exists(select 1 from public.opportunity_discovery_run delivery where delivery.id=new.discovery_run_id
      and delivery.trigger_payload->'manualInternalRecommendation'->>'type'='scheduled_matching_candidate_first'
      and delivery.trigger_payload->'manualInternalRecommendation'->>'matchingReviewId' is not null)
    and not public.scheduled_candidate_delivery_is_current_v1(new.talent_id,new.role_id,new.discovery_run_id)
    then raise exception 'scheduled_matching_selection_changed' using errcode='23505'; end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and (intro.status='connecting' or (intro.status='ready' and not (public.scheduled_candidate_delivery_is_current_v1(new.talent_id,new.role_id,new.discovery_run_id) or exists (
        select 1 from public.talent_opportunity_matching_review selected
        join public.talent_opportunity_fit fit on fit.talent_id=selected.talent_id and fit.opportunity_id=selected.opportunity_id
        where selected.talent_id=new.talent_id and selected.opportunity_id=new.role_id
          and selected.decision in ('candidate_first','both') and selected.closed_at is null
          and selected.input_fingerprint=fit.input_fingerprint and fit.expires_at>now()
      ))))
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first route already exists for this Role and Talent';
  end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status = 'awaiting_talent'
      and not (
        intro.role_id = new.role_id
        and intro.recommendation_id is null
        and intro.requested_at is not null
        and cardinality(intro.intro_recipient_emails) > 0
        and new.opportunity_type = 'intro_request'
        and new.discovery_run_id = intro.delivery_run_id
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'another company-first route already exists for this Role and Talent';
  end if;

  return new;
end;
$$;

