begin;

-- One durable request row, with rendered delivery copies kept in contact_queue.
create table public.company_talent_requests (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  recommendation_id uuid not null
    references public.talent_opportunity_recommendation(id) on delete cascade,
  talent_id uuid not null
    references public.talent_users(user_id) on delete cascade,
  source_company_message_id bigint not null
    references public.company_messages(id) on delete restrict,
  expects_document boolean not null default false,
  request_context text not null,
  workflow_status text not null default 'queued',
  expires_at timestamptz not null default (now() + interval '14 days'),
  talent_source_message_id bigint
    references public.talent_messages(id) on delete set null,
  document_id uuid references public.talent_documents(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.company_talent_requests is
  'Company questions and resume requests relayed through Harper.';

-- Only the durable outbox and reply alias need a direct request link. The
-- request row points to the actual talent response; delivery records keep their
-- normal message relation and optional requestId metadata.
alter table public.contact_queue
  add column if not exists company_talent_request_id uuid
    references public.company_talent_requests(id) on delete cascade;
alter table public.email_reply_aliases
  add column if not exists company_talent_request_id uuid
    references public.company_talent_requests(id) on delete cascade;

-- These two legacy columns were guarded by growing value lists. The application
-- already owns these extensible labels, so this feature removes the rigid lists
-- instead of replacing them with a still larger enum-like CHECK.
alter table public.contact_queue drop constraint if exists contact_queue_type_check;
alter table public.career_email_messages
  drop constraint if exists career_email_messages_mail_type_check;

create unique index company_talent_requests_source_message_uidx
  on public.company_talent_requests(source_company_message_id);
create index company_talent_requests_workspace_talent_idx
  on public.company_talent_requests(company_workspace_id, talent_id, created_at desc);
create index company_talent_requests_talent_status_idx
  on public.company_talent_requests(talent_id, workflow_status, created_at desc);
create unique index contact_queue_company_request_type_uidx
  on public.contact_queue(company_talent_request_id, type)
  where company_talent_request_id is not null;
create unique index email_reply_aliases_company_request_uidx
  on public.email_reply_aliases(company_talent_request_id)
  where company_talent_request_id is not null;

alter table public.company_talent_requests enable row level security;
revoke all on table public.company_talent_requests from public, anon, authenticated;
grant all on table public.company_talent_requests to service_role;

-- Older environments may have recorded the processed-stage migration before this
-- helper was added to that migration file. Define it here before relying on it.
create or replace function public.internal_opportunity_is_stage_tag(p_tag text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select btrim(coalesce(p_tag, '')) in (
    '내부:수락', '내부:아카이브', '내부:연결됨', '내부:최종오퍼',
    '내부:보류', '내부:연결대기', '내부:프로세스중단', '내부:거절'
  ) or btrim(coalesce(p_tag, '')) like '내부단계:%'
$$;

revoke all on function public.internal_opportunity_is_stage_tag(text)
from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant select, update on table public.company_talent_requests to harper_worker;
    create policy company_talent_requests_worker_access
      on public.company_talent_requests for all to harper_worker
      using (true) with check (true);
  end if;
end;
$$;

create or replace function public.company_talent_request_stage_is_pending_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select tag.tag = '내부:연결대기'
    from public.company_talent_requests request
    join public.talent_opportunity_tag tag
      on tag.opportunity_id = request.role_id
     and tag.talent_id = request.talent_id
    where request.id = p_request_id
      and public.internal_opportunity_is_stage_tag(tag.tag)
    order by tag.updated_at desc, tag.created_at desc, tag.id desc
    limit 1
  ), false)
$$;

create or replace function public.reconcile_company_talent_requests_for_stage_v1(
  p_talent_id uuid,
  p_role_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.contact_queue queue set
    status = 'cancelled',
    cancelled_at = coalesce(queue.cancelled_at, now()),
    last_error = case
      when queue.type = 'company_request_company_delivery'
        then 'stage_changed_before_relay'
      else 'stage_changed_before_send'
    end,
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where queue.type in (
      'company_request_candidate_delivery', 'company_request_company_delivery'
    )
    and queue.status in ('queued', 'processing')
    and exists (
      select 1
      from public.company_talent_requests request
      where request.id = queue.company_talent_request_id
        and request.talent_id = p_talent_id
        and request.role_id = p_role_id
        and request.workflow_status in ('queued', 'relay_queued')
        and not public.company_talent_request_stage_is_pending_v1(request.id)
    );

  update public.company_talent_requests request set
    workflow_status = 'closed'
  where request.talent_id = p_talent_id
    and request.role_id = p_role_id
    and request.workflow_status in ('queued', 'awaiting_talent')
    and not public.company_talent_request_stage_is_pending_v1(request.id);

  update public.company_talent_requests request set
    workflow_status = 'review_required'
  where request.talent_id = p_talent_id
    and request.role_id = p_role_id
    and request.workflow_status = 'relay_queued'
    and not public.company_talent_request_stage_is_pending_v1(request.id);
end;
$$;

create or replace function public.reconcile_company_talent_requests_stage_tag_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op <> 'DELETE' and public.internal_opportunity_is_stage_tag(new.tag) then
    perform public.reconcile_company_talent_requests_for_stage_v1(
      new.talent_id, new.opportunity_id
    );
  end if;
  if tg_op <> 'INSERT'
     and public.internal_opportunity_is_stage_tag(old.tag)
     and (
       tg_op = 'DELETE'
       or old.talent_id is distinct from new.talent_id
       or old.opportunity_id is distinct from new.opportunity_id
       or old.tag is distinct from new.tag
     ) then
    perform public.reconcile_company_talent_requests_for_stage_v1(
      old.talent_id, old.opportunity_id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists reconcile_company_talent_requests_stage_tag
on public.talent_opportunity_tag;
create trigger reconcile_company_talent_requests_stage_tag
after insert or update or delete on public.talent_opportunity_tag
for each row execute function public.reconcile_company_talent_requests_stage_tag_v1();

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
    join public.company_messages message on message.id = p_source_company_message_id
    where recommendation.id = p_recommendation_id
      and recommendation.talent_id = p_talent_id
      and recommendation.role_id = p_role_id
      and role.company_workspace_id = p_workspace_id
      and message.company_workspace_id = p_workspace_id
      and message.role_id = p_role_id
      and message.role = 'user'
  ) then
    raise exception using errcode = 'P0002', message = 'company_talent_request_target_not_found';
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
    jsonb_build_object('requestId', v_request.id), v_now, p_role_id,
    p_recommendation_id, v_request.id
  );
  return v_request;
end;
$$;

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
  if v_request.expires_at <= now() then
    update public.company_talent_requests set
      workflow_status = 'closed'
    where id = p_request_id returning * into v_request;
    return v_request;
  end if;
  if v_request.workflow_status <> 'awaiting_talent' then
    raise exception using errcode = 'P0001', message = 'company_talent_request_not_answerable';
  end if;

  update public.company_talent_requests set
    workflow_status = case
      when public.company_talent_request_stage_is_pending_v1(p_request_id)
        then 'relay_queued'
      else 'review_required'
    end,
    talent_source_message_id = p_source_message_id
  where id = p_request_id returning * into v_request;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) select
    v_request.talent_id, 'company_request_company_delivery', 'queued',
    jsonb_build_object('requestId', v_request.id), now(),
    v_request.role_id, v_request.recommendation_id, v_request.id
  where v_request.workflow_status = 'relay_queued'
  on conflict (company_talent_request_id, type)
    where company_talent_request_id is not null do nothing;
  return v_request;
end;
$$;

-- A requested resume becomes the talent's normal primary public resume.
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

create or replace function public.store_company_talent_relay_body_v1(
  p_request_id uuid,
  p_body text
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
  where id = p_request_id
  for update;
  if not found or v_request.workflow_status <> 'relay_queued' then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_not_ready';
  end if;
  if v_request.expires_at <= now() then
    update public.company_talent_requests set
      workflow_status = 'closed'
    where id = p_request_id returning * into v_request;
    update public.contact_queue set
      status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
      last_error = 'request_expired', locked_at = null, locked_by = null,
      updated_at = now()
    where company_talent_request_id = p_request_id
      and type = 'company_request_company_delivery';
    return v_request;
  end if;
  if not public.company_talent_request_stage_is_pending_v1(p_request_id) then
    update public.company_talent_requests set
      workflow_status = 'review_required'
    where id = p_request_id returning * into v_request;
    update public.contact_queue set
      status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, now()),
      last_error = 'stage_changed_before_relay',
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where company_talent_request_id = p_request_id
      and type = 'company_request_company_delivery';
    return v_request;
  end if;

  update public.contact_queue set
    payload = case
      when nullif(payload -> 'delivery' ->> 'body', '') is not null then payload
      else jsonb_set(
        coalesce(payload, '{}'::jsonb),
        '{delivery}',
        jsonb_build_object('body', left(btrim(p_body), 6000)),
        true
      )
    end,
    updated_at = now()
  where company_talent_request_id = p_request_id
    and type = 'company_request_company_delivery';
  return v_request;
end;
$$;

create or replace function public.finalize_company_talent_delivery_v1(
  p_request_id uuid,
  p_slack_message_ts text default null,
  p_slack_bot_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_source public.company_messages%rowtype;
  v_payload jsonb;
  v_body text;
  v_message_id bigint;
  v_now timestamptz := transaction_timestamp();
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_request_not_found';
  end if;
  select * into v_source
  from public.company_messages
  where id = v_request.source_company_message_id;
  select payload into v_payload
  from public.contact_queue
  where company_talent_request_id = p_request_id
    and type = 'company_request_company_delivery'
  for update;
  v_body := v_payload -> 'delivery' ->> 'body';
  if nullif(btrim(v_body), '') is null then
    raise exception using errcode = 'P0002', message = 'company_talent_relay_body_not_found';
  end if;

  if (v_payload -> 'delivery' ->> 'companyMessageId') ~ '^[0-9]+$' then
    v_message_id := (v_payload -> 'delivery' ->> 'companyMessageId')::bigint;
  end if;
  if v_message_id is null then
    select id into v_message_id
    from public.company_messages
    where role = 'assistant'
      and metadata ->> 'requestId' = p_request_id::text
    order by id desc
    limit 1;
  end if;
  if v_request.workflow_status = 'delivered' and v_message_id is not null then
    return jsonb_build_object(
      'status', 'delivered', 'messageId', v_message_id, 'idempotent', true
    );
  end if;

  if (
       v_request.expires_at <= v_now
       or not public.company_talent_request_stage_is_pending_v1(p_request_id)
     )
     and not (
       v_source.slack_thread_id is not null
       and nullif(btrim(p_slack_message_ts), '') is not null
     ) then
    update public.company_talent_requests set
      workflow_status = case
        when v_request.expires_at <= v_now then 'closed'
        else 'review_required'
      end
    where id = p_request_id;
    update public.contact_queue set
      status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, v_now),
      last_error = case
        when v_request.expires_at <= v_now then 'request_expired'
        else 'stage_changed_before_relay'
      end,
      locked_at = null,
      locked_by = null,
      updated_at = v_now
    where company_talent_request_id = p_request_id
      and type = 'company_request_company_delivery';
    return jsonb_build_object(
      'status',
      case when v_request.expires_at <= v_now then 'closed' else 'review_required' end,
      'idempotent', false
    );
  end if;

  if v_message_id is null and v_source.slack_thread_id is not null
     and nullif(btrim(p_slack_message_ts), '') is not null then
    select id into v_message_id
    from public.company_messages
    where slack_thread_id = v_source.slack_thread_id
      and slack_message_ts = p_slack_message_ts
      and role = 'assistant'
      and content = v_body
    order by id desc
    limit 1;
  end if;

  if v_message_id is null then
    insert into public.company_messages (
      conversation_id, company_workspace_id, role_id, role, content,
      message_type, status, mentions, thinking_logs, metadata,
      slack_thread_id, slack_message_ts, slack_user_id
    ) values (
      v_source.conversation_id, v_request.company_workspace_id,
      v_request.role_id, 'assistant', v_body,
      case when v_source.slack_thread_id is null then 'chat' else 'slack' end,
      'completed',
      jsonb_build_array(jsonb_build_object(
        'displayName', coalesce((
          select talent.name
          from public.talent_users talent
          where talent.user_id = v_request.talent_id
        ), ''),
        'talentId', v_request.talent_id,
        'roleId', v_request.role_id,
        'recommendationId', v_request.recommendation_id
      )),
      '[]'::jsonb,
      jsonb_build_object(
        'source', 'company_talent_request_relay',
        'requestId', p_request_id
      ),
      v_source.slack_thread_id,
      case when v_source.slack_thread_id is null then null else p_slack_message_ts end,
      case when v_source.slack_thread_id is null then null else p_slack_bot_user_id end
    ) returning id into v_message_id;
  end if;

  update public.company_conversations set
    last_message_id = v_message_id,
    last_message_at = v_now,
    updated_at = v_now
  where id = v_source.conversation_id;
  update public.company_talent_requests set
    workflow_status = 'delivered'
  where id = p_request_id;
  update public.contact_queue set
    payload = jsonb_set(
      coalesce(payload, '{}'::jsonb),
      '{delivery}',
      coalesce(payload -> 'delivery', '{}'::jsonb)
        || jsonb_build_object('body', v_body, 'companyMessageId', v_message_id),
      true
    ),
    status = 'sent',
    sent_at = coalesce(sent_at, v_now),
    locked_at = null,
    locked_by = null,
    last_error = null,
    updated_at = v_now
  where company_talent_request_id = p_request_id
    and type = 'company_request_company_delivery';
  return jsonb_build_object(
    'status', 'delivered', 'messageId', v_message_id, 'idempotent', false
  );
end;
$$;

revoke all on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) from public, anon, authenticated;
revoke all on function public.company_talent_request_stage_is_pending_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_company_talent_requests_for_stage_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_company_talent_requests_stage_tag_v1()
  from public, anon, authenticated;
revoke all on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.store_company_talent_relay_body_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.finalize_company_talent_delivery_v1(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_company_talent_request_v1(
  uuid, uuid, uuid, uuid, bigint, boolean, text
) to service_role;
grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
  to service_role;
grant execute on function public.reconcile_company_talent_requests_for_stage_v1(uuid, uuid)
  to service_role;
grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  to service_role;
grant execute on function public.finalize_talent_resume_upload_v1(
  uuid, uuid, uuid, text, text, text, bigint, text
) to service_role;
grant execute on function public.store_company_talent_relay_body_v1(uuid, text)
  to service_role;
grant execute on function public.finalize_company_talent_delivery_v1(uuid, text, text)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
      to harper_worker;
    grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
      to harper_worker;
    grant execute on function public.store_company_talent_relay_body_v1(uuid, text)
      to harper_worker;
  end if;
end;
$$;

commit;
