-- A delivered candidate email is an independent request. Keep only pre-send
-- requests mutually exclusive so a company can ask another question while a
-- prior sent request is awaiting a reply or being relayed back to the company.

drop index if exists public.company_talent_requests_workspace_role_talent_open_uidx;

create unique index company_talent_requests_workspace_role_talent_open_uidx
  on public.company_talent_requests(company_workspace_id, role_id, talent_id)
  where workflow_status in ('draft', 'queued', 'failed')
    and talent_source_message_id is null
    and document_id is null;
