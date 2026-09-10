begin;

-- A compact, read-only index for company-side LLM contact discovery. The
-- detailed readers continue to use the owning workflow tables so this does not
-- create a second source of truth for communication state or content.
create or replace function public.list_company_contact_index_v1(
  p_company_workspace_id uuid,
  p_kind text default null,
  p_talent_id uuid default null,
  p_role_id uuid default null,
  p_query text default null,
  p_date_basis text default 'updated',
  p_after timestamptz default null,
  p_before timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 20
)
returns table (
  source_id uuid,
  kind text,
  talent_id uuid,
  talent_name text,
  talent_email text,
  role_id uuid,
  role_name text,
  company_user_id uuid,
  company_user_name text,
  company_user_email text,
  created_at timestamptz,
  sent_at timestamptz,
  updated_at timestamptz,
  activity_at timestamptz,
  workflow_status text,
  delivery_status text,
  relay_status text,
  expects_document boolean,
  expires_at timestamptz,
  relay_sent_at timestamptz,
  has_response boolean,
  response_received_at timestamptz,
  confirmed_start_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with candidate_contacts as (
    select
      request.id as source_id,
      'contact'::text as kind,
      request.talent_id,
      talent.name as talent_name,
      talent.email as talent_email,
      request.role_id,
      role.name as role_name,
      source_message.company_user_id,
      company_user.name as company_user_name,
      company_user.email as company_user_email,
      request.created_at,
      candidate_delivery.sent_at,
      greatest(
        request.updated_at,
        coalesce(candidate_delivery.updated_at, request.updated_at),
        coalesce(company_delivery.updated_at, request.updated_at),
        coalesce(response_message.created_at, response_document.created_at, request.updated_at)
      ) as updated_at,
      request.workflow_status,
      candidate_delivery.status as delivery_status,
      company_delivery.status as relay_status,
      request.expects_document,
      request.expires_at,
      company_delivery.sent_at as relay_sent_at,
      (request.talent_source_message_id is not null or request.document_id is not null) as has_response,
      coalesce(response_message.created_at, response_document.created_at) as response_received_at,
      null::timestamptz as confirmed_start_at
    from public.company_talent_requests request
    join public.company_roles role
      on role.role_id = request.role_id
     and role.company_workspace_id = request.company_workspace_id
    join public.talent_users talent on talent.user_id = request.talent_id
    left join public.company_messages source_message
      on source_message.id = request.source_company_message_id
     and source_message.company_workspace_id = request.company_workspace_id
    left join public.company_users company_user
      on company_user.user_id = source_message.company_user_id
    left join lateral (
      select queue.status, queue.sent_at, queue.updated_at
      from public.contact_queue queue
      where queue.company_talent_request_id = request.id
        and queue.type = 'company_request_candidate_delivery'
      order by queue.updated_at desc, queue.id desc
      limit 1
    ) candidate_delivery on true
    left join lateral (
      select queue.status, queue.sent_at, queue.updated_at
      from public.contact_queue queue
      where queue.company_talent_request_id = request.id
        and queue.type = 'company_request_company_delivery'
      order by queue.updated_at desc, queue.id desc
      limit 1
    ) company_delivery on true
    left join public.talent_messages response_message
      on response_message.id = request.talent_source_message_id
    left join public.talent_documents response_document
      on response_document.id = request.document_id
    where request.company_workspace_id = p_company_workspace_id
      and talent.deleted_at is null
  ),
  interview_requests as (
    select
      schedule.id as source_id,
      'interview_request'::text as kind,
      schedule.talent_id,
      talent.name as talent_name,
      talent.email as talent_email,
      schedule.role_id,
      role.name as role_name,
      schedule.organizer_company_user_id as company_user_id,
      company_user.name as company_user_name,
      company_user.email as company_user_email,
      coalesce(source_message.created_at, delivery.created_at) as created_at,
      delivery.sent_at,
      greatest(
        schedule.updated_at,
        coalesce(round.updated_at, schedule.updated_at),
        coalesce(delivery.updated_at, schedule.updated_at)
      ) as updated_at,
      schedule.status as workflow_status,
      delivery.status as delivery_status,
      null::text as relay_status,
      false as expects_document,
      null::timestamptz as expires_at,
      null::timestamptz as relay_sent_at,
      (round.submitted_at is not null) as has_response,
      round.submitted_at as response_received_at,
      schedule.confirmed_start_at
    from public.meeting_schedules schedule
    join public.company_roles role
      on role.role_id = schedule.role_id
     and role.company_workspace_id = schedule.company_workspace_id
    join public.talent_users talent on talent.user_id = schedule.talent_id
    left join public.company_users company_user
      on company_user.user_id = schedule.organizer_company_user_id
    left join public.meeting_schedule_rounds round
      on round.id = schedule.active_round_id
     and round.schedule_id = schedule.id
    left join public.contact_queue delivery
      on delivery.id = round.delivery_queue_id
     and delivery.type = 'meeting_schedule_candidate_invitation'
    left join public.company_messages source_message
      on source_message.id = round.source_company_message_id
     and source_message.company_workspace_id = schedule.company_workspace_id
    where schedule.company_workspace_id = p_company_workspace_id
      and talent.deleted_at is null
  ),
  connection_intros as (
    select
      message.id as source_id,
      'connection_intro'::text as kind,
      message.talent_id,
      talent.name as talent_name,
      talent.email as talent_email,
      recommendation.role_id,
      role.name as role_name,
      case
        when coalesce(
          nullif(message.created_by::text, ''),
          nullif(message.metadata ->> 'companyUserId', '')
        ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(
            nullif(message.created_by::text, ''),
            nullif(message.metadata ->> 'companyUserId', '')
          )::uuid
        else null
      end as company_user_id,
      coalesce(company_user.name, nullif(message.metadata ->> 'companyUserName', '')) as company_user_name,
      company_user.email as company_user_email,
      message.created_at,
      case when message.status = 'sent' then message.occurred_at end as sent_at,
      greatest(
        message.occurred_at,
        coalesce(reply.latest_reply_at, message.occurred_at)
      ) as updated_at,
      message.status as workflow_status,
      message.status as delivery_status,
      null::text as relay_status,
      false as expects_document,
      null::timestamptz as expires_at,
      null::timestamptz as relay_sent_at,
      (reply.latest_reply_at is not null) as has_response,
      reply.latest_reply_at as response_received_at,
      null::timestamptz as confirmed_start_at
    from public.career_email_messages message
    join public.talent_opportunity_recommendation recommendation
      on recommendation.id::text = message.metadata ->> 'recommendationId'
     and recommendation.talent_id = message.talent_id
    join public.company_roles role
      on role.role_id = recommendation.role_id
     and role.company_workspace_id = p_company_workspace_id
    join public.talent_users talent on talent.user_id = message.talent_id
    left join public.company_users company_user
      on company_user.user_id::text = coalesce(
        message.created_by::text,
        nullif(message.metadata ->> 'companyUserId', '')
      )
    left join lateral (
      select max(candidate_reply.occurred_at) as latest_reply_at
      from public.career_email_messages candidate_reply
      where candidate_reply.talent_id = message.talent_id
        and candidate_reply.direction = 'inbound'
        and candidate_reply.status = 'received'
        and candidate_reply.mail_type = 'org_intro_reply'
        and candidate_reply.metadata ->> 'recommendationId' =
          message.metadata ->> 'recommendationId'
    ) reply on true
    where message.direction = 'outbound'
      and talent.deleted_at is null
      and (
        message.mail_type = 'org_intro'
        or message.metadata ->> 'intendedMailType' = 'org_intro'
      )
  ),
  notices as (
    select
      message.id as source_id,
      'notice'::text as kind,
      message.talent_id,
      talent.name as talent_name,
      talent.email as talent_email,
      recommendation.role_id,
      role.name as role_name,
      initiator.company_user_id,
      case
        when message.mail_type = 'internal_connection_confirmed' then 'Harper'
        else coalesce(company_user.name, company_user.email, '회사 담당자')
      end as company_user_name,
      company_user.email as company_user_email,
      message.created_at,
      message.occurred_at as sent_at,
      message.occurred_at as updated_at,
      message.status as workflow_status,
      message.status as delivery_status,
      null::text as relay_status,
      false as expects_document,
      null::timestamptz as expires_at,
      null::timestamptz as relay_sent_at,
      false as has_response,
      null::timestamptz as response_received_at,
      null::timestamptz as confirmed_start_at
    from public.career_email_messages message
    join public.talent_opportunity_recommendation recommendation
      on recommendation.id::text = message.metadata ->> 'recommendationId'
     and recommendation.talent_id = message.talent_id
    join public.company_roles role
      on role.role_id = recommendation.role_id
     and role.company_workspace_id = p_company_workspace_id
    join public.talent_users talent on talent.user_id = message.talent_id
    left join lateral (
      select progress.company_user_id
      from public.talent_progress progress
      where message.mail_type = 'internal_candidate_role_changed'
        and progress.kind = 'org_candidate_role_move'
        and progress.talent_id = message.talent_id
        and progress.role_id = recommendation.role_id
        and progress.metadata ->> 'transferId' = message.metadata ->> 'transferId'
      order by progress.created_at desc, progress.id desc
      limit 1
    ) initiator on true
    left join public.company_users company_user
      on company_user.user_id = initiator.company_user_id
    where message.direction = 'outbound'
      and message.status = 'sent'
      and message.mail_type in (
        'internal_connection_confirmed',
        'internal_candidate_role_changed'
      )
      and talent.deleted_at is null
  ),
  all_contacts as (
    select * from candidate_contacts
    union all
    select * from interview_requests
    union all
    select * from connection_intros
    union all
    select * from notices
  ),
  selected as (
    select
      contact.*,
      case p_date_basis
        when 'created' then contact.created_at
        when 'sent' then contact.sent_at
        else contact.updated_at
      end as selected_activity_at
    from all_contacts contact
    where (p_kind is null or contact.kind = p_kind)
      and (p_talent_id is null or contact.talent_id = p_talent_id)
      and (p_role_id is null or contact.role_id = p_role_id)
      and (
        nullif(btrim(p_query), '') is null
        or concat_ws(
          ' ',
          contact.talent_name,
          contact.talent_email,
          contact.role_name,
          contact.company_user_name,
          contact.company_user_email
        ) ilike '%' || btrim(p_query) || '%'
      )
  )
  select
    selected.source_id,
    selected.kind,
    selected.talent_id,
    selected.talent_name,
    selected.talent_email,
    selected.role_id,
    selected.role_name,
    selected.company_user_id,
    selected.company_user_name,
    selected.company_user_email,
    selected.created_at,
    selected.sent_at,
    selected.updated_at,
    selected.selected_activity_at as activity_at,
    selected.workflow_status,
    selected.delivery_status,
    selected.relay_status,
    selected.expects_document,
    selected.expires_at,
    selected.relay_sent_at,
    selected.has_response,
    selected.response_received_at,
    selected.confirmed_start_at
  from selected
  where selected.selected_activity_at is not null
    and (p_after is null or selected.selected_activity_at >= p_after)
    and (p_before is null or selected.selected_activity_at < p_before)
  order by selected.selected_activity_at desc, selected.kind, selected.source_id desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 20), 1), 101);
$$;

create index if not exists company_talent_requests_workspace_updated_idx
  on public.company_talent_requests (company_workspace_id, updated_at desc, id desc);

create index if not exists contact_queue_company_request_type_updated_idx
  on public.contact_queue (company_talent_request_id, type, updated_at desc)
  where company_talent_request_id is not null;

create index if not exists career_email_messages_org_intro_recommendation_idx
  on public.career_email_messages (
    (metadata ->> 'recommendationId'),
    occurred_at desc
  )
  where direction = 'outbound'
    and (
      mail_type = 'org_intro'
      or metadata ->> 'intendedMailType' = 'org_intro'
    );

create index if not exists career_email_messages_org_intro_reply_recommendation_idx
  on public.career_email_messages (
    (metadata ->> 'recommendationId'),
    occurred_at desc
  )
  where direction = 'inbound'
    and status = 'received'
    and mail_type = 'org_intro_reply';

create index if not exists career_email_messages_org_notice_recommendation_idx
  on public.career_email_messages (
    (metadata ->> 'recommendationId'),
    occurred_at desc
  )
  where direction = 'outbound'
    and status = 'sent'
    and mail_type in (
      'internal_connection_confirmed',
      'internal_candidate_role_changed'
    );

revoke all on function public.list_company_contact_index_v1(
  uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer
) from public, anon, authenticated;

grant execute on function public.list_company_contact_index_v1(
  uuid, text, uuid, uuid, text, text, timestamptz, timestamptz, integer, integer
) to service_role;

commit;
