begin;

create table if not exists public.meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete restrict,
  recommendation_id uuid not null
    references public.talent_opportunity_recommendation(id) on delete restrict,
  talent_id uuid not null
    references public.talent_users(user_id) on delete restrict,
  organizer_company_user_id uuid not null
    references public.company_users(user_id) on delete restrict,
  status text not null default 'preparing',
  title text not null,
  duration_minutes integer not null default 60,
  company_attendees jsonb not null default '[]'::jsonb,
  active_round_id uuid,
  idempotency_key text not null unique,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meeting_schedules_title_length_check
    check (char_length(title) between 1 and 200),
  constraint meeting_schedules_duration_check
    check (duration_minutes between 15 and 240 and duration_minutes % 15 = 0),
  constraint meeting_schedules_company_attendees_array_check
    check (jsonb_typeof(company_attendees) = 'array'),
  constraint meeting_schedules_idempotency_key_length_check
    check (char_length(idempotency_key) between 1 and 500),
  constraint meeting_schedules_version_check check (version > 0)
);

create table if not exists public.meeting_schedule_rounds (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null
    references public.meeting_schedules(id) on delete cascade,
  round_number integer not null default 1,
  status text not null default 'draft',
  draft_blocker text,
  meeting_config_snapshot jsonb not null,
  additional_message jsonb,
  source_company_message_id bigint
    references public.company_messages(id) on delete restrict,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meeting_schedule_rounds_number_check check (round_number > 0),
  constraint meeting_schedule_rounds_config_object_check
    check (jsonb_typeof(meeting_config_snapshot) = 'object'),
  constraint meeting_schedule_rounds_additional_message_object_check
    check (additional_message is null or jsonb_typeof(additional_message) = 'object'),
  constraint meeting_schedule_rounds_version_check check (version > 0),
  unique (schedule_id, round_number),
  unique (schedule_id, id)
);

alter table public.meeting_schedules
  add column if not exists confirmed_start_at timestamptz,
  add column if not exists confirmed_end_at timestamptz;

alter table public.meeting_schedule_rounds
  add column if not exists public_token_hash text,
  add column if not exists invitation_expires_at timestamptz,
  add column if not exists invitation_snapshot jsonb,
  add column if not exists candidate_options jsonb,
  add column if not exists selection_snapshot jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists delivery_queue_id uuid
    references public.contact_queue(id) on delete set null;

do $$
begin
  alter table public.meeting_schedules
    add constraint meeting_schedules_active_round_id_fkey
    foreign key (id, active_round_id)
    references public.meeting_schedule_rounds(schedule_id, id)
    on delete set null (active_round_id);
exception
  when duplicate_object then null;
end;
$$;

create index if not exists meeting_schedules_workspace_status_idx
  on public.meeting_schedules (company_workspace_id, status, updated_at desc);
create index if not exists meeting_schedules_organizer_status_idx
  on public.meeting_schedules (organizer_company_user_id, status, updated_at desc);
create index if not exists meeting_schedules_confirmed_time_idx
  on public.meeting_schedules (confirmed_start_at, confirmed_end_at)
  where status = 'confirmed';
create index if not exists meeting_schedules_company_attendees_gin_idx
  on public.meeting_schedules using gin (company_attendees jsonb_path_ops);
create index if not exists meeting_schedule_rounds_schedule_idx
  on public.meeting_schedule_rounds (schedule_id, round_number desc);
create unique index if not exists meeting_schedule_rounds_public_token_hash_uidx
  on public.meeting_schedule_rounds (public_token_hash)
  where public_token_hash is not null;
create unique index if not exists meeting_schedule_rounds_delivery_queue_uidx
  on public.meeting_schedule_rounds (delivery_queue_id)
  where delivery_queue_id is not null;

alter table public.meeting_schedules enable row level security;
alter table public.meeting_schedule_rounds enable row level security;

grant all on table public.meeting_schedules to service_role;
grant all on table public.meeting_schedule_rounds to service_role;

create or replace function public.create_meeting_schedule_draft_v1(
  p_company_workspace_id uuid,
  p_role_id uuid,
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_organizer_company_user_id uuid,
  p_title text,
  p_duration_minutes integer,
  p_company_attendees jsonb,
  p_meeting_config_snapshot jsonb,
  p_additional_message jsonb,
  p_draft_blocker text,
  p_source_company_message_id bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.meeting_schedules%rowtype;
  v_round public.meeting_schedule_rounds%rowtype;
begin
  if p_idempotency_key is null
     or char_length(p_idempotency_key) not between 1 and 500 then
    raise exception 'invalid meeting schedule idempotency key'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.company_roles
     where role_id = p_role_id
       and company_workspace_id = p_company_workspace_id
  ) then
    raise exception 'meeting schedule role does not belong to workspace'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.talent_opportunity_recommendation
     where id = p_recommendation_id
       and role_id = p_role_id
       and talent_id = p_talent_id
  ) then
    raise exception 'meeting schedule recommendation does not match role and talent'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
      from public.company_user_workspace
     where company_workspace_id = p_company_workspace_id
       and company_user_id = p_organizer_company_user_id
  ) then
    raise exception 'meeting schedule organizer is not a workspace member'
      using errcode = '23514';
  end if;

  if p_source_company_message_id is not null and not exists (
    select 1
      from public.company_messages
     where id = p_source_company_message_id
       and company_workspace_id = p_company_workspace_id
  ) then
    raise exception 'meeting schedule source message does not belong to workspace'
      using errcode = '23514';
  end if;

  if jsonb_typeof(p_company_attendees) is distinct from 'array'
     or not p_company_attendees @> jsonb_build_array(
       jsonb_build_object(
         'companyUserId', p_organizer_company_user_id::text
       )
     ) then
    raise exception 'meeting schedule attendees must include organizer'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_company_attendees) attendee
      left join public.company_user_workspace membership
        on membership.company_workspace_id = p_company_workspace_id
       and membership.company_user_id::text = attendee ->> 'companyUserId'
     where jsonb_typeof(attendee) is distinct from 'object'
        or nullif(attendee ->> 'companyUserId', '') is null
        or membership.id is null
  ) then
    raise exception 'meeting schedule attendee is not a workspace member'
      using errcode = '23514';
  end if;

  if jsonb_typeof(p_meeting_config_snapshot) is distinct from 'object'
     or p_meeting_config_snapshot ->> 'title' is distinct from p_title
     or p_meeting_config_snapshot ->> 'durationMinutes'
       is distinct from p_duration_minutes::text
     or p_meeting_config_snapshot -> 'companyAttendees'
       is distinct from p_company_attendees
     or p_meeting_config_snapshot #>> '{organizer,companyUserId}'
       is distinct from p_organizer_company_user_id::text then
    raise exception 'meeting schedule snapshot does not match aggregate'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select *
    into v_schedule
    from public.meeting_schedules
   where idempotency_key = p_idempotency_key;

  if found then
    select *
      into v_round
      from public.meeting_schedule_rounds
     where id = v_schedule.active_round_id;

    if v_schedule.company_workspace_id is distinct from p_company_workspace_id
       or v_schedule.role_id is distinct from p_role_id
       or v_schedule.recommendation_id is distinct from p_recommendation_id
       or v_schedule.talent_id is distinct from p_talent_id
       or v_schedule.organizer_company_user_id
         is distinct from p_organizer_company_user_id
       or v_schedule.title is distinct from p_title
       or v_schedule.duration_minutes is distinct from p_duration_minutes
       or v_schedule.company_attendees is distinct from p_company_attendees
       or v_round.meeting_config_snapshot
         is distinct from p_meeting_config_snapshot
       or v_round.additional_message is distinct from p_additional_message
       or v_round.draft_blocker is distinct from p_draft_blocker then
      raise exception 'meeting schedule idempotency key was reused with different input'
        using errcode = '23505';
    end if;

    -- A retry after the schedule row was written but the candidate-stage update
    -- failed can arrive in a later company message. Keep the original source
    -- message as the audit origin while allowing the otherwise identical draft
    -- to resume; changed meeting inputs still fail the comparison above.

    return jsonb_build_object(
      'scheduleId', v_schedule.id,
      'roundId', v_round.id,
      'status', v_schedule.status,
      'alreadyExisted', true
    );
  end if;

  insert into public.meeting_schedules (
    company_workspace_id,
    role_id,
    recommendation_id,
    talent_id,
    organizer_company_user_id,
    status,
    title,
    duration_minutes,
    company_attendees,
    idempotency_key
  ) values (
    p_company_workspace_id,
    p_role_id,
    p_recommendation_id,
    p_talent_id,
    p_organizer_company_user_id,
    'preparing',
    p_title,
    p_duration_minutes,
    p_company_attendees,
    p_idempotency_key
  )
  returning * into v_schedule;

  insert into public.meeting_schedule_rounds (
    schedule_id,
    round_number,
    status,
    draft_blocker,
    meeting_config_snapshot,
    additional_message,
    source_company_message_id
  ) values (
    v_schedule.id,
    1,
    'draft',
    p_draft_blocker,
    p_meeting_config_snapshot,
    p_additional_message,
    p_source_company_message_id
  )
  returning * into v_round;

  update public.meeting_schedules
     set active_round_id = v_round.id,
         updated_at = timezone('utc', now())
   where id = v_schedule.id
  returning * into v_schedule;

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'roundId', v_round.id,
    'status', v_schedule.status,
    'alreadyExisted', false
  );
end;
$$;

revoke all on function public.create_meeting_schedule_draft_v1(
  uuid, uuid, uuid, uuid, uuid, text, integer, jsonb, jsonb, jsonb, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.create_meeting_schedule_draft_v1(
  uuid, uuid, uuid, uuid, uuid, text, integer, jsonb, jsonb, jsonb, text, bigint, text
) to service_role;

create or replace function public.update_meeting_schedule_draft_v1(
  p_schedule_id uuid,
  p_company_workspace_id uuid,
  p_expected_version bigint,
  p_title text,
  p_duration_minutes integer,
  p_company_attendees jsonb,
  p_meeting_config_snapshot jsonb,
  p_additional_message jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.meeting_schedules%rowtype;
  v_round public.meeting_schedule_rounds%rowtype;
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
    raise exception 'meeting schedule is no longer editable'
      using errcode = '55000';
  end if;
  if v_schedule.version is distinct from p_expected_version then
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
    raise exception 'active meeting schedule round is no longer editable'
      using errcode = '55000';
  end if;

  if jsonb_typeof(p_company_attendees) is distinct from 'array'
     or not p_company_attendees @> jsonb_build_array(
       jsonb_build_object(
         'companyUserId', v_schedule.organizer_company_user_id::text
       )
     ) then
    raise exception 'meeting schedule attendees must include organizer'
      using errcode = '23514';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_company_attendees) attendee
      left join public.company_user_workspace membership
        on membership.company_workspace_id = p_company_workspace_id
       and membership.company_user_id::text = attendee ->> 'companyUserId'
     where jsonb_typeof(attendee) is distinct from 'object'
        or nullif(attendee ->> 'companyUserId', '') is null
        or membership.id is null
  ) then
    raise exception 'meeting schedule attendee is not a workspace member'
      using errcode = '23514';
  end if;

  if jsonb_typeof(p_meeting_config_snapshot) is distinct from 'object'
     or p_meeting_config_snapshot ->> 'title' is distinct from p_title
     or p_meeting_config_snapshot ->> 'durationMinutes'
       is distinct from p_duration_minutes::text
     or p_meeting_config_snapshot -> 'companyAttendees'
       is distinct from p_company_attendees
     or p_meeting_config_snapshot #>> '{organizer,companyUserId}'
       is distinct from v_schedule.organizer_company_user_id::text then
    raise exception 'meeting schedule snapshot does not match aggregate'
      using errcode = '23514';
  end if;

  update public.meeting_schedules
     set title = p_title,
         duration_minutes = p_duration_minutes,
         company_attendees = p_company_attendees,
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_schedule.id
  returning * into v_schedule;

  update public.meeting_schedule_rounds
     set meeting_config_snapshot = p_meeting_config_snapshot,
         additional_message = p_additional_message,
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_round.id
  returning * into v_round;

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'roundId', v_round.id,
    'status', v_schedule.status,
    'version', v_schedule.version
  );
end;
$$;

revoke all on function public.update_meeting_schedule_draft_v1(
  uuid, uuid, bigint, text, integer, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.update_meeting_schedule_draft_v1(
  uuid, uuid, bigint, text, integer, jsonb, jsonb, jsonb
) to service_role;

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
    timezone('utc', now()),
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

create or replace function public.submit_meeting_schedule_options_v1(
  p_public_token_hash text,
  p_expected_availability_version bigint,
  p_candidate_options jsonb,
  p_selection_snapshot jsonb,
  p_confirmed_start_at timestamptz,
  p_confirmed_end_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.meeting_schedules%rowtype;
  v_round public.meeting_schedule_rounds%rowtype;
  v_attendee_id text;
begin
  select *
    into v_round
    from public.meeting_schedule_rounds
   where public_token_hash = p_public_token_hash
   for update;

  if not found then
    raise exception 'meeting invitation not found' using errcode = 'P0002';
  end if;

  select *
    into v_schedule
    from public.meeting_schedules
   where id = v_round.schedule_id
   for update;

  if not found or v_schedule.active_round_id is distinct from v_round.id then
    raise exception 'meeting invitation is no longer active'
      using errcode = '55000';
  end if;
  if v_schedule.status is distinct from 'awaiting_talent'
     or v_round.status not in ('queued', 'sent')
     or v_round.submitted_at is not null then
    raise exception 'meeting invitation is no longer submittable'
      using errcode = '55000';
  end if;
  if v_round.invitation_expires_at is null
     or v_round.invitation_expires_at <= timezone('utc', now()) then
    raise exception 'meeting invitation expired' using errcode = '55000';
  end if;
  if jsonb_typeof(p_candidate_options) is distinct from 'array'
     or jsonb_array_length(p_candidate_options) not between 1 and 5
     or jsonb_typeof(p_selection_snapshot) is distinct from 'object' then
    raise exception 'invalid meeting selection snapshot'
      using errcode = '22023';
  end if;
  if p_confirmed_start_at is null
     or p_confirmed_end_at is null
     or p_confirmed_end_at - p_confirmed_start_at
       is distinct from make_interval(mins => v_schedule.duration_minutes) then
    raise exception 'confirmed meeting duration does not match schedule'
      using errcode = '23514';
  end if;
  if p_confirmed_start_at < (v_round.invitation_snapshot ->> 'windowStart')::timestamptz
     or p_confirmed_end_at > (v_round.invitation_snapshot ->> 'windowEnd')::timestamptz then
    raise exception 'confirmed meeting falls outside invitation window'
      using errcode = '23514';
  end if;

  perform 1
    from public.meeting_availability availability
   where availability.company_workspace_id = v_schedule.company_workspace_id
     and availability.company_user_id = v_schedule.organizer_company_user_id
     and availability.version = p_expected_availability_version
   for share;
  if not found then
    raise exception 'meeting availability changed during submission'
      using errcode = '40001';
  end if;

  -- Serialize confirmations that share any company attendee. Without this,
  -- two different schedules could both pass the overlap query before either
  -- transaction commits.
  for v_attendee_id in
    select distinct attendee ->> 'companyUserId' as attendee_id
      from jsonb_array_elements(v_schedule.company_attendees) attendee
     where nullif(attendee ->> 'companyUserId', '') is not null
     order by attendee_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('meeting-attendee:' || v_attendee_id, 0)
    );
  end loop;

  if exists (
    select 1
      from public.meeting_schedules other
     where other.id <> v_schedule.id
       and other.status = 'confirmed'
       and other.confirmed_start_at < p_confirmed_end_at
       and other.confirmed_end_at > p_confirmed_start_at
       and (
         other.organizer_company_user_id::text in (
           select attendee ->> 'companyUserId'
             from jsonb_array_elements(v_schedule.company_attendees) attendee
         )
         or exists (
           select 1
             from jsonb_array_elements(other.company_attendees) other_attendee
             join jsonb_array_elements(v_schedule.company_attendees) current_attendee
               on other_attendee ->> 'companyUserId'
                = current_attendee ->> 'companyUserId'
         )
       )
  ) then
    raise exception 'another Harper meeting now overlaps this selection'
      using errcode = '40001';
  end if;

  update public.meeting_schedule_rounds
     set status = 'confirmed',
         candidate_options = p_candidate_options,
         selection_snapshot = p_selection_snapshot,
         submitted_at = timezone('utc', now()),
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_round.id
  returning * into v_round;

  update public.meeting_schedules
     set status = 'confirmed',
         confirmed_start_at = p_confirmed_start_at,
         confirmed_end_at = p_confirmed_end_at,
         version = version + 1,
         updated_at = timezone('utc', now())
   where id = v_schedule.id
  returning * into v_schedule;

  return jsonb_build_object(
    'scheduleId', v_schedule.id,
    'roundId', v_round.id,
    'status', v_schedule.status,
    'confirmedStartAt', v_schedule.confirmed_start_at,
    'confirmedEndAt', v_schedule.confirmed_end_at,
    'version', v_schedule.version
  );
end;
$$;

revoke all on function public.submit_meeting_schedule_options_v1(
  text, bigint, jsonb, jsonb, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.submit_meeting_schedule_options_v1(
  text, bigint, jsonb, jsonb, timestamptz, timestamptz
) to service_role;

commit;
