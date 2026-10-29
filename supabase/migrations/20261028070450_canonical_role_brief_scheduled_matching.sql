-- company_internal_roles.request is the sole Hiring Brief source.
-- Existing legacy values are left untouched; there is no backfill or customer action.
-- Role ownership does not depend on optional internal settings. Team-scoped
-- access still requires its matching team; organization access uses the parent.
CREATE OR REPLACE FUNCTION public.company_memory_scope_allowed_v1(p_workspace uuid, p_user uuid, p_scope text, p_team uuid, p_role uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.company_user_workspace m
    where m.company_workspace_id=p_workspace and m.company_user_id=p_user
      and case p_scope
        when 'company' then p_team is null and p_role is null and (m.authority='owner' or m.access_scope='organization')
        when 'team' then p_role is null and exists (
          select 1 from public.company_workspace_teams t where t.id=p_team
            and t.company_workspace_id=p_workspace and t.deleted_at is null
            and ((m.authority='owner' or m.access_scope='organization') or m.team_id=t.id or exists (
              select 1 from public.company_workspace_team_members tm
              where tm.membership_id=m.id and tm.team_id=t.id)))
        when 'role' then p_team is null and exists (
          select 1 from public.company_roles r left join public.company_internal_roles ir using(role_id)
          where r.role_id=p_role and r.company_workspace_id=p_workspace and r.source_type='internal'
            and ((m.authority='owner' or m.access_scope='organization') or m.team_id=ir.team_id or exists (
              select 1 from public.company_workspace_team_members tm
              where tm.membership_id=m.id and tm.team_id=ir.team_id)))
        else false end
  )
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_company_scheduled_matching_v1(p_workspace uuid, p_role uuid, p_slot timestamp with time zone, p_actor uuid, p_conversation uuid, p_activation_run uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  select r.source_type,r.status,r.is_expired,r.expires_at,r.information,
    i.request as hiring_brief,i.is_company_first_search,i.intro_search_date,i.intro_search_time into role_row
    from public.company_roles r left join public.company_internal_roles i using(role_id)
    where r.role_id=p_role and r.company_workspace_id=p_workspace;
  if not found or role_row.source_type<>'internal' or role_row.status<>'active' or coalesce(role_row.is_expired,false)
    or role_row.expires_at<=now()
    or lower(coalesce(role_row.information->>'testOnly','false')) in ('true','1','yes','on')
    then raise exception 'scheduled_role_unavailable'; end if;
  if nullif(btrim(role_row.hiring_brief),'') is null then
    return jsonb_build_object('status','skipped','reason','hiring_brief_missing');
  end if;
  local_slot:=p_slot at time zone 'Asia/Seoul'; weekday:=to_char(local_slot,'Dy');
  kind:=public.role_matching_slot_type_v1(p_role,now());
  if kind not in ('free','paid') then raise exception 'scheduled_role_unavailable'; end if;
  if p_activation_run is null and (local_slot::date<>(now() at time zone 'Asia/Seoul')::date or p_slot>now()
    or not ((kind in ('free','paid') and weekday in ('Mon','Wed','Fri') and extract(hour from local_slot)=9)
      or (kind in ('free','paid') and role_row.is_company_first_search
        and weekday=any(coalesce(role_row.intro_search_date,array['Mon','Wed','Fri']))
        and extract(hour from local_slot)=coalesce(role_row.intro_search_time,9)
        and ((exists(select 1 from public.company_slack_channels c where c.company_workspace_id=p_workspace and c.is_enabled
          and not exists(select 1 from public.company_role_notification_channels o where o.channel_id=c.id and o.role_id=p_role)))
          or (public.company_role_candidate_email_enabled_v1(p_role) and exists(select 1 from public.company_role_email_recipients_v1(p_role))))))
   ) then raise exception 'scheduled_slot_not_due'; end if;
  select * into job from public.enqueue_company_agent_web_action_v1(p_workspace,p_conversation,p_role,p_actor,
    'scheduled_matching_review',jsonb_build_object('roleId',p_role,'scheduledSlot',p_slot,'activationRunId',p_activation_run),key);
  return jsonb_build_object('status','queued','jobId',job.job_id,'created',job.created);
end $function$
;
revoke all on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamp with time zone,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_company_scheduled_matching_v1(uuid,uuid,timestamp with time zone,uuid,uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.enqueue_scheduled_matching_search_v1(p_parent uuid, p_call_id text, p_options jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  if not exists(select 1 from public.company_roles r
      where r.role_id=root.role_id and r.company_workspace_id=root.company_workspace_id
        and r.source_type='internal' and r.status='active' and not coalesce(r.is_expired,false)
        and (r.expires_at is null or r.expires_at>now())
        and lower(coalesce(r.information->>'testOnly','false')) not in ('true','1','yes','on')
        and public.role_matching_slot_type_v1(r.role_id,now()) in ('free','paid')) then raise exception 'scheduled_role_unavailable'; end if;
  if not exists(select 1 from public.company_internal_roles
    where role_id=root.role_id and nullif(btrim(request),'') is not null) then
    return jsonb_build_object('status','skipped','reason','hiring_brief_missing');
  end if;
  brief:=public.company_role_search_brief_snapshot_v1(root.role_id); version:=md5(brief::text);
  insert into public.company_first_search_runs(company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,scheduled_role_ids,request_options,source_snapshot)
  values(root.company_workspace_id,root.role_id,(root.action_context->>'scheduledSlot')::timestamptz,'scheduled',
    'scheduled_agentic_role_search_v1','queued',array[root.role_id],command||jsonb_build_object('requestId',request_id,'briefVersion',version),
    jsonb_build_object('roleSearchBrief',brief||jsonb_build_object('version',version))) returning * into prior;
  return jsonb_build_object('status','queued','runId',prior.id,'briefVersion',version,'inputContractVersion','worker_behavior_v1');
end $function$
;
revoke all on function public.enqueue_scheduled_matching_search_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_scheduled_matching_search_v1(uuid,text,jsonb) to service_role;

CREATE OR REPLACE FUNCTION public.enqueue_company_agentic_search_v1(p_company_workspace_id uuid, p_company_user_id uuid, p_role_id uuid, p_options jsonb, p_request_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r record; queued public.company_first_search_runs%rowtype; version text; options jsonb; brief_snapshot jsonb; command jsonb;
begin
  if not exists(select 1 from public.company_user_workspace where company_workspace_id=p_company_workspace_id and company_user_id=p_company_user_id and authority in ('owner','admin')) then raise exception 'company_matching_search_workspace_forbidden' using errcode='42501'; end if;
  if not public.company_memory_scope_allowed_v1(p_company_workspace_id,p_company_user_id,'role',null,p_role_id)
    then raise exception 'company_matching_search_workspace_forbidden' using errcode='42501'; end if;
  if jsonb_typeof(p_options) is distinct from 'object' or nullif(btrim(p_request_id),'') is null then raise exception 'invalid_search_request'; end if;
  command:=(p_options - array['briefVersion','requestId','roleId'])||jsonb_build_object('roleId',p_role_id);
  perform pg_advisory_xact_lock(hashtextextended('company_matching_enqueue:'||p_company_workspace_id::text,0));
  select * into queued from public.company_first_search_runs
    where company_workspace_id=p_company_workspace_id and contract_version='company_agentic_role_search_v1'
      and request_options->>'requestId'=p_request_id order by created_at desc limit 1;
  if found then
    if (queued.request_options - array['briefVersion','requestId'])<>command then raise exception 'search_request_conflict'; end if;
    return jsonb_build_object('status',case when queued.status='running' then 'already_running'
      when queued.status='queued' then 'already_queued' else 'already_completed' end,
      'runId',queued.id,'runStatus',queued.status,'briefVersion',queued.request_options->>'briefVersion');
  end if;
  select cr.status,cr.is_expired,cr.expires_at,cr.information,ir.request as brief into r from public.company_roles cr join public.company_internal_roles ir using(role_id)
    where cr.role_id=p_role_id and cr.company_workspace_id=p_company_workspace_id;
  if not found or r.status<>'active' or r.is_expired or r.expires_at<=now()
    then return jsonb_build_object('status','not_queued','reason','role_unavailable'); end if;
  if lower(coalesce(r.information->>'testOnly','false')) in ('true','1','yes','on')
    then return jsonb_build_object('status','not_queued','reason','test_role'); end if;
  if nullif(btrim(r.brief),'') is null then return jsonb_build_object('status','not_queued','reason','brief_missing'); end if;
  -- Company-side evaluation/publication is available to Free and paid Roles.
  -- Candidate-first outreach keeps its separate paid entitlement.
  if coalesce(public.role_matching_slot_type_v1(p_role_id,now()),'unavailable') not in ('free','paid')
    then return jsonb_build_object('status','not_queued','reason','role_unavailable'); end if;
  -- One snapshot supplies both the identity and facts even if an edit races this enqueue.
  brief_snapshot:=public.company_role_search_brief_snapshot_v1(p_role_id);
  version:=md5(brief_snapshot::text);
  options:=command||jsonb_build_object('briefVersion',version,'requestId',p_request_id);
  insert into public.company_first_search_runs(company_workspace_id,role_id,scheduled_slot,trigger_reason,contract_version,
    status,requested_role_ids,request_options,source_snapshot)
    values(p_company_workspace_id,p_role_id,clock_timestamp(),'company_requested','company_agentic_role_search_v1','queued',
      array[p_role_id],options,jsonb_build_object('roleSearchBrief',brief_snapshot||jsonb_build_object('version',version)))
    returning * into queued;
  return jsonb_build_object('status','queued','runId',queued.id,'briefVersion',version);
end $function$
;
revoke all on function public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) to service_role;

-- Retire legacy fallback/mirroring without replacing unrelated data-change behavior.
do $migration$
declare definition text; previous text;
begin
  definition := pg_get_functiondef('public.apply_company_data_changes_internal_v1(uuid,jsonb,text,text,boolean)'::regprocedure);
  previous := definition;
  definition := replace(definition, $old$      if v_key = 'role_request'
         and (
           v_current_role_source = 'external'
           or not exists (
             select 1 from public.company_internal_roles internal_role
             where internal_role.role_id = v_role_id
           )
         ) then
        -- For currently external roles the parent is the only request store.
        -- During external -> internal conversion it is therefore also the
        -- optimistic transition snapshot. A currently internal role always
        -- keeps the extension canonical, even when its final source is external.
        select coalesce(to_jsonb(role.request), 'null'::jsonb)
        into v_current
        from public.company_roles role
        where role.role_id = v_role_id
          and role.company_workspace_id = p_workspace_id;
      end if;
$old$, $new$$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 1 not found'; end if;
  previous := definition;
  definition := replace(definition, $old$      insert into public.company_internal_roles(role_id, request, updated_at)
      select role_id, request, v_now
      from public.company_roles
      where role_id = v_role_id
      on conflict (role_id) do nothing;$old$, $new$      insert into public.company_internal_roles(role_id, updated_at)
      values (v_role_id, v_now)
      on conflict (role_id) do nothing;$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 2 not found'; end if;
  previous := definition;
  definition := replace(definition, $old$      update public.company_roles role
      set request = coalesce(
            (
              select internal_role.request
              from public.company_internal_roles internal_role
              where internal_role.role_id = role.role_id
            ),
            role.request
          ),
          source_type = v_text,
          updated_at = v_now
      where role.role_id = v_role_id;$old$, $new$      update public.company_roles
      set source_type = v_text, updated_at = v_now
      where role_id = v_role_id;$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 3 not found'; end if;
  previous := definition;
  definition := replace(definition, $old$        select lower(btrim(coalesce(source_type, '')))
        into v_final_role_source
        from public.company_roles
        where role_id = v_role_id;
        if v_final_role_source = 'internal' then
          update public.company_internal_roles
          set request = v_text, updated_at = v_now
          where role_id = v_role_id and request is distinct from v_text;
        end if;
        update public.company_roles
        set request = v_text, updated_at = v_now
        where role_id = v_role_id and request is distinct from v_text;
$old$, $new$        insert into public.company_internal_roles(role_id, request, updated_at)
        values (v_role_id, v_text, v_now)
        on conflict (role_id) do update set request = excluded.request, updated_at = excluded.updated_at
          where company_internal_roles.request is distinct from excluded.request;
        update public.company_roles set updated_at = v_now where role_id = v_role_id;
$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 4 not found'; end if;
  previous := definition;
  definition := replace(definition, $old$    if v_key in ('role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous')
       or (
         v_key = 'role_request'
         and (p_source <> 'website' or v_final_role_source = 'internal')
       ) then
      if v_final_role_source is distinct from 'internal'
         or coalesce(v_final_role_expired, true) then
        raise exception using errcode = '23514', message = 'role request and memory require a final active internal role';
      end if;
    elsif v_key = 'role_request'
       and v_final_role_source is distinct from 'external' then
      raise exception using errcode = '23514', message = 'website role request requires an internal or external role';
    end if;

$old$, $new$    if v_key in ('role_request', 'role_memory', 'role_is_company_first_search', 'role_intro_search_date', 'role_intro_search_time', 'role_is_promote', 'role_is_anonymous') then
      if v_final_role_source is distinct from 'internal'
         or coalesce(v_final_role_expired, true) then
        raise exception using errcode = '23514', message = 'role request and memory require a final active internal role';
      end if;
    end if;

$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 5 not found'; end if;
  previous := definition;
  definition := replace(definition, $old$  perform set_config('harper.company_role_request_sync', 'canonical', true);

$old$, $new$$new$);
  if definition = previous then raise exception 'canonical brief migration: data-change block 6 not found'; end if;
  execute definition;
end $migration$;

-- Preserve extension lifecycle, but never import legacy text or overwrite a canonical brief.
drop trigger if exists company_roles_legacy_request_to_internal on public.company_roles;
drop function if exists public.sync_legacy_company_role_request_to_internal_v1();
drop trigger if exists company_roles_guard_internal_legacy_request on public.company_roles;
drop function if exists public.guard_internal_company_role_legacy_request_v1();

create or replace function public.sync_company_internal_role_extension_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if lower(btrim(coalesce(new.source_type,''))) = 'internal' then
    insert into public.company_internal_roles(role_id,updated_at)
    values(new.role_id,transaction_timestamp()) on conflict(role_id) do nothing;
  else
    delete from public.company_internal_roles where role_id=new.role_id;
  end if;
  return new;
end $$;
revoke all on function public.sync_company_internal_role_extension_v1() from public,anon,authenticated;
create trigger company_roles_sync_internal_extension
  after insert or update of source_type on public.company_roles
  for each row execute function public.sync_company_internal_role_extension_v1();

-- Keep the existing search weight, sourcing internal criteria from the canonical row.
CREATE OR REPLACE FUNCTION public.set_company_roles_opportunity_search_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.status, 'active')) = 'draft' then
    new.opportunity_search_tsv := null;
    return new;
  end if;

  -- The weekly cold-storage sweep intentionally removes the search vector
  -- from expired roles that must remain because another row references them.
  if tg_op = 'UPDATE' then
    if coalesce(new.is_expired, false) = true
       and old.opportunity_search_tsv is null then
      return new;
    end if;
  end if;

  new.opportunity_search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce((select i.request from public.company_internal_roles i
      where i.role_id=new.role_id and new.source_type='internal'), '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(new.work_mode, '')), 'D') ||
    setweight(
      to_tsvector(
        'simple',
        array_to_string(coalesce(new."type", '{}'::text[]), ' ')
      ),
      'D'
    );

  return new;
end;
$function$
;

-- Canonical web/RPC saves touch the parent timestamp, never its legacy request.
drop trigger if exists company_roles_set_opportunity_search_tsv on public.company_roles;
create trigger company_roles_set_opportunity_search_tsv
  before insert or update of name,description,location_text,work_mode,type,is_expired,status,updated_at
  on public.company_roles for each row execute function public.set_company_roles_opportunity_search_tsv();
