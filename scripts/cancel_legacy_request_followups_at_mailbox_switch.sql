-- PR-9 (one company↔candidate message path): state change. Run once, right
-- after web deploy B, after reading check_legacy_company_contacts_before_mailbox_switch.sql.
--
-- Cancels only the pending follow-ups of old company requests (not Ops-only),
-- so they cannot re-ask a question the candidate may already have answered
-- through the mailbox. Rows are kept: requests, follow-ups and their history
-- stay; only status becomes 'cancelled'. Each row goes through
-- change_company_followup_v1, the existing cancel path, which records its
-- usual event and reports not_changeable when a delivery already started.

begin;

do $$
declare pending int;
begin
  select count(*) into pending
  from public.company_talent_followups f
  join public.company_talent_requests request on request.id = f.source_id
  where f.source_kind = 'contact' and f.status = 'pending'
    and not coalesce(request.ops_only, false);
  raise notice 'pending follow-ups of old company requests: %', pending;
  -- About 5 were expected on 2026-11-11. Many more means something else is going on.
  if pending > 20 then
    raise exception 'expected about 5 pending follow-ups, found %; nothing was changed', pending;
  end if;
end $$;

with pending as (
  select f.id, f.company_workspace_id, f.revision
  from public.company_talent_followups f
  join public.company_talent_requests request on request.id = f.source_id
  where f.source_kind = 'contact' and f.status = 'pending'
    and not coalesce(request.ops_only, false)
  order by f.due_at
  for update of f
)
select pending.id as followup_id,
  public.change_company_followup_v1(pending.company_workspace_id, pending.id,
    pending.revision, 'cancel', null, null) ->> 'status' as result
from pending;

-- Expected 0 (or only rows reported not_changeable above).
select count(*) as still_pending
from public.company_talent_followups f
join public.company_talent_requests request on request.id = f.source_id
where f.source_kind = 'contact' and f.status = 'pending'
  and not coalesce(request.ops_only, false);

commit;
