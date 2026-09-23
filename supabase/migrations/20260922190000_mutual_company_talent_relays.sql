begin;

-- A relay belongs to the durable candidate/Role recommendation relationship.
-- The original company request remains optional provenance for contacts that
-- started with a company question, but it is no longer the authorization
-- boundary for later candidate-to-company communication.
alter table public.company_talent_relays
  add column if not exists recommendation_id uuid
    references public.talent_opportunity_recommendation(id) on delete restrict;

update public.company_talent_relays relay
set recommendation_id = request.recommendation_id
from public.company_talent_requests request
where request.id = relay.company_talent_request_id
  and relay.recommendation_id is null;

create or replace function public.fill_company_talent_relay_recommendation_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.recommendation_id is null and new.company_talent_request_id is not null then
    select request.recommendation_id into new.recommendation_id
    from public.company_talent_requests request
    where request.id = new.company_talent_request_id;
  end if;
  if new.recommendation_id is null then
    raise exception using
      errcode = '23502',
      message = 'company_talent_relay_recommendation_required';
  end if;
  return new;
end;
$$;

drop trigger if exists company_talent_relays_fill_recommendation_v1
  on public.company_talent_relays;
create trigger company_talent_relays_fill_recommendation_v1
before insert or update of company_talent_request_id, recommendation_id
on public.company_talent_relays
for each row execute function public.fill_company_talent_relay_recommendation_v1();

alter table public.company_talent_relays
  alter column recommendation_id set not null,
  alter column company_talent_request_id drop not null;
alter table public.company_talent_relays
  drop constraint if exists company_talent_relays_company_talent_request_id_fkey;
alter table public.company_talent_relays
  add constraint company_talent_relays_company_talent_request_id_fkey
  foreign key (company_talent_request_id)
  references public.company_talent_requests(id) on delete set null;

create index if not exists company_talent_relays_recommendation_created_idx
  on public.company_talent_relays(recommendation_id, created_at desc, id desc);
create unique index if not exists company_talent_relays_recommendation_source_uidx
  on public.company_talent_relays(recommendation_id, source_talent_message_id);

-- This FK is the durable causal link used to authorize and audit a company
-- reply that Harper sends directly after receiving a candidate relay.
alter table public.company_talent_requests
  add column if not exists in_reply_to_company_talent_relay_id uuid
    references public.company_talent_relays(id) on delete set null;

create index if not exists company_talent_requests_reply_relay_idx
  on public.company_talent_requests(in_reply_to_company_talent_relay_id, created_at desc)
  where in_reply_to_company_talent_relay_id is not null;
create unique index if not exists company_talent_requests_reply_source_uidx
  on public.company_talent_requests(
    source_company_message_id,
    in_reply_to_company_talent_relay_id
  )
  where in_reply_to_company_talent_relay_id is not null;

-- Official first-contact drafts stay mutually exclusive. Direct replies are
-- separate transmissions and must not be blocked by an unrelated draft.
drop index if exists public.company_talent_requests_workspace_role_talent_open_uidx;
create unique index company_talent_requests_workspace_role_talent_open_uidx
  on public.company_talent_requests(company_workspace_id, role_id, talent_id)
  where workflow_status in ('draft', 'queued', 'failed')
    and talent_source_message_id is null
    and document_id is null
    and in_reply_to_company_talent_relay_id is null;

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
    v_first_response := v_request.talent_source_message_id is null
      and v_request.document_id is null;
    if v_first_response and v_request.intent = 'candidate_reengagement' then
      raise exception using
        errcode = 'P0001',
        message = 'candidate_reengagement_requires_response_recording';
    end if;
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

-- Backward-compatible adapter for existing first-response, resume, and email
-- paths. New Career turns use the recommendation-based v2 contract.
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
  v_recommendation_id uuid;
begin
  select request.recommendation_id into v_recommendation_id
  from public.company_talent_requests request
  where request.id = p_request_id
    and request.talent_id = p_talent_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_contact_not_found';
  end if;
  return public.create_company_talent_relay_v2(
    v_recommendation_id,
    p_talent_id,
    p_source_message_id,
    p_relay_content,
    p_document_id,
    p_request_id
  );
end;
$$;

create or replace function public.send_company_talent_relay_reply_v1(
  p_relay_id uuid,
  p_workspace_id uuid,
  p_source_company_message_id bigint,
  p_subject text,
  p_body text,
  p_request_context text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_delivery_status text;
  v_now timestamptz := transaction_timestamp();
  v_recommendation_id uuid;
  v_request public.company_talent_requests%rowtype;
  v_role_id uuid;
  v_source_conversation_id uuid;
  v_source_slack_thread_id uuid;
  v_scheduled_at timestamptz;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_talent_id uuid;
begin
  if v_subject = '' or v_body = '' or nullif(btrim(coalesce(p_request_context, '')), '') is null then
    raise exception using errcode = '22023', message = 'company_talent_relay_reply_copy_required';
  end if;
  if length(v_subject) > 180 or length(v_body) > 5000 or length(p_request_context) > 800 then
    raise exception using errcode = '22001', message = 'company_talent_relay_reply_copy_too_long';
  end if;

  select relay.recommendation_id, recommendation.role_id, recommendation.talent_id
  into v_recommendation_id, v_role_id, v_talent_id
  from public.company_talent_relays relay
  join public.talent_opportunity_recommendation recommendation
    on recommendation.id = relay.recommendation_id
  join public.company_roles role on role.role_id = recommendation.role_id
  where relay.id = p_relay_id
    and role.company_workspace_id = p_workspace_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_reply_target_not_found';
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.role_id = v_role_id
      and coalesce((role.information ->> 'testOnly')::boolean, false)
      and not coalesce(role.information -> 'testTalentIds' ? v_talent_id::text, false)
  ) then
    raise exception using errcode = 'P0001', message = 'test_only_company_contact_not_relayable';
  end if;

  select message.conversation_id, message.slack_thread_id
  into v_source_conversation_id, v_source_slack_thread_id
  from public.company_messages message
  where message.id = p_source_company_message_id
    and message.company_workspace_id = p_workspace_id
    and message.role = 'user';
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_reply_source_not_found';
  end if;

  if not exists (
    select 1
    from public.company_messages prior
    where prior.company_workspace_id = p_workspace_id
      and prior.role = 'assistant'
      and prior.id < p_source_company_message_id
      and prior.metadata #>> '{candidateRelayRef,relayId}' = p_relay_id::text
      and (
        (v_source_conversation_id is not null and prior.conversation_id = v_source_conversation_id)
        or (v_source_slack_thread_id is not null and prior.slack_thread_id = v_source_slack_thread_id)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'company_talent_relay_reply_not_in_current_context';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company-talent-relay-reply:' || p_source_company_message_id::text || ':' || p_relay_id::text,
      0
    )
  );
  select * into v_request
  from public.company_talent_requests request
  where request.source_company_message_id = p_source_company_message_id
    and request.in_reply_to_company_talent_relay_id = p_relay_id
    and request.company_workspace_id = p_workspace_id
  for update;
  if found then
    select delivery.status, delivery.scheduled_at
    into v_delivery_status, v_scheduled_at
    from public.contact_queue delivery
    where delivery.company_talent_request_id = v_request.id
      and delivery.type = 'company_request_candidate_delivery'
    order by delivery.created_at desc, delivery.id desc
    limit 1;
    return jsonb_build_object(
      'requestId', v_request.id,
      'relayId', p_relay_id,
      'scheduledAt', coalesce(v_scheduled_at, v_request.approved_at),
      'status', case
        when v_delivery_status = 'sent' then 'sent'
        when v_delivery_status in ('failed', 'cancelled') then v_delivery_status
        else 'queued'
      end,
      'idempotent', true
    );
  end if;

  insert into public.company_talent_requests (
    company_workspace_id,
    contact_kind,
    delivery_body,
    delivery_subject,
    draft_revision,
    expects_document,
    expires_at,
    in_reply_to_company_talent_relay_id,
    intent,
    recommendation_id,
    request_context,
    role_id,
    source_company_message_id,
    talent_id,
    workflow_status,
    approved_at
  ) values (
    p_workspace_id,
    'contact',
    v_body,
    v_subject,
    1,
    false,
    'infinity'::timestamptz,
    p_relay_id,
    'ordinary',
    v_recommendation_id,
    btrim(p_request_context),
    v_role_id,
    p_source_company_message_id,
    v_talent_id,
    'queued',
    v_now
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
    v_talent_id,
    'company_request_candidate_delivery',
    'queued',
    jsonb_build_object(
      'requestId', v_request.id,
      'deliveryMode', 'immediate',
      'replyToRelayId', p_relay_id,
      'delivery', jsonb_build_object(
        'subject', v_subject,
        'chatText', v_body,
        'draftRevision', 1
      )
    ),
    v_now,
    v_role_id,
    v_recommendation_id,
    v_request.id
  );

  return jsonb_build_object(
    'requestId', v_request.id,
    'relayId', p_relay_id,
    'scheduledAt', v_now,
    'status', 'queued',
    'idempotent', false
  );
end;
$$;

-- The existing delivery trigger calls this function. Resolve progress from the
-- recommendation anchor so a relay without an originating company request is
-- represented in the same candidate/Role activity feed.
create or replace function public.record_company_talent_relay_progress_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text;
  v_relay public.company_talent_relays%rowtype;
  v_request public.company_talent_requests%rowtype;
  v_recommendation public.talent_opportunity_recommendation%rowtype;
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

  select recommendation.* into v_recommendation
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = v_relay.recommendation_id;
  if not found then return new; end if;

  if v_relay.company_talent_request_id is not null then
    select request.* into v_request
    from public.company_talent_requests request
    where request.id = v_relay.company_talent_request_id;
  end if;

  v_body := nullif(btrim(new.payload #>> '{delivery,body}'), '');
  if v_body is null then return new; end if;

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
      v_recommendation.talent_id,
      v_recommendation.role_id,
      v_recommendation.id,
      v_body,
      null,
      null,
      'org_candidate_activity',
      jsonb_strip_nulls(jsonb_build_object(
        'eventKey', 'company_talent_relay:' || v_relay.id::text || ':delivered',
        'eventType', 'candidate_message_delivered',
        'relayId', v_relay.id,
        'requestId', v_relay.company_talent_request_id,
        'requestKind', v_request.contact_kind,
        'requestContext', v_request.request_context
      )),
      coalesce(new.sent_at, new.updated_at, transaction_timestamp())
    )
    on conflict do nothing;
  exception when others then
    raise warning 'Could not record company talent relay progress: %', sqlerrm;
  end;

  return new;
end;
$$;

comment on column public.company_talent_relays.recommendation_id is
  'Durable candidate/Role relationship that authorizes this transmission independently of how the connection originated.';
comment on column public.company_talent_requests.in_reply_to_company_talent_relay_id is
  'Candidate relay being answered by this immediate company-to-talent transmission; null for company-initiated official contact.';

revoke all on function public.create_company_talent_relay_v2(uuid, uuid, bigint, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.send_company_talent_relay_reply_v1(uuid, uuid, bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_company_talent_relay_v2(uuid, uuid, bigint, text, uuid, uuid)
  to service_role;
grant execute on function public.send_company_talent_relay_reply_v1(uuid, uuid, bigint, text, text, text)
  to service_role;

commit;
