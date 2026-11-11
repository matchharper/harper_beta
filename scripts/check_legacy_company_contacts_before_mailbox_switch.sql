-- PR-9 (one company↔candidate message path): read-only check.
-- Run before web deploy A, before and after web deploy B, then once a day for
-- 7 days. It changes nothing (read-only transaction, rolled back).

begin read only;

-- 1. Deploy step 1 (DB) is in place: the known-pair function and the
--    Role-move agent method exist.
select
  to_regprocedure('public.company_knows_candidate_for_role_v1(uuid)') is not null
    as known_pair_function,
  position('ask_candidate_agent' in coalesce(pg_get_functiondef(to_regprocedure(
    'public.move_org_candidate_role_web_v1(uuid,uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,text,boolean,text,text,text)'
  )), '')) > 0 as role_move_agent_method;

-- 2. New rows in the old ledgers. After deploy B both "last 1 day" counts
--    should stay 0 (Ops-only private contact keeps the old path and is excluded).
select 'company_talent_requests (not ops_only)' as ledger, count(*) as total,
  count(*) filter (where created_at >= now() - interval '1 day') as last_1_day,
  max(created_at) as latest
from public.company_talent_requests where not coalesce(ops_only, false)
union all
select 'company_talent_relays', count(*),
  count(*) filter (where relay.created_at >= now() - interval '1 day'), max(relay.created_at)
from public.company_talent_relays relay
left join public.company_talent_requests request on request.id = relay.company_talent_request_id
where not coalesce(request.ops_only, false);

-- 3. Old requests by state (rows stay; awaiting_talent ones are not closed by PR-9).
select workflow_status, count(*) as requests, max(updated_at) as latest_change
from public.company_talent_requests where not coalesce(ops_only, false)
group by workflow_status order by requests desc;

-- 4. Pending follow-ups of old requests: exactly what
--    cancel_legacy_request_followups_at_mailbox_switch.sql cancels. A row whose
--    delivery already started is reported there as not_changeable.
select f.id as followup_id, f.company_workspace_id, f.role_id, f.talent_id,
  f.source_id as request_id, request.workflow_status, f.due_at, f.revision,
  f.delivery_started_at, run.status as delivery_run_status
from public.company_talent_followups f
join public.company_talent_requests request on request.id = f.source_id
left join public.opportunity_discovery_run run on run.id = f.delivery_run_id
where f.source_kind = 'contact' and f.status = 'pending'
  and not coalesce(request.ops_only, false)
order by f.due_at;

-- 5. Old deliveries and old company events still waiting (expected 0 before B).
select delivery.type, delivery.status, count(*) as deliveries
from public.contact_queue delivery
where delivery.status in ('queued', 'processing', 'failed')
  and (delivery.company_talent_request_id is not null or delivery.company_talent_relay_id is not null)
group by delivery.type, delivery.status order by deliveries desc;
select action_name, status, count(*) as jobs
from public.company_agent_web_action_jobs
where action_name = 'candidate_contact_received' and status in ('queued', 'retry', 'processing', 'failed')
group by action_name, status;

-- 6. The mailbox after the switch: messages by direction (7 days), and
--    conversations opened outside an introduction (the widened pairs).
select direction, count(*) as messages, max(created_at) as latest
from public.agent_contact_messages
where created_at >= now() - interval '7 days'
group by direction;
select count(*) as correspondence_roots,
  count(*) filter (where cancelled_at is not null) as withdrawn,
  max(created_at) as latest
from public.agent_contact_messages
where id = root_id and source->>'legacyCorrespondence' = 'true';

rollback;
