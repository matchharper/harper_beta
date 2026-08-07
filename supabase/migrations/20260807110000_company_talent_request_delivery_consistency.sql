begin;

-- Before the candidate email is accepted by the provider, the current
-- opportunity stage is a valid reason to stop the request. Once that external
-- delivery is committed, the request must stay answerable: changing an
-- internal stage cannot unsend the email or discard a later candidate reply.
-- Keep the existing RPC name for compatibility, but treat a sent candidate
-- delivery as a monotonic continuation condition in addition to the live tag.
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
    select
      exists (
        select 1
        from public.contact_queue queue
        where queue.company_talent_request_id = request.id
          and queue.type = 'company_request_candidate_delivery'
          and queue.status = 'sent'
          and queue.sent_at is not null
      )
      or coalesce((
        select tag.tag = '내부:연결대기'
        from public.talent_opportunity_tag tag
        where tag.opportunity_id = request.role_id
          and tag.talent_id = request.talent_id
          and public.internal_opportunity_is_stage_tag(tag.tag)
        order by tag.updated_at desc, tag.created_at desc, tag.id desc
        limit 1
      ), false)
    from public.company_talent_requests request
    where request.id = p_request_id
  ), false)
$$;

comment on function public.company_talent_request_stage_is_pending_v1(uuid) is
  'True while the request may continue: the opportunity is pending, or candidate delivery is already committed.';

-- A stage change may cancel work which has not started. It must not rewrite a
-- processing job because that job may already be inside the external provider
-- call. The worker rechecks the stage immediately before that call and owns the
-- final outcome of processing work.
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
    last_error = 'stage_changed_before_send',
    locked_at = null,
    locked_by = null,
    updated_at = now()
  where queue.type = 'company_request_candidate_delivery'
    and queue.status in ('queued', 'failed')
    and exists (
      select 1
      from public.company_talent_requests request
      where request.id = queue.company_talent_request_id
        and request.talent_id = p_talent_id
        and request.role_id = p_role_id
        and request.workflow_status in ('queued', 'failed')
        and not public.company_talent_request_stage_is_pending_v1(request.id)
    );

  update public.company_talent_requests request set
    workflow_status = 'closed'
  where request.talent_id = p_talent_id
    and request.role_id = p_role_id
    and request.workflow_status in ('queued', 'failed')
    and not public.company_talent_request_stage_is_pending_v1(request.id)
    and exists (
      select 1
      from public.contact_queue queue
      where queue.company_talent_request_id = request.id
        and queue.type = 'company_request_candidate_delivery'
        and queue.status = 'cancelled'
    );
end;
$$;

-- Reinstall the response transition against the continuation predicate above.
-- The LLM still decides whether the message answers or declines the request;
-- this RPC only records that model-authorized decision atomically.
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

revoke all on function public.company_talent_request_stage_is_pending_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_company_talent_requests_for_stage_v1(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  from public, anon, authenticated;

grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
  to service_role;
grant execute on function public.reconcile_company_talent_requests_for_stage_v1(uuid, uuid)
  to service_role;
grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
      to harper_worker;
    grant execute on function public.record_company_talent_response_v1(uuid, uuid, bigint)
      to harper_worker;
  end if;
end;
$$;

commit;
