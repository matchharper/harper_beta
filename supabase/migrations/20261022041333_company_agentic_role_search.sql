-- Interactive company search: durable evaluations and scoped facts, without
-- changing the canonical current-fit contract used by scheduled/Career readers.
begin;

alter table public.company_first_search_runs
  add column if not exists request_options jsonb not null default '{}'::jsonb;

create table public.company_role_candidate_evaluations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  run_id uuid not null references public.company_first_search_runs(id) on delete cascade,
  brief_version text not null,
  stage integer not null,
  input_fingerprint text not null,
  assessment jsonb not null,
  evaluated_at timestamptz not null default now(),
  -- A retry of the same stage must not create a second evaluation receipt.
  unique (run_id, talent_id, stage)
);
create index company_role_evaluations_version_idx on public.company_role_candidate_evaluations
  (company_workspace_id, role_id, brief_version, talent_id, stage, evaluated_at desc);
create index company_role_evaluations_talent_idx on public.company_role_candidate_evaluations
  (company_workspace_id, talent_id, evaluated_at desc);
alter table public.company_role_candidate_evaluations enable row level security;
revoke all on public.company_role_candidate_evaluations from public, anon, authenticated;
grant all on public.company_role_candidate_evaluations to service_role;

create table public.company_memory_entries (
  id bigint generated always as identity primary key,
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  scope text not null,
  team_id uuid references public.company_workspace_teams(id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete cascade,
  label text not null default '',
  content text not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index company_memory_entries_scope_idx on public.company_memory_entries
  (company_workspace_id, scope, role_id, team_id, id) where deleted_at is null;
alter table public.company_memory_entries enable row level security;
revoke all on public.company_memory_entries from public, anon, authenticated;
revoke all on sequence public.company_memory_entries_id_seq from public, anon, authenticated;
grant all on public.company_memory_entries to service_role;
grant usage, select on sequence public.company_memory_entries_id_seq to service_role;

-- The receipt is an executed batch, not model reasoning. It lets an HTTP/tool
-- retry return the original refs even after rows were subsequently edited.
create table public.company_memory_operations (
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  operation_id text not null,
  company_user_id uuid not null,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_workspace_id, operation_id)
);
alter table public.company_memory_operations enable row level security;
revoke all on public.company_memory_operations from public, anon, authenticated;
grant all on public.company_memory_operations to service_role;

create function public.company_role_search_brief_snapshot_v1(p_role_id uuid)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'roleId', r.role_id, 'name', r.name, 'description', r.description,
    'request', ir.request, 'criteria', ir.criteria,
    'location', r.location_text, 'countryCode', r.country_code,
    'workMode', r.work_mode, 'employmentType', r.type,
    'seniority', r.seniority_level, 'salaryRange', r.salary_range,
    'salaryMin', r.salary_min, 'salaryMax', r.salary_max,
    'salaryCurrency', r.salary_currency, 'salaryPeriod', r.salary_period
  ) from public.company_roles r join public.company_internal_roles ir using(role_id)
  where r.role_id = p_role_id
$$;
create function public.company_role_search_brief_version_v1(p_role_id uuid)
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select md5(public.company_role_search_brief_snapshot_v1(p_role_id)::text)
$$;

create function public.company_memory_scope_allowed_v1(
  p_workspace uuid, p_user uuid, p_scope text, p_team uuid, p_role uuid
) returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
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
          select 1 from public.company_roles r join public.company_internal_roles ir using(role_id)
          where r.role_id=p_role and r.company_workspace_id=p_workspace and r.source_type='internal'
            and ((m.authority='owner' or m.access_scope='organization') or m.team_id=ir.team_id or exists (
              select 1 from public.company_workspace_team_members tm
              where tm.membership_id=m.id and tm.team_id=ir.team_id)))
        else false end
  )
$$;

create function public.write_company_memory_v1(
  p_workspace uuid, p_user uuid, p_operation_id text, p_changes jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  item jsonb; current_row public.company_memory_entries%rowtype;
  receipt public.company_memory_operations%rowtype;
  applied jsonb := '[]'::jsonb; saved jsonb; request_hash text := md5(p_changes::text);
begin
  if p_operation_id is null or btrim(p_operation_id)='' or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes)=0 then raise exception 'invalid_memory_batch' using errcode='22023'; end if;
  if not exists(select 1 from public.company_user_workspace where company_workspace_id=p_workspace and company_user_id=p_user and authority in ('owner','admin'))
    then raise exception 'memory_workspace_forbidden' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('company-memory-source:'||p_workspace::text,0));
  select * into receipt from public.company_memory_operations where company_workspace_id=p_workspace and operation_id=p_operation_id;
  if found then
    if receipt.company_user_id<>p_user or receipt.request_hash<>request_hash then raise exception 'memory_operation_conflict'; end if;
    return receipt.result;
  end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    if item->>'op'='add' then
      if not public.company_memory_scope_allowed_v1(p_workspace,p_user,item->>'scope',(item->>'teamId')::uuid,(item->>'roleId')::uuid)
        then raise exception 'memory_scope_forbidden' using errcode='42501'; end if;
      if jsonb_typeof(item->'content') is distinct from 'string' or btrim(item->>'content')='' then raise exception 'memory_content_required'; end if;
      insert into public.company_memory_entries(company_workspace_id,scope,team_id,role_id,label,content)
      values(p_workspace,item->>'scope',(item->>'teamId')::uuid,(item->>'roleId')::uuid,coalesce(item->>'label',''),item->>'content') returning * into current_row;
    elsif item->>'op' in ('update','delete') then
      select * into current_row from public.company_memory_entries where id=(item->>'ref')::bigint
        and company_workspace_id=p_workspace and deleted_at is null for update;
      if not found then raise exception 'memory_not_found'; end if;
      if not public.company_memory_scope_allowed_v1(p_workspace,p_user,current_row.scope,current_row.team_id,current_row.role_id)
        then raise exception 'memory_scope_forbidden' using errcode='42501'; end if;
      if (item->>'revision')::bigint is distinct from current_row.revision then raise exception 'memory_revision_conflict'; end if;
      if item->>'op'='update' then
        if item ? 'content' and (jsonb_typeof(item->'content') is distinct from 'string' or btrim(item->>'content')='') then raise exception 'memory_content_required'; end if;
        update public.company_memory_entries set content=coalesce(item->>'content',content),label=coalesce(item->>'label',label),
          revision=revision+1,updated_at=now() where id=current_row.id returning * into current_row;
      else
        update public.company_memory_entries set deleted_at=now(),updated_at=now(),revision=revision+1
          where id=current_row.id returning * into current_row;
      end if;
    else raise exception 'invalid_memory_operation'; end if;
    applied:=applied||jsonb_build_array(jsonb_build_object('ref',current_row.id,'revision',current_row.revision,'op',item->>'op'));
  end loop;
  saved:=jsonb_build_object('applied',applied);
  insert into public.company_memory_operations values(p_workspace,p_operation_id,p_user,request_hash,saved,now());
  return saved;
end $$;

create function public.enqueue_company_agentic_search_v1(
  p_company_workspace_id uuid, p_company_user_id uuid, p_role_id uuid,
  p_options jsonb, p_request_id text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
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
  select cr.*, ir.request as brief into r from public.company_roles cr join public.company_internal_roles ir using(role_id)
    where cr.role_id=p_role_id and cr.company_workspace_id=p_company_workspace_id;
  if not found or r.status<>'active' or r.is_expired or r.expires_at<=now()
    then return jsonb_build_object('status','not_queued','reason','role_unavailable'); end if;
  if lower(coalesce(r.information->>'testOnly','false')) in ('true','1','yes','on')
    then return jsonb_build_object('status','not_queued','reason','test_role'); end if;
  if nullif(btrim(r.brief),'') is null then return jsonb_build_object('status','not_queued','reason','brief_missing'); end if;
  if public.role_matching_slot_type_v1(p_role_id,now()) is distinct from 'paid'
    then return jsonb_build_object('status','not_queued','reason','paid_role_required'); end if;
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
end $$;

-- This is a read of the currently shareable population, not a suitability
-- threshold or an LLM-derived exclusion. It makes unevaluated work discoverable.
create function public.company_role_search_inventory_v1(p_workspace uuid, p_role uuid, p_version text)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with last_search as (
    select max(source_cutoff) as cutoff from public.company_first_search_runs
    where company_workspace_id=p_workspace and status='succeeded'
      and (role_id=p_role or p_role=any(requested_role_ids) or p_role=any(scheduled_role_ids))
  ), population as (
    select talent.user_id, talent.created_at,
      exists(select 1 from public.company_role_candidate_evaluations e
        where e.company_workspace_id=p_workspace and e.role_id=p_role and e.talent_id=talent.user_id
          and e.brief_version=p_version
          and (e.stage=2 or (e.stage=1 and e.assessment->>'proceedToStage2'='false'
            and not exists(select 1 from public.company_role_candidate_evaluations later
              where later.role_id=e.role_id and later.talent_id=e.talent_id and later.brief_version=e.brief_version
                and later.stage=1 and (later.evaluated_at,later.id)>(e.evaluated_at,e.id))))) as assessed
    from public.talent_users talent join public.talent_setting settings on settings.user_id=talent.user_id
    join public.company_workspace workspace on workspace.company_workspace_id=p_workspace
    join public.company_roles role on role.role_id=p_role and role.company_workspace_id=p_workspace
    where talent.deleted_at is null and settings.is_onboarding_done is true
      and settings.profile_visibility='open_to_matches' and settings.get_internal_recommendation is not false
      and not exists(select 1 from unnest(coalesce(settings.blocked_companies,'{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (lower(btrim(workspace.company_name)),lower(btrim(coalesce(workspace.published_name,'')))))
  ) select jsonb_build_object('shareable',count(*),'unassessed',count(*) filter(where not assessed),
      'newUnassessed',count(*) filter(where not assessed and created_at>coalesce((select cutoff from last_search),'-infinity'::timestamptz)))
    from population
$$;
revoke all on function public.company_role_search_inventory_v1(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.company_role_search_inventory_v1(uuid,uuid,text) to service_role;

-- A changed recommendation is not a company rejection. Keep the existing
-- lifecycle states but let the executor record the factual closure reason.
alter table public.company_intro_candidates drop constraint if exists company_intro_candidates_close_reason_check;

revoke all on function public.company_role_search_brief_snapshot_v1(uuid),public.company_role_search_brief_version_v1(uuid),
  public.company_memory_scope_allowed_v1(uuid,uuid,text,uuid,uuid),public.write_company_memory_v1(uuid,uuid,text,jsonb),
  public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.company_role_search_brief_snapshot_v1(uuid),public.company_role_search_brief_version_v1(uuid),
  public.company_memory_scope_allowed_v1(uuid,uuid,text,uuid,uuid),public.write_company_memory_v1(uuid,uuid,text,jsonb),
  public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) to service_role;
commit;
