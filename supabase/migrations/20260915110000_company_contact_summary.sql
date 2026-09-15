begin;

-- Reuse the exact workspace contact index used by list_contacts. The summary is
-- intentionally counts-only: detailed records remain available through the
-- existing list/read path, while the company-side LLM gets enough default
-- context to avoid treating an absent detail row as an empty contact history.
create or replace function public.summarize_company_contact_index_v1(
  p_company_workspace_id uuid,
  p_window_start timestamptz,
  p_as_of timestamptz
)
returns table (
  window_start timestamptz,
  as_of timestamptz,
  recent_active_draft_count bigint,
  recent_sent_count bigint,
  recent_response_contact_count bigint,
  all_sent_count bigint,
  all_response_contact_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  contact_row record;
  page_count integer;
  page_offset integer := 0;
  page_size constant integer := 101;
  resolved_as_of timestamptz := coalesce(p_as_of, statement_timestamp());
  resolved_window_start timestamptz := p_window_start;
  counted_recent_active_drafts bigint := 0;
  counted_recent_sent bigint := 0;
  counted_recent_responses bigint := 0;
  counted_all_sent bigint := 0;
  counted_all_responses bigint := 0;
begin
  if resolved_window_start is null or resolved_window_start > resolved_as_of then
    raise exception 'invalid_company_contact_summary_window';
  end if;

  loop
    page_count := 0;
    for contact_row in
      select contact.*
      from public.list_company_contact_index_v2(
        p_company_workspace_id,
        null,
        null,
        null,
        null,
        'updated',
        null,
        null,
        page_offset,
        page_size
      ) contact
    loop
      page_count := page_count + 1;

      if contact_row.sent_at is not null
        and contact_row.sent_at <= resolved_as_of then
        counted_all_sent := counted_all_sent + 1;
        if contact_row.sent_at >= resolved_window_start
          and contact_row.sent_at <= resolved_as_of then
          counted_recent_sent := counted_recent_sent + 1;
        end if;
      end if;

      if coalesce(contact_row.has_response, false)
        and contact_row.response_received_at is not null
        and contact_row.response_received_at <= resolved_as_of then
        counted_all_responses := counted_all_responses + 1;
        if contact_row.response_received_at >= resolved_window_start
          and contact_row.response_received_at <= resolved_as_of then
          counted_recent_responses := counted_recent_responses + 1;
        end if;
      end if;

      if contact_row.kind = 'contact'
        and contact_row.workflow_status = 'draft'
        and contact_row.created_at >= resolved_window_start
        and contact_row.created_at <= resolved_as_of
        and contact_row.expires_at > resolved_as_of then
        counted_recent_active_drafts := counted_recent_active_drafts + 1;
      end if;
    end loop;

    exit when page_count < page_size;
    page_offset := page_offset + page_size;
  end loop;

  return query
  select
    resolved_window_start,
    resolved_as_of,
    counted_recent_active_drafts,
    counted_recent_sent,
    counted_recent_responses,
    counted_all_sent,
    counted_all_responses;
end;
$$;

revoke all on function public.summarize_company_contact_index_v1(
  uuid, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.summarize_company_contact_index_v1(
  uuid, timestamptz, timestamptz
) to service_role;

commit;
