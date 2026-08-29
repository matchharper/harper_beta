begin;

create table if not exists public.company_user_integrations (
  company_user_id uuid not null
    references public.company_users(user_id) on delete cascade,
  provider text not null,
  composio_connected_account_id text not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (company_user_id, provider),
  unique (composio_connected_account_id),
  constraint company_user_integrations_provider_length_check
    check (char_length(provider) between 1 and 80),
  constraint company_user_integrations_account_id_check
    check (
      char_length(composio_connected_account_id) between 4 and 160
      and composio_connected_account_id ~ '^ca_[A-Za-z0-9_-]+$'
    ),
  constraint company_user_integrations_status_check
    check (status in ('active', 'expired', 'disabled'))
);

-- Some environments received the connection table before it was committed to
-- repository history. Make those installations converge on the same contract
-- instead of treating table existence as proof that every invariant exists.
alter table public.company_user_integrations
  add column if not exists company_user_id uuid,
  add column if not exists provider text,
  add column if not exists composio_connected_account_id text,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.company_user_integrations
  alter column company_user_id set not null,
  alter column provider set not null,
  alter column composio_connected_account_id set not null,
  alter column status set default 'active',
  alter column status set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null,
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and contype = 'p'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_pkey
      primary key (company_user_id, provider);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and conname = 'company_user_integrations_company_user_id_fkey'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_company_user_id_fkey
      foreign key (company_user_id)
      references public.company_users(user_id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and conname = 'company_user_integrations_composio_connected_account_id_key'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_composio_connected_account_id_key
      unique (composio_connected_account_id);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and conname = 'company_user_integrations_provider_length_check'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_provider_length_check
      check (char_length(provider) between 1 and 80);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and conname = 'company_user_integrations_account_id_check'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_account_id_check
      check (
        char_length(composio_connected_account_id) between 4 and 160
        and composio_connected_account_id ~ '^ca_[A-Za-z0-9_-]+$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.company_user_integrations'::regclass
       and conname = 'company_user_integrations_status_check'
  ) then
    alter table public.company_user_integrations
      add constraint company_user_integrations_status_check
      check (status in ('active', 'expired', 'disabled'));
  end if;
end
$$;

alter table public.company_user_integrations enable row level security;
revoke all on table public.company_user_integrations
  from public, anon, authenticated;
grant all on table public.company_user_integrations to service_role;

alter table public.company_user_integrations
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_window_end_at timestamptz;

create table if not exists public.company_user_calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  company_user_id uuid not null
    references public.company_users(user_id) on delete cascade,
  provider text not null default 'google_calendar',
  external_calendar_id text not null,
  external_event_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  constraint company_user_calendar_busy_blocks_provider_check
    check (provider = 'google_calendar'),
  constraint company_user_calendar_busy_blocks_calendar_id_length_check
    check (char_length(external_calendar_id) between 1 and 1024),
  constraint company_user_calendar_busy_blocks_event_id_length_check
    check (char_length(external_event_id) between 1 and 1024),
  constraint company_user_calendar_busy_blocks_range_check
    check (start_at < end_at),
  unique (company_user_id, provider, external_calendar_id, external_event_id)
);

create index if not exists company_user_calendar_busy_blocks_overlap_idx
  on public.company_user_calendar_busy_blocks
  (company_user_id, start_at, end_at);

alter table public.company_user_calendar_busy_blocks enable row level security;
revoke all on table public.company_user_calendar_busy_blocks
  from public, anon, authenticated;
grant all on table public.company_user_calendar_busy_blocks to service_role;

create table if not exists public.meeting_schedule_calendar_events (
  schedule_id uuid primary key
    references public.meeting_schedules(id) on delete cascade,
  organizer_company_user_id uuid not null
    references public.company_users(user_id) on delete restrict,
  provider text not null default 'google_calendar',
  status text not null default 'pending',
  external_event_id text,
  calendar_url text,
  conference_url text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint meeting_schedule_calendar_events_provider_check
    check (provider = 'google_calendar'),
  constraint meeting_schedule_calendar_events_status_check
    check (status in (
      'pending', 'creating', 'created', 'created_without_meet', 'failed'
    )),
  constraint meeting_schedule_calendar_events_attempts_check
    check (attempts >= 0),
  constraint meeting_schedule_calendar_events_event_id_length_check
    check (external_event_id is null or char_length(external_event_id) between 1 and 1024),
  constraint meeting_schedule_calendar_events_calendar_url_length_check
    check (calendar_url is null or char_length(calendar_url) <= 2048),
  constraint meeting_schedule_calendar_events_conference_url_length_check
    check (conference_url is null or char_length(conference_url) <= 2048),
  constraint meeting_schedule_calendar_events_error_length_check
    check (last_error is null or char_length(last_error) <= 1000)
);

alter table public.meeting_schedule_calendar_events enable row level security;
revoke all on table public.meeting_schedule_calendar_events
  from public, anon, authenticated;
grant all on table public.meeting_schedule_calendar_events to service_role;

create or replace function public.upsert_google_calendar_busy_blocks_v1(
  p_company_user_id uuid,
  p_connected_account_id text,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_blocks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_added_count integer := 0;
  v_changed_count integer := 0;
  v_total_count integer := 0;
begin
  if p_window_start is null
     or p_window_end is null
     or p_window_end <= p_window_start
     or p_window_end > p_window_start + interval '14 days 1 minute'
     or jsonb_typeof(p_blocks) is distinct from 'array' then
    raise exception 'invalid Google Calendar sync window or blocks'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.company_user_integrations integration
     where integration.company_user_id = p_company_user_id
       and integration.provider = 'google_calendar'
       and integration.composio_connected_account_id = p_connected_account_id
       and integration.status = 'active'
  ) then
    raise exception 'Google Calendar connection is not active'
      using errcode = '55000';
  end if;

  if exists (
    select 1
      from jsonb_to_recordset(p_blocks) as block(
        "externalCalendarId" text,
        "externalEventId" text,
        "startAt" timestamptz,
        "endAt" timestamptz,
        "allDay" boolean
      )
     where nullif(block."externalCalendarId", '') is null
        or char_length(block."externalCalendarId") > 1024
        or nullif(block."externalEventId", '') is null
        or char_length(block."externalEventId") > 1024
        or block."startAt" is null
        or block."endAt" is null
        or block."startAt" < p_window_start
        or block."endAt" > p_window_end
        or block."startAt" >= block."endAt"
  ) then
    raise exception 'invalid Google Calendar busy block'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meeting-attendee:' || p_company_user_id::text, 0)
  );

  select count(*)::integer
    into v_added_count
    from jsonb_to_recordset(p_blocks) as block(
      "externalCalendarId" text,
      "externalEventId" text,
      "startAt" timestamptz,
      "endAt" timestamptz,
      "allDay" boolean
    )
   where not exists (
     select 1
       from public.company_user_calendar_busy_blocks existing
      where existing.company_user_id = p_company_user_id
        and existing.provider = 'google_calendar'
        and existing.external_calendar_id = block."externalCalendarId"
        and existing.external_event_id = block."externalEventId"
   );

  select count(*)::integer
    into v_changed_count
    from jsonb_to_recordset(p_blocks) as block(
      "externalCalendarId" text,
      "externalEventId" text,
      "startAt" timestamptz,
      "endAt" timestamptz,
      "allDay" boolean
    )
    join public.company_user_calendar_busy_blocks existing
      on existing.company_user_id = p_company_user_id
     and existing.provider = 'google_calendar'
     and existing.external_calendar_id = block."externalCalendarId"
     and existing.external_event_id = block."externalEventId"
   where existing.start_at is distinct from block."startAt"
      or existing.end_at is distinct from block."endAt"
      or existing.all_day is distinct from coalesce(block."allDay", false);

  insert into public.company_user_calendar_busy_blocks (
    company_user_id,
    provider,
    external_calendar_id,
    external_event_id,
    start_at,
    end_at,
    all_day,
    last_seen_at
  )
  select
    p_company_user_id,
    'google_calendar',
    block."externalCalendarId",
    block."externalEventId",
    block."startAt",
    block."endAt",
    coalesce(block."allDay", false),
    timezone('utc', now())
  from jsonb_to_recordset(p_blocks) as block(
    "externalCalendarId" text,
    "externalEventId" text,
    "startAt" timestamptz,
    "endAt" timestamptz,
    "allDay" boolean
  )
  on conflict (
    company_user_id, provider, external_calendar_id, external_event_id
  ) do update
    set start_at = excluded.start_at,
        end_at = excluded.end_at,
        all_day = excluded.all_day,
        last_seen_at = excluded.last_seen_at;

  delete from public.company_user_calendar_busy_blocks
   where company_user_id = p_company_user_id
     and provider = 'google_calendar'
     and end_at <= p_window_start;

  update public.company_user_integrations
     set last_synced_at = timezone('utc', now()),
         last_sync_window_end_at = p_window_end,
         updated_at = greatest(
           updated_at + interval '1 microsecond',
           timezone('utc', now())
         )
   where company_user_id = p_company_user_id
     and provider = 'google_calendar'
     and composio_connected_account_id = p_connected_account_id
     and status = 'active';
  if not found then
    raise exception 'Google Calendar connection changed during sync'
      using errcode = '40001';
  end if;

  select count(*)::integer
    into v_total_count
    from public.company_user_calendar_busy_blocks
   where company_user_id = p_company_user_id
     and provider = 'google_calendar'
     and start_at < p_window_end
     and end_at > p_window_start;

  return jsonb_build_object(
    'addedCount', v_added_count,
    'updatedCount', v_changed_count,
    'totalBusyCount', v_total_count,
    'lastSyncedAt', timezone('utc', now()),
    'windowEnd', p_window_end
  );
end;
$$;

revoke all on function public.upsert_google_calendar_busy_blocks_v1(
  uuid, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.upsert_google_calendar_busy_blocks_v1(
  uuid, text, timestamptz, timestamptz, jsonb
) to service_role;

create or replace function public.enforce_confirmed_meeting_calendar_busy_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendee_id text;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if new.confirmed_start_at is null or new.confirmed_end_at is null then
    raise exception 'confirmed meeting requires a time range'
      using errcode = '23514';
  end if;

  for v_attendee_id in
    select distinct attendee ->> 'companyUserId' as attendee_id
      from jsonb_array_elements(new.company_attendees) attendee
     where nullif(attendee ->> 'companyUserId', '') is not null
     order by attendee_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('meeting-attendee:' || v_attendee_id, 0)
    );
  end loop;

  if exists (
    select 1
      from public.company_user_calendar_busy_blocks busy
     where busy.company_user_id::text in (
       select attendee ->> 'companyUserId'
         from jsonb_array_elements(new.company_attendees) attendee
     )
       and busy.start_at < new.confirmed_end_at
       and busy.end_at > new.confirmed_start_at
  ) then
    raise exception 'a synced Google Calendar event overlaps this meeting'
      using errcode = '40001';
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_schedules_calendar_busy_insert_v1
  on public.meeting_schedules;
create trigger meeting_schedules_calendar_busy_insert_v1
before insert on public.meeting_schedules
for each row execute function public.enforce_confirmed_meeting_calendar_busy_v1();

drop trigger if exists meeting_schedules_calendar_busy_update_v1
  on public.meeting_schedules;
create trigger meeting_schedules_calendar_busy_update_v1
before update of status, confirmed_start_at, confirmed_end_at
on public.meeting_schedules
for each row execute function public.enforce_confirmed_meeting_calendar_busy_v1();

revoke all on function public.enforce_confirmed_meeting_calendar_busy_v1()
  from public, anon, authenticated;

create or replace function public.initialize_meeting_schedule_calendar_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' then
    insert into public.meeting_schedule_calendar_events (
      schedule_id, organizer_company_user_id
    ) values (
      new.id, new.organizer_company_user_id
    ) on conflict (schedule_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists meeting_schedules_calendar_event_initialize_v1
  on public.meeting_schedules;
create trigger meeting_schedules_calendar_event_initialize_v1
after insert or update of status on public.meeting_schedules
for each row execute function public.initialize_meeting_schedule_calendar_event_v1();

revoke all on function public.initialize_meeting_schedule_calendar_event_v1()
  from public, anon, authenticated;

create or replace function public.claim_meeting_schedule_calendar_event_v1(
  p_schedule_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule public.meeting_schedules%rowtype;
  v_delivery public.meeting_schedule_calendar_events%rowtype;
begin
  select * into v_schedule
    from public.meeting_schedules
   where id = p_schedule_id;
  if not found or v_schedule.status is distinct from 'confirmed' then
    raise exception 'meeting schedule is not confirmed' using errcode = '55000';
  end if;

  insert into public.meeting_schedule_calendar_events (
    schedule_id, organizer_company_user_id
  ) values (
    v_schedule.id, v_schedule.organizer_company_user_id
  ) on conflict (schedule_id) do nothing;

  select * into v_delivery
    from public.meeting_schedule_calendar_events
   where schedule_id = p_schedule_id
   for update;

  if v_delivery.status in ('created', 'created_without_meet') then
    return jsonb_build_object('claimed', false, 'status', v_delivery.status);
  end if;
  if v_delivery.status = 'creating'
     and v_delivery.updated_at > timezone('utc', now()) - interval '90 seconds' then
    return jsonb_build_object('claimed', false, 'status', v_delivery.status);
  end if;

  update public.meeting_schedule_calendar_events
     set status = 'creating',
         attempts = attempts + 1,
         last_error = null,
         updated_at = timezone('utc', now())
   where schedule_id = p_schedule_id
  returning * into v_delivery;

  return jsonb_build_object(
    'claimed', true,
    'status', v_delivery.status,
    'attempts', v_delivery.attempts
  );
end;
$$;

revoke all on function public.claim_meeting_schedule_calendar_event_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_meeting_schedule_calendar_event_v1(uuid)
  to service_role;

create or replace function public.delete_google_calendar_busy_blocks_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.provider = 'google_calendar' then
    delete from public.company_user_calendar_busy_blocks
     where company_user_id = old.company_user_id
       and provider = old.provider;
    return old;
  end if;
  if tg_op = 'UPDATE'
     and new.provider = 'google_calendar'
     and new.status = 'disabled'
     and old.status is distinct from new.status then
    delete from public.company_user_calendar_busy_blocks
     where company_user_id = new.company_user_id
       and provider = new.provider;
  end if;
  return new;
end;
$$;

drop trigger if exists company_user_integrations_delete_calendar_busy_v1
  on public.company_user_integrations;
create trigger company_user_integrations_delete_calendar_busy_v1
after delete on public.company_user_integrations
for each row execute function public.delete_google_calendar_busy_blocks_v1();

drop trigger if exists company_user_integrations_disable_calendar_busy_v1
  on public.company_user_integrations;
create trigger company_user_integrations_disable_calendar_busy_v1
after update of status on public.company_user_integrations
for each row execute function public.delete_google_calendar_busy_blocks_v1();

revoke all on function public.delete_google_calendar_busy_blocks_v1()
  from public, anon, authenticated;

comment on table public.company_user_calendar_busy_blocks is
  'Privacy-minimal busy ranges imported from a company user Google Calendar. Calendar/event identifiers are application-hashed; titles and attendees are intentionally not stored.';
comment on table public.meeting_schedule_calendar_events is
  'Idempotent Google Calendar invitation and Google Meet delivery state for confirmed Harper meetings.';

commit;
