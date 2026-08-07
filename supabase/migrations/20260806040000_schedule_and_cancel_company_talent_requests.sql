begin;

-- Candidate contact is intentionally delayed so the company has a practical
-- cancellation window. The queue timestamp remains the single delivery clock.
create or replace function public.enqueue_company_talent_request_v1(
  p_workspace_id uuid,
  p_role_id uuid,
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_source_company_message_id bigint,
  p_expects_document boolean,
  p_request_context text
)
returns public.company_talent_requests
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
  update public.company_talent_requests set
    workflow_status = 'closed'
  where talent_id = p_talent_id
    and expires_at <= v_now
    and workflow_status in (
      'queued', 'awaiting_talent', 'relay_queued', 'review_required'
    );

  select * into v_request
  from public.company_talent_requests
  where source_company_message_id = p_source_company_message_id
  for update;
  if found then return v_request; end if;

  if not exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role on role.role_id = recommendation.role_id
    join public.company_messages message
      on message.id = p_source_company_message_id
    where recommendation.id = p_recommendation_id
      and recommendation.talent_id = p_talent_id
      and recommendation.role_id = p_role_id
      and role.company_workspace_id = p_workspace_id
      and message.company_workspace_id = p_workspace_id
      and message.role = 'user'
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'company_talent_request_target_not_found';
  end if;

  v_earliest_at := v_now + interval '20 minutes';
  v_earliest_kst := v_earliest_at at time zone 'Asia/Seoul';
  v_scheduled_at := case
    when v_earliest_kst::time < time '08:00'
      then (v_earliest_kst::date + time '08:00') at time zone 'Asia/Seoul'
    when v_earliest_kst::time >= time '20:00'
      then ((v_earliest_kst::date + 1) + time '08:00') at time zone 'Asia/Seoul'
    else v_earliest_at
  end;

  insert into public.company_talent_requests (
    company_workspace_id, role_id, recommendation_id, talent_id,
    source_company_message_id, expects_document, request_context
  ) values (
    p_workspace_id, p_role_id, p_recommendation_id, p_talent_id,
    p_source_company_message_id, p_expects_document, btrim(p_request_context)
  ) returning * into v_request;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) values (
    p_talent_id, 'company_request_candidate_delivery', 'queued',
    jsonb_build_object('requestId', v_request.id), v_scheduled_at, p_role_id,
    p_recommendation_id, v_request.id
  );
  return v_request;
end;
$$;

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

  update public.company_talent_requests set
    workflow_status = 'closed'
  where id = p_request_id;

  return jsonb_build_object(
    'status', 'cancelled',
    'requestId', p_request_id,
    'cancelledAt', coalesce(v_queue.cancelled_at, v_now),
    'idempotent', false
  );
end;
$$;

revoke all on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) from public, anon, authenticated;
grant execute on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) to service_role;

revoke all on function public.cancel_company_talent_request_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.cancel_company_talent_request_v1(
  uuid, uuid, uuid, uuid
) to service_role;

commit;
