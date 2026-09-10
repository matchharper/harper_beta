begin;

-- A renewed-interest check is an ordinary company-to-talent request with one
-- durable consequence: an explicit positive answer may reopen the same Role.
-- Keeping this on the existing request row preserves its delivery, reply,
-- relay, cancellation, and follow-up behavior.
alter table public.company_talent_requests
  add column if not exists intent text not null default 'ordinary',
  add column if not exists resume_stage text,
  add column if not exists response_disposition text;

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_intent_check;
alter table public.company_talent_requests
  add constraint company_talent_requests_intent_check
  check (intent in ('ordinary', 'candidate_reengagement'));

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_response_disposition_check;
alter table public.company_talent_requests
  add constraint company_talent_requests_response_disposition_check
  check (
    response_disposition is null
    or response_disposition in ('positive', 'negative', 'other')
  );

alter table public.company_talent_requests
  drop constraint if exists company_talent_requests_reengagement_stage_check;
alter table public.company_talent_requests
  add constraint company_talent_requests_reengagement_stage_check
  check (
    (intent = 'ordinary' and resume_stage is null)
    or (
      intent = 'candidate_reengagement'
      and nullif(btrim(coalesce(resume_stage, '')), '') is not null
    )
  );

create unique index if not exists talent_progress_reengagement_event_key_uidx
  on public.talent_progress ((metadata ->> 'eventKey'))
  where kind in (
    'internal_process_reengagement_required',
    'internal_process_reengagement_requested',
    'internal_process_reengagement_response',
    'internal_process_reactivated'
  )
    and nullif(metadata ->> 'eventKey', '') is not null;

-- A candidate reply may reopen a Position only while the company-side stage
-- still represents the same decision that existed when this request began.
-- Any later stage write supersedes the older request without enumerating the
-- possible source and destination stage combinations.
create or replace function public.candidate_reengagement_request_is_current_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      request.intent = 'candidate_reengagement'
      and lower(btrim(coalesce(recommendation.saved_stage, ''))) = 'closed'
      and not exists (
        select 1
        from public.talent_opportunity_tag stage_change
        where stage_change.opportunity_id = request.role_id
          and stage_change.talent_id = request.talent_id
          and coalesce(stage_change.updated_at, stage_change.created_at) > request.created_at
          and (
            btrim(stage_change.tag) in (
              '내부:수락',
              '내부:아카이브',
              '내부:최종오퍼',
              '내부:보류',
              '내부:연결대기',
              '내부:프로세스중단',
              '내부:거절',
              '내부:추천',
              '내부:연결됨'
            )
            or btrim(stage_change.tag) like '내부단계:%'
          )
      )
    from public.company_talent_requests request
    join public.talent_opportunity_recommendation recommendation
      on recommendation.id = request.recommendation_id
     and recommendation.talent_id = request.talent_id
     and recommendation.role_id = request.role_id
    where request.id = p_request_id
  ), false);
$$;

comment on function public.candidate_reengagement_request_is_current_v1(uuid) is
  'True only while no company-side stage change has superseded this renewed-interest request.';

-- Before the first email is sent, ordinary requests still require an active
-- company-visible stage. A renewed-interest request instead requires the
-- durable closed recommendation it is specifically intended to recover.
create or replace function public.company_talent_request_target_is_active_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      coalesce(role.status, 'active') not in ('ended', 'deleted')
      and coalesce(role.is_expired, false) = false
      and (
        exists (
          select 1
          from public.contact_queue delivery
          where delivery.company_talent_request_id = request.id
            and delivery.type = 'company_request_candidate_delivery'
            and delivery.status = 'sent'
            and delivery.sent_at is not null
        )
        or (
          request.intent = 'candidate_reengagement'
          and public.candidate_reengagement_request_is_current_v1(request.id)
        )
        or (
          request.intent = 'ordinary'
          and (
            exists (
            select 1
            from public.talent_opportunity_recommendation recommendation
            where recommendation.id = request.recommendation_id
              and recommendation.talent_id = request.talent_id
              and recommendation.role_id = request.role_id
              and lower(btrim(coalesce(recommendation.saved_stage, ''))) = 'closed'
            )
            or latest_stage.tag in (
              '내부:연결대기',
              '내부:연결됨',
              '내부:최종오퍼',
              '내부:프로세스중단'
            )
            or latest_stage.tag like '내부단계:%'
          )
        )
      )
    from public.company_talent_requests request
    join public.company_roles role on role.role_id = request.role_id
    left join lateral (
      select btrim(tag_row.tag) as tag
      from public.talent_opportunity_tag tag_row
      where tag_row.opportunity_id = request.role_id
        and tag_row.talent_id = request.talent_id
        and (
          btrim(tag_row.tag) in (
            '내부:수락',
            '내부:아카이브',
            '내부:최종오퍼',
            '내부:보류',
            '내부:연결대기',
            '내부:프로세스중단',
            '내부:거절',
            '내부:추천',
            '내부:연결됨'
          )
          or btrim(tag_row.tag) like '내부단계:%'
        )
      order by tag_row.updated_at desc nulls last,
               tag_row.created_at desc nulls last,
               tag_row.id desc
      limit 1
    ) latest_stage on true
    where request.id = p_request_id
  ), false);
$$;

comment on function public.company_talent_request_target_is_active_v1(uuid) is
  'Pre-send requests require an active company-visible stage or the durable closed recommendation they are contacting. Only candidate-reengagement intent can reopen it after a positive answer. Sent requests stay answerable until the Role ends.';

create or replace function public.company_talent_request_stage_is_pending_v1(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.company_talent_request_target_is_active_v1(p_request_id);
$$;

-- Career chat uses the service-role client rather than a long-lived database
-- transaction. Commit the closed marker and its LLM-readable progress fact as
-- one operation so neither can exist without the other.
create or replace function public.commit_internal_process_closure_notice_v1(
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_text text,
  p_user_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id uuid;
begin
  update public.talent_opportunity_recommendation
  set saved_stage = 'closed',
      updated_at = transaction_timestamp()
  where id = p_recommendation_id
    and talent_id = p_talent_id
    and lower(btrim(coalesce(saved_stage, ''))) <> 'closed'
  returning role_id into v_role_id;

  if not found then
    return false;
  end if;

  insert into public.talent_progress (
    talent_id,
    role_id,
    recommendation_id,
    user_id,
    kind,
    text,
    metadata
  ) values (
    p_talent_id,
    v_role_id,
    p_recommendation_id,
    coalesce(nullif(btrim(p_user_id), ''), 'harper'),
    'internal_process_stopped_notified',
    coalesce(nullif(btrim(p_text), ''), 'Harper가 후보자에게 프로세스 종료를 안내하고 종료 상태로 전환했습니다.'),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

create or replace function public.confirm_internal_candidate_reengagement_v1(
  p_recommendation_id uuid,
  p_talent_id uuid,
  p_role_id uuid,
  p_stage text,
  p_actor_user_id uuid,
  p_actor_email text,
  p_text text,
  p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changed boolean;
  v_stage text := lower(btrim(coalesce(p_stage, '')));
  v_stage_tag text;
begin
  if v_stage like 'custom:%' then
    if not exists (
      select 1
      from public.ops_matching_role_stages stage
      where stage.id::text = substring(v_stage from length('custom:') + 1)
        and stage.role_id = p_role_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'candidate_reengagement_stage_not_found';
    end if;
    v_stage_tag := '내부단계:' || substring(v_stage from length('custom:') + 1);
  else
    v_stage_tag := case v_stage
      when 'pending_connection' then '내부:연결대기'
      when 'connected' then '내부:연결됨'
      when 'final_offer' then '내부:최종오퍼'
      else null
    end;
    if v_stage_tag is null then
      raise exception using
        errcode = '22023',
        message = 'candidate_reengagement_stage_invalid';
    end if;
  end if;

  update public.talent_opportunity_recommendation
  set saved_stage = 'accepted',
      processed_stage = v_stage,
      updated_at = transaction_timestamp()
  where talent_id = p_talent_id
    and id = p_recommendation_id
    and role_id = p_role_id
    and lower(btrim(coalesce(saved_stage, ''))) = 'closed'
    and exists (
      select 1
      from public.company_roles role
      where role.role_id = p_role_id
        and coalesce(role.status, 'active') not in ('ended', 'deleted')
        and coalesce(role.is_expired, false) = false
    );
  v_changed := found;

  if not v_changed then
    if nullif(coalesce(p_metadata, '{}'::jsonb) ->> 'eventKey', '') is not null
       and exists (
         select 1
         from public.talent_progress progress
         where progress.talent_id = p_talent_id
           and progress.role_id = p_role_id
           and progress.recommendation_id = p_recommendation_id
           and progress.kind = 'internal_process_reactivated'
           and progress.metadata ->> 'eventKey' = p_metadata ->> 'eventKey'
       ) then
      return true;
    end if;
    return false;
  end if;

  delete from public.talent_opportunity_tag
  where talent_id = p_talent_id
    and opportunity_id = p_role_id
    and (
      tag in (
        '내부:추천', '내부:수락', '내부:거절', '내부:보류',
        '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
        '내부:프로세스중단', '내부:아카이브'
      )
      or tag like '내부단계:%'
    );

  insert into public.talent_opportunity_tag (
    talent_id, opportunity_id, tag, created_at, updated_at
  ) values (
    p_talent_id,
    p_role_id,
    v_stage_tag,
    transaction_timestamp(),
    transaction_timestamp()
  );

  insert into public.talent_progress (
    talent_id,
    role_id,
    recommendation_id,
    company_user_id,
    user_id,
    kind,
    text,
    metadata
  ) values (
    p_talent_id,
    p_role_id,
    p_recommendation_id,
    p_actor_user_id,
    coalesce(nullif(btrim(p_actor_email), ''), 'harper'),
    'internal_process_reactivated',
    p_text,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict ((metadata ->> 'eventKey'))
    where kind in (
      'internal_process_reengagement_required',
      'internal_process_reengagement_requested',
      'internal_process_reengagement_response',
      'internal_process_reactivated'
    )
      and nullif(metadata ->> 'eventKey', '') is not null
  do nothing;

  return true;
end;
$$;

create or replace function public.record_company_talent_response_v2(
  p_request_id uuid,
  p_talent_id uuid,
  p_source_message_id bigint,
  p_disposition text default null
)
returns public.company_talent_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.company_talent_requests%rowtype;
  v_requested_stage text;
  v_stage text;
  v_stage_tag text;
  v_event_kind text;
  v_event_text text;
  v_reopened boolean := false;
  v_reengagement_current boolean := false;
  v_position_still_closed boolean := false;
  v_reopen_skipped_reason text;
  v_stage_fallback boolean := false;
begin
  select * into v_request
  from public.company_talent_requests
  where id = p_request_id and talent_id = p_talent_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_talent_request_not_found';
  end if;

  if v_request.intent = 'candidate_reengagement' then
    if p_disposition is null
       or p_disposition not in ('positive', 'negative', 'other') then
      raise exception using
        errcode = '22023',
        message = 'candidate_reengagement_disposition_required';
    end if;
    if v_request.response_disposition is not null
       and v_request.response_disposition <> p_disposition then
      raise exception using
        errcode = '40001',
        message = 'candidate_reengagement_disposition_conflict';
    end if;
    if v_request.response_disposition = p_disposition then
      return v_request;
    end if;
  elsif p_disposition is not null then
    raise exception using
      errcode = '22023',
      message = 'ordinary_company_request_disposition_not_allowed';
  end if;

  v_request := public.record_company_talent_response_v1(
    p_request_id,
    p_talent_id,
    p_source_message_id
  );

  if v_request.intent <> 'candidate_reengagement' then
    return v_request;
  end if;

  update public.company_talent_requests
  set response_disposition = coalesce(response_disposition, p_disposition)
  where id = p_request_id
  returning * into v_request;

  v_requested_stage := coalesce(
    nullif(btrim(v_request.resume_stage), ''),
    'pending_connection'
  );
  v_reengagement_current :=
    public.candidate_reengagement_request_is_current_v1(v_request.id);
  select exists (
    select 1
    from public.talent_opportunity_recommendation recommendation
    where recommendation.id = v_request.recommendation_id
      and recommendation.talent_id = v_request.talent_id
      and recommendation.role_id = v_request.role_id
      and lower(btrim(coalesce(recommendation.saved_stage, ''))) = 'closed'
  ) into v_position_still_closed;

  if p_disposition = 'positive' and v_reengagement_current then
    v_stage := v_requested_stage;
    if v_stage like 'custom:%' then
      if not exists (
        select 1
        from public.ops_matching_role_stages stage
        where stage.id::text = substring(v_stage from length('custom:') + 1)
          and stage.role_id = v_request.role_id
      ) then
        v_stage := 'pending_connection';
        v_stage_tag := '내부:연결대기';
        v_stage_fallback := true;
      else
        v_stage_tag := '내부단계:' || substring(v_stage from length('custom:') + 1);
      end if;
    else
      v_stage_tag := case v_stage
        when 'pending_connection' then '내부:연결대기'
        when 'connected' then '내부:연결됨'
        when 'final_offer' then '내부:최종오퍼'
        else null
      end;
      if v_stage_tag is null then
        v_stage := 'pending_connection';
        v_stage_tag := '내부:연결대기';
        v_stage_fallback := true;
      end if;
    end if;

    delete from public.talent_opportunity_tag
    where talent_id = v_request.talent_id
      and opportunity_id = v_request.role_id
      and (
        tag in (
          '내부:추천', '내부:수락', '내부:거절', '내부:보류',
          '내부:연결대기', '내부:연결됨', '내부:최종오퍼',
          '내부:프로세스중단', '내부:아카이브'
        )
        or tag like '내부단계:%'
      );

    insert into public.talent_opportunity_tag (
      talent_id, opportunity_id, tag, created_at, updated_at
    ) values (
      v_request.talent_id,
      v_request.role_id,
      v_stage_tag,
      transaction_timestamp(),
      transaction_timestamp()
    );

    update public.talent_opportunity_recommendation
    set saved_stage = 'accepted',
        processed_stage = v_stage,
        updated_at = transaction_timestamp()
    where talent_id = v_request.talent_id
      and id = v_request.recommendation_id
      and role_id = v_request.role_id
      and lower(btrim(coalesce(saved_stage, ''))) = 'closed';

    v_reopened := true;
    v_event_kind := 'internal_process_reactivated';
    v_event_text := case when v_stage_fallback then
      '후보자가 다시 연결받을 의향이 있다고 답했습니다. 원래 목표 단계를 더 이상 사용할 수 없어 연결 대기로 복구했으며, 회사가 다음 진행을 정해야 합니다.'
    else
      '후보자가 다시 연결받을 의향이 있다고 답해 해당 역할의 진행 상태를 복구했습니다.'
    end;
  else
    v_event_kind := 'internal_process_reengagement_response';
    v_reopen_skipped_reason := case
      when p_disposition = 'positive'
       and v_position_still_closed
       and not v_reengagement_current
        then 'company_stage_changed_after_request'
      when p_disposition = 'positive' and not v_position_still_closed
        then 'position_already_reactivated'
      else null
    end;
    v_event_text := case p_disposition
      when 'positive' then
        case when v_position_still_closed then
          '후보자가 다시 연결받을 의향이 있다고 답했지만, 질문을 보낸 뒤 회사가 후보자 상태를 변경해 자동으로 복구하지 않고 현재 상태를 유지했습니다.'
        else
          '후보자가 다시 연결받을 의향이 있다고 답했습니다. 후보자는 이미 진행 중이어서 현재 단계를 유지했습니다.'
        end
      when 'negative' then
        '후보자가 다시 연결받지 않겠다고 답해 종료 상태를 유지했습니다.'
      else
        '후보자의 답변만으로 다시 연결할 의향을 확정하지 못해 종료 상태를 유지했습니다.'
    end;
  end if;

  insert into public.talent_progress (
    talent_id,
    role_id,
    recommendation_id,
    user_id,
    kind,
    text,
    metadata
  ) values (
    v_request.talent_id,
    v_request.role_id,
    v_request.recommendation_id,
    v_request.talent_id::text,
    v_event_kind,
    v_event_text,
    jsonb_build_object(
      'eventKey', 'candidate-reengagement-response:' || v_request.id::text,
      'requestId', v_request.id,
      'responseMessageId', p_source_message_id,
      'responseDisposition', p_disposition,
      'requestedStage', v_requested_stage,
      'stage', case when v_reopened then v_stage else null end,
      'stageFallbackToPendingConnection', v_stage_fallback,
      'reopenSkippedReason', v_reopen_skipped_reason,
      'consentSource', 'candidate_reply'
    )
  )
  on conflict ((metadata ->> 'eventKey'))
    where kind in (
      'internal_process_reengagement_required',
      'internal_process_reengagement_requested',
      'internal_process_reengagement_response',
      'internal_process_reactivated'
    )
      and nullif(metadata ->> 'eventKey', '') is not null
  do nothing;

  return v_request;
end;
$$;

revoke all on function public.record_company_talent_response_v2(uuid, uuid, bigint, text)
  from public;
revoke all on function public.candidate_reengagement_request_is_current_v1(uuid)
  from public;
revoke all on function public.commit_internal_process_closure_notice_v1(uuid, uuid, text, text, jsonb)
  from public;
revoke all on function public.confirm_internal_candidate_reengagement_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb)
  from public;
grant execute on function public.record_company_talent_response_v2(uuid, uuid, bigint, text)
  to service_role;
grant execute on function public.commit_internal_process_closure_notice_v1(uuid, uuid, text, text, jsonb)
  to service_role;
grant execute on function public.confirm_internal_candidate_reengagement_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb)
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.record_company_talent_response_v2(uuid, uuid, bigint, text)
      to supabase_auth_admin;
    grant execute on function public.commit_internal_process_closure_notice_v1(uuid, uuid, text, text, jsonb)
      to supabase_auth_admin;
    grant execute on function public.confirm_internal_candidate_reengagement_v1(uuid, uuid, uuid, text, uuid, text, text, jsonb)
      to supabase_auth_admin;
  end if;
end;
$$;

commit;
