begin;

-- Keep the company-approved candidate copy on the existing request row. A
-- draft has no contact_queue item; scheduling promotes that same row and
-- snapshots the approved copy into the queue atomically.
alter table public.company_talent_requests
  add column if not exists delivery_subject text,
  add column if not exists delivery_body text,
  add column if not exists draft_revision integer not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Existing requests were approved when their candidate-delivery outbox item
-- was created. Drafts have no outbox item and therefore remain unapproved.
update public.company_talent_requests request
set approved_at = delivery.created_at
from (
  select distinct on (company_talent_request_id)
    company_talent_request_id, created_at
  from public.contact_queue
  where type = 'company_request_candidate_delivery'
    and company_talent_request_id is not null
  order by company_talent_request_id, created_at
) delivery
where request.id = delivery.company_talent_request_id
  and request.approved_at is null;

update public.company_talent_requests request
set updated_at = greatest(
  request.created_at,
  coalesce(
    (
      select max(queue.updated_at)
      from public.contact_queue queue
      where queue.company_talent_request_id = request.id
    ),
    request.created_at
  )
)
where request.updated_at is null;

alter table public.company_talent_requests
  alter column updated_at set default transaction_timestamp(),
  alter column updated_at set not null;

create or replace function public.touch_company_talent_request_updated_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := transaction_timestamp();
  return new;
end;
$$;

drop trigger if exists company_talent_requests_touch_updated_at
  on public.company_talent_requests;
create trigger company_talent_requests_touch_updated_at
before update on public.company_talent_requests
for each row execute function public.touch_company_talent_request_updated_at_v1();

update public.company_talent_requests
set workflow_status = 'closed'
where expires_at <= transaction_timestamp()
  and workflow_status = 'draft';

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
      'draft', 'queued', 'failed', 'awaiting_talent', 'relay_queued',
      'review_required'
    );

  if new.expires_at <= transaction_timestamp()
     and new.workflow_status in (
       'draft', 'queued', 'failed', 'awaiting_talent', 'relay_queued',
       'review_required'
     ) then
    new.workflow_status := 'closed';
  end if;
  return new;
end;
$$;

drop index if exists public.company_talent_requests_workspace_role_talent_open_uidx;
create unique index company_talent_requests_workspace_role_talent_open_uidx
  on public.company_talent_requests(company_workspace_id, role_id, talent_id)
  where workflow_status in (
    'draft', 'queued', 'failed', 'awaiting_talent', 'relay_queued',
    'review_required'
  );

create or replace function public.schedule_company_talent_request_v1(
  p_request_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid,
  p_expected_revision integer,
  p_delivery_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_now timestamptz := transaction_timestamp();
  v_earliest_at timestamptz;
  v_earliest_kst timestamp;
  v_scheduled_at timestamptz;
begin
  if p_delivery_mode is null
     or p_delivery_mode not in ('standard', 'immediate') then
    raise exception using
      errcode = '22023',
      message = 'company_talent_request_delivery_mode_invalid';
  end if;

  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and company_workspace_id = p_workspace_id
    and role_id = p_role_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'company_talent_request_not_found';
  end if;
  if v_request.workflow_status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_not_draft';
  end if;
  if v_request.expires_at <= v_now then
    update public.company_talent_requests
    set workflow_status = 'closed'
    where id = p_request_id;
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_draft_expired';
  end if;
  if v_request.draft_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'company_talent_request_draft_stale';
  end if;
  if length(btrim(coalesce(v_request.delivery_subject, ''))) = 0
     or length(btrim(coalesce(v_request.delivery_body, ''))) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_draft_incomplete';
  end if;
  if not public.company_talent_request_stage_is_pending_v1(p_request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_stage_not_pending';
  end if;

  if p_delivery_mode = 'immediate' then
    v_scheduled_at := v_now;
  else
    v_earliest_at := v_now + interval '20 minutes';
    v_earliest_kst := v_earliest_at at time zone 'Asia/Seoul';
    v_scheduled_at := case
      when v_earliest_kst::time < time '08:00'
        then (v_earliest_kst::date + time '08:00') at time zone 'Asia/Seoul'
      when v_earliest_kst::time >= time '20:00'
        then ((v_earliest_kst::date + 1) + time '08:00') at time zone 'Asia/Seoul'
      else v_earliest_at
    end;
  end if;

  update public.company_talent_requests
  set workflow_status = 'queued',
      approved_at = coalesce(approved_at, v_now)
  where id = p_request_id;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) values (
    v_request.talent_id,
    'company_request_candidate_delivery',
    'queued',
    jsonb_build_object(
      'requestId', v_request.id,
      'deliveryMode', p_delivery_mode,
      'delivery', jsonb_build_object(
        'subject', v_request.delivery_subject,
        'chatText', v_request.delivery_body,
        'draftRevision', v_request.draft_revision
      )
    ),
    v_scheduled_at,
    v_request.role_id,
    v_request.recommendation_id,
    v_request.id
  );

  return jsonb_build_object(
    'status', case when p_delivery_mode = 'immediate' then 'immediate' else 'queued' end,
    'requestId', v_request.id,
    'scheduledAt', v_scheduled_at,
    'revision', v_request.draft_revision
  );
end;
$$;

-- Draft cancellation has no queue row. Once scheduled, retain the existing
-- queue-state guards so a processing or sent email can never be re-labelled as
-- cancelled.
create or replace function public.cancel_company_talent_request_v1(
  p_request_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_queue public.contact_queue%rowtype;
  v_now timestamptz := transaction_timestamp();
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and company_workspace_id = p_workspace_id
    and role_id = p_role_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'company_talent_request_not_found';
  end if;

  if v_request.workflow_status = 'draft' then
    update public.company_talent_requests
    set workflow_status = 'closed'
    where id = p_request_id;
    return jsonb_build_object(
      'status', 'cancelled',
      'requestId', p_request_id,
      'cancelledAt', v_now,
      'idempotent', false
    );
  end if;

  select * into v_queue
  from public.contact_queue
  where company_talent_request_id = p_request_id
    and type = 'company_request_candidate_delivery'
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'company_talent_request_delivery_not_found';
  end if;

  if v_queue.status = 'cancelled' and v_request.workflow_status = 'closed' then
    return jsonb_build_object(
      'status', 'cancelled',
      'requestId', p_request_id,
      'cancelledAt', v_queue.cancelled_at,
      'idempotent', true
    );
  end if;
  if v_queue.status not in ('queued', 'failed')
     or v_request.workflow_status not in ('queued', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_not_cancellable';
  end if;

  update public.contact_queue set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, v_now),
    locked_at = null,
    locked_by = null,
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{cancellation}',
      jsonb_build_object('source', 'company', 'at', v_now),
      true
    ),
    updated_at = v_now
  where id = v_queue.id;

  update public.company_talent_requests
  set workflow_status = 'closed'
  where id = p_request_id;

  return jsonb_build_object(
    'status', 'cancelled',
    'requestId', p_request_id,
    'cancelledAt', coalesce(v_queue.cancelled_at, v_now),
    'idempotent', false
  );
end;
$$;

revoke all on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) to service_role;

revoke all on function public.touch_company_talent_request_updated_at_v1()
  from public, anon, authenticated;

commit;
