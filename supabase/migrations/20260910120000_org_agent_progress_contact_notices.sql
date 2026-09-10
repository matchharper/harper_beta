begin;

-- Keep the existing communication projection as the single base reader. V2
-- only adds Harper-delivered progress facts, so future changes to V1 remain
-- available here without copying every communication source.
create or replace function public.list_company_contact_index_v2(
  p_company_workspace_id uuid,
  p_kind text default null,
  p_talent_id uuid default null,
  p_role_id uuid default null,
  p_query text default null,
  p_date_basis text default 'updated',
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (
  source_id uuid,
  kind text,
  talent_id uuid,
  talent_name text,
  talent_email text,
  role_id uuid,
  role_name text,
  company_user_id uuid,
  company_user_name text,
  company_user_email text,
  created_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz,
  activity_at timestamptz,
  workflow_status text,
  delivery_status text,
  relay_status text,
  expects_document boolean,
  expires_at timestamptz,
  relay_sent_at timestamptz,
  has_response boolean,
  response_received_at timestamptz,
  confirmed_start_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with normalized as (
    select
      greatest(coalesce(p_offset, 0), 0) as requested_offset,
      least(greatest(coalesce(p_limit, 20), 1), 101) as requested_limit
  ),
  base_pages as (
    select page_number * 101 as page_offset
    from normalized
    cross join lateral generate_series(
      0,
      (normalized.requested_offset + normalized.requested_limit - 1) / 101
    ) as page_number
  ),
  base_contacts as (
    select contact.*
    from base_pages page
    cross join lateral public.list_company_contact_index_v1(
      p_company_workspace_id,
      p_kind,
      p_talent_id,
      p_role_id,
      p_query,
      p_date_basis,
      p_after,
      p_before,
      page.page_offset,
      101
    ) contact
  ),
  progress_notices as (
    select
      progress.id as source_id,
      'notice'::text as kind,
      progress.talent_id,
      talent.name as talent_name,
      talent.email as talent_email,
      progress.role_id,
      role.name as role_name,
      null::uuid as company_user_id,
      'Harper'::text as company_user_name,
      null::text as company_user_email,
      progress.created_at,
      progress.created_at as sent_at,
      progress.created_at as updated_at,
      progress.created_at as activity_at,
      progress.kind as workflow_status,
      'sent'::text as delivery_status,
      null::text as relay_status,
      false as expects_document,
      null::timestamptz as expires_at,
      null::timestamptz as relay_sent_at,
      false as has_response,
      null::timestamptz as response_received_at,
      null::timestamptz as confirmed_start_at
    from public.talent_progress progress
    join public.company_roles role
      on role.role_id = progress.role_id
     and role.company_workspace_id = p_company_workspace_id
    join public.talent_users talent on talent.user_id = progress.talent_id
    where progress.kind in (
        'internal_process_stopped_notified',
        'company_request_followup_sent'
      )
      and talent.deleted_at is null
      and (p_kind is null or p_kind = 'notice')
      and (p_talent_id is null or progress.talent_id = p_talent_id)
      and (p_role_id is null or progress.role_id = p_role_id)
      and (
        nullif(btrim(p_query), '') is null
        or concat_ws(
          ' ',
          talent.name,
          talent.email,
          role.name,
          'Harper'
        ) ilike '%' || btrim(p_query) || '%'
      )
      and (p_after is null or progress.created_at >= p_after)
      and (p_before is null or progress.created_at < p_before)
  ),
  all_contacts as (
    select * from base_contacts
    union all
    select * from progress_notices
  )
  select contact.*
  from all_contacts contact
  order by contact.activity_at desc, contact.kind, contact.source_id desc
  offset (select requested_offset from normalized)
  limit (select requested_limit from normalized);
$$;

create index if not exists talent_progress_company_contact_notice_idx
  on public.talent_progress (role_id, talent_id, created_at desc, id desc)
  where kind in (
    'internal_process_stopped_notified',
    'company_request_followup_sent'
  );

revoke all on function public.list_company_contact_index_v2(
  uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;

grant execute on function public.list_company_contact_index_v2(
  uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer
) to service_role;

commit;
