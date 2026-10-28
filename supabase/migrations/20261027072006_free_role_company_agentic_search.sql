-- Run Search evaluates and publishes company-first candidates; it never sends an Intro.
create or replace function public.enqueue_company_agentic_search_v1(
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
end $$;

revoke all on function public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.enqueue_company_agentic_search_v1(uuid,uuid,uuid,jsonb,text) to service_role;
