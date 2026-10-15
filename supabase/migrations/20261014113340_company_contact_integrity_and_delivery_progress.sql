-- Company-authorized contact does not require a particular hiring stage,
-- recommendation decision, prior introduction, or earlier correspondence.
-- The shared predicate is retained only for target integrity and hard boundaries;
-- draft creation, scheduling, direct contact, and both delivery runtimes use it.
create or replace function public.company_talent_pair_is_contactable_v1(
  p_workspace_id uuid, p_role_id uuid, p_talent_id uuid, p_recommendation_id uuid
)
returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_roles role
    join public.talent_opportunity_recommendation recommendation
      on recommendation.role_id = role.role_id
     and recommendation.talent_id = p_talent_id
     and recommendation.id = p_recommendation_id
    join public.talent_users talent on talent.user_id = p_talent_id
    where role.role_id = p_role_id
      and role.company_workspace_id = p_workspace_id
      and coalesce(role.status, 'active') not in ('ended', 'deleted')
      and not coalesce(role.is_expired, false)
      and talent.deleted_at is null
      and nullif(btrim(talent.email), '') is not null
      and (
        not coalesce((role.information ->> 'testOnly')::boolean, false)
        or coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false)
      )
  );
$$;

create or replace function public.company_talent_request_target_is_active_v1(
  p_request_id uuid
)
returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$
  select coalesce((
    select public.company_talent_pair_is_contactable_v1(
      request.company_workspace_id, request.role_id,
      request.talent_id, request.recommendation_id
    )
    from public.company_talent_requests request
    where request.id = p_request_id
  ), false);
$$;

revoke all on function public.company_talent_pair_is_contactable_v1(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.company_talent_request_target_is_active_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.company_talent_pair_is_contactable_v1(uuid, uuid, uuid, uuid)
  to service_role;
grant execute on function public.company_talent_request_target_is_active_v1(uuid)
  to service_role;

-- The old sent-contact progress function exists without an attached trigger.
-- Record durable delivery facts from the shared outbox so Python and Vercel
-- deliveries have the same history. Never infer a send from a queued request
-- or a provider checkpoint alone, and never swallow a history-write failure.
create or replace function public.record_contact_queue_org_candidate_activity_v1()
returns trigger
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_company_user_id uuid;
  v_event_type text;
  v_event_key text;
  v_text text;
  v_subject text;
  v_recipient text;
  v_created_at timestamptz;
begin
  if new.type not in ('company_request_candidate_delivery', 'company_request_company_delivery')
     or new.company_talent_request_id is null
     or new.status not in ('queued', 'sent', 'failed', 'cancelled') then
    return new;
  end if;
  -- Preserve the historical request-response event in environments that still
  -- use that transport. Current candidate relays have their own progress writer.
  if new.type = 'company_request_company_delivery' and new.status <> 'sent' then
    return new;
  end if;
  if new.status = 'sent' and new.sent_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.scheduled_at is not distinct from old.scheduled_at
     and new.sent_at is not distinct from old.sent_at
     and new.resend_email_id is not distinct from old.resend_email_id
     and new.last_error is not distinct from old.last_error then
    return new;
  end if;

  select * into strict v_request
  from public.company_talent_requests request
  where request.id = new.company_talent_request_id
    and request.talent_id = new.user_id
    and request.role_id = new.role_id
    and request.recommendation_id = new.recommendation_id;
  select message.company_user_id into v_company_user_id
  from public.company_messages message
  where message.id = v_request.source_company_message_id
    and message.company_workspace_id = v_request.company_workspace_id;

  v_event_type := case when new.type = 'company_request_company_delivery'
    then 'candidate_response_received'
    else 'candidate_contact_' || case new.status
      when 'queued' then 'scheduled'
      else new.status end end;
  v_event_key := 'company_talent_request:' || v_request.id::text || ':' || v_event_type;
  v_created_at := case when new.status = 'sent' then new.sent_at
    else coalesce(new.updated_at, new.created_at, transaction_timestamp()) end;
  v_subject := coalesce(
    nullif(btrim(new.payload #>> '{runtimeDelivery,subject}'), ''),
    nullif(btrim(new.payload #>> '{delivery,subject}'), ''),
    v_request.delivery_subject
  );
  v_recipient := coalesce(
    nullif(btrim(new.payload #>> '{runtimeDelivery,to}'), ''),
    nullif(btrim(new.payload #>> '{delivery,to}'), '')
  );
  v_text := case new.status
    when 'sent' then coalesce(
      nullif(btrim(new.payload #>> '{runtimeCopy,body}'), ''),
      nullif(btrim(new.payload #>> '{delivery,chatText}'), ''),
      nullif(btrim(v_request.delivery_body), ''),
      v_request.request_context
    )
    when 'queued' then '후보자에게 보낼 회사 연락을 예약했습니다.'
    when 'failed' then '회사 연락의 발송 처리를 완료하지 못했습니다.'
    when 'cancelled' then '후보자에게 보낼 회사 연락을 취소했습니다.'
  end;
  if new.type = 'company_request_company_delivery' then
    v_company_user_id := null;
    v_subject := null;
    v_recipient := null;
    v_text := coalesce(
      nullif(btrim(new.payload #>> '{delivery,body}'), ''),
      '후보자의 답변을 받았습니다.'
    );
  end if;

  insert into public.talent_progress (
    id, talent_id, role_id, recommendation_id, company_user_id,
    user_id, kind, text, metadata, created_at
  ) values (
    md5(v_event_key)::uuid, v_request.talent_id, v_request.role_id,
    v_request.recommendation_id, v_company_user_id, null,
    'org_candidate_activity', v_text,
    jsonb_strip_nulls(jsonb_build_object(
      'eventKey', v_event_key,
      'eventType', v_event_type,
      'requestId', v_request.id,
      'requestKind', v_request.contact_kind,
      'requestContext', v_request.request_context,
      'contactQueueId', new.id,
      'deliveryStatus', new.status,
      'scheduledAt', new.scheduled_at,
      'sentAt', new.sent_at,
      'cancelledAt', new.cancelled_at,
      'subject', v_subject,
      'toEmail', v_recipient,
      'resendEmailId', new.resend_email_id,
      'lastError', new.last_error,
      'attempts', new.attempts
    )), v_created_at
  )
  on conflict (id) do update
  set text = excluded.text, metadata = excluded.metadata;
  return new;
end;
$$;

revoke all on function public.record_contact_queue_org_candidate_activity_v1()
  from public, anon, authenticated;

drop trigger if exists contact_queue_org_candidate_activity_v1 on public.contact_queue;
create trigger contact_queue_org_candidate_activity_v1
after insert or update of status, scheduled_at, sent_at, resend_email_id, last_error
on public.contact_queue
for each row execute function public.record_contact_queue_org_candidate_activity_v1();

notify pgrst, 'reload schema';
