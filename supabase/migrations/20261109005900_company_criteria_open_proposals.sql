-- Several open criteria suggestions per Role.
--
-- A review of pass reasons now runs while earlier suggestions wait, so a Role
-- can hold up to five open ones. A new suggestion can replace earlier open
-- ones (status superseded, no decision event).
--
-- create_company_brief_proposal_v1 and every other function stay as they are,
-- so the web deployed before this migration keeps its one pending suggestion.
-- Only the new web calls create_company_brief_proposal_v2.

-- The one-pending index exists only in the live database. It keeps guarding
-- company_data proposals (chat and Slack confirmations); criteria suggestions
-- are counted by create_company_brief_proposal_v2 under its lock. An upsert
-- naming this index's columns could no longer infer it, so stop if one exists.
do $migration$
declare
  v_index record;
begin
  if exists (
    select 1
    from pg_proc proc
    join pg_namespace ns on ns.oid = proc.pronamespace
    where ns.nspname = 'public'
      and proc.prosrc ilike '%company_agent_update_proposals%'
      and proc.prosrc ~* 'on\s+conflict\s*\([^)]*scope_key'
  ) then
    raise exception using errcode = '55000', message = 'company_agent_update_proposals_upsert_depends_on_one_pending_index';
  end if;
  for v_index in
    select index_row.indexname
    from pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.tablename = 'company_agent_update_proposals'
      and index_row.indexdef ilike 'create unique index%(workspace_id, scope_key)%'
      and index_row.indexdef ilike '%status = ''pending''%'
      and index_row.indexdef not ilike '%criteria_refinement%'
  loop
    execute format('drop index public.%I', v_index.indexname);
    execute format(
      'create unique index %I on public.company_agent_update_proposals (workspace_id, scope_key) where status = %L and kind <> %L',
      v_index.indexname, 'pending', 'criteria_refinement'
    );
  end loop;
end $migration$;

-- Adds a suggestion unless the company already answered the same change.
-- p_replaces: open suggestions of this Role that the new one takes over.
-- status: created | answered_before | busy (a replaced one is being applied)
-- | limit_reached (p_open_limit open without the replaced ones; nothing changed).
create or replace function public.create_company_brief_proposal_v2(
  p_workspace_id uuid,
  p_role_id uuid,
  p_kind text,
  p_content_key text,
  p_base_brief_revision integer,
  p_summary text,
  p_preview text,
  p_payload jsonb,
  p_expires_at timestamptz,
  p_replaces uuid[] default '{}',
  p_open_limit integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := 'brief:' || p_role_id::text;
  v_replaced uuid[];
  v_open integer;
  v_id uuid;
begin
  if p_kind is distinct from 'criteria_refinement'
     or nullif(btrim(coalesce(p_content_key, '')), '') is null
     or nullif(btrim(coalesce(p_summary, '')), '') is null
     or nullif(btrim(coalesce(p_preview, '')), '') is null
     or jsonb_typeof(p_payload) is distinct from 'object'
     or p_expires_at is null or p_expires_at <= now()
     or p_open_limit is null or p_open_limit < 1 then
    raise exception using errcode = '22023', message = 'company_brief_proposal_invalid';
  end if;
  if not exists (
    select 1 from public.company_roles role
    where role.role_id = p_role_id and role.company_workspace_id = p_workspace_id
  ) then
    raise exception using errcode = 'P0002', message = 'company_brief_proposal_role_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('company_brief_proposal:' || p_role_id::text, 0));

  update public.company_agent_update_proposals proposal
  set status = 'expired', payload = null, preview = null, presentation_text = null, updated_at = now()
  where proposal.workspace_id = p_workspace_id
    and proposal.scope_key = v_scope
    and proposal.status = 'pending'
    and proposal.expires_at <= now();
  if exists (
    select 1 from public.company_decision_events event
    where event.role_id = p_role_id
      and event.subject_kind = 'proposal'
      and event.action in ('accept', 'reject')
      and event.detail->>'contentKey' = p_content_key
  ) then
    return jsonb_build_object('status', 'answered_before');
  end if;

  select coalesce(array_agg(proposal.id), '{}') into v_replaced
  from public.company_agent_update_proposals proposal
  where proposal.workspace_id = p_workspace_id
    and proposal.scope_key = v_scope
    and proposal.status = 'pending'
    and proposal.kind = 'criteria_refinement'
    and proposal.id = any(coalesce(p_replaces, '{}'));
  -- A member's save in progress finishes first (the claim of resolve_company_brief_proposal_v1).
  if exists (
    select 1 from public.company_agent_update_proposals proposal
    where proposal.id = any(v_replaced)
      and (proposal.payload->'claim'->>'at')::timestamptz > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('status', 'busy');
  end if;
  select count(*) into v_open
  from public.company_agent_update_proposals proposal
  where proposal.workspace_id = p_workspace_id
    and proposal.scope_key = v_scope
    and proposal.status = 'pending'
    and not proposal.id = any(v_replaced);
  if v_open >= p_open_limit then
    return jsonb_build_object('status', 'limit_reached', 'open', v_open);
  end if;

  update public.company_agent_update_proposals proposal
  set status = 'superseded', payload = null, preview = null, presentation_text = null, updated_at = now()
  where proposal.id = any(v_replaced);

  insert into public.company_agent_update_proposals (
    workspace_id, scope_key, status, source, kind, content_key, base_brief_revision,
    summary, preview, presentation_text, payload, message_type, expires_at
  ) values (
    p_workspace_id, v_scope, 'pending', 'chat', p_kind, btrim(p_content_key), p_base_brief_revision,
    left(btrim(p_summary), 160), left(btrim(p_preview), 3000), left(btrim(p_summary), 6000),
    p_payload, 'chat', p_expires_at
  ) returning id into v_id;
  return jsonb_build_object('status', 'created', 'proposalId', v_id, 'replaced', to_jsonb(v_replaced));
end;
$$;

revoke all on function public.create_company_brief_proposal_v2(uuid, uuid, text, text, integer, text, text, jsonb, timestamptz, uuid[], integer)
  from public, anon, authenticated;
grant execute on function public.create_company_brief_proposal_v2(uuid, uuid, text, text, integer, text, text, jsonb, timestamptz, uuid[], integer) to service_role;
