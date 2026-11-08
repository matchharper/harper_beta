-- One save is one Brief version, with who and where (#249, #260).
--
-- Brief versions (20261105080000) take one version per transaction and read
-- who and where from harper.hiring_brief_change_context. Two kinds of web
-- saves still left versions without them, or split one save into two:
--
-- - Role facts alone (name, location, work mode, type) went through
--   apply_company_data_changes_v1, which sets no context; the salary text was
--   then written in a second transaction.
-- - Ops edits went through the same writer as company website saves, so their
--   versions and history said "website" with no person.
--
-- apply_company_data_with_hiring_history_v2 is v1 with two additions:
-- p_change_source (where, for versions and history, when it is not the
-- company data source: "ops") and p_salary_range (a role's salary text,
-- written as given in the same transaction, as the website and the role
-- creation chat wrote it before). The company data writers it calls and their
-- checks are unchanged.
--
-- A role start session created with an empty Brief ('{}') is not a Brief
-- change: the version snapshot reads it as no structured Brief, as before the
-- session existed. Only the hash of such versions changes; no search reads it.

create or replace function public.apply_company_data_with_hiring_history_v2(
  p_workspace_id uuid,
  p_changes jsonb,
  p_criteria_changes jsonb,
  p_source text,
  p_event_content text,
  p_actor_user_id uuid,
  p_actor_label text,
  p_request_review boolean default false,
  p_change_source text default null,
  p_salary_range jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb := jsonb_build_object('status', 'already_reflected', 'changed_count', 0);
  v_criterion jsonb;
  v_criteria_result jsonb;
  v_history_ids jsonb;
  v_error_detail text;
  v_salary text;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_criteria_changes) is distinct from 'array' then
    raise exception 'Changes must be arrays';
  end if;
  if p_salary_range is not null and (
    jsonb_typeof(p_salary_range) is distinct from 'object'
    or nullif(p_salary_range ->> 'role_id', '') is null
    or jsonb_typeof(p_salary_range -> 'value') not in ('string', 'null')
    or char_length(coalesce(p_salary_range ->> 'value', '')) > 1000
  ) then
    raise exception using errcode = '22023', message = 'salary range needs role_id and a text value of at most 1000 characters or null';
  end if;
  if p_request_review and (p_source <> 'website' or p_actor_user_id is null) then
    raise exception 'Web review request requires an authenticated website save';
  end if;
  -- Who and where for the Brief and settings versions and the Brief history.
  perform set_config('harper.hiring_brief_change_context', jsonb_build_object(
    'actorUserId', p_actor_user_id, 'actorLabel', p_actor_label,
    'source', coalesce(nullif(btrim(coalesce(p_change_source, '')), ''), p_source),
    'requestReview', p_request_review)::text, true);
  begin
    if jsonb_array_length(p_changes) > 0 then
      if exists (select 1 from jsonb_array_elements(p_changes) c where c ->> 'key' = 'salaryRange') then
        v_result := public.apply_company_data_changes_with_role_salary_v1(p_workspace_id, p_changes, p_source, p_event_content);
      else
        v_result := public.apply_company_data_changes_v1(p_workspace_id, p_changes, p_source, p_event_content);
      end if;
      if v_result ->> 'status' = 'conflict' then
        raise exception using errcode = 'P0099', message = 'Hiring Brief save conflict', detail = v_result::text;
      end if;
    end if;
    for v_criterion in select value from jsonb_array_elements(p_criteria_changes) loop
      v_criteria_result := public.update_company_internal_role_criteria_v1(p_workspace_id,
        (v_criterion ->> 'role_id')::uuid, v_criterion -> 'expected', v_criterion -> 'value', p_event_content, p_source);
      if v_criteria_result ->> 'status' = 'conflict' then
        raise exception using errcode = 'P0099', message = 'Hiring Brief save conflict',
          detail = jsonb_build_object('status', 'conflict', 'key', 'criteria', 'role_id', v_criterion ->> 'role_id')::text;
      end if;
      if v_criteria_result ->> 'status' = 'updated' then
        v_result := jsonb_build_object('status', 'updated',
          'changed_count', coalesce((v_result ->> 'changed_count')::int, 0) + 1);
      end if;
    end loop;
    -- The salary text as given (no stored-value check, as before). draft_only:
    -- only while the role is still a draft (the role creation chat).
    if p_salary_range is not null then
      v_salary := case when jsonb_typeof(p_salary_range -> 'value') = 'null' then null
        else p_salary_range ->> 'value' end;
      update public.company_roles role
      set salary_range = v_salary, updated_at = now()
      where role.role_id = (p_salary_range ->> 'role_id')::uuid
        and role.company_workspace_id = p_workspace_id
        and role.salary_range is distinct from v_salary
        and (not coalesce((p_salary_range ->> 'draft_only')::boolean, false) or role.status = 'draft');
      if found then
        v_result := jsonb_build_object('status', 'updated',
          'changed_count', coalesce((v_result ->> 'changed_count')::int, 0) + 1);
      end if;
    end if;
  exception when sqlstate 'P0099' then
    get stacked diagnostics v_error_detail = pg_exception_detail;
    return v_error_detail::jsonb;
  end;
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_history_ids
  from public.company_role_hiring_brief_history
  where transaction_id = txid_current() and company_workspace_id = p_workspace_id;
  return v_result || jsonb_build_object('history_ids', v_history_ids);
end;
$$;

revoke all on function public.apply_company_data_with_hiring_history_v2(uuid, jsonb, jsonb, text, text, uuid, text, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_company_data_with_hiring_history_v2(uuid, jsonb, jsonb, text, text, uuid, text, boolean, text, jsonb)
  to service_role;

create or replace function public.company_role_brief_snapshot_v1(p_role_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'search', public.company_role_search_brief_snapshot_v1(p_role_id),
    'sessionBrief', (
      select nullif(session.brief, '{}'::jsonb) from public.company_role_start_sessions session
      where session.role_id = p_role_id
    )
  );
$$;
