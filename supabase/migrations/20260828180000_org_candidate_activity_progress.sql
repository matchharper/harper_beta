begin;

create unique index if not exists talent_progress_org_candidate_activity_event_key_uidx
  on public.talent_progress ((metadata ->> 'eventKey'))
  where kind = 'org_candidate_activity'
    and nullif(metadata ->> 'eventKey', '') is not null;

create or replace function public.record_contact_queue_org_candidate_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_user_id uuid;
  v_created_at timestamptz;
  v_event_key text;
  v_event_type text;
  v_expects_document boolean;
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
    request.expects_document,
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
    v_expects_document,
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
      case
        when v_expects_document then '후보자에게 최신 이력서를 요청했어요.'
        else '후보자에게 회사의 질문을 전달했어요.'
      end
    );
  else
    v_event_type := 'candidate_response_received';
    v_event_key := 'company_talent_request:' || v_request_id::text || ':candidate_response_received';
    v_text := coalesce(
      nullif(btrim(new.payload #>> '{delivery,body}'), ''),
      case
        when v_expects_document then '후보자에게 요청한 이력서를 받았어요.'
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
          'requestKind', case
            when v_expects_document then 'resume'
            else 'question'
          end,
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

revoke all on function public.record_contact_queue_org_candidate_activity_v1()
  from public, anon, authenticated;

drop trigger if exists contact_queue_org_candidate_activity_v1
  on public.contact_queue;
create trigger contact_queue_org_candidate_activity_v1
after update of status on public.contact_queue
for each row execute function public.record_contact_queue_org_candidate_activity_v1();

create or replace function public.record_confirmed_meeting_org_candidate_activity_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_message text;
  v_created_at timestamptz;
  v_timezone text;
begin
  if new.status is distinct from 'confirmed'
     or old.status is not distinct from 'confirmed'
     or new.confirmed_start_at is null then
    return new;
  end if;

  select
    round.submitted_at,
    nullif(btrim(round.selection_snapshot ->> 'companyMessage'), ''),
    nullif(btrim(round.selection_snapshot ->> 'timezone'), '')
  into
    v_created_at,
    v_company_message,
    v_timezone
  from public.meeting_schedule_rounds round
  where round.id = new.active_round_id;

  v_created_at := coalesce(
    v_created_at,
    new.updated_at,
    timezone('utc', now())
  );
  v_company_message := coalesce(
    v_company_message,
    '미팅이 확정됐어요.'
  );

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
      new.talent_id,
      new.role_id,
      new.recommendation_id,
      v_company_message,
      null,
      null,
      'org_candidate_activity',
      jsonb_strip_nulls(
        jsonb_build_object(
          'eventKey', 'meeting_schedule:' || new.id::text || ':meeting_confirmed',
          'eventType', 'meeting_confirmed',
          'scheduledAt', new.confirmed_start_at,
          'scheduledEndAt', new.confirmed_end_at,
          'durationMinutes', new.duration_minutes,
          'title', new.title,
          'timezone', v_timezone
        )
      ),
      v_created_at
    )
    on conflict do nothing;
  exception when others then
    raise warning 'Could not record confirmed meeting progress: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.record_confirmed_meeting_org_candidate_activity_v1()
  from public, anon, authenticated;

drop trigger if exists meeting_schedules_org_candidate_activity_v1
  on public.meeting_schedules;
create trigger meeting_schedules_org_candidate_activity_v1
after update of status on public.meeting_schedules
for each row execute function public.record_confirmed_meeting_org_candidate_activity_v1();

commit;
