-- Supabase SQL Editor에서 파일 전체를 한 번에 실행합니다. 반복 실행 가능합니다.
-- 대상: Harper의 기존 FDE Pool / DS Pool, 아래 두 본인 테스트 계정만.
-- 매번 두 Pool의 채팅 전체와 두 계정의 Harper 전체 Contact 이력을 삭제합니다.
-- 두 Pool의 기존 추천/단계/일정도 초기화한 뒤:
--   daniel@matchharper.com  -> 먼저 제안 가능한 후보 (두 Pool)
--   khj605123@gmail.com     -> 연결 대기 (두 Pool)
-- 다른 Role의 추천/단계, 다른 후보자, 프로필/이력서/Brief/Memory는 보존합니다.
-- 메일/Slack 발송은 만들지 않습니다. 이미 외부에 보낸 메일/Slack은 회수하지 않습니다.
-- 진행 중인 대화/발송 작업 또는 실제 캘린더 일정이 있으면 전체 롤백합니다.
-- 선행 조건: 20260928013822_allow_company_intro_across_roles.sql 적용 완료.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create temporary table _pool_reset_roles (
  role_id uuid primary key, expected_name text not null
) on commit drop;
insert into _pool_reset_roles values
  ('3f4a1b7c-f2a0-4776-bc3a-0bfe94b3e376', 'Forward Deployed Engineer Pool'),
  ('d0250ab8-b6cd-4815-aaeb-e1bbd37ee8c9', 'Deployment Strategist Pool');

create temporary table _pool_reset_talents (
  talent_id uuid primary key, email text not null, target_stage text not null
) on commit drop;
insert into _pool_reset_talents values
  ('2c3a9d50-d392-4764-8bd1-6d9c036ddc87', 'daniel@matchharper.com', 'ready'),
  ('111fe5c4-8f66-4392-9a27-e81fb8dfa7dd', 'khj605123@gmail.com', 'pending_connection');

do $$
begin
  perform pg_advisory_xact_lock(hashtextextended('harper-pool-candidate-reset', 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'company_talent_route:720254d7-aeb7-4709-a56f-7b822f89eac5:' || talent_id::text, 0
  )) from _pool_reset_talents order by talent_id;
  perform 1 from public.company_roles
    where role_id in (select role_id from _pool_reset_roles) for update;
  perform 1 from public.talent_users
    where user_id in (select talent_id from _pool_reset_talents) for update;

  if (select count(*) from public.company_roles r
      join _pool_reset_roles s using (role_id)
      where r.company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5'
        and r.name = s.expected_name and r.source_type = 'internal'
        and r.status = 'paused'
        and coalesce(r.is_expired, false) is false
        and (r.expires_at is null or r.expires_at > now())) <> 2 then
    raise exception '중단된 Harper FDE/DS Pool인지 확인하세요. Role 설정은 자동 변경하지 않습니다.';
  end if;
  if (select count(*) from public.talent_users u
      join _pool_reset_talents t on t.talent_id = u.user_id and t.email = u.email
      join public.talent_setting s on s.user_id = u.user_id
      where u.deleted_at is null and s.is_onboarding_done is true
        and s.profile_visibility = 'open_to_matches'
        and s.get_internal_recommendation is not false
        and not exists (
          select 1 from unnest(coalesce(s.blocked_companies, '{}'::text[])) blocked(name)
          join public.company_workspace w on w.company_workspace_id =
            '720254d7-aeb7-4709-a56f-7b822f89eac5'
          where lower(btrim(blocked.name)) in
            (lower(btrim(w.company_name)), lower(btrim(w.published_name)))
        )) <> 2 then
    raise exception '테스트 계정 ID/이메일 또는 공개/추천 설정을 확인하세요.';
  end if;
  if to_regclass('public.company_intro_candidates_active_workspace_talent_idx') is not null then
    raise exception '여러 Role 등록 허용 migration을 먼저 적용하세요.';
  end if;
  if exists (select 1 from public.opportunity_discovery_run
      where talent_id in (select talent_id from _pool_reset_talents) and status = 'running')
    or exists (select 1 from public.company_first_search_runs
      where company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5'
        and status = 'running') then
    raise exception '추천 작업이 실행 중입니다. 완료 후 다시 실행하세요.';
  end if;
end $$;

-- 삭제 전에 연결 ID를 고정합니다. 과거 실행에서 생성된 ID를 하드코딩하지 않습니다.
create temporary table _pool_reset_recs on commit drop as
select r.* from public.talent_opportunity_recommendation r
join _pool_reset_roles using (role_id) join _pool_reset_talents using (talent_id);
create temporary table _pool_reset_intros on commit drop as
select c.* from public.company_intro_candidates c
join _pool_reset_roles using (role_id) join _pool_reset_talents using (talent_id);
create temporary table _pool_reset_contacts on commit drop as
select c.* from public.company_talent_requests c
join _pool_reset_talents using (talent_id)
where c.company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5';
create temporary table _pool_reset_relays on commit drop as
select c.* from public.company_talent_relays c
join public.talent_opportunity_recommendation r on r.id = c.recommendation_id
join public.company_roles p on p.role_id = r.role_id
join _pool_reset_talents t on t.talent_id = r.talent_id
where p.company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5';
create temporary table _pool_reset_meetings on commit drop as
select m.* from public.meeting_schedules m
join _pool_reset_roles using (role_id) join _pool_reset_talents using (talent_id);
create temporary table _pool_reset_runs on commit drop as
select d.* from public.opportunity_discovery_run d
join _pool_reset_talents using (talent_id)
where d.id in (select delivery_run_id from _pool_reset_intros)
  or d.trigger_payload #>> '{manualInternalRecommendation,roleId}' in
    (select role_id::text from _pool_reset_roles)
  or d.trigger_payload #>> '{companyRequestFollowup,companyTalentRequestId}' in
    (select id::text from _pool_reset_contacts);

create temporary table _pool_reset_refs (id text primary key) on commit drop;
insert into _pool_reset_refs
select id::text from _pool_reset_recs union select id::text from _pool_reset_intros
union select id::text from _pool_reset_contacts union select id::text from _pool_reset_relays
union select id::text from _pool_reset_runs;

create temporary table _pool_reset_emails on commit drop as
select e.* from public.career_email_messages e join _pool_reset_talents using (talent_id)
where exists (select 1 from _pool_reset_refs s where strpos(e.metadata::text, s.id) > 0);
create temporary table _pool_reset_talent_messages (id bigint primary key) on commit drop;
insert into _pool_reset_talent_messages
select talent_source_message_id from _pool_reset_contacts where talent_source_message_id is not null
union select source_talent_message_id from _pool_reset_relays
union select talent_message_id from _pool_reset_emails where talent_message_id is not null;
create temporary table _pool_reset_reply_jobs on commit drop as
select j.* from public.email_reply_jobs j join _pool_reset_talents using (talent_id)
where j.user_message_id in (select id from _pool_reset_talent_messages)
  or j.assistant_message_id in (select id from _pool_reset_talent_messages)
  or j.id in (select reply_job_id from _pool_reset_emails);
insert into _pool_reset_talent_messages
select user_message_id from _pool_reset_reply_jobs where user_message_id is not null
union select assistant_message_id from _pool_reset_reply_jobs where assistant_message_id is not null
on conflict do nothing;
insert into _pool_reset_emails
select e.* from public.career_email_messages e
where (e.reply_job_id in (select id from _pool_reset_reply_jobs)
    or e.talent_message_id in (select id from _pool_reset_talent_messages))
  and e.talent_id in (select talent_id from _pool_reset_talents)
  and e.id not in (select id from _pool_reset_emails);

create temporary table _pool_reset_company_messages on commit drop as
select m.id, m.conversation_id, m.created_at from public.company_messages m
where m.company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5' and (
  m.role_id in (select role_id from _pool_reset_roles)
  or m.conversation_id in (select id from public.company_conversations
    where role_id in (select role_id from _pool_reset_roles))
  or m.id in (select source_company_message_id from _pool_reset_contacts)
  or m.id in (select source_company_message_id from public.meeting_schedule_rounds
    where schedule_id in (select id from _pool_reset_meetings))
  or exists (select 1 from _pool_reset_refs s where strpos(m.metadata::text, s.id) > 0)
);
create temporary table _pool_reset_conversations on commit drop as
select id from public.company_conversations where
  role_id in (select role_id from _pool_reset_roles)
  or id in (select conversation_id from _pool_reset_company_messages);
create temporary table _pool_reset_queue on commit drop as
select q.* from public.contact_queue q where
  q.company_talent_request_id in (select id from _pool_reset_contacts)
  or q.company_talent_relay_id in (select id from _pool_reset_relays)
  or (q.user_id in (select talent_id from _pool_reset_talents) and q.role_id in (
    select role_id from public.company_roles
    where company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5'));

-- 처리 중인 발송이나 다른 후보자와 공유된 데이터가 있으면 중단합니다.
do $$
begin
  perform 1 from public.contact_queue where id in (select id from _pool_reset_queue) for update;
  perform 1 from public.email_reply_jobs where id in (select id from _pool_reset_reply_jobs) for update;
  perform 1 from public.company_agent_web_action_jobs
    where conversation_id in (select id from _pool_reset_conversations) for update;
  perform 1 from public.slack_reply_jobs where
    user_message_id in (select id from _pool_reset_company_messages)
    or response_message_id in (select id from _pool_reset_company_messages) for update;

  if exists (select 1 from public.contact_queue where id in (select id from _pool_reset_queue)
      and (locked_at is not null or status in ('processing','running','sending')))
    or exists (select 1 from public.email_reply_jobs where id in (select id from _pool_reset_reply_jobs)
      and (locked_at is not null or status in ('processing','running','sending')))
    or exists (select 1 from public.company_agent_web_action_jobs
      where conversation_id in (select id from _pool_reset_conversations)
        and (locked_at is not null or status in ('processing','running')))
    or exists (select 1 from public.company_messages
      where id in (select id from _pool_reset_company_messages)
        and status in ('processing','running','streaming','pending'))
    or exists (select 1 from public.slack_reply_jobs where
      (user_message_id in (select id from _pool_reset_company_messages)
        or response_message_id in (select id from _pool_reset_company_messages))
      and (locked_at is not null or status in ('processing','running','sending'))) then
    raise exception '대화/연락 처리 중입니다. 작업이 끝난 뒤 다시 실행하세요.';
  end if;
  if exists (select 1 from public.meeting_schedule_calendar_events
      where schedule_id in (select id from _pool_reset_meetings)
        and status not in ('cancelled','deleted') and external_event_id is not null) then
    raise exception '실제 캘린더 일정이 있습니다. 서비스에서 일정을 취소한 뒤 다시 실행하세요.';
  end if;
  if exists (select 1 from public.company_talent_requests where
      source_company_message_id in (select id from _pool_reset_company_messages)
      and id not in (select id from _pool_reset_contacts))
    or exists (select 1 from public.meeting_schedule_rounds where
      source_company_message_id in (select id from _pool_reset_company_messages)
      and schedule_id not in (select id from _pool_reset_meetings))
    or exists (select 1 from public.talent_opportunity_recommendation where
      discovery_run_id in (select id from _pool_reset_runs)
      and id not in (select id from _pool_reset_recs))
    or exists (select 1 from public.company_intro_candidates where
      delivery_run_id in (select id from _pool_reset_runs)
      and id not in (select id from _pool_reset_intros))
    or exists (select 1 from public.crm_email_campaign_deliveries where
      discovery_run_id in (select id from _pool_reset_runs)
      and talent_id not in (select talent_id from _pool_reset_talents)) then
    raise exception '다른 후보자/Role과 공유된 데이터가 있습니다. 전체 롤백합니다.';
  end if;
  if exists (select 1 from public.company_first_slack_outbox o
      where o.candidate_ids && array(select id from _pool_reset_intros)) then
    raise exception '후보 카드에 연결된 Slack 발송 묶음이 있습니다. 먼저 해당 발송을 정리하세요.';
  end if;
end $$;

-- FK 하위 행부터 정리합니다. 외부 서비스로 발송하는 RPC는 호출하지 않습니다.
delete from public.company_agent_web_action_jobs
where anchor_message_id in (select id from _pool_reset_company_messages)
  or conversation_id in (select id from public.company_conversations
    where role_id in (select role_id from _pool_reset_roles));
delete from public.slack_reply_jobs where
  user_message_id in (select id from _pool_reset_company_messages)
  or response_message_id in (select id from _pool_reset_company_messages);
delete from public.contact_queue where id in (select id from _pool_reset_queue);
delete from public.email_reply_aliases
where company_talent_request_id in (select id from _pool_reset_contacts);
delete from public.company_talent_relays where id in (select id from _pool_reset_relays);
delete from public.company_talent_requests where id in (select id from _pool_reset_contacts);
delete from public.meeting_schedules where id in (select id from _pool_reset_meetings);
delete from public.company_intro_candidates where id in (select id from _pool_reset_intros);
delete from public.talent_progress where
  (talent_id in (select talent_id from _pool_reset_talents)
    and role_id in (select role_id from _pool_reset_roles))
  or (talent_id in (select talent_id from _pool_reset_talents)
    and role_id in (select role_id from public.company_roles
      where company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5')
    and (kind = 'company_request_followup_sent' or
      (kind = 'org_candidate_activity' and metadata->>'eventType' in
        ('candidate_contact_sent','candidate_message_delivered','candidate_response_received'))));
delete from public.talent_opportunity_tag
where talent_id in (select talent_id from _pool_reset_talents)
  and opportunity_id in (select role_id from _pool_reset_roles);
delete from public.talent_opportunity_fit
where talent_id in (select talent_id from _pool_reset_talents)
  and opportunity_id in (select role_id from _pool_reset_roles);
delete from public.talent_external_fit
where talent_id in (select talent_id from _pool_reset_talents)
  and role_id in (select role_id from _pool_reset_roles);
delete from public.talent_opportunity_matching_review
where talent_id in (select talent_id from _pool_reset_talents)
  and opportunity_id in (select role_id from _pool_reset_roles);
delete from public.talent_referral_application
where referred_user_id in (select talent_id from _pool_reset_talents)
  and role_id in (select role_id from _pool_reset_roles);
-- recommendation의 CASCADE로 role_activity / chat_preview / intro_email_threads도 삭제됩니다.
delete from public.talent_opportunity_recommendation where id in (select id from _pool_reset_recs);
delete from public.talent_opportunity_delivery where discovery_run_id in (select id from _pool_reset_runs);
delete from public.crm_email_campaign_deliveries
where discovery_run_id in (select id from _pool_reset_runs);
delete from public.opportunity_discovery_run where id in (select id from _pool_reset_runs);
delete from public.career_email_messages where id in (select id from _pool_reset_emails);
delete from public.email_reply_jobs where id in (select id from _pool_reset_reply_jobs);
delete from public.talent_conversation_summaries s where exists (
  select 1 from public.talent_messages m join _pool_reset_talent_messages d using (id)
  where m.conversation_id = s.conversation_id
    and m.id between coalesce(s.from_message_id, 0) and s.to_message_id
);
delete from public.company_conversation_summaries s where
  s.role_id in (select role_id from _pool_reset_roles)
  or s.conversation_id in (select id from public.company_conversations
    where role_id in (select role_id from _pool_reset_roles))
  or exists (select 1 from _pool_reset_company_messages m
    where m.conversation_id = s.conversation_id
      and m.id between coalesce(s.source_start_message_id, 0) and s.source_end_message_id);
delete from public.talent_messages where id in (select id from _pool_reset_talent_messages)
  and user_id in (select talent_id from _pool_reset_talents);
delete from public.company_messages where id in (select id from _pool_reset_company_messages);
update public.company_conversations c set
  last_message_id = (select m.id from public.company_messages m
    where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1),
  last_message_at = coalesce((select max(m.created_at) from public.company_messages m
    where m.conversation_id = c.id), c.created_at),
  summary_cursor_message_id = (select max(s.source_end_message_id)
    from public.company_conversation_summaries s where s.conversation_id = c.id),
  updated_at = now()
where c.id in (select id from _pool_reset_conversations);

-- 카드 표시를 위한 설정. Role의 paused 상태는 그대로 유지합니다.
update public.company_internal_roles set is_company_first_search = true, updated_at = now()
where role_id in (select role_id from _pool_reset_roles);

do $$
declare
  v_run_id uuid;
  v_fixture constant text := 'harper-pool-candidate-reset-20260928';
begin
  select id into v_run_id from public.company_first_search_runs
  where company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5'
    and source_snapshot->>'testFixture' = v_fixture
    and trigger_reason = 'manual_fixture'
  order by created_at desc limit 1;
  if v_run_id is null then
    insert into public.company_first_search_runs (
      company_workspace_id, scheduled_slot, trigger_reason, contract_version,
      status, source_snapshot, model_manifest, requested_role_ids
    ) values (
      '720254d7-aeb7-4709-a56f-7b822f89eac5', now(), 'manual_fixture', 'manual-fixture-v1',
      'succeeded', jsonb_build_object('testFixture', v_fixture,
        'source', 'explicit_user_request', 'manual', true),
      '{"llmCalls":0}', array(select role_id from _pool_reset_roles)
    ) returning id into v_run_id;
  end if;
  update public.company_first_search_runs set status = 'succeeded',
    source_cutoff = now(), selection_committed_at = now(), finished_at = now(), updated_at = now(),
    result = '{"manualFixture":true,"selectedCount":2,"notificationCount":0}'
  where id = v_run_id;

  insert into public.company_intro_candidates (
    company_workspace_id, role_id, talent_id, selection_run_id, selection_reason,
    presentation, status, role_fingerprint, talent_fingerprint
  ) select '720254d7-aeb7-4709-a56f-7b822f89eac5', r.role_id, t.talent_id, v_run_id,
    '사용자가 지정한 본인 계정으로 먼저 제안하기 흐름을 확인하기 위한 테스트 후보입니다.',
    jsonb_build_object('version', 'company_first_presentation_v1', 'name', u.name,
      'headline', u.headline, 'roleName', r.expected_name,
      'summary', '먼저 제안하기 기능 확인용 테스트 후보', 'testFixture', v_fixture),
    'ready', md5(r.role_id::text || ':' || v_fixture), md5(t.talent_id::text || ':' || v_fixture)
  from _pool_reset_roles r cross join _pool_reset_talents t
  join public.talent_users u on u.user_id = t.talent_id where t.target_stage = 'ready';

  insert into public.talent_opportunity_recommendation (
    talent_id, role_id, kind, opportunity_type, feedback, feedback_at,
    saved_stage, processed_stage, model_version, fit_summary, fit_reasons, tradeoffs
  ) select t.talent_id, r.role_id, 'recommendation', 'internal_recommendation', 'like', now(),
    'accepted', 'pending_connection', 'manual-pool-test-20260928',
    '사용자가 지정한 본인 계정의 연결 대기 테스트 상태입니다.',
    '["Harper Pool의 연결 대기 기능 확인을 위해 사용자가 직접 지정한 테스트 계정"]',
    '["실제 후보자 응답을 기록한 데이터가 아닌 수동 테스트 상태"]'
  from _pool_reset_roles r cross join _pool_reset_talents t
  where t.target_stage = 'pending_connection';
  insert into public.talent_opportunity_tag (talent_id, opportunity_id, tag)
  select t.talent_id, r.role_id, '내부:연결대기'
  from _pool_reset_roles r cross join _pool_reset_talents t
  where t.target_stage = 'pending_connection';
end $$;

-- 의도한 상태가 아니면 일부만 적용하지 않고 전체 롤백합니다.
do $$
begin
  if (select count(*) from public.company_intro_candidates c
      join _pool_reset_roles using (role_id) join _pool_reset_talents t using (talent_id)
      where t.target_stage = 'ready' and c.status = 'ready') <> 2
    or (select count(*) from public.talent_opportunity_recommendation c
      join _pool_reset_roles using (role_id) join _pool_reset_talents t using (talent_id)
      where t.target_stage = 'pending_connection'
        and c.processed_stage = 'pending_connection' and c.saved_stage = 'accepted') <> 2
    or (select count(*) from public.talent_opportunity_tag c
      join _pool_reset_roles r on r.role_id = c.opportunity_id
      join _pool_reset_talents t using (talent_id)
      where t.target_stage = 'pending_connection' and c.tag = '내부:연결대기') <> 2
    or exists (select 1 from public.company_talent_requests
      where company_workspace_id = '720254d7-aeb7-4709-a56f-7b822f89eac5'
        and talent_id in (select talent_id from _pool_reset_talents))
    or exists (select 1 from public.company_messages
      where role_id in (select role_id from _pool_reset_roles)
        or conversation_id in (select id from public.company_conversations
          where role_id in (select role_id from _pool_reset_roles))) then
    raise exception '초기화 결과가 예상과 다릅니다. 전체 롤백합니다.';
  end if;
end $$;

-- 성공 결과: Role당 각 계정 1개씩, 총 4행입니다.
select r.expected_name as role, t.email, '먼저 제안 가능한 후보' as stage, c.id
from public.company_intro_candidates c
join _pool_reset_roles r using (role_id) join _pool_reset_talents t using (talent_id)
where c.status = 'ready'
union all
select r.expected_name, t.email, '연결 대기', c.id
from public.talent_opportunity_recommendation c
join _pool_reset_roles r using (role_id) join _pool_reset_talents t using (talent_id)
where c.processed_stage = 'pending_connection'
order by role, email;

commit;
