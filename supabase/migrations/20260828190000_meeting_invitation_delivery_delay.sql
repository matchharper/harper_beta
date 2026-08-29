-- Keep meeting invitations consistent with Harper's standard candidate-contact
-- delay so the company has a short window to add context before delivery.

create or replace function public.queue_meeting_schedule_invitation_v1(
  p_schedule_id uuid,
  p_company_workspace_id uuid,
  p_expected_schedule_version bigint,
  p_public_token_hash text,
  p_invitation_expires_at timestamptz,
  p_invitation_snapshot jsonb,
  p_queue_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.meeting_schedules%rowtype;
  v_round public.meeting_schedule_rounds%rowtype;
  v_queue public.contact_queue%rowtype;
begin
  select *
    into v_schedule
    from public.meeting_schedules
   where id = p_schedule_id
     and company_workspace_id = p_company_workspace_id
   for update;

  if not found then
    raise exception 'meeting schedule not found' using errcode = 'P0002';
  end if;
  if v_schedule.status is distinct from 'preparing' then
    raise exception 'meeting schedule is no longer sendable'
      using errcode = '55000';
  end if;
  if v_schedule.version is distinct from p_expected_schedule_version then
    raise exception 'meeting schedule version conflict'
      using errcode = '40001';
  end if;

  select *
    into v_round
    from public.meeting_schedule_rounds
   where schedule_id = v_schedule.id
     and id = v_schedule.active_round_id
   for update;

  if not found or v_round.status is distinct from 'draft' then
    raise exception 'active meeting schedule round is no longer sendable'
      using errcode = '55000';
  end if;
  if p_public_token_hash is null or char_length(p_public_token_hash) <> 64 then
    raise exception 'invalid meeting invitation token hash'
      using errcode = '22023';
  end if;
  if p_invitation_expires_at <= timezone('utc', now()) then
    raise exception 'meeting invitation must expire in the future'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_invitation_snapshot) is distinct from 'object'
     or jsonb_typeof(p_queue_payload) is distinct from 'object' then
    raise exception 'meeting invitation snapshots must be objects'
      using errcode = '22023';
  end if;

  insert into public.contact_queue (
    user_id,
    type,
    scheduled_at,
    status,
    payload,
    recommendation_id,
    role_id
  ) values (
    v_schedule.talent_id,
    'meeting_schedule_candidate_invitation',
    timezone('utc', now()) + interval '20 minutes',
    'queued',
    p_queue_payload,
    v_schedule.recommendation_id,
    v_schedule.role_id
  )
  returning * into v_queue;

  update public.meeting_schedule_rounds
     set status = 'queued',
         public_token_hash = p_public_token_hash,
         invitation_expires_at = p_invitation_expires_at,
         invitation_snapshot = p_invitation_snapshot,
         delivery_queue_id = v_queue.id,
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_round.id
  returning * into v_round;

  update public.meeting_schedules
     set status = 'awaiting_talent',
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_schedule.id
  returning * into v_schedule;

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'roundId', v_round.id,
    'queueId', v_queue.id,
    'status', v_schedule.status,
    'version', v_schedule.version
  );
end;
$$;

revoke all on function public.queue_meeting_schedule_invitation_v1(
  uuid, uuid, bigint, text, timestamptz, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.queue_meeting_schedule_invitation_v1(
  uuid, uuid, bigint, text, timestamptz, jsonb, jsonb
) to service_role;
