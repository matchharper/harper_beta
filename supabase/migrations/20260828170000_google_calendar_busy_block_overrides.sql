begin;

alter table public.company_user_calendar_busy_blocks
  add column if not exists is_blocking boolean not null default true;

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
  v_removed_count integer := 0;
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

  if exists (
    select 1
      from public.company_user_integrations integration
     where integration.company_user_id = p_company_user_id
       and integration.provider = 'google_calendar'
       and integration.composio_connected_account_id = p_connected_account_id
       and integration.status = 'active'
       and integration.last_sync_window_end_at > p_window_end
  ) then
    raise exception 'a newer Google Calendar sync already completed'
      using errcode = '40001';
  end if;

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
   where existing.is_blocking
     and (
       existing.start_at is distinct from block."startAt"
       or existing.end_at is distinct from block."endAt"
       or existing.all_day is distinct from coalesce(block."allDay", false)
     );

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

  with removed as (
    delete from public.company_user_calendar_busy_blocks existing
     where existing.company_user_id = p_company_user_id
       and existing.provider = 'google_calendar'
       and existing.start_at < p_window_end
       and existing.end_at > p_window_start
       and not exists (
         select 1
           from jsonb_to_recordset(p_blocks) as block(
             "externalCalendarId" text,
             "externalEventId" text
           )
          where block."externalCalendarId" = existing.external_calendar_id
            and block."externalEventId" = existing.external_event_id
       )
    returning is_blocking
  )
  select count(*) filter (where is_blocking)::integer
    into v_removed_count
    from removed;

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
     and is_blocking
     and start_at < p_window_end
     and end_at > p_window_start;

  return jsonb_build_object(
    'addedCount', v_added_count,
    'updatedCount', v_changed_count,
    'removedCount', v_removed_count,
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

create or replace function public.set_google_calendar_busy_block_blocking_v1(
  p_company_user_id uuid,
  p_busy_block_id uuid,
  p_is_blocking boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_block public.company_user_calendar_busy_blocks%rowtype;
begin
  if p_company_user_id is null
     or p_busy_block_id is null
     or p_is_blocking is null then
    raise exception 'invalid Google Calendar busy block update'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('meeting-attendee:' || p_company_user_id::text, 0)
  );

  update public.company_user_calendar_busy_blocks
     set is_blocking = p_is_blocking
   where id = p_busy_block_id
     and company_user_id = p_company_user_id
     and provider = 'google_calendar'
  returning * into v_block;

  if not found then
    raise exception 'Google Calendar busy block not found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_block.id,
    'start_at', v_block.start_at,
    'end_at', v_block.end_at,
    'all_day', v_block.all_day,
    'is_blocking', v_block.is_blocking
  );
end;
$$;

revoke all on function public.set_google_calendar_busy_block_blocking_v1(
  uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.set_google_calendar_busy_block_blocking_v1(
  uuid, uuid, boolean
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
     where busy.is_blocking
       and busy.company_user_id::text in (
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

notify pgrst, 'reload schema';

commit;
