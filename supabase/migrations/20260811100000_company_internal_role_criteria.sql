begin;

alter table public.company_internal_roles
  add column if not exists criteria jsonb not null default '[]'::jsonb;

update public.company_internal_roles
set criteria = '[]'::jsonb
where criteria is null;

alter table public.company_internal_roles
  alter column criteria set default '[]'::jsonb,
  alter column criteria set not null;

comment on column public.company_internal_roles.criteria is
  'Three to six structured matching dimensions. Each item has non-empty name and criteria strings; empty arrays are reserved for legacy roles and incomplete drafts.';

create or replace function public.update_company_internal_role_criteria_v1(
  p_workspace_id uuid,
  p_role_id uuid,
  p_expected_criteria jsonb,
  p_criteria jsonb,
  p_event_content text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_now timestamptz := now();
begin
  if p_expected_criteria is null
     or jsonb_typeof(p_expected_criteria) <> 'array' then
    raise exception using errcode = '22023', message = 'expected criteria must be an array';
  end if;
  if p_criteria is null
     or jsonb_typeof(p_criteria) <> 'array'
     or jsonb_array_length(p_criteria) < 3
     or jsonb_array_length(p_criteria) > 6 then
    raise exception using errcode = '22023', message = 'criteria must contain three to six items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_criteria) item
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item ->> 'name'), '') is null
       or nullif(btrim(item ->> 'criteria'), '') is null
       or char_length(item ->> 'name') > 200
       or char_length(item ->> 'criteria') > 8000
  ) then
    raise exception using errcode = '22023', message = 'criteria items require valid name and criteria strings';
  end if;
  if p_source not in ('chat', 'slack', 'website') then
    raise exception using errcode = '22023', message = 'unsupported company event source';
  end if;
  if nullif(btrim(p_event_content), '') is null
     or char_length(p_event_content) > 300 then
    raise exception using errcode = '22023', message = 'invalid company event content';
  end if;

  select coalesce(cir.criteria, '[]'::jsonb)
  into v_current
  from public.company_roles r
  join public.company_internal_roles cir on cir.role_id = r.role_id
  where r.company_workspace_id = p_workspace_id
    and r.role_id = p_role_id
    and r.source_type = 'internal'
    and r.is_expired is not true
  for update of r, cir;

  if not found then
    raise exception using errcode = 'P0002', message = 'internal role not found';
  end if;
  if v_current is distinct from p_expected_criteria then
    return jsonb_build_object('status', 'conflict');
  end if;
  if v_current = p_criteria then
    return jsonb_build_object('status', 'already_reflected');
  end if;

  update public.company_internal_roles
  set criteria = p_criteria, updated_at = v_now
  where role_id = p_role_id;

  update public.company_roles
  set updated_at = v_now
  where role_id = p_role_id;

  insert into public.company_events(workspace_id, content, source, created_at)
  values (p_workspace_id, p_event_content, p_source, v_now);

  return jsonb_build_object('status', 'updated');
end;
$$;

revoke all on function public.update_company_internal_role_criteria_v1(
  uuid, uuid, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.update_company_internal_role_criteria_v1(
  uuid, uuid, jsonb, jsonb, text, text
) to service_role;

comment on function public.update_company_internal_role_criteria_v1(
  uuid, uuid, jsonb, jsonb, text, text
) is 'Atomically validates and updates structured internal-role criteria with optimistic concurrency and an audit event.';

commit;
