-- Shared appointment facts. Company scheduling remains owned by its existing RPCs.
alter table public.meeting_schedules
  add column scheduling_source text not null default 'harper',
  add column content text not null default '',
  add column timezone text not null default 'Asia/Seoul',
  add column source_refs jsonb not null default '{}',
  add column source_key text,
  alter column company_workspace_id drop not null,
  alter column organizer_company_user_id drop not null,
  alter column recommendation_id drop not null,
  alter column role_id drop not null,
  alter column duration_minutes drop not null;
alter table public.meeting_schedules drop constraint meeting_schedules_title_length_check;
alter table public.meeting_schedules drop constraint meeting_schedules_duration_check;
alter table public.meeting_schedules add constraint meeting_schedules_execution_scope check (
  (scheduling_source = 'harper' and company_workspace_id is not null and organizer_company_user_id is not null
    and recommendation_id is not null and role_id is not null and duration_minutes is not null
    and duration_minutes between 15 and 240 and duration_minutes % 15 = 0)
  or (scheduling_source = 'external' and company_workspace_id is null and organizer_company_user_id is null
    and recommendation_id is null and active_round_id is null and company_attendees = '[]'::jsonb
    and source_key is not null and status in ('confirmed', 'cancelled')
    and confirmed_start_at is not null and (confirmed_end_at is null or confirmed_end_at > confirmed_start_at))
);
create unique index meeting_schedules_external_source on public.meeting_schedules(talent_id,source_key) where scheduling_source='external';
create index meeting_schedules_talent_upcoming on public.meeting_schedules(talent_id,confirmed_start_at,id) where status='confirmed';
alter table public.meeting_schedules enable row level security;
-- Existing table has no end-user policies. Reads/writes stay behind authenticated server routes.
revoke all on public.meeting_schedules from anon, authenticated;

-- External appointments must not reserve company calendars or enqueue invitations.
drop trigger meeting_schedules_calendar_busy_insert_v1 on public.meeting_schedules;
create trigger meeting_schedules_calendar_busy_insert_v1 before insert on public.meeting_schedules
  for each row when (new.scheduling_source='harper') execute function public.enforce_confirmed_meeting_calendar_busy_v1();
drop trigger meeting_schedules_calendar_busy_update_v1 on public.meeting_schedules;
create trigger meeting_schedules_calendar_busy_update_v1 before update of status,confirmed_start_at,confirmed_end_at on public.meeting_schedules
  for each row when (new.scheduling_source='harper') execute function public.enforce_confirmed_meeting_calendar_busy_v1();
drop trigger meeting_schedules_calendar_event_initialize_v1 on public.meeting_schedules;
create trigger meeting_schedules_calendar_event_initialize_v1 after insert or update of status on public.meeting_schedules
  for each row when (new.scheduling_source='harper') execute function public.initialize_meeting_schedule_calendar_event_v1();
drop trigger company_meeting_followup_parent on public.meeting_schedules;
create trigger company_meeting_followup_parent after update of status,active_round_id on public.meeting_schedules
  for each row when (new.scheduling_source='harper') execute function public.company_followup_source_changed_v1('meeting_schedule');

create function public.write_talent_meeting_schedule(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare
  v_row public.meeting_schedules%rowtype;
  v_op public.talent_external_operations%rowtype;
  v_action text := p_input->>'action';
  v_role uuid;
begin
  if nullif(p_request_id,'') is null or not exists(select 1 from talent_users where user_id=p_user_id and deleted_at is null) then
    raise exception 'Authenticated Career user and request ID required';
  end if;
  if p_conversation_id is not null and not exists(select 1 from talent_conversations where id=p_conversation_id and user_id=p_user_id) then
    raise exception 'Conversation unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('talent-meeting:'||p_user_id::text,0));
  select * into v_op from talent_external_operations where user_id=p_user_id and kind='meeting_schedule' and idempotency_key=p_request_id;
  if found then
    if v_op.request is distinct from p_input then raise exception 'Request ID reused with different input'; end if;
    return v_op.result;
  end if;
  if v_action not in ('create','update','cancel') or v_action is null then raise exception 'Invalid action'; end if;
  if v_action='create' then
    if nullif(p_input->>'source_key','') is null or nullif(p_input->>'title','') is null or p_input->>'starts_at' is null then
      raise exception 'source_key, title and starts_at required';
    end if;
    select * into v_row from meeting_schedules where talent_id=p_user_id and scheduling_source='external' and source_key=p_input->>'source_key';
    if found then raise exception 'Source already recorded as schedule %. Read and update its current version.',v_row.id; end if;
  else
    select * into v_row from meeting_schedules where id=(p_input->>'schedule_id')::uuid and talent_id=p_user_id for update;
    if not found then raise exception 'Schedule unavailable'; end if;
    if v_row.scheduling_source<>'external' then raise exception 'Harper-managed meetings must use the existing company scheduling flow'; end if;
    if v_row.version is distinct from (p_input->>'expected_version')::bigint then raise exception 'Schedule version conflict'; end if;
  end if;
  v_role := case when p_input ? 'role_id' then (p_input->>'role_id')::uuid else v_row.role_id end;
  if v_role is not null and (v_action='create' or p_input ? 'role_id') and not exists(select 1 from company_roles where role_id=v_role
    and lower(coalesce(information->>'testOnly','false'))<>'true') then raise exception 'Role unavailable'; end if;
  if p_input ? 'timezone' and not exists(select 1 from pg_timezone_names where name=p_input->>'timezone') then raise exception 'Invalid timezone'; end if;
  if p_input ? 'source_refs' and jsonb_typeof(p_input->'source_refs')<>'object' then raise exception 'source_refs must be an object'; end if;
  if v_action='create' then
    insert into meeting_schedules(talent_id,role_id,scheduling_source,title,content,timezone,source_refs,source_key,
      status,confirmed_start_at,confirmed_end_at,duration_minutes,idempotency_key)
    values(p_user_id,v_role,'external',p_input->>'title',coalesce(p_input->>'content',''),coalesce(p_input->>'timezone','Asia/Seoul'),
      coalesce(p_input->'source_refs','{}'),p_input->>'source_key','confirmed',(p_input->>'starts_at')::timestamptz,
      (p_input->>'ends_at')::timestamptz,null,'career-meeting:'||p_user_id::text||':'||md5(p_request_id)) returning * into v_row;
  else
    update meeting_schedules set role_id=v_role,
      title=case when p_input ? 'title' then p_input->>'title' else title end,
      content=case when p_input ? 'content' then p_input->>'content' else content end,
      timezone=coalesce(p_input->>'timezone',timezone),
      source_refs=case when p_input ? 'source_refs' then p_input->'source_refs' else source_refs end,
      confirmed_start_at=case when p_input ? 'starts_at' then (p_input->>'starts_at')::timestamptz else confirmed_start_at end,
      confirmed_end_at=case when p_input ? 'ends_at' then (p_input->>'ends_at')::timestamptz else confirmed_end_at end,
      status=case when v_action='cancel' then 'cancelled' else 'confirmed' end,
      version=version+1,updated_at=now() where id=v_row.id returning * into v_row;
  end if;
  insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
    values(p_user_id,p_conversation_id,'meeting_schedule',p_request_id,'completed',p_input,to_jsonb(v_row));
  return to_jsonb(v_row);
end $$;
revoke all on function public.write_talent_meeting_schedule(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_talent_meeting_schedule(uuid,uuid,text,jsonb) to service_role;
