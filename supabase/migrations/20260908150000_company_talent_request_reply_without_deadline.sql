begin;

-- The 14-day request deadline is only a cleanup boundary before candidate
-- delivery. Once the provider has accepted the candidate email, a later first
-- reply remains attributable and relayable until the Role itself has ended.
create or replace function public.company_talent_request_target_is_active_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      coalesce(role.status, 'active') not in ('ended', 'deleted')
      and coalesce(role.is_expired, false) = false
      and (role.expires_at is null or role.expires_at > now())
      and (
        exists (
          select 1
          from public.contact_queue delivery
          where delivery.company_talent_request_id = request.id
            and delivery.type = 'company_request_candidate_delivery'
            and delivery.status = 'sent'
            and delivery.sent_at is not null
        )
        or latest_stage.tag in (
          '내부:연결대기',
          '내부:연결됨',
          '내부:최종오퍼',
          '내부:프로세스중단'
        )
        or latest_stage.tag like '내부단계:%'
      )
    from public.company_talent_requests request
    join public.company_roles role on role.role_id = request.role_id
    left join lateral (
      select btrim(tag_row.tag) as tag
      from public.talent_opportunity_tag tag_row
      where tag_row.opportunity_id = request.role_id
        and tag_row.talent_id = request.talent_id
        and (
          btrim(tag_row.tag) in (
            '내부:수락',
            '내부:아카이브',
            '내부:최종오퍼',
            '내부:보류',
            '내부:연결대기',
            '내부:프로세스중단',
            '내부:거절',
            '내부:추천',
            '내부:연결됨'
          )
          or btrim(tag_row.tag) like '내부단계:%'
        )
      order by tag_row.updated_at desc nulls last,
               tag_row.created_at desc nulls last,
               tag_row.id desc
      limit 1
    ) latest_stage on true
    where request.id = p_request_id
  ), false);
$$;

comment on function public.company_talent_request_target_is_active_v1(uuid) is
  'Before delivery, requires a company-visible contactable candidate position. After candidate email delivery, remains true until the Role ends.';

create or replace function public.company_talent_request_stage_is_pending_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.company_talent_request_target_is_active_v1(p_request_id);
$$;

-- Existing sent requests and their reply aliases must receive the same
-- no-deadline behavior as newly sent requests.
update public.company_talent_requests request
set expires_at = 'infinity'::timestamptz
where exists (
  select 1
  from public.contact_queue delivery
  where delivery.company_talent_request_id = request.id
    and delivery.type = 'company_request_candidate_delivery'
    and delivery.status = 'sent'
    and delivery.sent_at is not null
);

update public.email_reply_aliases alias
set expires_at = null
where alias.company_talent_request_id is not null
  and exists (
    select 1
    from public.contact_queue delivery
    where delivery.company_talent_request_id = alias.company_talent_request_id
      and delivery.type = 'company_request_candidate_delivery'
      and delivery.status = 'sent'
      and delivery.sent_at is not null
  );

-- A legacy request may already have been closed by the old deadline before a
-- newer question was created for the same candidate and Role. Let the old,
-- precisely addressed reply enter relay without colliding with the newer
-- unanswered request. Every pre-response state remains uniquely guarded; the
-- old request leaves this index in the same atomic update that records its
-- first response.
drop index if exists public.company_talent_requests_workspace_role_talent_open_uidx;
create unique index company_talent_requests_workspace_role_talent_open_uidx
  on public.company_talent_requests(company_workspace_id, role_id, talent_id)
  where workflow_status in (
    'draft', 'queued', 'failed', 'awaiting_talent', 'relay_queued',
    'review_required'
  )
    and talent_source_message_id is null
    and document_id is null;

-- Drafts used to close without any durable cancellation cause. Record a
-- cancelled candidate-delivery row so read_talent can say who stopped the
-- prepared email instead of guessing from a generic `closed` state.
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
    insert into public.contact_queue (
      user_id, type, status, payload, scheduled_at, cancelled_at, role_id,
      recommendation_id, company_talent_request_id
    ) values (
      v_request.talent_id,
      'company_request_candidate_delivery',
      'cancelled',
      jsonb_build_object(
        'requestId', v_request.id,
        'cancellation', jsonb_build_object('source', 'company', 'at', v_now)
      ),
      v_now,
      v_now,
      v_request.role_id,
      v_request.recommendation_id,
      v_request.id
    )
    on conflict (company_talent_request_id, type)
      where company_talent_request_id is not null do nothing;

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

-- The email-reply LLM decides whether the inbound message answers the company
-- request. This function only validates the durable request relation and queues
-- the relay atomically. `closed` is accepted solely for previously expired,
-- already-sent requests created before this migration.
create or replace function public.record_company_talent_response_v1(
  p_request_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint
)
returns public.company_talent_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_request public.company_talent_requests%rowtype;
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_request_not_found';
  end if;
  if v_request.talent_source_message_id is not null then return v_request; end if;
  if v_request.workflow_status not in ('awaiting_talent', 'closed')
     or not exists (
       select 1
       from public.contact_queue delivery
       where delivery.company_talent_request_id = p_request_id
         and delivery.type = 'company_request_candidate_delivery'
         and delivery.status = 'sent'
         and delivery.sent_at is not null
     ) then
    raise exception using errcode = 'P0001', message = 'company_talent_request_not_answerable';
  end if;
  if not public.company_talent_request_target_is_active_v1(p_request_id) then
    raise exception using errcode = 'P0001', message = 'company_talent_request_role_ended';
  end if;

  update public.company_talent_requests set
    workflow_status = 'relay_queued',
    talent_source_message_id = p_source_message_id,
    expires_at = 'infinity'::timestamptz
  where id = p_request_id returning * into v_request;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) values (
    v_request.talent_id, 'company_request_company_delivery', 'queued',
    jsonb_build_object('requestId', v_request.id), now(),
    v_request.role_id, v_request.recommendation_id, v_request.id
  )
  on conflict (company_talent_request_id, type)
    where company_talent_request_id is not null do nothing;
  return v_request;
end;
$$;

-- A resume attached to a late reply follows the same contract as a text answer.
create or replace function public.finalize_talent_resume_upload_v1(
  p_request_id uuid,
  p_talent_id uuid,
  p_conversation_id uuid,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_extracted_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_document_id uuid;
  v_message_id bigint;
  v_now timestamptz := transaction_timestamp();
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id and talent_id = p_talent_id
  for update;
  if not found or not v_request.expects_document then
    raise exception using errcode = 'P0002', message = 'company_talent_resume_request_not_found';
  end if;
  if v_request.document_id is not null then
    v_message_id := v_request.talent_source_message_id;
    return jsonb_build_object(
      'requestId', v_request.id,
      'documentId', v_request.document_id,
      'messageId', v_message_id,
      'idempotent', true
    );
  end if;
  if v_request.workflow_status not in ('awaiting_talent', 'closed')
     or not exists (
       select 1
       from public.contact_queue delivery
       where delivery.company_talent_request_id = p_request_id
         and delivery.type = 'company_request_candidate_delivery'
         and delivery.status = 'sent'
         and delivery.sent_at is not null
     )
     or not public.company_talent_request_target_is_active_v1(p_request_id) then
    raise exception using errcode = 'P0001', message = 'company_talent_resume_request_not_uploadable';
  end if;

  update public.talent_documents set is_primary = false
  where talent_id = p_talent_id and kind = 'resume' and is_primary;
  insert into public.talent_documents (
    talent_id, kind, file_name, storage_path, content_type, size_bytes,
    extracted_text, is_public, is_primary
  ) values (
    p_talent_id, 'resume', btrim(p_file_name), btrim(p_storage_path),
    nullif(btrim(p_content_type), ''), p_size_bytes,
    nullif(p_extracted_text, ''), true, true
  ) returning id into v_document_id;

  update public.talent_users set
    resume_file_name = btrim(p_file_name),
    resume_storage_path = btrim(p_storage_path),
    resume_text = coalesce(nullif(p_extracted_text, ''), resume_text),
    updated_at = v_now
  where user_id = p_talent_id;

  insert into public.talent_messages (
    user_id, conversation_id, role, content, message_type
  ) values (
    p_talent_id, p_conversation_id, 'user',
    '요청받은 이력서를 업로드했습니다.', 'resume_upload_note'
  ) returning id into v_message_id;
  insert into public.talent_activity_events (
    talent_id, conversation_id, message_id, source, event_type, summary,
    impact_level, changed_domains
  ) values (
    p_talent_id, p_conversation_id, v_message_id, 'system_action',
    'resume_uploaded', '요청받은 이력서를 업로드했습니다.', 'medium',
    array['profile', 'resume']::text[]
  );

  update public.company_talent_requests set
    workflow_status = 'relay_queued',
    document_id = v_document_id,
    talent_source_message_id = v_message_id,
    expires_at = 'infinity'::timestamptz
  where id = p_request_id returning * into v_request;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) values (
    p_talent_id, 'company_request_company_delivery', 'queued',
    jsonb_build_object('requestId', p_request_id), v_now,
    v_request.role_id, v_request.recommendation_id, p_request_id
  )
  on conflict (company_talent_request_id, type)
    where company_talent_request_id is not null do nothing;

  return jsonb_build_object(
    'requestId', p_request_id,
    'documentId', v_document_id,
    'messageId', v_message_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.company_talent_request_target_is_active_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.company_talent_request_stage_is_pending_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.cancel_company_talent_request_v1(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.company_talent_request_target_is_active_v1(uuid)
  to service_role;
grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
  to service_role;
grant execute on function public.cancel_company_talent_request_v1(
  uuid, uuid, uuid, uuid
) to service_role;
grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  to service_role;
grant execute on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
      to harper_worker;
  end if;
end;
$$;

commit;
