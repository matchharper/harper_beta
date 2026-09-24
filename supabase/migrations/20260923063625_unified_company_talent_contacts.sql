-- One contact contract; legacy columns remain readable for historical records.
-- No message classification or answer-driven pipeline transition lives here.
begin;

create or replace function public.create_company_talent_relay_v2(
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint,
  p_relay_content text,
  p_document_id uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_content text := btrim(coalesce(p_relay_content, ''));
  v_delivery_status text;
  v_first_response boolean := false;
  v_relay public.company_talent_relays%rowtype;
  v_request public.company_talent_requests%rowtype;
  v_role_id uuid;
  v_workspace_id uuid;
begin
  if v_content = '' and p_document_id is null then
    raise exception using errcode = '22023', message = 'company_talent_relay_content_required';
  end if;
  if length(v_content) > 5000 then
    raise exception using errcode = '22001', message = 'company_talent_relay_content_too_long';
  end if;

  select recommendation.role_id, role.company_workspace_id
  into v_role_id, v_workspace_id
  from public.talent_opportunity_recommendation recommendation
  join public.company_roles role on role.role_id = recommendation.role_id
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
    and recommendation.feedback = 'like';
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_connection_not_found';
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.role_id = v_role_id
      and coalesce((role.information ->> 'testOnly')::boolean, false)
      and not coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false)
  ) then
    raise exception using errcode = 'P0001', message = 'test_only_company_contact_not_relayable';
  end if;

  -- A mutual relationship is established by one of three durable facts:
  -- a company contact that reached the talent, a company-first intro accepted
  -- into connecting/connected, or a company-visible pipeline stage after the
  -- normal Harper recommendation handoff.
  if not (
    exists (
      select 1
      from public.company_talent_requests request
      join public.contact_queue delivery
        on delivery.company_talent_request_id = request.id
       and delivery.type = 'company_request_candidate_delivery'
       and delivery.status = 'sent'
       and delivery.sent_at is not null
      where request.recommendation_id = p_recommendation_id
        and request.talent_id = p_talent_id
    )
    or exists (
      select 1
      from public.company_intro_candidates intro
      where intro.recommendation_id = p_recommendation_id
        and intro.talent_id = p_talent_id
        and intro.status in ('connecting', 'connected')
    )
    or exists (
      select 1
      from public.talent_opportunity_tag tag
      where tag.talent_id = p_talent_id
        and tag.opportunity_id = v_role_id
        and (
          tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
          or tag.tag like '내부단계:%'
        )
    )
    or exists (
      select 1
      from public.talent_progress progress
      where progress.recommendation_id = p_recommendation_id
        and progress.talent_id = p_talent_id
        and progress.role_id = v_role_id
        and progress.kind = 'org_stage_change'
        and (
          progress.metadata ->> 'stage' in (
            'pending_connection', 'connected', 'final_offer'
          )
          or progress.metadata ->> 'stage' like 'custom:%'
        )
    )
  ) then
    raise exception using errcode = 'P0001', message = 'company_talent_connection_not_established';
  end if;

  if not exists (
    select 1
    from public.talent_messages message
    where message.id = p_source_message_id
      and message.user_id = p_talent_id
      and message.role = 'user'
      and (p_document_id is not null or message.message_type <> 'resume_upload_note')
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_message_evidence_not_found';
  end if;

  if p_document_id is not null and not exists (
    select 1
    from public.talent_documents document
    where document.id = p_document_id
      and document.talent_id = p_talent_id
      and document.kind = 'resume'
      and document.is_public = true
      and document.is_deleted = false
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_relay_document_not_found';
  end if;

  if p_request_id is not null then
    select * into v_request
    from public.company_talent_requests request
    where request.id = p_request_id
      and request.recommendation_id = p_recommendation_id
      and request.talent_id = p_talent_id
      and request.role_id = v_role_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'company_talent_contact_not_found';
    end if;
    if not exists (
      select 1 from public.contact_queue delivery
      where delivery.company_talent_request_id = p_request_id
        and delivery.type = 'company_request_candidate_delivery'
        and delivery.status = 'sent' and delivery.sent_at is not null
    ) then
      raise exception 'company_talent_contact_not_delivered';
    end if;
    v_first_response := v_request.talent_source_message_id is null
      and v_request.document_id is null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_recommendation_id::text || ':' || p_source_message_id::text, 0)
  );
  select * into v_relay
  from public.company_talent_relays relay
  where relay.recommendation_id = p_recommendation_id
    and relay.source_talent_message_id = p_source_message_id
  order by relay.created_at, relay.id
  limit 1
  for update;
  if found then
    select delivery.status into v_delivery_status
    from public.contact_queue delivery
    where delivery.company_talent_relay_id = v_relay.id
      and delivery.type = 'company_contact_company_delivery';
    return jsonb_build_object(
      'id', v_relay.id,
      'connectionId', 'recommendation:' || v_relay.recommendation_id::text,
      'recommendationId', v_relay.recommendation_id,
      'requestId', v_relay.company_talent_request_id,
      'status', coalesce(v_delivery_status, 'queued'),
      'idempotent', true,
      'contentMismatch', coalesce(v_relay.relay_content, '') <> v_content
        or v_relay.document_id is distinct from p_document_id
    );
  end if;

  insert into public.company_talent_relays (
    company_talent_request_id,
    recommendation_id,
    source_talent_message_id,
    relay_content,
    document_id
  ) values (
    p_request_id,
    p_recommendation_id,
    p_source_message_id,
    nullif(v_content, ''),
    p_document_id
  ) returning * into v_relay;

  if p_request_id is not null then
    if v_first_response then
      update public.company_talent_requests
      set talent_source_message_id = p_source_message_id,
          document_id = coalesce(document_id, p_document_id),
          workflow_status = case
            when workflow_status in ('awaiting_talent', 'closed', 'review_required')
              then 'relay_queued'
            else workflow_status
          end,
          expires_at = 'infinity'::timestamptz
      where id = p_request_id;
    else
      update public.company_talent_requests
      set updated_at = transaction_timestamp()
      where id = p_request_id;
    end if;
  end if;

  insert into public.contact_queue (
    user_id,
    type,
    status,
    payload,
    scheduled_at,
    role_id,
    recommendation_id,
    company_talent_request_id,
    company_talent_relay_id
  ) values (
    p_talent_id,
    'company_contact_company_delivery',
    'queued',
    jsonb_strip_nulls(jsonb_build_object(
      'connectionId', 'recommendation:' || p_recommendation_id::text,
      'recommendationId', p_recommendation_id,
      'requestId', p_request_id,
      'relayId', v_relay.id
    )),
    now(),
    v_role_id,
    p_recommendation_id,
    null,
    v_relay.id
  )
  on conflict (company_talent_relay_id, type)
    where company_talent_relay_id is not null
      and type = 'company_contact_company_delivery'
    do nothing;

  return jsonb_build_object(
    'id', v_relay.id,
    'connectionId', 'recommendation:' || v_relay.recommendation_id::text,
    'recommendationId', v_relay.recommendation_id,
    'requestId', v_relay.company_talent_request_id,
    'status', 'queued',
    'idempotent', false,
    'firstResponse', v_first_response
  );
end;
$$;

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
      and (
        exists (
          select 1
          from public.contact_queue delivery
          where delivery.company_talent_request_id = request.id
            and delivery.type = 'company_request_candidate_delivery'
            and delivery.status = 'sent'
            and delivery.sent_at is not null
        )
        or (
          (
            exists (
            select 1
            from public.talent_opportunity_recommendation recommendation
            where recommendation.id = request.recommendation_id
              and recommendation.talent_id = request.talent_id
              and recommendation.role_id = request.role_id
              and lower(btrim(coalesce(recommendation.saved_stage, ''))) = 'closed'
            )
            or latest_stage.tag in (
              '내부:연결대기',
              '내부:연결됨',
              '내부:최종오퍼',
              '내부:프로세스중단'
            )
            or latest_stage.tag like '내부단계:%'
          )
        )
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
  v_relay jsonb;
  v_now timestamptz := transaction_timestamp();
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_resume_request_not_found';
  end if;
  if v_request.document_id is not null then
    return jsonb_build_object(
      'requestId', v_request.id,
      'documentId', v_request.document_id,
      'relayId', (select id from public.company_talent_relays
        where company_talent_request_id = p_request_id and document_id = v_request.document_id
        order by created_at desc limit 1),
      'messageId', (select source_talent_message_id from public.company_talent_relays
        where company_talent_request_id = p_request_id and document_id = v_request.document_id
        order by created_at desc limit 1),
      'idempotent', true
    );
  end if;
  if not exists (
       select 1
       from public.contact_queue delivery
       where delivery.company_talent_request_id = p_request_id
         and delivery.type = 'company_request_candidate_delivery'
         and delivery.status = 'sent'
         and delivery.sent_at is not null
     ) then
    raise exception using errcode = 'P0001', message = 'company_talent_resume_request_not_uploadable';
  end if;

  update public.talent_documents
  set is_primary = false,
      is_public = false
  where talent_id = p_talent_id
    and kind = 'resume'
    and is_deleted = false
    and is_primary = true;

  insert into public.talent_documents (
    talent_id,
    kind,
    file_name,
    storage_path,
    content_type,
    size_bytes,
    extracted_text,
    is_public,
    is_primary,
    is_deleted,
    origin_type,
    origin_id
  ) values (
    p_talent_id,
    'resume',
    btrim(p_file_name),
    btrim(p_storage_path),
    nullif(btrim(coalesce(p_content_type, '')), ''),
    p_size_bytes,
    nullif(p_extracted_text, ''),
    true,
    true,
    false,
    'company_talent_relay',
    p_request_id::text
  )
  returning id into v_document_id;

  update public.talent_users
  set resume_file_name = btrim(p_file_name),
      resume_storage_path = btrim(p_storage_path),
      resume_text = coalesce(nullif(p_extracted_text, ''), resume_text),
      updated_at = v_now
  where user_id = p_talent_id;

  insert into public.talent_messages (
    user_id,
    conversation_id,
    role,
    content,
    message_type
  ) values (
    p_talent_id,
    p_conversation_id,
    'user',
    '요청받은 이력서를 업로드했습니다.',
    'resume_upload_note'
  )
  returning id into v_message_id;

  insert into public.talent_activity_events (
    talent_id,
    conversation_id,
    message_id,
    source,
    event_type,
    summary,
    impact_level,
    changed_domains
  ) values (
    p_talent_id,
    p_conversation_id,
    v_message_id,
    'system_action',
    'resume_uploaded',
    '요청받은 이력서를 업로드했습니다.',
    'medium',
    array['profile', 'resume']::text[]
  );

  v_relay := public.create_company_talent_relay_v1(
    p_request_id,
    p_talent_id,
    v_message_id,
    null,
    v_document_id
  );

  update public.company_talent_requests set document_id = v_document_id
    where id = p_request_id and document_id is null;
  return jsonb_build_object(
    'requestId', p_request_id,
    'documentId', v_document_id,
    'messageId', v_message_id,
    'relayId', v_relay ->> 'id',
    'idempotent', false
  );
end;
$$;

create or replace function public.finalize_company_talent_resume_relay_v1(
  p_request_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_extracted_text text,
  p_relay_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_relay public.company_talent_relays%rowtype;
  v_document_id uuid;
  v_first_response boolean;
  v_now timestamptz := transaction_timestamp();
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_resume_contact_not_found';
  end if;

  if not exists (
    select 1
    from public.contact_queue delivery
    where delivery.company_talent_request_id = v_request.id
      and delivery.type = 'company_request_candidate_delivery'
      and delivery.status = 'sent'
      and delivery.sent_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'company_talent_contact_not_established';
  end if;

  if not exists (
    select 1
    from public.talent_messages message
    where message.id = p_source_message_id
      and message.user_id = p_talent_id
      and message.role = 'user'
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_message_evidence_not_found';
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.role_id = v_request.role_id
      and coalesce((role.information ->> 'testOnly')::boolean, false)
      and not coalesce(
        role.information -> 'testTalentIds' ? p_talent_id::text,
        false
      )
  ) then
    raise exception using errcode = 'P0001', message = 'test_only_company_contact_not_relayable';
  end if;

  select * into v_relay
  from public.company_talent_relays
  where company_talent_request_id = p_request_id
    and source_talent_message_id = p_source_message_id
  for update;
  if found then
    return jsonb_build_object(
      'requestId', p_request_id,
      'relayId', v_relay.id,
      'documentId', v_relay.document_id,
      'messageId', p_source_message_id,
      'idempotent', true
    );
  end if;

  if nullif(btrim(coalesce(p_file_name, '')), '') is null
     or nullif(btrim(coalesce(p_storage_path, '')), '') is null
     or p_size_bytes is null
     or p_size_bytes <= 0 then
    raise exception using errcode = '22023', message = 'company_talent_resume_document_invalid';
  end if;

  update public.talent_documents
  set is_primary = false,
      is_public = false
  where talent_id = p_talent_id
    and kind = 'resume'
    and is_deleted = false
    and is_primary = true;

  insert into public.talent_documents (
    talent_id,
    kind,
    file_name,
    storage_path,
    content_type,
    size_bytes,
    extracted_text,
    is_public,
    is_primary,
    is_deleted,
    origin_type,
    origin_id
  ) values (
    p_talent_id,
    'resume',
    btrim(p_file_name),
    btrim(p_storage_path),
    nullif(btrim(coalesce(p_content_type, '')), ''),
    p_size_bytes,
    nullif(p_extracted_text, ''),
    true,
    true,
    false,
    'company_talent_relay',
    p_request_id::text || ':' || p_source_message_id::text
  )
  returning id into v_document_id;

  update public.talent_users
  set resume_file_name = btrim(p_file_name),
      resume_storage_path = btrim(p_storage_path),
      resume_text = coalesce(nullif(p_extracted_text, ''), resume_text),
      updated_at = v_now
  where user_id = p_talent_id;

  insert into public.company_talent_relays (
    company_talent_request_id,
    recommendation_id,
    source_talent_message_id,
    relay_content,
    document_id
  ) values (
    p_request_id,
    v_request.recommendation_id,
    p_source_message_id,
    nullif(left(btrim(coalesce(p_relay_content, '')), 5000), ''),
    v_document_id
  )
  returning * into v_relay;

  insert into public.talent_activity_events (
    talent_id,
    conversation_id,
    message_id,
    source,
    event_type,
    summary,
    impact_level,
    changed_domains
  )
  select
    p_talent_id,
    message.conversation_id,
    p_source_message_id,
    'system_action',
    'resume_uploaded',
    '요청받은 이력서를 업로드했습니다.',
    'medium',
    array['profile', 'resume']::text[]
  from public.talent_messages message
  where message.id = p_source_message_id;

  v_first_response := v_request.talent_source_message_id is null
    and v_request.document_id is null;
  if v_first_response then
    update public.company_talent_requests
    set workflow_status = case
          when workflow_status in ('awaiting_talent', 'closed', 'review_required')
            then 'relay_queued'
          else workflow_status
        end,
        document_id = v_document_id,
        talent_source_message_id = p_source_message_id,
        expires_at = 'infinity'::timestamptz
    where id = p_request_id;
  else
    update public.company_talent_requests
    set updated_at = v_now
    where id = p_request_id;
  end if;

  insert into public.contact_queue (
    user_id,
    type,
    status,
    payload,
    scheduled_at,
    role_id,
    recommendation_id,
    company_talent_request_id,
    company_talent_relay_id
  ) values (
    p_talent_id,
    'company_contact_company_delivery',
    'queued',
    jsonb_build_object('requestId', p_request_id, 'relayId', v_relay.id),
    v_now,
    v_request.role_id,
    null,
    null,
    v_relay.id
  );

  return jsonb_build_object(
    'requestId', p_request_id,
    'relayId', v_relay.id,
    'documentId', v_document_id,
    'messageId', p_source_message_id,
    'idempotent', false
  );
end;
$$;

-- Rolling-upgrade adapter: old clients can deliver a reply, never reopen a
-- position from a positive/negative label.
create or replace function public.record_company_talent_response_v2(
  p_request_id uuid, p_talent_id uuid, p_source_message_id bigint,
  p_disposition text default null
)
returns public.company_talent_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_content text;
  v_request public.company_talent_requests%rowtype;
begin
  select content into v_content from public.talent_messages
  where id = p_source_message_id and user_id = p_talent_id and role = 'user';
  perform public.create_company_talent_relay_v1(
    p_request_id, p_talent_id, p_source_message_id, left(v_content, 5000), null
  );
  select * into v_request from public.company_talent_requests where id = p_request_id;
  return v_request;
end;
$$;

-- A candidate contact is evidence for a company-side tool, not a classified
-- answer. Meaning and company delegation are judged by the company-side LLM;
-- the DB checks ownership, delivery and freshness under the same row lock.
create or replace function public.confirm_internal_candidate_from_contact_v1(
  p_recommendation_id uuid, p_talent_id uuid, p_role_id uuid, p_stage text,
  p_actor_user_id uuid, p_actor_email text, p_text text, p_metadata jsonb,
  p_relay_id uuid
)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_source_at timestamptz;
  v_source_id bigint;
begin
  select * into v_recommendation from public.talent_opportunity_recommendation
  where id = p_recommendation_id and talent_id = p_talent_id and role_id = p_role_id
  for update;
  if not found then return false; end if;
  select message.created_at, message.id into v_source_at, v_source_id
  from public.company_talent_relays relay
  join public.talent_messages message on message.id = relay.source_talent_message_id
  join public.contact_queue delivery on delivery.company_talent_relay_id = relay.id
  where relay.id = p_relay_id and relay.recommendation_id = p_recommendation_id
    and message.user_id = p_talent_id and message.role = 'user'
    and delivery.type = 'company_contact_company_delivery'
    and delivery.status = 'sent' and delivery.sent_at is not null;
  if not found then
    raise exception 'candidate_contact_consent_evidence_not_found';
  end if;
  if v_recommendation.saved_stage = 'closed' and v_source_at < v_recommendation.updated_at then
    raise exception 'candidate_contact_consent_evidence_superseded';
  end if;
  if exists (
    select 1 from public.company_talent_relays newer
    where newer.recommendation_id = p_recommendation_id
      and newer.source_talent_message_id > v_source_id
  ) then
    raise exception 'candidate_contact_consent_evidence_superseded';
  end if;
  return public.confirm_internal_candidate_reengagement_v1(
    p_recommendation_id, p_talent_id, p_role_id, p_stage,
    p_actor_user_id, p_actor_email, p_text,
    p_metadata || jsonb_build_object('consentSource', 'candidate_contact', 'relayId', p_relay_id)
  );
end;
$$;

revoke all on function public.confirm_internal_candidate_from_contact_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_internal_candidate_from_contact_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb, uuid)
  to service_role;

-- Reuse the existing durable company-side LLM job/outbox. A missing actor is
-- recorded as a failed job, not allowed to roll back a delivered contact.
alter table public.company_agent_web_action_jobs alter column actor_user_id drop not null;

create or replace function public.enqueue_delivered_company_contact_turn_v1()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_relay public.company_talent_relays%rowtype;
  v_source public.company_messages%rowtype;
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_conversation public.company_conversations%rowtype;
  v_workspace_id uuid;
  v_actor_id uuid;
  v_job_id uuid := gen_random_uuid();
  v_message_id bigint;
  v_anchor_id bigint;
  v_metadata jsonb;
begin
  if new.type <> 'company_contact_company_delivery' or new.status <> 'sent'
     or new.sent_at is null or new.company_talent_relay_id is null then return new; end if;
  if old.status = 'sent' then return new; end if;
  select * into strict v_relay from public.company_talent_relays where id = new.company_talent_relay_id;
  perform pg_advisory_xact_lock(hashtextextended('company-contact-turn:' || v_relay.id::text, 0));
  if exists (select 1 from public.company_agent_web_action_jobs
    where idempotency_key = 'candidate-contact:' || v_relay.id::text) then return new; end if;
  select * into strict v_recommendation from public.talent_opportunity_recommendation
    where id = v_relay.recommendation_id;
  select company_workspace_id into strict v_workspace_id from public.company_roles
    where role_id = v_recommendation.role_id;
  -- Prefer the addressed contact, otherwise the latest preceding company contact.
  select message.* into v_source
  from public.company_talent_requests request
  join public.company_messages message on message.id = request.source_company_message_id
  where request.recommendation_id = v_relay.recommendation_id
    and request.created_at <= v_relay.created_at
    and message.company_workspace_id = v_workspace_id
    and exists (
      select 1 from public.contact_queue sent
      where sent.company_talent_request_id = request.id
        and sent.type = 'company_request_candidate_delivery'
        and sent.status = 'sent' and sent.sent_at is not null
    )
  order by (request.id = v_relay.company_talent_request_id) desc nulls last, request.created_at desc
  limit 1;
  -- Proactive contacts are delivered to workspace channels, not an old thread.
  if v_relay.company_talent_request_id is null then
    v_source.slack_thread_id := null;
  end if;
  if v_source.id is not null then
    select * into v_conversation from public.company_conversations
      where id = v_source.conversation_id and company_workspace_id = v_workspace_id;
    v_actor_id := v_source.company_user_id;
  end if;
  if v_actor_id is null then
    select company_user_id into v_actor_id from public.company_user_workspace
    where company_workspace_id = v_workspace_id and authority in ('owner', 'admin')
    order by (authority = 'owner') desc, id limit 1;
  end if;
  if v_conversation.id is null then
    select * into v_conversation from public.company_conversations
      where company_workspace_id = v_workspace_id and role_id = v_recommendation.role_id;
    if not found then
      insert into public.company_conversations (company_workspace_id, role_id, metadata)
      values (v_workspace_id, v_recommendation.role_id, '{"phase":"completed","scope":"role_creation"}')
      on conflict do nothing;
      select * into strict v_conversation from public.company_conversations
        where company_workspace_id = v_workspace_id and role_id = v_recommendation.role_id;
    end if;
  end if;
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'source', 'company_talent_relay', 'relayId', v_relay.id,
    'recommendationId', v_relay.recommendation_id, 'requestId', v_relay.company_talent_request_id,
    'candidateRelayRef', jsonb_strip_nulls(jsonb_build_object(
      'relayId', v_relay.id, 'recommendationId', v_relay.recommendation_id,
      'requestId', v_relay.company_talent_request_id,
      'roleId', v_recommendation.role_id, 'talentId', v_recommendation.talent_id
    ))
  ));
  insert into public.company_messages (
    company_workspace_id, conversation_id, role_id, role, content,
    message_type, status, metadata, slack_thread_id
  ) values (
    v_workspace_id, v_conversation.id, v_conversation.role_id, 'assistant',
    coalesce(new.payload #>> '{delivery,body}', v_relay.relay_content, ''),
    'chat', 'completed', v_metadata, v_source.slack_thread_id
  ) returning id into v_message_id;
  update public.company_conversations
    set last_message_id = v_message_id, last_message_at = new.sent_at, updated_at = new.sent_at
    where id = v_conversation.id;
  insert into public.company_messages (
    company_workspace_id, conversation_id, role_id, company_user_id,
    role, content, message_type, status, metadata, slack_thread_id
  ) values (
    v_workspace_id, v_conversation.id, v_conversation.role_id, v_actor_id,
    'user', 'candidate_contact_received', 'web_action', 'completed',
    jsonb_build_object('source', 'candidate_contact_event', 'webActionJobId', v_job_id),
    v_source.slack_thread_id
  ) returning id into v_anchor_id;
  insert into public.company_agent_web_action_jobs (
    id, company_workspace_id, conversation_id, role_id, actor_user_id,
    anchor_message_id, action_name, action_context, idempotency_key,
    status, queue_dispatch_status, last_error
  ) values (
    v_job_id, v_workspace_id, v_conversation.id, v_conversation.role_id, v_actor_id,
    v_anchor_id, 'candidate_contact_received',
    jsonb_strip_nulls(jsonb_build_object('relayId', v_relay.id, 'recommendationId', v_relay.recommendation_id, 'slackThreadId', v_source.slack_thread_id)),
    'candidate-contact:' || v_relay.id::text,
    case when v_actor_id is null then 'failed' else 'queued' end,
    case when v_actor_id is null then 'failed' else 'pending' end,
    case when v_actor_id is null then 'company_contact_actor_not_found' else null end
  );
  return new;
end;
$$;
revoke all on function public.enqueue_delivered_company_contact_turn_v1() from public, anon, authenticated;
create trigger enqueue_delivered_company_contact_turn
after update of status on public.contact_queue
for each row execute function public.enqueue_delivered_company_contact_turn_v1();


create or replace function public.read_company_talent_connections_v1(
  p_talent_id uuid, p_query text default null, p_limit integer default 20
)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(to_jsonb(connection)), '[]'::jsonb) from (
    select 'recommendation:' || recommendation.id::text as "connectionId",
      recommendation.id as "recommendationId", role.role_id as "roleId",
      role.name as "roleName", workspace.company_name as "companyName",
      contact.delivery_body as "latestCompanyContact",
      recommendation.saved_stage as "positionState",
      latest_relay.relay_content as "latestCandidateContact",
      latest_relay.delivery_status as "deliveryStatus"
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role on role.role_id = recommendation.role_id
    join public.company_workspace workspace on workspace.company_workspace_id = role.company_workspace_id
    left join lateral (
      select request.id, request.delivery_body, request.created_at
      from public.company_talent_requests request
      where request.recommendation_id = recommendation.id and exists (
        select 1 from public.contact_queue delivery
        where delivery.company_talent_request_id = request.id
          and delivery.type = 'company_request_candidate_delivery'
          and delivery.status = 'sent' and delivery.sent_at is not null
      ) order by request.created_at desc limit 1
    ) contact on true
    left join lateral (
      select relay.relay_content, delivery.status as delivery_status
      from public.company_talent_relays relay
      left join public.contact_queue delivery on delivery.company_talent_relay_id = relay.id
        and delivery.type = 'company_contact_company_delivery'
      where relay.recommendation_id = recommendation.id
      order by relay.created_at desc limit 1
    ) latest_relay on true
    where recommendation.talent_id = p_talent_id and recommendation.feedback = 'like'
      and (not coalesce((role.information ->> 'testOnly')::boolean, false)
        or coalesce(role.information -> 'testTalentIds' ? p_talent_id::text, false))
      and (contact.id is not null or exists (
        select 1 from public.company_intro_candidates intro
        where intro.recommendation_id = recommendation.id
          and intro.talent_id = p_talent_id and intro.status in ('connecting', 'connected')
      ) or exists (
        select 1 from public.talent_opportunity_tag tag
        where tag.talent_id = p_talent_id and tag.opportunity_id = role.role_id
          and (tag.tag in ('내부:연결대기', '내부:연결됨', '내부:최종오퍼') or tag.tag like '내부단계:%')
      ) or exists (
        select 1 from public.talent_progress progress
        where progress.recommendation_id = recommendation.id and progress.talent_id = p_talent_id
          and progress.role_id = role.role_id and progress.kind = 'org_stage_change'
          and (progress.metadata ->> 'stage' in ('pending_connection', 'connected', 'final_offer')
            or progress.metadata ->> 'stage' like 'custom:%')
      ))
      and not exists (
        select 1 from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') term
        where term <> '' and strpos(lower(workspace.company_name || ' ' || role.name), term) = 0
      )
    order by coalesce(contact.created_at, recommendation.updated_at) desc, recommendation.id
    limit least(30, greatest(1, coalesce(p_limit, 20)))
  ) connection;
$$;
revoke all on function public.read_company_talent_connections_v1(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.read_company_talent_connections_v1(uuid, text, integer) to service_role;

revoke all on function public.create_company_talent_relay_v2(uuid, uuid, bigint, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_company_talent_relay_v2(uuid, uuid, bigint, text, uuid, uuid)
  to service_role;
revoke all on function public.record_company_talent_response_v2(uuid, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.record_company_talent_response_v2(uuid, uuid, bigint, text)
  to service_role;

commit;
