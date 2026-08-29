begin;

-- Keep the 20-minute cancellation window for standard candidate contact, but
-- stop moving after-hours approvals into a separate KST delivery window.
-- Existing queue rows retain their already-recorded scheduled_at values.
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
  v_scheduled_at timestamptz := v_now + interval '20 minutes';
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

  v_scheduled_at := case
    when p_delivery_mode = 'immediate' then v_now
    else v_now + interval '20 minutes'
  end;

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

revoke all on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) from public, anon, authenticated;
grant execute on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) to service_role;

revoke all on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) to service_role;

commit;
