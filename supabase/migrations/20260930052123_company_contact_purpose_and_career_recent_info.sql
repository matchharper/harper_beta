-- Whether the company expects a candidate response is independent of the
-- legacy question/resume/contact transport kind. Old rows are backfilled from
-- a read-only review of the 41 production contacts on 2026-09-30.
alter table public.company_talent_requests
  add column contact_purpose text not null default 'deliver';

alter table public.company_talent_requests
  add constraint company_talent_requests_contact_purpose_check
  check (contact_purpose in ('request', 'deliver'));

update public.company_talent_requests
set contact_purpose = 'request'
where contact_kind in ('question', 'resume')
  and id <> 'c63aa7fb-cec8-41b2-96e1-e33a7d2d2ca1'::uuid;

-- Legacy contact-kind messages that explicitly ask for an answer, decision,
-- document, or contact information. The other four reviewed contact-kind
-- messages and the one question-kind notice above are informational.
update public.company_talent_requests
set contact_purpose = 'request'
where id in (
  '22e561c3-65d0-4eac-bd7c-ac2d8b9bfa3a',
  'febabee7-8d1e-4d75-b073-2d7fdc735b22',
  '2639ecef-62c5-4673-b9e4-796978d07925',
  'a0414976-3600-4f43-a276-317a637c9d69',
  'b3d6764f-7ca3-48b9-ac02-ab82ac2fbdad',
  '6b29a627-0abb-4d8f-abde-38854b7636cd'
);

comment on column public.company_talent_requests.contact_purpose is
  'request: asks the candidate for an answer or action; deliver: information only. Omitted new values default to deliver.';

-- Keep the existing authorization, idempotency and delivery RPCs intact.
-- The wrapper saves the purpose in the same transaction before the queued
-- message can be consumed. A retry preserves the purpose of the first write.
create function public.send_company_talent_contact_v2(
  p_request_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_source_company_message_id bigint,
  p_subject text,
  p_body text,
  p_request_context text,
  p_contact_purpose text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_contact_purpose not in ('request', 'deliver') or p_contact_purpose is null then
    raise exception 'invalid_company_contact_purpose';
  end if;
  v_result := public.send_company_talent_contact_v1(
    p_request_id, p_workspace_id, p_role_id, p_talent_id,
    p_recommendation_id, p_source_company_message_id,
    p_subject, p_body, p_request_context
  );
  if coalesce((v_result->>'idempotent')::boolean, false) = false then
    update public.company_talent_requests
    set contact_purpose = p_contact_purpose
    where id = (v_result->>'requestId')::uuid;
  end if;
  return v_result;
end;
$$;

revoke all on function public.send_company_talent_contact_v2(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.send_company_talent_contact_v2(
  uuid, uuid, uuid, uuid, uuid, bigint, text, text, text, text
) to service_role;

create function public.send_company_talent_relay_reply_v2(
  p_relay_id uuid,
  p_workspace_id uuid,
  p_source_company_message_id bigint,
  p_subject text,
  p_body text,
  p_request_context text,
  p_contact_purpose text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_contact_purpose not in ('request', 'deliver') or p_contact_purpose is null then
    raise exception 'invalid_company_contact_purpose';
  end if;
  v_result := public.send_company_talent_relay_reply_v1(
    p_relay_id, p_workspace_id, p_source_company_message_id,
    p_subject, p_body, p_request_context
  );
  if coalesce((v_result->>'idempotent')::boolean, false) = false then
    update public.company_talent_requests
    set contact_purpose = p_contact_purpose
    where id = (v_result->>'requestId')::uuid;
  end if;
  return v_result;
end;
$$;

revoke all on function public.send_company_talent_relay_reply_v2(
  uuid, uuid, bigint, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.send_company_talent_relay_reply_v2(
  uuid, uuid, bigint, text, text, text, text
) to service_role;

-- One chronological read across delivered information and terminal accepted
-- internal opportunities. Called only by the authenticated talent API with
-- its verified user ID. Older events use a stable (time, event ID) cursor.
create function public.fetch_career_recent_info_v1(
  p_talent_id uuid,
  p_before_at timestamptz default null,
  p_before_id text default null,
  p_since timestamptz default null,
  p_limit integer default 10
)
returns table (
  event_id text,
  kind text,
  occurred_at timestamptz,
  role_id uuid,
  company_name text,
  role_name text,
  body text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with events as (
    select
      'contact:' || request.id::text as event_id,
      'company_deliver'::text as kind,
      delivery.sent_at as occurred_at,
      request.role_id,
      workspace.company_name::text,
      role.name::text as role_name,
      request.delivery_body::text as body
    from public.company_talent_requests request
    join lateral (
      select queue.sent_at
      from public.contact_queue queue
      where queue.company_talent_request_id = request.id
        and queue.type = 'company_request_candidate_delivery'
        and queue.status = 'sent'
        and queue.sent_at is not null
      order by queue.sent_at desc
      limit 1
    ) delivery on true
    join public.company_roles role on role.role_id = request.role_id
    join public.company_workspace workspace
      on workspace.company_workspace_id = request.company_workspace_id
    where request.talent_id = p_talent_id
      and request.contact_purpose = 'deliver'
      and (
        coalesce((role.information->>'testOnly')::boolean, false) = false
        or coalesce(role.information->'testTalentIds' ? p_talent_id::text, false)
      )

    union all

    select
      'closed:' || recommendation.id::text as event_id,
      case when role.status in ('ended', 'deleted')
        then 'role_ended' else 'process_ended' end::text as kind,
      case when role.status in ('ended', 'deleted')
        then role.updated_at
        else stage.updated_at end as occurred_at,
      recommendation.role_id,
      workspace.company_name::text,
      role.name::text as role_name,
      null::text as body
    from public.talent_opportunity_recommendation recommendation
    join public.company_roles role on role.role_id = recommendation.role_id
    join public.company_workspace workspace
      on workspace.company_workspace_id = role.company_workspace_id
    left join lateral (
      select tag.tag, tag.updated_at
      from public.talent_opportunity_tag tag
      where tag.talent_id = recommendation.talent_id
        and tag.opportunity_id = recommendation.role_id
      order by tag.updated_at desc nulls last, tag.created_at desc, tag.id desc
      limit 1
    ) stage on true
    where recommendation.talent_id = p_talent_id
      and recommendation.feedback = 'like'
      and role.source_type = 'internal'
      and (
        role.status in ('ended', 'deleted')
        or stage.tag in ('내부:프로세스중단', '내부:아카이브')
      )
      and (
        coalesce((role.information->>'testOnly')::boolean, false) = false
        or coalesce(role.information->'testTalentIds' ? p_talent_id::text, false)
      )
  )
  select events.*
  from events
  where events.occurred_at is not null
    and (p_since is null or events.occurred_at >= p_since)
    and (
      p_before_at is null
      or (events.occurred_at, events.event_id) <
        (p_before_at, coalesce(p_before_id, ''))
    )
  order by events.occurred_at desc, events.event_id desc
  limit least(greatest(p_limit, 1), 201);
$$;

revoke all on function public.fetch_career_recent_info_v1(
  uuid, timestamptz, text, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.fetch_career_recent_info_v1(
  uuid, timestamptz, text, timestamptz, integer
) to service_role;
