begin;

-- Change an existing candidate-contact delivery without replacing its request.
-- "immediate" is an explicit company override of the default delay/window.
create or replace function public.change_company_talent_request_v1(
  p_action text,
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
  if p_action is null or p_action not in ('cancel', 'immediate') then
    raise exception using
      errcode = '22023',
      message = 'company_talent_request_action_invalid';
  end if;

  if p_action = 'cancel' then
    return public.cancel_company_talent_request_v1(
      p_request_id,
      p_workspace_id,
      p_role_id,
      p_talent_id
    );
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

  if v_queue.status = 'queued'
     and v_request.workflow_status = 'queued'
     and v_queue.payload ->> 'deliveryMode' = 'immediate'
     and v_queue.scheduled_at <= v_now
     and v_queue.attempts = 0
     and v_queue.last_error is null then
    return jsonb_build_object(
      'status', 'immediate',
      'requestId', p_request_id,
      'scheduledAt', v_queue.scheduled_at,
      'idempotent', true
    );
  end if;

  if v_queue.status not in ('queued', 'failed')
     or v_request.workflow_status not in ('queued', 'failed') then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_not_changeable';
  end if;

  update public.contact_queue set
    status = 'queued',
    scheduled_at = v_now,
    attempts = 0,
    last_error = null,
    locked_at = null,
    locked_by = null,
    cancelled_at = null,
    payload = coalesce(payload, '{}'::jsonb)
      || jsonb_build_object(
        'deliveryMode', 'immediate',
        'deliveryChange', jsonb_build_object(
          'action', 'immediate',
          'source', 'company',
          'at', v_now
        )
      ),
    updated_at = v_now
  where id = v_queue.id;

  update public.company_talent_requests set
    workflow_status = 'queued'
  where id = p_request_id;

  return jsonb_build_object(
    'status', 'immediate',
    'requestId', p_request_id,
    'scheduledAt', v_now,
    'idempotent', false
  );
end;
$$;

revoke all on function public.change_company_talent_request_v1(
  text, uuid, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.change_company_talent_request_v1(
  text, uuid, uuid, uuid, uuid
) to service_role;

commit;
