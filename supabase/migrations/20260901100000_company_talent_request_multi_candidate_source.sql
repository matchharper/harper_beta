begin;

-- One company message may explicitly ask Harper to contact several candidates.
-- Preserve per-target idempotency without limiting the message to one request.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'company_talent_requests_source_message_uidx'
      and conrelid = 'public.company_talent_requests'::regclass
  ) then
    alter table public.company_talent_requests
      drop constraint company_talent_requests_source_message_uidx;
  end if;
end;
$$;

drop index if exists public.company_talent_requests_source_message_uidx;

create unique index if not exists company_talent_requests_source_message_target_uidx
  on public.company_talent_requests(
    source_company_message_id,
    role_id,
    talent_id
  );

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
  v_scheduled_at timestamptz := v_now + interval '20 minutes';
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
    jsonb_build_object('requestId', v_request.id), v_scheduled_at, p_role_id,
    p_recommendation_id, v_request.id
  );
  return v_request;
end;
$$;

commit;
