-- External execution identity and delivery revision; no conversational plan state.
alter table public.meeting_schedule_calendar_events
  add column calendar_owner jsonb,
  add column delivered_version bigint,
  add column lease_token uuid;
alter table public.meeting_schedule_calendar_events drop constraint meeting_schedule_calendar_events_status_check;
alter table public.meeting_schedule_calendar_events add constraint meeting_schedule_calendar_events_status_check
  check(status in ('pending','creating','created','created_without_meet','failed','cancelled'));

create function public.claim_meeting_calendar_delivery_v2(p_schedule_id uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare s meeting_schedules%rowtype; d meeting_schedule_calendar_events%rowtype;
begin
  select * into s from meeting_schedules where id=p_schedule_id for update;
  if not found or s.scheduling_source<>'harper' or s.status not in ('confirmed','cancelled') then
    raise exception 'Meeting has no deliverable appointment' using errcode='55000';
  end if;
  insert into meeting_schedule_calendar_events(schedule_id,organizer_company_user_id)
    values(s.id,s.organizer_company_user_id) on conflict(schedule_id) do nothing;
  select * into d from meeting_schedule_calendar_events where schedule_id=s.id for update;
  if (d.status in ('created','cancelled') and coalesce(d.delivered_version,s.version)=s.version)
    or (d.status='creating' and d.lease_token is not null and d.updated_at>now()-interval '90 seconds') then
    return jsonb_build_object('claimed',false);
  end if;
  update meeting_schedule_calendar_events set status='creating',attempts=attempts+1,last_error=null,
    lease_token=gen_random_uuid(),updated_at=now() where schedule_id=s.id returning * into d;
  return jsonb_build_object('claimed',true,'token',d.lease_token,'version',s.version,'owner',d.calendar_owner,
    'eventId',d.external_event_id,'deliveredVersion',d.delivered_version,'attempt',d.attempts);
end $$;

-- Historical positive decisions and current likes both retain consent.
create or replace function public.cancel_withdrawn_agent_introduction_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.agent_introduction_root_id is not null and
    ((new.feedback is distinct from 'like' and new.feedback is distinct from 'positive')
      or new.saved_stage='closed' or new.agent_introduction_root_id is distinct from old.agent_introduction_root_id) then
    update public.agent_contact_messages set cancelled_at=coalesce(cancelled_at,now()),revision=revision+1
      where id=old.agent_introduction_root_id and cancelled_at is null;
  end if;
  return new;
end $$;
revoke all on function public.claim_meeting_calendar_delivery_v2(uuid) from public,anon,authenticated;
grant execute on function public.claim_meeting_calendar_delivery_v2(uuid) to service_role;

-- One-off agreements need not use the legacy selection page's 15-minute grid.
alter table public.meeting_schedules drop constraint meeting_schedules_execution_scope;
alter table public.meeting_schedules add constraint meeting_schedules_execution_scope check (
  (scheduling_source='harper' and company_workspace_id is not null and organizer_company_user_id is not null
    and recommendation_id is not null and role_id is not null and duration_minutes is not null and duration_minutes>0)
  or (scheduling_source='external' and company_workspace_id is null and organizer_company_user_id is null
    and recommendation_id is null and active_round_id is null and company_attendees='[]'::jsonb
    and source_key is not null and status in ('confirmed','cancelled')
    and confirmed_start_at is not null and (confirmed_end_at is null or confirmed_end_at>confirmed_start_at))
);

-- A reschedule may overlap its own imported Calendar event, but no other event.
create or replace function public.enforce_confirmed_meeting_calendar_busy_v1() returns trigger
language plpgsql security definer set search_path=public as $$
declare attendee_id text;
begin
  if new.status is distinct from 'confirmed' then return new; end if;
  if new.confirmed_start_at is null or new.confirmed_end_at is null then
    raise exception 'confirmed meeting requires a time range' using errcode='23514';
  end if;
  for attendee_id in select distinct a->>'companyUserId' from jsonb_array_elements(new.company_attendees) a order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-attendee:'||attendee_id,0));
  end loop;
  if exists(select 1 from company_user_calendar_busy_blocks busy
    where busy.is_blocking and busy.company_user_id::text in (select a->>'companyUserId' from jsonb_array_elements(new.company_attendees) a)
      and busy.start_at<new.confirmed_end_at and busy.end_at>new.confirmed_start_at
      and not exists(select 1 from meeting_schedule_calendar_events d where d.schedule_id=new.id
        and busy.external_event_id=encode(sha256(convert_to('harper.google-calendar.busy.event:'||d.external_event_id,'UTF8')),'hex'))
  ) then raise exception 'a synced Google Calendar event overlaps this meeting' using errcode='40001'; end if;
  return new;
end $$;
