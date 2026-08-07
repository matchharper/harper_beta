begin;

-- Production's talent_activity_events constraint accepts low/medium/high. The
-- original request-linked resume finalizer used "normal", so every otherwise
-- valid email attachment rolled back at the activity-event insert.
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
  if v_request.workflow_status <> 'awaiting_talent'
     or v_request.expires_at <= v_now then
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
    workflow_status = case
      when public.company_talent_request_stage_is_pending_v1(p_request_id)
        then 'relay_queued'
      else 'review_required'
    end,
    document_id = v_document_id,
    talent_source_message_id = v_message_id
  where id = p_request_id returning * into v_request;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) select
    p_talent_id, 'company_request_company_delivery', 'queued',
    jsonb_build_object('requestId', p_request_id), v_now,
    v_request.role_id, v_request.recommendation_id, p_request_id
  where v_request.workflow_status = 'relay_queued'
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

revoke all on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) to service_role;

commit;
