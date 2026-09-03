begin;

-- Candidate questions and resume requests belong to the whole active company
-- process, not only the initial connection-decision stage.
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
      latest_stage.tag in (
        '내부:연결대기',
        '내부:연결됨',
        '내부:최종오퍼'
      ) or latest_stage.tag like '내부단계:%'
    from public.company_talent_requests request
    join lateral (
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

-- Keep existing database functions that still depend on the old helper name
-- correct during a rolling application/worker rollout. New callers use the
-- active-target name above.
create or replace function public.company_talent_request_stage_is_pending_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.company_talent_request_target_is_active_v1(p_request_id);
$$;

create or replace function public.schedule_company_talent_request_v1(
  p_request_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_talent_id uuid,
  p_expected_revision integer,
  p_delivery_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_now timestamptz := transaction_timestamp();
  v_scheduled_at timestamptz;
begin
  if p_delivery_mode is null
     or p_delivery_mode not in ('standard', 'immediate') then
    raise exception using
      errcode = '22023',
      message = 'company_talent_request_delivery_mode_invalid';
  end if;

  select * into v_request
  from public.company_talent_requests
  where id = p_request_id
    and company_workspace_id = p_workspace_id
    and role_id = p_role_id
    and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'company_talent_request_not_found';
  end if;
  if v_request.workflow_status <> 'draft' then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_not_draft';
  end if;
  if v_request.expires_at <= v_now then
    update public.company_talent_requests
    set workflow_status = 'closed'
    where id = p_request_id;
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_draft_expired';
  end if;
  if v_request.draft_revision <> p_expected_revision then
    raise exception using
      errcode = '40001',
      message = 'company_talent_request_draft_stale';
  end if;
  if length(btrim(coalesce(v_request.delivery_subject, ''))) = 0
     or length(btrim(coalesce(v_request.delivery_body, ''))) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_draft_incomplete';
  end if;
  if not public.company_talent_request_target_is_active_v1(p_request_id) then
    raise exception using
      errcode = 'P0001',
      message = 'company_talent_request_target_not_active';
  end if;

  v_scheduled_at := case
    when p_delivery_mode = 'immediate' then v_now
    else v_now + interval '20 minutes'
  end;

  update public.company_talent_requests
  set workflow_status = 'queued',
      approved_at = coalesce(approved_at, v_now)
  where id = p_request_id;

  insert into public.contact_queue (
    user_id, type, status, payload, scheduled_at, role_id,
    recommendation_id, company_talent_request_id
  ) values (
    v_request.talent_id,
    'company_request_candidate_delivery',
    'queued',
    jsonb_build_object(
      'requestId', v_request.id,
      'deliveryMode', p_delivery_mode,
      'delivery', jsonb_build_object(
        'subject', v_request.delivery_subject,
        'chatText', v_request.delivery_body,
        'draftRevision', v_request.draft_revision
      )
    ),
    v_scheduled_at,
    v_request.role_id,
    v_request.recommendation_id,
    v_request.id
  );

  return jsonb_build_object(
    'status', case when p_delivery_mode = 'immediate' then 'immediate' else 'queued' end,
    'requestId', v_request.id,
    'scheduledAt', v_scheduled_at,
    'revision', v_request.draft_revision
  );
end;
$$;

revoke all on function public.company_talent_request_target_is_active_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.company_talent_request_target_is_active_v1(uuid)
  to service_role;

revoke all on function public.company_talent_request_stage_is_pending_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.company_talent_request_stage_is_pending_v1(uuid)
  to service_role;

revoke all on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.schedule_company_talent_request_v1(
  uuid, uuid, uuid, uuid, integer, text
) to service_role;

commit;
