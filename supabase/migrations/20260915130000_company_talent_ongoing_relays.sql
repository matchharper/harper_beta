begin;

-- A company contact is the durable routing anchor between one company Role and
-- one talent. The contact kind describes what the company initially sent, but
-- it does not constrain later talent-to-company messages on that connection.
alter table public.company_talent_requests
  add column if not exists contact_kind text not null default 'question';

update public.company_talent_requests
set contact_kind = 'resume'
where expects_document = true
  and contact_kind = 'question';

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_contact_kind_check;
alter table public.company_talent_requests
  add constraint company_talent_requests_contact_kind_check
  check (contact_kind in ('question', 'resume', 'contact'));

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_contact_kind_document_check;
alter table public.company_talent_requests
  add constraint company_talent_requests_contact_kind_document_check
  check (expects_document = (contact_kind = 'resume'));

-- Keep the legacy enqueue RPC compatible with the new structural invariant.
-- New company-agent writes use the explicit contact_kind column directly;
-- this adapter can only represent its historical question/resume contract.
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
  v_scheduled_at timestamptz := v_now + interval '5 minutes';
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
    and company_workspace_id = p_workspace_id
    and role_id = p_role_id
    and talent_id = p_talent_id
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
    company_workspace_id,
    role_id,
    recommendation_id,
    talent_id,
    source_company_message_id,
    contact_kind,
    expects_document,
    request_context
  ) values (
    p_workspace_id,
    p_role_id,
    p_recommendation_id,
    p_talent_id,
    p_source_company_message_id,
    case when p_expects_document then 'resume' else 'question' end,
    p_expects_document,
    btrim(p_request_context)
  ) returning * into v_request;

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
    jsonb_build_object('requestId', v_request.id),
    v_scheduled_at,
    p_role_id,
    p_recommendation_id,
    v_request.id
  );
  return v_request;
end;
$$;

-- Preserve the existing candidate-contact activity writer while letting the
-- explicit neutral contact kind remain neutral in company-facing history.
create or replace function public.record_contact_queue_org_candidate_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_user_id uuid;
  v_contact_kind text;
  v_created_at timestamptz;
  v_event_key text;
  v_event_type text;
  v_recommendation_id uuid;
  v_request_context text;
  v_request_id uuid;
  v_role_id uuid;
  v_talent_id uuid;
  v_text text;
begin
  if new.status is distinct from 'sent'
     or old.status is not distinct from 'sent'
     or new.type not in (
       'company_request_candidate_delivery',
       'company_request_company_delivery'
     )
     or new.company_talent_request_id is null then
    return new;
  end if;

  select
    request.id,
    request.role_id,
    request.recommendation_id,
    request.talent_id,
    request.contact_kind,
    request.request_context,
    source_message.company_user_id,
    coalesce(
      talent_response.created_at,
      document.created_at,
      new.sent_at,
      new.updated_at,
      timezone('utc', now())
    )
  into
    v_request_id,
    v_role_id,
    v_recommendation_id,
    v_talent_id,
    v_contact_kind,
    v_request_context,
    v_company_user_id,
    v_created_at
  from public.company_talent_requests request
  left join public.company_messages source_message
    on source_message.id = request.source_company_message_id
  left join public.talent_messages talent_response
    on talent_response.id = request.talent_source_message_id
  left join public.talent_documents document
    on document.id = request.document_id
  where request.id = new.company_talent_request_id;

  if not found then
    return new;
  end if;

  if new.type = 'company_request_candidate_delivery' then
    v_event_type := 'candidate_contact_sent';
    v_event_key := 'company_talent_request:' || v_request_id::text || ':candidate_contact_sent';
    v_created_at := coalesce(
      new.sent_at,
      new.updated_at,
      timezone('utc', now())
    );
    v_text := coalesce(
      nullif(btrim(new.payload #>> '{delivery,chatText}'), ''),
      nullif(btrim(v_request_context), ''),
      case v_contact_kind
        when 'resume' then '후보자에게 최신 이력서를 요청했어요.'
        when 'contact' then '후보자에게 회사의 연락을 전달했어요.'
        else '후보자에게 회사의 질문을 전달했어요.'
      end
    );
  else
    v_event_type := 'candidate_response_received';
    v_event_key := 'company_talent_request:' || v_request_id::text || ':candidate_response_received';
    v_text := coalesce(
      nullif(btrim(new.payload #>> '{delivery,body}'), ''),
      case
        when v_contact_kind = 'resume' then '후보자에게 요청한 이력서를 받았어요.'
        else '후보자의 답변을 받았어요.'
      end
    );
    v_company_user_id := null;
  end if;

  begin
    insert into public.talent_progress (
      talent_id,
      role_id,
      recommendation_id,
      text,
      user_id,
      company_user_id,
      kind,
      metadata,
      created_at
    ) values (
      v_talent_id,
      v_role_id,
      v_recommendation_id,
      v_text,
      null,
      v_company_user_id,
      'org_candidate_activity',
      jsonb_strip_nulls(
        jsonb_build_object(
          'eventKey', v_event_key,
          'eventType', v_event_type,
          'requestId', v_request_id,
          'requestKind', v_contact_kind,
          'requestContext', v_request_context
        )
      ),
      v_created_at
    )
    on conflict do nothing;
  exception when others then
    raise warning 'Could not record company talent request progress: %', sqlerrm;
  end;

  return new;
end;
$$;

-- Each row is one candidate-authored transmission. This is irreducible
-- durable state: it is the idempotency and retry boundary for repeated
-- deliveries after the first response has already completed.
create table if not exists public.company_talent_relays (
  id uuid primary key default gen_random_uuid(),
  company_talent_request_id uuid not null
    references public.company_talent_requests(id) on delete cascade,
  source_talent_message_id bigint not null
    references public.talent_messages(id) on delete restrict,
  relay_content text,
  document_id uuid references public.talent_documents(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (company_talent_request_id, source_talent_message_id),
  check (nullif(btrim(coalesce(relay_content, '')), '') is not null or document_id is not null),
  check (length(coalesce(relay_content, '')) <= 5000)
);

comment on table public.company_talent_relays is
  'Candidate-authored messages relayed through an established company contact; one row is one independently retryable delivery.';

alter table public.company_talent_relays enable row level security;

alter table public.contact_queue
  add column if not exists company_talent_relay_id uuid
    references public.company_talent_relays(id) on delete cascade;

create unique index if not exists contact_queue_company_talent_relay_delivery_uidx
  on public.contact_queue(company_talent_relay_id, type)
  where company_talent_relay_id is not null
    and type = 'company_contact_company_delivery';

create index if not exists company_talent_relays_request_created_idx
  on public.company_talent_relays(company_talent_request_id, created_at desc, id desc);

create index if not exists company_talent_requests_talent_activity_idx
  on public.company_talent_requests(talent_id, updated_at desc, id desc);

create index if not exists company_talent_requests_scope_created_idx
  on public.company_talent_requests(
    company_workspace_id, role_id, talent_id, created_at desc, id desc
  );

-- Preserve one relay row for every response that existed before this additive
-- migration. Legacy delivery rows remain the transport record; attaching the
-- relay id makes new readers see one continuous history without resending it.
insert into public.company_talent_relays (
  company_talent_request_id,
  source_talent_message_id,
  relay_content,
  document_id,
  created_at
)
select
  request.id,
  request.talent_source_message_id,
  nullif(btrim(message.content), ''),
  request.document_id,
  coalesce(message.created_at, request.updated_at, request.created_at)
from public.company_talent_requests request
join public.talent_messages message
  on message.id = request.talent_source_message_id
where request.talent_source_message_id is not null
  and (
    nullif(btrim(message.content), '') is not null
    or request.document_id is not null
  )
on conflict (company_talent_request_id, source_talent_message_id) do nothing;

update public.contact_queue queue
set company_talent_relay_id = relay.id
from public.company_talent_relays relay
where queue.type = 'company_request_company_delivery'
  and queue.company_talent_relay_id is null
  and queue.company_talent_request_id = relay.company_talent_request_id
  and relay.source_talent_message_id = (
    select request.talent_source_message_id
    from public.company_talent_requests request
    where request.id = queue.company_talent_request_id
  );

-- Candidate-reengagement keeps its existing response-state RPC. Attach that
-- legacy outbox to the same relay ledger without creating a second delivery.
create or replace function public.attach_legacy_company_talent_relay_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_relay_id uuid;
begin
  if new.type <> 'company_request_company_delivery'
     or new.company_talent_request_id is null
     or new.company_talent_relay_id is not null then
    return new;
  end if;

  insert into public.company_talent_relays (
    company_talent_request_id,
    source_talent_message_id,
    relay_content,
    document_id
  )
  select
    request.id,
    request.talent_source_message_id,
    nullif(btrim(message.content), ''),
    request.document_id
  from public.company_talent_requests request
  join public.talent_messages message
    on message.id = request.talent_source_message_id
  where request.id = new.company_talent_request_id
    and (
      nullif(btrim(message.content), '') is not null
      or request.document_id is not null
    )
  on conflict (company_talent_request_id, source_talent_message_id) do nothing
  returning id into v_relay_id;

  if v_relay_id is null then
    select relay.id into v_relay_id
    from public.company_talent_relays relay
    join public.company_talent_requests request
      on request.id = relay.company_talent_request_id
    where request.id = new.company_talent_request_id
      and relay.source_talent_message_id = request.talent_source_message_id;
  end if;
  new.company_talent_relay_id := v_relay_id;
  return new;
end;
$$;

drop trigger if exists contact_queue_attach_legacy_company_talent_relay_v1
  on public.contact_queue;
create trigger contact_queue_attach_legacy_company_talent_relay_v1
before insert on public.contact_queue
for each row execute function public.attach_legacy_company_talent_relay_v1();

-- Authorization is based only on durable relationship evidence: this talent
-- owns the request and its candidate delivery was actually sent. Conversational
-- state such as awaiting_talent, answered, closed, or the current Role status
-- does not decide whether a later message can be relayed.
create or replace function public.create_company_talent_relay_v1(
  p_request_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint,
  p_relay_content text,
  p_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_relay public.company_talent_relays%rowtype;
  v_content text := btrim(coalesce(p_relay_content, ''));
  v_delivery_status text;
  v_first_response boolean;
begin
  if v_content = '' and p_document_id is null then
    raise exception using errcode = '22023', message = 'company_talent_relay_content_required';
  end if;

  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_contact_not_found';
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
      and document.is_deleted = false
  ) then
    raise exception using errcode = 'P0002', message = 'candidate_relay_document_not_found';
  end if;

  select * into v_relay
  from public.company_talent_relays
  where company_talent_request_id = p_request_id
    and source_talent_message_id = p_source_message_id
  for update;
  if found then
    select delivery.status into v_delivery_status
    from public.contact_queue delivery
    where delivery.company_talent_relay_id = v_relay.id
      and delivery.type = 'company_contact_company_delivery';
    return jsonb_build_object(
      'id', v_relay.id,
      'requestId', v_relay.company_talent_request_id,
      'status', coalesce(v_delivery_status, 'queued'),
      'idempotent', true,
      'contentMismatch', coalesce(v_relay.relay_content, '') <> v_content
        or v_relay.document_id is distinct from p_document_id
    );
  end if;

  v_first_response := v_request.talent_source_message_id is null
    and v_request.document_id is null;

  if v_first_response and v_request.intent = 'candidate_reengagement' then
    raise exception using
      errcode = 'P0001',
      message = 'candidate_reengagement_requires_response_recording';
  end if;

  insert into public.company_talent_relays (
    company_talent_request_id,
    source_talent_message_id,
    relay_content,
    document_id
  ) values (
    p_request_id,
    p_source_message_id,
    nullif(v_content, ''),
    p_document_id
  )
  returning * into v_relay;

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
    v_request.talent_id,
    'company_contact_company_delivery',
    'queued',
    jsonb_build_object('requestId', v_request.id, 'relayId', v_relay.id),
    now(),
    v_request.role_id,
    null,
    null,
    v_relay.id
  )
  on conflict (company_talent_relay_id, type)
    where company_talent_relay_id is not null
      and type = 'company_contact_company_delivery'
    do nothing;

  return jsonb_build_object(
    'id', v_relay.id,
    'requestId', v_relay.company_talent_request_id,
    'status', 'queued',
    'idempotent', false,
    'firstResponse', v_first_response
  );
end;
$$;

-- Preserve the authenticated web upload contract while routing its first
-- request-linked resume through the same relay ledger/outbox as text and email.
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
  if not found
     or not v_request.expects_document
     or v_request.contact_kind <> 'resume' then
    raise exception using errcode = 'P0002', message = 'company_talent_resume_request_not_found';
  end if;
  if v_request.document_id is not null then
    return jsonb_build_object(
      'requestId', v_request.id,
      'documentId', v_request.document_id,
      'messageId', v_request.talent_source_message_id,
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

  return jsonb_build_object(
    'requestId', p_request_id,
    'documentId', v_document_id,
    'messageId', v_message_id,
    'relayId', v_relay ->> 'id',
    'idempotent', false
  );
end;
$$;

-- Email attachments need one transaction that commits the new document and
-- creates its independently retryable relay. The inbound talent message is the
-- idempotency evidence, so retrying the same provider event cannot create a
-- second document or delivery.
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
  if not found or not v_request.expects_document or v_request.contact_kind <> 'resume' then
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
    source_talent_message_id,
    relay_content,
    document_id
  ) values (
    p_request_id,
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

-- Freeze generated company-facing copy in the outbox, which is the only
-- delivery-state owner. The immutable relay row keeps candidate evidence only.
create or replace function public.store_company_talent_relay_body_v2(
  p_relay_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queue public.contact_queue%rowtype;
  v_body text := btrim(coalesce(p_body, ''));
  v_stored_body text;
  v_had_body boolean;
begin
  if v_body = '' then
    raise exception using errcode = '22023', message = 'company_talent_relay_body_required';
  end if;
  if length(v_body) > 5000 then
    raise exception using errcode = '22001', message = 'company_talent_relay_body_too_long';
  end if;

  select queue.* into v_queue
  from public.contact_queue queue
  where queue.company_talent_relay_id = p_relay_id
    and queue.type = 'company_contact_company_delivery'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_outbox_not_found';
  end if;
  v_stored_body := nullif(btrim(v_queue.payload #>> '{delivery,body}'), '');
  v_had_body := v_stored_body is not null;
  if v_queue.status = 'sent' then
    return jsonb_build_object(
      'id', p_relay_id,
      'status', 'delivered',
      'body', v_stored_body,
      'idempotent', true
    );
  end if;

  if v_stored_body is null then
    update public.contact_queue queue
    set payload = jsonb_set(
          coalesce(queue.payload, '{}'::jsonb),
          '{delivery}',
          coalesce(queue.payload #> '{delivery}', '{}'::jsonb)
            || jsonb_build_object('body', v_body),
          true
        ),
        updated_at = now()
    where queue.id = v_queue.id
    returning queue.* into v_queue;
    v_stored_body := v_body;
  end if;

  return jsonb_build_object(
    'id', p_relay_id,
    'status', 'delivery_ready',
    'body', v_stored_body,
    'idempotent', v_had_body,
    'contentMismatch', v_had_body and v_stored_body <> v_body
  );
end;
$$;

create or replace function public.finalize_company_talent_relay_delivery_v1(
  p_relay_id uuid,
  p_slack_message_ts text default null,
  p_slack_bot_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queue public.contact_queue%rowtype;
  v_request_id uuid;
  v_source_message_id bigint;
  v_body text;
  v_now timestamptz := transaction_timestamp();
begin
  select
    relay.company_talent_request_id,
    relay.source_talent_message_id
  into v_request_id, v_source_message_id
  from public.company_talent_relays relay
  where relay.id = p_relay_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_not_found';
  end if;

  select queue.* into v_queue
  from public.contact_queue queue
  where queue.company_talent_relay_id = p_relay_id
    and queue.type = 'company_contact_company_delivery'
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_outbox_not_found';
  end if;
  if v_queue.status = 'sent' then
    return jsonb_build_object(
      'id', p_relay_id,
      'status', 'delivered',
      'deliveredAt', v_queue.sent_at,
      'idempotent', true
    );
  end if;
  v_body := nullif(btrim(v_queue.payload #>> '{delivery,body}'), '');
  if v_body is null then
    raise exception using errcode = 'P0001', message = 'company_talent_relay_not_ready';
  end if;

  update public.contact_queue queue
  set status = 'sent',
      sent_at = coalesce(sent_at, v_now),
      payload = jsonb_set(
        coalesce(queue.payload, '{}'::jsonb),
        '{delivery}',
        coalesce(queue.payload #> '{delivery}', '{}'::jsonb)
          || jsonb_strip_nulls(jsonb_build_object(
            'slackMessageTs', nullif(btrim(coalesce(p_slack_message_ts, '')), ''),
            'slackBotUserId', nullif(btrim(coalesce(p_slack_bot_user_id, '')), '')
          )),
        true
      ),
      last_error = null,
      locked_at = null,
      locked_by = null,
      updated_at = v_now
  where queue.id = v_queue.id
  returning queue.* into v_queue;

  update public.company_talent_requests request
  set workflow_status = 'delivered'
  where request.id = v_request_id
    and request.talent_source_message_id = v_source_message_id
    and request.workflow_status = 'relay_queued';

  return jsonb_build_object(
    'id', p_relay_id,
    'status', 'delivered',
    'deliveredAt', v_queue.sent_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.record_company_talent_relay_progress_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_relay public.company_talent_relays%rowtype;
  v_request public.company_talent_requests%rowtype;
begin
  if new.type <> 'company_contact_company_delivery'
     or new.status is distinct from 'sent'
     or old.status is not distinct from 'sent'
     or new.company_talent_relay_id is null then
    return new;
  end if;

  select relay.* into v_relay
  from public.company_talent_relays relay
  where relay.id = new.company_talent_relay_id;
  if not found then return new; end if;

  select request.* into v_request
  from public.company_talent_requests request
  where request.id = v_relay.company_talent_request_id;
  if not found then return new; end if;

  begin
    insert into public.talent_progress (
      talent_id,
      role_id,
      recommendation_id,
      text,
      user_id,
      company_user_id,
      kind,
      metadata,
      created_at
    ) values (
      v_request.talent_id,
      v_request.role_id,
      v_request.recommendation_id,
      coalesce(
        nullif(btrim(new.payload #>> '{delivery,body}'), ''),
        '후보자가 회사에 새 메시지를 전달했어요.'
      ),
      null,
      null,
      'org_candidate_activity',
      jsonb_build_object(
        'eventKey', 'company_talent_relay:' || v_relay.id::text || ':delivered',
        'eventType', 'candidate_message_delivered',
        'relayId', v_relay.id,
        'requestId', v_request.id,
        'requestKind', v_request.contact_kind,
        'requestContext', v_request.request_context
      ),
      coalesce(new.sent_at, new.updated_at, transaction_timestamp())
    )
    on conflict do nothing;
  exception when others then
    raise warning 'Could not record company talent relay progress: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists contact_queue_company_talent_relay_progress_v1
  on public.contact_queue;
create trigger contact_queue_company_talent_relay_progress_v1
after update of status on public.contact_queue
for each row execute function public.record_company_talent_relay_progress_v1();

revoke all on table public.company_talent_relays from public, anon, authenticated;
grant all on table public.company_talent_relays to service_role;

revoke all on function public.create_company_talent_relay_v1(uuid, uuid, bigint, text, uuid)
  from public, anon, authenticated;
revoke all on function public.finalize_company_talent_resume_relay_v1(
  uuid, uuid, bigint, text, text, text, bigint, text, text
) from public, anon, authenticated;
revoke all on function public.store_company_talent_relay_body_v2(uuid, text)
  from public, anon, authenticated;
revoke all on function public.finalize_company_talent_relay_delivery_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.record_company_talent_relay_progress_v1()
  from public, anon, authenticated;
revoke all on function public.attach_legacy_company_talent_relay_v1()
  from public, anon, authenticated;
grant execute on function public.create_company_talent_relay_v1(uuid, uuid, bigint, text, uuid)
  to service_role;
grant execute on function public.finalize_company_talent_resume_relay_v1(
  uuid, uuid, bigint, text, text, text, bigint, text, text
) to service_role;
grant execute on function public.store_company_talent_relay_body_v2(uuid, text)
  to service_role;
grant execute on function public.finalize_company_talent_relay_delivery_v1(uuid, text, text)
  to service_role;

commit;
