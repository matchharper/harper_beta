-- Separate company messages to the same candidate are independent requests. Keep
-- source-message idempotency, but do not reserve one open slot per Role pair.
drop index if exists public.company_talent_requests_workspace_role_talent_open_uidx;

create or replace function public.send_company_talent_contact_v1(
  p_request_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_source_company_message_id bigint,
  p_subject text,
  p_body text,
  p_request_context text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_delivery public.contact_queue%rowtype;
  v_now timestamptz := transaction_timestamp();
begin
  if nullif(btrim(p_subject), '') is null
     or nullif(btrim(p_body), '') is null
     or nullif(btrim(p_request_context), '') is null then
    raise exception 'company_talent_contact_copy_required';
  end if;

  if length(p_subject) > 180
     or length(p_body) > 5000
     or length(p_request_context) > 800 then
    raise exception 'company_talent_contact_copy_too_long';
  end if;

  if not exists (
    select 1
    from public.company_messages message
    where message.id = p_source_company_message_id
      and message.company_workspace_id = p_workspace_id
      and message.role = 'user'
  ) then
    raise exception 'company_talent_contact_source_not_found';
  end if;

  -- Serialize only retries of this exact user message and target. An older
  -- draft or delivery for the same candidate must not block a new message.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'company-contact-source:'
        || p_workspace_id::text || ':'
        || p_role_id::text || ':'
        || p_talent_id::text || ':'
        || p_source_company_message_id::text,
      0
    )
  );

  select *
  into v_request
  from public.company_talent_requests request
  where request.company_workspace_id = p_workspace_id
    and request.role_id = p_role_id
    and request.talent_id = p_talent_id
    and request.source_company_message_id = p_source_company_message_id
  order by request.created_at desc, request.id desc
  limit 1
  for update;

  if found then
    select *
    into v_delivery
    from public.contact_queue delivery
    where delivery.company_talent_request_id = v_request.id
      and delivery.type = 'company_request_candidate_delivery'
    order by delivery.created_at desc, delivery.id desc
    limit 1;

    return jsonb_build_object(
      'requestId', v_request.id,
      'status', coalesce(v_delivery.status, v_request.workflow_status),
      'scheduledAt', v_delivery.scheduled_at,
      'idempotent', true
    );
  end if;

  if not public.company_talent_pair_is_contactable_v1(
    p_workspace_id,
    p_role_id,
    p_talent_id,
    p_recommendation_id
  ) then
    raise exception 'company_talent_request_target_not_active';
  end if;

  insert into public.company_talent_requests (
    id,
    company_workspace_id,
    role_id,
    talent_id,
    recommendation_id,
    source_company_message_id,
    contact_kind,
    delivery_subject,
    delivery_body,
    request_context,
    draft_revision,
    expects_document,
    intent,
    workflow_status,
    approved_at,
    expires_at
  ) values (
    p_request_id,
    p_workspace_id,
    p_role_id,
    p_talent_id,
    p_recommendation_id,
    p_source_company_message_id,
    'contact',
    btrim(p_subject),
    btrim(p_body),
    btrim(p_request_context),
    1,
    false,
    'ordinary',
    'queued',
    v_now,
    'infinity'
  )
  returning * into v_request;

  insert into public.contact_queue (
    user_id,
    type,
    status,
    payload,
    scheduled_at,
    role_id,
    recommendation_id,
    company_talent_request_id
  ) values (
    p_talent_id,
    'company_request_candidate_delivery',
    'queued',
    jsonb_build_object(
      'requestId', v_request.id,
      'deliveryMode', 'immediate',
      'delivery', jsonb_build_object(
        'subject', v_request.delivery_subject,
        'chatText', v_request.delivery_body,
        'draftRevision', 1
      )
    ),
    v_now,
    p_role_id,
    p_recommendation_id,
    v_request.id
  );

  return jsonb_build_object(
    'requestId', v_request.id,
    'status', 'queued',
    'scheduledAt', v_now,
    'idempotent', false
  );
end;
$$;

revoke all on function public.send_company_talent_contact_v1(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text
) from public, anon, authenticated;

grant execute on function public.send_company_talent_contact_v1(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text
) to service_role;
