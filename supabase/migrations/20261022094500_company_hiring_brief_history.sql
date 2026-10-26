-- Durable facts: the exact Hiring Brief before/after a committed save, its
-- author/source, and the eventual short change summary read by UI and agent.
create table public.company_role_hiring_brief_history (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_label text,
  source text,
  before_snapshot jsonb not null,
  after_snapshot jsonb not null,
  summary text,
  summary_status text not null default 'pending',
  summary_attempts integer not null default 0,
  summary_locked_at timestamptz,
  summary_error text,
  summary_next_attempt_at timestamptz not null default now(),
  request_review boolean not null default false,
  review_job_id uuid references public.company_agent_web_action_jobs(id),
  -- Several physical updates in one atomic save must produce one history item.
  unique(role_id, transaction_id)
);
create index company_role_hiring_brief_history_role_time_idx
  on public.company_role_hiring_brief_history(role_id, created_at desc, id desc);
alter table public.company_role_hiring_brief_history enable row level security;
revoke all on public.company_role_hiring_brief_history from public, anon, authenticated;
grant all on public.company_role_hiring_brief_history to service_role;

create function public.capture_company_hiring_brief_history_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_context jsonb := coalesce(nullif(current_setting('harper.hiring_brief_change_context', true), ''), '{}')::jsonb;
  v_before jsonb;
  v_after jsonb := jsonb_build_object('request',new.request,'criteria',coalesce(new.criteria,'[]'::jsonb));
  v_workspace uuid;
begin
  v_before := case when tg_op='INSERT' then jsonb_build_object('request',null,'criteria','[]'::jsonb)
    else jsonb_build_object('request',old.request,'criteria',coalesce(old.criteria,'[]'::jsonb)) end;
  if v_before = v_after then return new; end if;
  select company_workspace_id into v_workspace from public.company_roles where role_id=new.role_id;
  insert into public.company_role_hiring_brief_history(company_workspace_id,role_id,
    actor_user_id,actor_label,source,before_snapshot,after_snapshot,request_review)
  values(v_workspace,new.role_id,nullif(v_context->>'actorUserId','')::uuid,
    nullif(v_context->>'actorLabel',''),nullif(v_context->>'source',''),v_before,v_after,
    coalesce((v_context->>'requestReview')::boolean,false))
  on conflict(role_id,transaction_id) do update set after_snapshot=excluded.after_snapshot;
  -- A transaction that ends where it started is not a new saved version.
  delete from public.company_role_hiring_brief_history
    where role_id=new.role_id and transaction_id=txid_current() and before_snapshot=after_snapshot;
  return new;
end $$;

-- A Hiring Brief is free text. Preserve type, null/empty, ownership and stale
-- write checks; remove only the old content-length gate from both validators.
do $$
declare v_definition text; v_branch text;
begin
  select pg_get_functiondef('public.validate_company_data_change_value_strict_v1(text,jsonb,text)'::regprocedure)
    into v_definition;
  if position('when ''role_request'' then 20000' in v_definition)=0 then
    raise exception 'Canonical Brief validator changed; inspect before migration';
  end if;
  v_definition:=replace(v_definition,'when ''role_request'' then 20000','');
  v_definition:=replace(v_definition,'v_max_length := case p_key',
    E'if p_key = ''role_request'' then return; end if;\n  v_max_length := case p_key');
  execute v_definition;
  select pg_get_functiondef('public.apply_company_data_changes_internal_v1(uuid,jsonb,text,text,boolean)'::regprocedure)
    into v_definition;
  v_branch:=E'    elsif v_key = ''role_request''\n       and jsonb_typeof(v_value) <> ''null''\n       and char_length(v_value #>> ''{}'') > 20000 then\n      raise exception using errcode = ''22023'', message = ''role_request exceeds 20000 characters'';\n';
  if position(v_branch in v_definition)=0 then
    raise exception 'Canonical Brief writer changed; inspect before migration';
  end if;
  execute replace(v_definition,v_branch,'');
end $$;
create trigger company_hiring_brief_history_capture
after insert or update of request,criteria on public.company_internal_roles
for each row execute function public.capture_company_hiring_brief_history_v1();

create function public.apply_company_data_with_hiring_history_v1(
  p_workspace_id uuid, p_changes jsonb, p_criteria_changes jsonb,
  p_source text, p_event_content text, p_actor_user_id uuid, p_actor_label text,
  p_request_review boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_result jsonb := jsonb_build_object('status','already_reflected','changed_count',0);
  v_criterion jsonb;
  v_criteria_result jsonb;
  v_history_ids jsonb;
  v_error_detail text;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_criteria_changes) is distinct from 'array' then
    raise exception 'Changes must be arrays';
  end if;
  if p_request_review and (p_source <> 'website' or p_actor_user_id is null) then
    raise exception 'Web review request requires an authenticated website save';
  end if;
  perform set_config('harper.hiring_brief_change_context',jsonb_build_object(
    'actorUserId',p_actor_user_id,'actorLabel',p_actor_label,'source',p_source,
    'requestReview',p_request_review)::text,true);
  begin
    if jsonb_array_length(p_changes)>0 then
      if exists(select 1 from jsonb_array_elements(p_changes) c where c->>'key'='salaryRange') then
        v_result := public.apply_company_data_changes_with_role_salary_v1(p_workspace_id,p_changes,p_source,p_event_content);
      else
        v_result := public.apply_company_data_changes_v1(p_workspace_id,p_changes,p_source,p_event_content);
      end if;
      if v_result->>'status'='conflict' then
        raise exception using errcode='P0099', message='Hiring Brief save conflict',detail=v_result::text;
      end if;
    end if;
    for v_criterion in select value from jsonb_array_elements(p_criteria_changes) loop
      v_criteria_result := public.update_company_internal_role_criteria_v1(p_workspace_id,
        (v_criterion->>'role_id')::uuid,v_criterion->'expected',v_criterion->'value',p_event_content,p_source);
      if v_criteria_result->>'status'='conflict' then
        raise exception using errcode='P0099', message='Hiring Brief save conflict',
          detail=jsonb_build_object('status','conflict','key','criteria','role_id',v_criterion->>'role_id')::text;
      end if;
      if v_criteria_result->>'status'='updated' then
        v_result := jsonb_build_object('status','updated','changed_count',coalesce((v_result->>'changed_count')::int,0)+1);
      end if;
    end loop;
  exception when sqlstate 'P0099' then
    get stacked diagnostics v_error_detail=pg_exception_detail;
    return v_error_detail::jsonb;
  end;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into v_history_ids
    from public.company_role_hiring_brief_history where transaction_id=txid_current() and company_workspace_id=p_workspace_id;
  return v_result || jsonb_build_object('history_ids',v_history_ids);
end $$;

create function public.claim_company_hiring_brief_summary_v1(p_history_id uuid)
returns setof public.company_role_hiring_brief_history
language sql security definer set search_path=public,pg_temp as $$
  update public.company_role_hiring_brief_history set summary_status='processing',
    summary_locked_at=now(),summary_attempts=summary_attempts+1,summary_error=null
  where id=p_history_id and (
    (summary_status in ('pending','retry') and summary_next_attempt_at<=now())
    or (summary_status='processing' and summary_locked_at<now()-interval '35 minutes'))
  returning *;
$$;

create function public.enqueue_company_hiring_brief_review_v1(p_history_id uuid,p_conversation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_history public.company_role_hiring_brief_history%rowtype;
  v_job uuid;
begin
  select * into v_history from public.company_role_hiring_brief_history where id=p_history_id for update;
  if not found or not v_history.request_review then return null; end if;
  if v_history.review_job_id is not null then return v_history.review_job_id; end if;
  select job_id into v_job from public.enqueue_company_agent_web_action_v1(
    v_history.company_workspace_id,p_conversation_id,v_history.role_id,v_history.actor_user_id,
    'hiring_brief_saved',jsonb_build_object('hiringBriefHistoryId',v_history.id,
      'userMessage','수정된 기준으로 인재풀을 다시 검토해주세요'),
    'hiring-brief-review:'||v_history.id::text);
  -- The legacy queue's timestamp expression uses a timezone-less UTC value.
  -- A visible user message must retain the actual saved instant in any DB zone.
  update public.company_messages set content='수정된 기준으로 인재풀을 다시 검토해주세요',message_type='chat',created_at=v_history.created_at
    where id=(select anchor_message_id from public.company_agent_web_action_jobs where id=v_job);
  update public.company_role_hiring_brief_history set review_job_id=v_job where id=v_history.id;
  return v_job;
end $$;

revoke all on function public.capture_company_hiring_brief_history_v1() from public,anon,authenticated;
revoke all on function public.apply_company_data_with_hiring_history_v1(uuid,jsonb,jsonb,text,text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.claim_company_hiring_brief_summary_v1(uuid) from public,anon,authenticated;
revoke all on function public.enqueue_company_hiring_brief_review_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.apply_company_data_with_hiring_history_v1(uuid,jsonb,jsonb,text,text,uuid,text,boolean) to service_role;
grant execute on function public.claim_company_hiring_brief_summary_v1(uuid) to service_role;
grant execute on function public.enqueue_company_hiring_brief_review_v1(uuid,uuid) to service_role;

-- Criteria are an extensible comparison document, not a six-slot state machine.
-- Keep array/object/required-field validation and the existing role ownership,
-- optimistic concurrency and event contracts in the canonical writer.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.update_company_internal_role_criteria_v1(uuid,uuid,jsonb,jsonb,text,text)'::regprocedure)
    into v_definition;
  if position('or jsonb_array_length(p_criteria) > 6' in v_definition)=0
     or position('or char_length(item ->> ''name'') > 200' in v_definition)=0
     or position('or char_length(item ->> ''criteria'') > 8000' in v_definition)=0 then
    raise exception 'Canonical criteria writer changed; inspect its constraints before applying this migration';
  end if;
  v_definition:=replace(v_definition,'or jsonb_array_length(p_criteria) > 6','');
  v_definition:=replace(v_definition,'or char_length(item ->> ''name'') > 200','');
  v_definition:=replace(v_definition,'or char_length(item ->> ''criteria'') > 8000','');
  v_definition:=replace(v_definition,'criteria must contain zero to six items','criteria must be an array');
  execute v_definition;
end $$;
