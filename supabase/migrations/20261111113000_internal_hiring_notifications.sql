-- Internal operations delivery receipts, separate from company-facing conversation.
-- Capture only new committed facts; no historical replay. No network I/O in triggers.
create table public.internal_hiring_notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  facts jsonb not null,
  created_at timestamptz not null default now(),
  attempt_after timestamptz not null default now(),
  lease_id uuid,
  sent_at timestamptz,
  slack_ts text,
  last_error text
);
alter table public.internal_hiring_notifications enable row level security;
revoke all on public.internal_hiring_notifications from public,anon,authenticated;
grant select,update on public.internal_hiring_notifications to service_role;
create index internal_hiring_notifications_pending on public.internal_hiring_notifications(attempt_after,created_at) where sent_at is null;

create function public.record_internal_hiring_notification(
  p_key text,p_role uuid,p_talent uuid,p_action text,p_actor uuid,p_actor_label text,
  p_details jsonb default '{}',p_at timestamptz default now()
) returns void language plpgsql security invoker set search_path='' as $$
declare r record; t record; a record;
begin
  select role.name,role.company_workspace_id,w.company_name into r
  from public.company_roles role join public.company_workspace w on w.company_workspace_id=role.company_workspace_id
  where role.role_id=p_role and role.source_type='internal'
    and lower(coalesce(role.information->>'testOnly','false')) not in ('true','1','yes','on');
  if not found then return; end if;
  select name,email into t from public.talent_users where user_id=p_talent;
  if not found then return; end if;
  select name,email into a from public.company_users where user_id=p_actor;
  insert into public.internal_hiring_notifications(event_key,facts)
  values(p_key,jsonb_build_object('workspaceId',r.company_workspace_id,'companyName',r.company_name,
    'roleId',p_role,'roleName',r.name,'talentId',p_talent,'talentName',coalesce(nullif(t.name,''),t.email,p_talent::text),
    'actor',coalesce(nullif(p_actor_label,''),nullif(a.name,''),a.email,p_actor::text,'변경자 미기록'),
    'actorEmail',case when p_actor_label is null then a.email end,'action',p_action,'details',p_details,'occurredAt',p_at))
  on conflict(event_key) do nothing;
end $$;
revoke all on function public.record_internal_hiring_notification(text,uuid,uuid,text,uuid,text,jsonb,timestamptz) from public,anon,authenticated;

create function public.capture_internal_hiring_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare action text; actor_label text; organizer_label text; details jsonb:='{}'; previous jsonb:='{}';
begin
  if tg_op='UPDATE' then previous:=to_jsonb(old); end if;
  if tg_table_name='talent_progress' then
    if new.kind='org_stage_change' and new.metadata->>'stage' is distinct from new.metadata->>'previousStage' then
      if new.metadata->>'stage'='process_stopped' then
        action:=case when new.metadata->>'previousStage'='pending_connection' then 'company_connection_declined' else 'company_process_ended' end;
      elsif new.metadata->>'previousStage'='pending_connection' and new.metadata->>'stage' not in ('archived','pending_connection') then
        action:='company_connection_accepted';
        -- The accepted company-first Intro is connected automatically, under the
        -- original requester's account. Do not mislabel that as another human decision.
        if exists(select 1 from public.company_intro_candidates i where i.recommendation_id=new.recommendation_id
          and i.talent_decision_at is not null and i.status in ('connecting','connected')) then
          action:='intro_connected'; actor_label:='Harper 시스템';
        end if;
      end if;
      details:=jsonb_build_object('notifyCandidate',new.metadata->'notifyCandidateOnClosure','channel',new.metadata->>'decisionChannel');
    elsif new.kind='candidate_role_recommendation_accepted' then
      action:='candidate_recommendation_accepted';
      select coalesce(nullif(name,''),email)||'(후보자)' into actor_label from public.talent_users where user_id=new.talent_id;
    end if;
    if action is not null then
      perform public.record_internal_hiring_notification('progress:'||new.id,new.role_id,new.talent_id,action,
        new.company_user_id,actor_label,details,new.created_at);
    end if;
  elsif tg_table_name='company_decision_events' then
    if new.action='pass' and new.subject_kind='member_candidate' and new.intro_candidate_id is not null then
      perform public.record_internal_hiring_notification('company-pass:'||new.id,new.role_id,new.subject_id,
        'company_intro_passed',new.actor_user_id,null,jsonb_build_object('channel',new.channel),new.created_at);
    end if;
  elsif tg_table_name='company_intro_candidates' then
    if new.requested_at is not null and previous->>'requested_at' is distinct from to_jsonb(new)->>'requested_at' then
      perform public.record_internal_hiring_notification('intro-request:'||new.id||':'||new.requested_at,new.role_id,new.talent_id,
        'intro_requested',new.requested_by_company_user_id,null,'{}',new.requested_at);
    end if;
    if new.candidate_sent_at is not null and previous->>'candidate_sent_at' is distinct from to_jsonb(new)->>'candidate_sent_at' then
      perform public.record_internal_hiring_notification('intro-sent:'||new.id||':'||new.candidate_sent_at,new.role_id,new.talent_id,
        'intro_sent',null,'Harper 시스템','{}',new.candidate_sent_at);
    end if;
    if new.talent_decision_at is not null and previous->>'talent_decision_at' is distinct from to_jsonb(new)->>'talent_decision_at' then
      action:=case when new.close_reason='talent_declined' then 'candidate_intro_declined'
        when new.status in ('connecting','connected') then 'candidate_intro_accepted' end;
      if action is not null then
        select coalesce(nullif(name,''),email)||'(후보자)' into actor_label from public.talent_users where user_id=new.talent_id;
        perform public.record_internal_hiring_notification('intro-decision:'||new.id||':'||new.talent_decision_at,new.role_id,new.talent_id,
          action,null,actor_label,'{}',new.talent_decision_at);
      end if;
    end if;
  elsif tg_table_name='career_email_messages' then
    if new.direction='outbound' and new.status='sent' and previous->>'status' is distinct from 'sent'
      and (new.mail_type='org_intro' or new.metadata->>'emailKind'='orgIntro')
      and nullif(new.metadata->>'resendEmailId','') is not null then
      perform public.record_internal_hiring_notification('connection-email:'||new.id,(new.metadata->>'roleId')::uuid,new.talent_id,
        'connection_email_sent',null,'Harper 시스템',jsonb_build_object('requester',new.metadata->>'companyUserName'),new.occurred_at);
    end if;
  elsif tg_table_name='meeting_schedules' then
    if new.status='confirmed' and previous->>'status' is distinct from 'confirmed' then action:='meeting_confirmed';
    elsif new.status='confirmed' and (previous->>'confirmed_start_at' is distinct from to_jsonb(new)->>'confirmed_start_at'
      or previous->>'confirmed_end_at' is distinct from to_jsonb(new)->>'confirmed_end_at') then action:='meeting_rescheduled';
    elsif new.status='cancelled' and previous->>'status'='confirmed' then action:='meeting_cancelled'; end if;
    if action is not null then
      -- Organizer is a separate fact, never assumed to be the person who changed it.
      select coalesce(nullif(name,''),email) into organizer_label from public.company_users where user_id=new.organizer_company_user_id;
      if previous#>>'{source_refs,calendarMutation,operationKey}' is distinct from new.source_refs#>>'{calendarMutation,operationKey}' then
        actor_label:=new.source_refs#>>'{calendarMutation,actorLabel}';
      elsif action='meeting_confirmed' and previous->>'status'='awaiting_talent' and exists(
        select 1 from public.meeting_schedule_rounds r where r.id=new.active_round_id and r.status='confirmed'
          and r.submitted_at=new.updated_at and jsonb_array_length(coalesce(r.candidate_options,'[]'))>0
      ) then
        select coalesce(nullif(name,''),email)||'(후보자·예약 링크 제출)' into actor_label from public.talent_users where user_id=new.talent_id;
      end if;
      perform public.record_internal_hiring_notification('meeting:'||new.id||':'||new.version||':'||action,new.role_id,new.talent_id,
        action,null,coalesce(actor_label,'Harper 시스템(일정 기록·변경자 미기록)'),
        jsonb_build_object('startsAt',new.confirmed_start_at,'endsAt',new.confirmed_end_at,'timezone',new.timezone,
          'previousStartsAt',previous->>'confirmed_start_at','previousEndsAt',previous->>'confirmed_end_at','organizer',organizer_label),new.updated_at);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.capture_internal_hiring_notification() from public,anon,authenticated;
create trigger internal_hiring_progress after insert on public.talent_progress
  for each row execute function public.capture_internal_hiring_notification();
create trigger internal_hiring_company_decision after insert on public.company_decision_events
  for each row execute function public.capture_internal_hiring_notification();
create trigger internal_hiring_intro after insert or update of requested_at,candidate_sent_at,talent_decision_at on public.company_intro_candidates
  for each row execute function public.capture_internal_hiring_notification();
create trigger internal_hiring_email after insert or update of status on public.career_email_messages
  for each row execute function public.capture_internal_hiring_notification();
create trigger internal_hiring_meeting after insert or update of status,confirmed_start_at,confirmed_end_at on public.meeting_schedules
  for each row execute function public.capture_internal_hiring_notification();
