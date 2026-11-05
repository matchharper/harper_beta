-- One write path for the Brief text and criteria (D18, E3a).
--
-- A role started from role start keeps its Brief in role start
-- (company_role_start_sessions.brief); its company_internal_roles.request and
-- criteria are copies written from that Brief. The role screen already refuses
-- other edits to them (409) and chat edits go through role start, but the
-- website data editor, Ops, accepted proposals or a script could still change
-- the copy alone. Now every path is the same: for a registered role-start role
-- (onboarding Brief, no longer a draft) only role start writes request and
-- criteria (company_role_brief_via_role_start otherwise).
--
-- write_company_role_brief_v1 is the write function for the writers that wrote
-- the columns directly: role start (with p_role_start) and Ops role creation.
-- It records who and where for the Brief version and history in the same call.
-- Chat, Slack, website and Ops edits keep going through
-- apply_company_data_with_hiring_history_v1, which already does the same.
-- Other roles' Brief text is the original and is not otherwise restricted.

create or replace function public.guard_company_role_brief_copy_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (old.request, old.criteria) is not distinct from (new.request, new.criteria) then
    return new;
  end if;
  if coalesce(current_setting('harper.company_role_brief_write', true), '') <> 'role_start' and exists (
    select 1
    from public.company_roles role
    join public.company_role_start_sessions session on session.role_id = role.role_id
    where role.role_id = new.role_id
      and role.status <> 'draft'
      and session.brief_source = 'onboarding'
      and session.phase <> 'superseded'
  ) then
    raise exception using errcode = 'P0001', message = 'company_role_brief_via_role_start';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_company_role_brief_copy_v1()
  from public, anon, authenticated, service_role;

create trigger company_internal_roles_brief_copy_guard
  before insert or update of request, criteria on public.company_internal_roles
  for each row execute function public.guard_company_role_brief_copy_v1();

-- Writes a role's Brief text and/or criteria (null leaves that part as it is).
-- p_role_start: the write comes from the role's role start Brief.
create or replace function public.write_company_role_brief_v1(
  p_role_id uuid,
  p_request text,
  p_criteria jsonb,
  p_source text,
  p_actor_user_id uuid default null,
  p_actor_label text default null,
  p_request_review boolean default false,
  p_role_start boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
  v_history jsonb;
begin
  if nullif(btrim(coalesce(p_source, '')), '') is null then
    raise exception using errcode = '22023', message = 'company_role_brief_source_required';
  end if;
  if p_criteria is not null and jsonb_typeof(p_criteria) <> 'array' then
    raise exception using errcode = '22023', message = 'criteria must be an array';
  end if;
  if not exists (
    select 1 from public.company_roles role
    where role.role_id = p_role_id and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  ) then
    raise exception using errcode = 'P0002', message = 'internal role not found';
  end if;

  perform set_config('harper.hiring_brief_change_context', jsonb_build_object(
    'actorUserId', p_actor_user_id, 'actorLabel', p_actor_label, 'source', p_source,
    'requestReview', p_request_review)::text, true);
  perform set_config('harper.company_role_brief_write',
    case when p_role_start then 'role_start' else '' end, true);

  update public.company_internal_roles internal_role
  set request = coalesce(p_request, internal_role.request),
      criteria = coalesce(p_criteria, internal_role.criteria),
      updated_at = now()
  where internal_role.role_id = p_role_id
    and (internal_role.request, internal_role.criteria)
      is distinct from (coalesce(p_request, internal_role.request), coalesce(p_criteria, internal_role.criteria));
  get diagnostics v_changed = row_count;
  if v_changed = 0 and not exists (
    select 1 from public.company_internal_roles internal_role where internal_role.role_id = p_role_id
  ) then
    insert into public.company_internal_roles (role_id, request, criteria, updated_at)
    values (p_role_id, p_request, coalesce(p_criteria, '[]'::jsonb), now());
    v_changed := 1;
  end if;
  perform set_config('harper.company_role_brief_write', '', true);

  -- A save of the text (with or without the list) marks the Role as updated, as before.
  if p_request is not null and v_changed > 0 then
    update public.company_roles set updated_at = now() where role_id = p_role_id;
  end if;

  select coalesce(jsonb_agg(history.id order by history.created_at), '[]'::jsonb)
  into v_history
  from public.company_role_hiring_brief_history history
  where history.role_id = p_role_id and history.transaction_id = txid_current();

  return jsonb_build_object(
    'status', case when v_changed > 0 then 'updated' else 'unchanged' end,
    'historyIds', v_history);
end;
$$;

revoke all on function public.write_company_role_brief_v1(uuid, text, jsonb, text, uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.write_company_role_brief_v1(uuid, text, jsonb, text, uuid, text, boolean, boolean)
  to service_role;
