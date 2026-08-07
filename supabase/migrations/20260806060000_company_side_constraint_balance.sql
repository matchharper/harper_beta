begin;

-- The original queue index accidentally made every queue type a once-ever
-- delivery per recommendation. Only internal connection confirmation needs
-- that idempotency rule; company talent requests have their own durable ID.
drop index if exists public.contact_queue_type_recommendation_uidx;
create unique index if not exists contact_queue_internal_connection_recommendation_uidx
  on public.contact_queue(type, recommendation_id)
  where type = 'internal_connection_confirmed';

-- Keep one unresolved candidate contact per company, role, and talent. This is
-- intentionally narrower than a talent-wide lock: another company or another
-- role may have its own request, and closed requests never block replacements.
update public.company_talent_requests
set workflow_status = 'closed'
where expires_at <= transaction_timestamp()
  and workflow_status in (
    'queued', 'failed', 'awaiting_talent', 'relay_queued', 'review_required'
  );

create or replace function public.close_expired_company_talent_request_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_talent_requests request
  set workflow_status = 'closed'
  where request.company_workspace_id = new.company_workspace_id
    and request.role_id = new.role_id
    and request.talent_id = new.talent_id
    and request.expires_at <= transaction_timestamp()
    and request.workflow_status in (
      'queued', 'failed', 'awaiting_talent', 'relay_queued', 'review_required'
    );

  if new.expires_at <= transaction_timestamp()
     and new.workflow_status in (
       'queued', 'failed', 'awaiting_talent', 'relay_queued', 'review_required'
     ) then
    new.workflow_status := 'closed';
  end if;
  return new;
end;
$$;

drop trigger if exists company_talent_requests_close_expired_scope
  on public.company_talent_requests;
create trigger company_talent_requests_close_expired_scope
before insert on public.company_talent_requests
for each row
execute function public.close_expired_company_talent_request_scope_v1();

revoke all on function public.close_expired_company_talent_request_scope_v1()
  from public, anon, authenticated;

create unique index if not exists company_talent_requests_workspace_role_talent_open_uidx
  on public.company_talent_requests(company_workspace_id, role_id, talent_id)
  where workflow_status in (
    'queued', 'failed', 'awaiting_talent', 'relay_queued', 'review_required'
  );

-- Employment labels are descriptive provider/company data, not a database
-- state machine. Preserve unfamiliar but valid values instead of rejecting or
-- deleting them merely because the current UI has four shortcuts.
alter table public.company_roles
  drop constraint if exists company_roles_type_check;
comment on column public.company_roles.type is
  'Employment type labels. Known values are normalized by writers, while provider- or company-specific labels are preserved.';

-- Keep the existing validator for structural fields, but give extensible
-- employment labels a deliberately wider contract.
do $$
begin
  if to_regprocedure(
       'public.validate_company_data_change_value_strict_v1(text,jsonb,text)'
     ) is null then
    alter function public.validate_company_data_change_value_v1(text, jsonb, text)
      rename to validate_company_data_change_value_strict_v1;
  end if;
end;
$$;

create or replace function public.validate_company_data_change_value_v1(
  p_key text,
  p_value jsonb,
  p_source text
)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_key <> 'role_employment_types' then
    perform public.validate_company_data_change_value_strict_v1(
      p_key, p_value, p_source
    );
    return;
  end if;

  if jsonb_typeof(p_value) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'role_employment_types must be an array';
  end if;
  if jsonb_array_length(p_value) > 12 then
    raise exception using
      errcode = '22023',
      message = 'role_employment_types exceeds 12 items';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_value) item
    where jsonb_typeof(item) <> 'string'
      or char_length(item #>> '{}') > 120
  ) then
    raise exception using
      errcode = '22023',
      message = 'role_employment_types items must be strings of at most 120 characters';
  end if;
end;
$$;

revoke all on function public.validate_company_data_change_value_v1(
  text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.validate_company_data_change_value_strict_v1(
  text, jsonb, text
) from public, anon, authenticated;

-- Event sources are descriptive telemetry labels. Unknown labels do not break
-- event readers, so an enum CHECK only makes new company-side surfaces brittle.
alter table public.company_events
  drop constraint if exists company_events_source_check;
alter table public.company_events
  add constraint company_events_source_shape_check
  check (char_length(btrim(source)) between 1 and 80);
comment on column public.company_events.source is
  'Extensible company-side event source label, bounded only for storage hygiene.';

commit;
