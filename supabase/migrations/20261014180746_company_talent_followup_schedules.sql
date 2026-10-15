-- Durable company-authorized dates, not model judgment. Text remains extensible;
-- only the primary key and initialization idempotency are schema constraints.
create table public.company_talent_followups (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid, role_id uuid, talent_id uuid, recommendation_id uuid,
  source_kind text, source_id uuid, delay_days integer, due_at timestamptz,
  status text default 'pending', revision bigint default 1,
  delivery_run_id uuid, delivery_started_at timestamptz,
  created_by uuid, updated_by uuid, created_at timestamptz default now(), updated_at timestamptz default now(),
  idempotency_key text unique
);
alter table public.company_talent_followups enable row level security;
revoke all on public.company_talent_followups from public, anon, authenticated;
grant select, insert, update on public.company_talent_followups to service_role;
grant select, insert, update on public.company_talent_followups to harper_worker;
create policy company_followups_worker on public.company_talent_followups to harper_worker using (true) with check (true);
create index company_followups_due on public.company_talent_followups(talent_id,due_at) where status='pending';
create index company_followups_workspace on public.company_talent_followups(company_workspace_id,role_id,due_at);
create index company_followups_source on public.company_talent_followups(source_kind,source_id);
alter table public.company_intro_candidates add column followups_initialized_at timestamptz;
alter table public.company_talent_requests add column followups_initialized_at timestamptz;
alter table public.meeting_schedule_rounds add column followups_initialized_at timestamptz;
-- The existing contact Worker is a trusted BYPASSRLS role, but table privileges
-- still apply to invoker triggers. Grant only reads and writes this path needs.
grant select on public.company_intro_candidates, public.company_roles, public.company_workspace,
  public.company_messages, public.meeting_schedules, public.meeting_schedule_rounds,
  public.talent_opportunity_delivery, public.talent_progress to harper_worker;
grant update(followups_initialized_at) on public.company_intro_candidates, public.meeting_schedule_rounds to harper_worker;
grant insert on public.talent_progress to harper_worker;

create function public.company_followup_source_v1(p_kind text,p_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare s jsonb; q jsonb; e jsonb; role_row public.company_roles; talent_row public.talent_users; workspace_name text; contactable boolean;
begin
  if p_kind='intro' then
    select jsonb_build_object('workspaceId',i.company_workspace_id,'roleId',i.role_id,'talentId',i.talent_id,
      'recommendationId',i.recommendation_id,'actorId',i.requested_by_company_user_id,
      'active',i.status='awaiting_talent','requestSummary',i.company_appeal,'initializedAt',i.followups_initialized_at)
      into s from public.company_intro_candidates i where i.id=p_id;
    select to_jsonb(d) into q from public.talent_opportunity_delivery d
      join public.company_intro_candidates i on i.delivery_run_id=d.discovery_run_id
      where i.id=p_id and d.channel='email' and d.status='sent' and d.sent_at is not null
      order by d.sent_at limit 1;
    s:=s||jsonb_build_object('originalSentAt',q->>'sent_at',
      'originalSubject',q#>>'{payload,emailPayload,subject}',
      'originalBody',q#>>'{payload,emailPayload,textBody}');
  elsif p_kind='contact' then
    select jsonb_build_object('workspaceId',r.company_workspace_id,'roleId',r.role_id,'talentId',r.talent_id,
      'recommendationId',r.recommendation_id,'actorId',m.company_user_id,'initializedAt',r.followups_initialized_at,
      'contactPurpose',r.contact_purpose,'expiresAt',r.expires_at,
      'active',r.contact_purpose='request' and r.workflow_status in ('draft','queued','failed','awaiting_talent')
        and (r.expires_at is null or r.expires_at>now()) and r.talent_source_message_id is null and r.document_id is null,
      'requestSummary',r.request_context,'originalSubject',r.delivery_subject,'originalBody',r.delivery_body)
      into s from public.company_talent_requests r left join public.company_messages m on m.id=r.source_company_message_id where r.id=p_id;
    select to_jsonb(d) into q from public.contact_queue d where d.company_talent_request_id=p_id
      and d.type='company_request_candidate_delivery' and d.status='sent' and d.sent_at is not null order by d.sent_at limit 1;
    select to_jsonb(m) into e from public.career_email_messages m where m.metadata->>'companyTalentRequestId'=p_id::text
      and m.direction='outbound' and m.status='sent' order by m.occurred_at limit 1;
    s:=s||jsonb_build_object('originalSentAt',q->>'sent_at',
      'originalSubject',coalesce(e->>'subject',s->>'originalSubject'),
      'originalBody',coalesce(e->>'body_text',s->>'originalBody'));
  elsif p_kind='meeting' then
    select jsonb_build_object('workspaceId',m.company_workspace_id,'roleId',m.role_id,'talentId',m.talent_id,
      'recommendationId',m.recommendation_id,'actorId',m.organizer_company_user_id,'initializedAt',r.followups_initialized_at,
      'meetingScheduleId',m.id,'meetingScheduleRoundId',r.id,'expiresAt',r.invitation_expires_at,
      'publicTokenHash',r.public_token_hash,'requestSummary',m.title,
      'active',m.status='awaiting_talent' and m.active_round_id=r.id and r.submitted_at is null
        and (r.invitation_expires_at is null or r.invitation_expires_at>now()),
      'originalSentAt',d.sent_at,'originalSubject',d.payload->>'subject','originalBody',d.payload->>'body')
      into s from public.meeting_schedule_rounds r join public.meeting_schedules m on m.id=r.schedule_id
      left join public.contact_queue d on d.id=r.delivery_queue_id and d.status='sent' where r.id=p_id;
  else return null;
  end if;
  if s is null then return null; end if;
  select * into role_row from public.company_roles where role_id=(s->>'roleId')::uuid;
  select * into talent_row from public.talent_users where user_id=(s->>'talentId')::uuid;
  select company_name into workspace_name from public.company_workspace where company_workspace_id=(s->>'workspaceId')::uuid;
  contactable:=talent_row.user_id is not null and talent_row.deleted_at is null
      and role_row.company_workspace_id=(s->>'workspaceId')::uuid
      and lower(coalesce(role_row.status,'')) in ('active','paused','top_priority')
      and not coalesce(role_row.is_expired,false) and (role_row.expires_at is null or role_row.expires_at>now())
      and not exists(select 1 from public.talent_setting setting,
        unnest(coalesce(setting.blocked_companies,'{}'::text[])) blocked(name)
        where setting.user_id=talent_row.user_id and nullif(btrim(blocked.name),'') is not null
          and (blocked.name=(s->>'workspaceId') or workspace_name ilike '%'||btrim(blocked.name)||'%'))
      and lower(coalesce(role_row.information->>'testOnly','false')) not in ('true','1','yes','on');
  return s||jsonb_build_object('sourceKind',p_kind,'sourceId',p_id,'companyName',workspace_name,
    'roleName',role_row.name,'candidateName',talent_row.name,'contactable',coalesce(contactable,false),
    'active',coalesce((s->>'active')::boolean,false) and coalesce(contactable,false));
end $$;

create function public.record_company_followup_event_v1(p_id uuid,p_event text,p_details jsonb default '{}')
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.company_talent_followups;
begin
  select * into strict f from public.company_talent_followups where id=p_id;
  insert into public.talent_progress(talent_id,role_id,recommendation_id,company_user_id,user_id,kind,text,metadata)
    values(f.talent_id,f.role_id,f.recommendation_id,coalesce(f.updated_by,f.created_by),'harper_worker','company_followup',
      '회사 요청의 후속 연락 기록',jsonb_build_object('eventType',p_event,'followupId',f.id,
      'sourceKind',f.source_kind,'sourceId',f.source_id,'dueAt',f.due_at,'revision',f.revision)||p_details);
end $$;
create function public.company_followup_progress_audience_v1() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if new.kind='company_followup' then
    new.open_to_company:=true;
    new.open_to_talent:=new.metadata->>'eventType' in ('chat_delivered','email_sent');
  end if; return new;
end $$;
create trigger zz_company_followup_progress_audience before insert or update on public.talent_progress
  for each row execute function public.company_followup_progress_audience_v1();

create function public.initialize_company_followups_v1(p_kind text,p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb; n integer; f uuid; initialized timestamptz;
begin
  if p_kind='intro' then select followups_initialized_at into initialized from public.company_intro_candidates where id=p_id for update;
  elsif p_kind='contact' then select followups_initialized_at into initialized from public.company_talent_requests where id=p_id for update;
  elsif p_kind='meeting' then select followups_initialized_at into initialized from public.meeting_schedule_rounds where id=p_id for update;
  else return; end if;
  if initialized is not null then return; end if;
  s:=public.company_followup_source_v1(p_kind,p_id);
  if s is null or not coalesce((s->>'contactable')::boolean,false)
    or (p_kind='contact' and s->>'contactPurpose' is distinct from 'request') then return; end if;
  if p_kind='intro' then update public.company_intro_candidates set followups_initialized_at=now() where id=p_id;
  elsif p_kind='contact' then update public.company_talent_requests set followups_initialized_at=now() where id=p_id;
  else update public.meeting_schedule_rounds set followups_initialized_at=now() where id=p_id; end if;
  -- Defaults instantiate dates once. Runtime scheduling never recalculates cadence.
  foreach n in array case when p_kind='intro' then array[3,9,18] else array[3] end loop
    insert into public.company_talent_followups(company_workspace_id,role_id,talent_id,recommendation_id,
      source_kind,source_id,delay_days,due_at,created_by,idempotency_key)
    values((s->>'workspaceId')::uuid,(s->>'roleId')::uuid,(s->>'talentId')::uuid,(s->>'recommendationId')::uuid,
      p_kind,p_id,n,(s->>'originalSentAt')::timestamptz+make_interval(days=>n),(s->>'actorId')::uuid,
      'initial:'||p_kind||':'||p_id::text||':'||n::text) on conflict(idempotency_key) do nothing returning id into f;
    if f is not null then perform public.record_company_followup_event_v1(f,'scheduled'); end if;
  end loop;
  insert into public.opportunity_scheduler_state(talent_id,next_check_at)
    values((s->>'talentId')::uuid,now()+interval '3 days') on conflict(talent_id) do nothing;
end $$;

create function public.refresh_company_followups_v1(p_kind text,p_id uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb; f public.company_talent_followups;
begin
  s:=public.company_followup_source_v1(p_kind,p_id);
  for f in select * from public.company_talent_followups where source_kind=p_kind and source_id=p_id and status='pending' for update loop
    update public.company_talent_followups set recommendation_id=(s->>'recommendationId')::uuid where id=f.id and recommendation_id is distinct from (s->>'recommendationId')::uuid;
    if not coalesce((s->>'active')::boolean,false) and f.delivery_started_at is null then
      update public.company_talent_followups set status='cancelled',revision=revision+1,updated_at=now() where id=f.id;
      perform public.record_company_followup_event_v1(f.id,'cancelled','{"reason":"source_unavailable"}');
    elsif f.due_at is null and s->>'originalSentAt' is not null then
      update public.company_talent_followups set due_at=(s->>'originalSentAt')::timestamptz+make_interval(days=>f.delay_days),updated_at=now() where id=f.id;
      perform public.record_company_followup_event_v1(f.id,'date_anchored');
    end if;
  end loop;
end $$;

create function public.company_followup_source_changed_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare k text:=tg_argv[0];
begin
  if k='intro' then
    if new.status='awaiting_talent' and (tg_op='INSERT' or old.status is distinct from new.status) then perform public.initialize_company_followups_v1(k,new.id); end if;
    perform public.refresh_company_followups_v1(k,new.id);
  elsif k='contact' then
    if new.contact_purpose='request' and new.workflow_status in ('queued','failed','awaiting_talent')
      and (tg_op='INSERT' or old.workflow_status is distinct from new.workflow_status or old.contact_purpose is distinct from new.contact_purpose) then
      perform public.initialize_company_followups_v1(k,new.id); end if;
    perform public.refresh_company_followups_v1(k,new.id);
  elsif k='meeting' then
    if new.delivery_queue_id is not null and (tg_op='INSERT' or old.delivery_queue_id is distinct from new.delivery_queue_id) then perform public.initialize_company_followups_v1(k,new.id); end if;
    -- The round can be queued before the parent active-round pointer commits.
    if new.submitted_at is not null then perform public.refresh_company_followups_v1(k,new.id); end if;
  elsif k='meeting_schedule' then
    if old.active_round_id is not null and old.active_round_id is distinct from new.active_round_id then
      perform public.refresh_company_followups_v1('meeting',old.active_round_id); end if;
    if new.active_round_id is not null then perform public.refresh_company_followups_v1('meeting',new.active_round_id); end if;
  end if;
  return new;
end $$;
create trigger company_intro_followup_schedule after insert or update of status,delivery_run_id,candidate_sent_at,recommendation_id
  on public.company_intro_candidates for each row execute function public.company_followup_source_changed_v1('intro');
create trigger company_contact_followup_schedule after insert or update of workflow_status,contact_purpose
  on public.company_talent_requests for each row execute function public.company_followup_source_changed_v1('contact');
create trigger company_meeting_followup_schedule after insert or update of status,delivery_queue_id,submitted_at
  on public.meeting_schedule_rounds for each row execute function public.company_followup_source_changed_v1('meeting');
create trigger company_meeting_followup_parent after update of status,active_round_id
  on public.meeting_schedules for each row execute function public.company_followup_source_changed_v1('meeting_schedule');

create function public.company_followup_first_delivery_v1() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s record;
begin
  if new.status<>'sent' or new.sent_at is null then return new; end if;
  if tg_table_name='contact_queue' then
    if new.type='company_request_candidate_delivery' then
      if tg_op='INSERT' or old.sent_at is null then perform public.initialize_company_followups_v1('contact',new.company_talent_request_id); end if;
      perform public.refresh_company_followups_v1('contact',new.company_talent_request_id);
    elsif new.type='meeting_schedule_candidate_invitation' then
      for s in select id from public.meeting_schedule_rounds where delivery_queue_id=new.id loop
        if tg_op='INSERT' or old.sent_at is null then perform public.initialize_company_followups_v1('meeting',s.id); end if;
        perform public.refresh_company_followups_v1('meeting',s.id);
      end loop;
    end if;
  elsif new.channel='email' then
    for s in select id from public.company_intro_candidates where delivery_run_id=new.discovery_run_id loop
      if tg_op='INSERT' or old.sent_at is null then perform public.initialize_company_followups_v1('intro',s.id); end if;
      perform public.refresh_company_followups_v1('intro',s.id);
    end loop;
  end if; return new;
end $$;
create trigger company_followup_contact_delivery after insert or update of status,sent_at on public.contact_queue
  for each row execute function public.company_followup_first_delivery_v1();
create trigger company_followup_intro_delivery after insert or update of status,sent_at on public.talent_opportunity_delivery
  for each row execute function public.company_followup_first_delivery_v1();

-- Only trusted executors call mutations, after current workspace/team permission
-- checks. No public Data API access or model-owned authorization claims.
create function public.change_company_followup_v1(p_workspace uuid,p_id uuid,p_revision bigint,p_action text,
  p_due_at timestamptz default null,p_actor uuid default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.company_talent_followups; s jsonb; previous_date timestamptz;
begin
  select * into strict f from public.company_talent_followups where id=p_id and company_workspace_id=p_workspace for update;
  if f.status='cancelled' and p_action='cancel' then return to_jsonb(f); end if;
  if p_revision is null or f.revision is distinct from p_revision then raise exception using errcode='40001',message='followup_changed'; end if;
  if f.status is distinct from 'pending' or (f.delivery_started_at is not null and not (
    p_action='cancel' and exists(select 1 from public.opportunity_discovery_run r
      where r.id=f.delivery_run_id and r.status='failed' and not exists(select 1 from public.talent_opportunity_delivery d where d.discovery_run_id=r.id and d.channel='email' and d.status='sent')))) then
    return jsonb_build_object('status','not_changeable','followupId',f.id); end if;
  if p_action='reschedule' and p_due_at is null then raise exception 'followup_date_required'; end if;
  if p_action not in ('cancel','reschedule') then raise exception 'unsupported_followup_operation'; end if;
  s:=public.company_followup_source_v1(f.source_kind,f.source_id);
  if p_action='reschedule' and (not coalesce((s->>'active')::boolean,false)
    or (s->>'expiresAt' is not null and p_due_at >= (s->>'expiresAt')::timestamptz)) then
    raise exception 'followup_source_unavailable_at_date'; end if;
  previous_date:=f.due_at;
  update public.company_talent_followups set status=case when p_action='cancel' then 'cancelled' else status end,
    due_at=case when p_action='reschedule' then p_due_at else due_at end,
    delay_days=case when p_action='reschedule' then null else delay_days end,
    revision=revision+1,updated_by=p_actor,updated_at=now(),
    delivery_run_id=case when p_action='reschedule' then null else delivery_run_id end
    where id=f.id returning * into f;
  perform public.record_company_followup_event_v1(f.id,case when p_action='cancel' then 'cancelled' else 'rescheduled' end,
    jsonb_build_object('previousDueAt',previous_date));
  return to_jsonb(f);
end $$;

create function public.add_company_followup_v1(p_workspace uuid,p_kind text,p_source uuid,p_due_at timestamptz,p_actor uuid,p_key text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare s jsonb; f public.company_talent_followups;
begin
  s:=public.company_followup_source_v1(p_kind,p_source);
  if s->>'workspaceId' is distinct from p_workspace::text or not coalesce((s->>'active')::boolean,false) then raise exception 'followup_source_unavailable'; end if;
  if p_due_at is null or (s->>'expiresAt' is not null and p_due_at >= (s->>'expiresAt')::timestamptz) then raise exception 'followup_date_unavailable'; end if;
  -- An explicit date on a legacy source also records initialization, so a later
  -- source update cannot resurrect defaults behind the company's instruction.
  if p_kind='intro' then update public.company_intro_candidates set followups_initialized_at=coalesce(followups_initialized_at,now()) where id=p_source;
  elsif p_kind='contact' then update public.company_talent_requests set followups_initialized_at=coalesce(followups_initialized_at,now()) where id=p_source;
  elsif p_kind='meeting' then update public.meeting_schedule_rounds set followups_initialized_at=coalesce(followups_initialized_at,now()) where id=p_source; end if;
  insert into public.company_talent_followups(company_workspace_id,role_id,talent_id,recommendation_id,source_kind,source_id,due_at,created_by,idempotency_key)
    values(p_workspace,(s->>'roleId')::uuid,(s->>'talentId')::uuid,(s->>'recommendationId')::uuid,p_kind,p_source,p_due_at,p_actor,p_key)
    on conflict(idempotency_key) do nothing returning * into f;
  if found then
    perform public.record_company_followup_event_v1(f.id,'scheduled');
  else
    select * into strict f from public.company_talent_followups where idempotency_key=p_key
      and company_workspace_id=p_workspace and source_kind=p_kind and source_id=p_source;
  end if;
  return to_jsonb(f);
end $$;

create function public.list_company_followup_rows_v1(p_workspace uuid,p_role_ids uuid[] default null,
  p_ids uuid[] default null,p_role uuid default null,p_talent uuid default null,p_status text default null,
  p_date_basis text default 'scheduled',p_after timestamptz default null,p_before timestamptz default null,
  p_query text default null,p_limit integer default 21,p_offset integer default 0)
returns setof public.company_talent_followups language sql stable security invoker set search_path=public,pg_temp as $$
  select f.* from public.company_talent_followups f
  join public.company_roles role on role.role_id=f.role_id
  join public.talent_users talent on talent.user_id=f.talent_id and talent.deleted_at is null
  left join lateral(select d.sent_at from public.talent_opportunity_delivery d
    where d.discovery_run_id=f.delivery_run_id and d.channel='email' and d.status='sent'
    order by d.sent_at desc limit 1) delivery on true
  cross join lateral(select case p_date_basis when 'sent' then delivery.sent_at when 'created' then f.created_at
    when 'updated' then f.updated_at else f.due_at end as at) stamp
  where f.company_workspace_id=p_workspace and (p_role_ids is null or f.role_id=any(p_role_ids))
    and (p_ids is null or f.id=any(p_ids)) and (p_role is null or f.role_id=p_role)
    and (p_talent is null or f.talent_id=p_talent) and (p_status is null or f.status=p_status)
    and (p_date_basis<>'sent' or delivery.sent_at is not null)
    and (p_after is null or stamp.at>=p_after) and (p_before is null or stamp.at<p_before)
    and (p_query is null or talent.name ilike '%'||p_query||'%' or role.name ilike '%'||p_query||'%')
  order by stamp.at desc nulls last,f.id limit p_limit offset p_offset;
$$;
revoke all on function public.list_company_followup_rows_v1(uuid,uuid[],uuid[],uuid,uuid,text,text,timestamptz,timestamptz,text,integer,integer) from public,anon,authenticated;
grant execute on function public.list_company_followup_rows_v1(uuid,uuid[],uuid[],uuid,uuid,text,text,timestamptz,timestamptz,text,integer,integer) to service_role;

create function public.begin_company_followup_delivery_v1(p_talent uuid,p_ids uuid[],p_revisions bigint[],p_run uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare f public.company_talent_followups; s jsonb; i integer;
begin
  if coalesce(array_length(p_ids,1),0)=0 or array_length(p_ids,1) is distinct from array_length(p_revisions,1) then return false; end if;
  -- Lock all selected dates before recording any start. A stale composition is
  -- invalidated as a whole; do not remove prose using regex/keywords.
  perform 1 from public.company_talent_followups where id=any(p_ids) order by id for update;
  for i in 1..coalesce(array_length(p_ids,1),0) loop
    select * into f from public.company_talent_followups where id=p_ids[i] and talent_id=p_talent;
    if not found or f.status is distinct from 'pending' or p_revisions[i] is null or f.revision is distinct from p_revisions[i] or f.due_at>now()
      or f.due_at is null or (f.delivery_run_id is not null and f.delivery_run_id<>p_run) then return false; end if;
    s:=public.company_followup_source_v1(f.source_kind,f.source_id);
    if not coalesce((s->>'active')::boolean,false) or s->>'originalSentAt' is null then return false; end if;
  end loop;
  update public.company_talent_followups set delivery_run_id=p_run,delivery_started_at=coalesce(delivery_started_at,now()),updated_at=now() where id=any(p_ids);
  return true;
end $$;

-- Grants are deliberately limited to the existing trusted callers.
revoke all on function public.company_followup_source_v1(text,uuid),
  public.record_company_followup_event_v1(uuid,text,jsonb),public.initialize_company_followups_v1(text,uuid),
  public.refresh_company_followups_v1(text,uuid),public.change_company_followup_v1(uuid,uuid,bigint,text,timestamptz,uuid),
  public.add_company_followup_v1(uuid,text,uuid,timestamptz,uuid,text),
  public.begin_company_followup_delivery_v1(uuid,uuid[],bigint[],uuid) from public,anon,authenticated;
grant execute on function public.company_followup_source_v1(text,uuid),public.refresh_company_followups_v1(text,uuid),
  public.record_company_followup_event_v1(uuid,text,jsonb),public.begin_company_followup_delivery_v1(uuid,uuid[],bigint[],uuid)
  to service_role,harper_worker;
grant execute on function public.initialize_company_followups_v1(text,uuid),
  public.change_company_followup_v1(uuid,uuid,bigint,text,timestamptz,uuid),
  public.add_company_followup_v1(uuid,text,uuid,timestamptz,uuid,text) to service_role;
grant execute on function public.initialize_company_followups_v1(text,uuid) to harper_worker;
notify pgrst,'reload schema';
