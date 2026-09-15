begin;

-- The first Company Context Run for a newly activated Role starts only after
-- the calibration request has actually reached Slack. The calibration row
-- keeps the exact delivery anchor even when another Role run temporarily owns
-- the one-open-run slot.

create unique index if not exists company_context_runs_post_calibration_unique_idx
  on public.company_context_runs ((result->>'calibrationId'))
  where trigger_reason = 'post_calibration_12h'
    and result ? 'calibrationId';

create unique index if not exists company_messages_post_calibration_notice_unique_idx
  on public.company_messages ((metadata->'postCalibrationReview'->>'idempotencyKey'))
  where role = 'assistant'
    and metadata->>'source' = 'post_calibration_review'
    and nullif(metadata->'postCalibrationReview'->>'idempotencyKey', '') is not null;

create or replace function public.enqueue_post_calibration_company_context_run_v1(
  p_calibration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_available_at timestamptz;
  v_existing_id uuid;
  v_open_id uuid;
  v_role_id uuid;
  v_run_id uuid;
  v_sent_at timestamptz;
begin
  select
    calibration.role_id,
    nullif(calibration.payload->'delivery'->>'sentAt', '')::timestamptz
  into v_role_id, v_sent_at
  from public.company_role_calibrations calibration
  where calibration.id = p_calibration_id
    and calibration.status in ('sent', 'completed')
    and calibration.payload->'delivery'->>'status' = 'sent'
  for update;

  if v_role_id is null or v_sent_at is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_role_id::text, 0));

  select run.id
  into v_existing_id
  from public.company_context_runs run
  where run.trigger_reason = 'post_calibration_12h'
    and run.result->>'calibrationId' = p_calibration_id::text
  order by run.id
  limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if not exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = v_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and coalesce(role.is_expired, false) = false
      and (role.expires_at is null or role.expires_at > timezone('utc', now()))
      and coalesce(internal_role.is_auto, false) = true
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
  ) then
    update public.company_role_calibrations calibration
    set payload = jsonb_set(
      calibration.payload,
      '{postCalibrationRun}',
      jsonb_build_object(
        'status', 'not_eligible',
        'availableAt', v_sent_at + interval '12 hours',
        'updatedAt', timezone('utc', now())
      ),
      true
    )
    where calibration.id = p_calibration_id;
    return null;
  end if;

  v_available_at := v_sent_at + interval '12 hours';

  -- A queued row from the superseded immediate flow can safely become the
  -- exact post-calibration run without losing the one-open-run invariant.
  update public.company_context_runs run
  set
    trigger_reason = 'post_calibration_12h',
    available_at = v_available_at,
    result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
      'calibrationId', p_calibration_id,
      'queuedAt', timezone('utc', now()),
      'scheduledFrom', 'calibration_slack_sent_at'
    )
  where run.role_id = v_role_id
    and run.status = 'queued'
    and run.trigger_reason = 'role_created'
  returning run.id into v_run_id;

  if v_run_id is null then
    select run.id
    into v_open_id
    from public.company_context_runs run
    where run.role_id = v_role_id
      and run.status in ('queued', 'running')
    order by run.available_at, run.id
    limit 1;

    if v_open_id is null then
      insert into public.company_context_runs (
        role_id,
        status,
        trigger_reason,
        available_at,
        result
      ) values (
        v_role_id,
        'queued',
        'post_calibration_12h',
        v_available_at,
        jsonb_build_object(
          'calibrationId', p_calibration_id,
          'queuedAt', timezone('utc', now()),
          'scheduledFrom', 'calibration_slack_sent_at'
        )
      )
      on conflict do nothing
      returning id into v_run_id;
    end if;
  end if;

  update public.company_role_calibrations calibration
  set payload = jsonb_set(
    calibration.payload,
    '{postCalibrationRun}',
    jsonb_build_object(
      'status', case when v_run_id is null then 'waiting_for_role_run' else 'queued' end,
      'runId', v_run_id,
      'blockedByRunId', case when v_run_id is null then v_open_id else null end,
      'availableAt', v_available_at,
      'updatedAt', timezone('utc', now())
    ),
    true
  )
  where calibration.id = p_calibration_id;

  return v_run_id;
end;
$$;

-- Fix the original JSON-null sentAt behavior and schedule from the first
-- successful Slack receipt in the same transaction.
create or replace function public.mark_company_role_calibration_delivery_v1(
  p_calibration_id uuid,
  p_delivered boolean,
  p_error text default null
)
returns public.company_role_calibrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_sent_at timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_row public.company_role_calibrations;
  v_sent_at timestamptz;
begin
  select nullif(calibration.payload->'delivery'->>'sentAt', '')::timestamptz
  into v_existing_sent_at
  from public.company_role_calibrations calibration
  where calibration.id = p_calibration_id
  for update;

  v_sent_at := case
    when p_delivered then coalesce(v_existing_sent_at, v_now)
    else v_existing_sent_at
  end;

  update public.company_role_calibrations calibration
  set
    status = case
      when calibration.status = 'completed' then 'completed'
      when p_delivered then 'sent'
      else 'ready'
    end,
    payload = jsonb_set(
      calibration.payload,
      '{delivery}',
      coalesce(calibration.payload->'delivery', '{}'::jsonb) || jsonb_build_object(
        'status', case when p_delivered then 'sent' else 'pending' end,
        'attempts', coalesce((calibration.payload->'delivery'->>'attempts')::integer, 0) + 1,
        'lastAttemptAt', v_now,
        'sentAt', v_sent_at,
        'error', case
          when p_delivered then null
          else left(nullif(btrim(coalesce(p_error, '')), ''), 500)
        end
      ),
      true
    )
  where calibration.id = p_calibration_id
    and calibration.status in ('ready', 'sent', 'completed')
    and (
      calibration.payload->'delivery'->>'status' is distinct from 'sent'
      or p_delivered
    )
  returning calibration.* into v_row;

  if v_row.id is null then
    raise exception 'deliverable calibration not found';
  end if;

  if p_delivered then
    perform public.enqueue_post_calibration_company_context_run_v1(p_calibration_id);
    select calibration.*
    into v_row
    from public.company_role_calibrations calibration
    where calibration.id = p_calibration_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.claim_post_calibration_company_context_run_v1(
  p_runner text
)
returns setof public.company_context_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_context_runs run
  set
    status = 'canceled',
    result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
      'resultReason', 'post_calibration_gate_failed',
      'summary', 'Role 또는 calibration이 최초 후보 검토의 현재 실행 조건을 충족하지 않음',
      'finishedAt', timezone('utc', now())
    )
  where run.trigger_reason = 'post_calibration_12h'
    and run.status in ('queued', 'running')
    and not exists (
      select 1
      from public.company_roles role
      join public.company_internal_roles internal_role
        on internal_role.role_id = role.role_id
      join public.company_role_calibrations calibration
        on calibration.id::text = run.result->>'calibrationId'
       and calibration.role_id = role.role_id
      where role.role_id = run.role_id
        and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
        and lower(btrim(coalesce(role.status, ''))) = 'active'
        and coalesce(role.is_expired, false) = false
        and (role.expires_at is null or role.expires_at > timezone('utc', now()))
        and coalesce(internal_role.is_auto, false) = true
        and coalesce(lower(btrim(role.information->>'testOnly')), '')
          not in ('true', '1', 'yes', 'on')
        and calibration.status in ('sent', 'completed')
        and calibration.payload->'delivery'->>'status' = 'sent'
        and nullif(calibration.payload->'delivery'->>'sentAt', '') is not null
    );

  return query
  with claimable as (
    select run.id
    from public.company_context_runs run
    join public.company_roles role on role.role_id = run.role_id
    join public.company_internal_roles internal_role
      on internal_role.role_id = run.role_id
    join public.company_role_calibrations calibration
      on calibration.id::text = run.result->>'calibrationId'
     and calibration.role_id = run.role_id
    where run.trigger_reason = 'post_calibration_12h'
      and (
        (
          run.status = 'queued'
          and run.available_at <= timezone('utc', now())
        )
        or (
          run.status = 'running'
          and nullif(run.result->>'startedAt', '')::timestamptz
            <= timezone('utc', now()) - interval '6 hours'
        )
      )
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and coalesce(role.is_expired, false) = false
      and (role.expires_at is null or role.expires_at > timezone('utc', now()))
      and coalesce(internal_role.is_auto, false) = true
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
      and calibration.status in ('sent', 'completed')
      and calibration.payload->'delivery'->>'status' = 'sent'
      and nullif(calibration.payload->'delivery'->>'sentAt', '') is not null
    order by run.available_at, run.id
    for update of run skip locked
    limit 1
  )
  update public.company_context_runs run
  set
    status = 'running',
    result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
      'runner', nullif(btrim(coalesce(p_runner, '')), ''),
      'startedAt', timezone('utc', now())
    )
  from claimable
  where run.id = claimable.id
  returning run.*;
end;
$$;

create or replace function public.retry_post_calibration_company_context_run_v1(
  p_run_id uuid,
  p_available_at timestamptz
)
returns public.company_context_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_context_runs;
begin
  update public.company_context_runs run
  set
    status = 'queued',
    available_at = greatest(p_available_at, timezone('utc', now())),
    result = (coalesce(run.result, '{}'::jsonb) - 'runner' - 'startedAt') ||
      jsonb_build_object(
        'retryQueuedAt', timezone('utc', now()),
        'retryCount', coalesce((run.result->>'retryCount')::integer, 0) + 1
      )
  where run.id = p_run_id
    and run.trigger_reason = 'post_calibration_12h'
    and run.status = 'failed'
    and nullif(run.result->>'calibrationId', '') is not null
  returning run.* into v_row;

  if v_row.id is null then
    raise exception 'failed post-calibration run not found: %', p_run_id;
  end if;
  return v_row;
end;
$$;

-- If another queued/running Company Run occupied the Role when Slack delivery
-- succeeded, its terminal update releases the slot and enqueues the preserved
-- calibration intent.
create or replace function public.enqueue_waiting_post_calibration_run_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calibration_id uuid;
begin
  if old.status not in ('queued', 'running')
     or new.status not in ('succeeded', 'failed', 'canceled') then
    return new;
  end if;

  for v_calibration_id in
    select calibration.id
    from public.company_role_calibrations calibration
    where calibration.role_id = new.role_id
      and calibration.status in ('sent', 'completed')
      and calibration.payload->'delivery'->>'status' = 'sent'
      and nullif(calibration.payload->'delivery'->>'sentAt', '') is not null
      and not exists (
        select 1
        from public.company_context_runs post_run
        where post_run.trigger_reason = 'post_calibration_12h'
          and post_run.result->>'calibrationId' = calibration.id::text
      )
    order by calibration.created_at, calibration.id
  loop
    perform public.enqueue_post_calibration_company_context_run_v1(v_calibration_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists company_context_runs_enqueue_waiting_post_calibration_v1
  on public.company_context_runs;
create trigger company_context_runs_enqueue_waiting_post_calibration_v1
after update of status on public.company_context_runs
for each row execute function public.enqueue_waiting_post_calibration_run_v1();

-- New active Roles are owned by the calibration pipeline. Keep the legacy
-- function callable for migration compatibility but stop its insert trigger.
drop trigger if exists company_internal_roles_enqueue_context_run_v1
  on public.company_internal_roles;

create or replace function public.track_company_role_status_and_enqueue_context_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_previous_status_started_at timestamptz;
  v_is_auto boolean := false;
  v_old_status text := lower(btrim(coalesce(old.status, '')));
  v_new_status text := lower(btrim(coalesce(new.status, '')));
begin
  select internal_role.role_status_changed_at, coalesce(internal_role.is_auto, false)
  into v_previous_status_started_at, v_is_auto
  from public.company_internal_roles internal_role
  where internal_role.role_id = new.role_id;

  if not found or v_is_auto is not true then
    return new;
  end if;

  if old.status is distinct from new.status
     and not (
       v_old_status in ('paused', 'ended')
       and v_new_status in ('paused', 'ended')
     ) then
    update public.company_internal_roles internal_role
    set role_status_changed_at = v_now
    where internal_role.role_id = new.role_id;
  end if;

  if v_new_status <> 'active' or coalesce(new.is_expired, false) = true then
    update public.company_context_runs run
    set
      status = 'canceled',
      result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
        'resultReason', case
          when coalesce(new.is_expired, false) then 'role_expired'
          else 'role_not_active'
        end,
        'summary', 'Role이 자동 실행 조건을 벗어나 대기 작업을 취소함',
        'finishedAt', v_now
      )
    where run.role_id = new.role_id
      and run.status = 'queued'
      and run.trigger_reason <> 'manual';
    return new;
  end if;

  if old.status is distinct from new.status
     and v_old_status in ('paused', 'ended')
     and v_new_status = 'active'
     and v_previous_status_started_at is not null
     and v_previous_status_started_at <= v_now - interval '7 days' then
    perform public.enqueue_company_context_run_v1(
      new.role_id,
      'reactivated_after_7d',
      v_now
    );
  end if;

  return new;
end;
$$;

create or replace function public.enqueue_due_company_context_runs_v1(
  p_now timestamptz default timezone('utc', now())
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.company_context_runs (
    role_id,
    status,
    trigger_reason,
    available_at,
    result
  )
  select
    role.role_id,
    'queued',
    'weekly',
    p_now,
    jsonb_build_object('queuedAt', p_now)
  from public.company_roles role
  join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  join lateral (
    select max((run.result->>'finishedAt')::timestamptz) as finished_at
    from public.company_context_runs run
    where run.role_id = role.role_id
      and run.status = 'succeeded'
      and run.result ? 'finishedAt'
  ) last_success on last_success.finished_at is not null
  where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and lower(btrim(coalesce(role.status, ''))) = 'active'
    and coalesce(role.is_expired, false) = false
    and (role.expires_at is null or role.expires_at > p_now)
    and coalesce(internal_role.is_auto, false) = true
    and coalesce(lower(btrim(role.information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on')
    and last_success.finished_at <= p_now - interval '7 days'
  on conflict (role_id) where status in ('queued', 'running')
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

-- Existing immediate work is not allowed to race a future calibration. A
-- delivered calibration is converted in place; other queued rows are closed.
update public.company_context_runs run
set
  trigger_reason = 'post_calibration_12h',
  available_at = (calibration.payload->'delivery'->>'sentAt')::timestamptz
    + interval '12 hours',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'calibrationId', calibration.id,
    'queuedAt', timezone('utc', now()),
    'scheduledFrom', 'calibration_slack_sent_at'
  )
from public.company_role_calibrations calibration
where run.role_id = calibration.role_id
  and run.status = 'queued'
  and run.trigger_reason = 'role_created'
  and calibration.status in ('sent', 'completed')
  and calibration.payload->'delivery'->>'status' = 'sent'
  and nullif(calibration.payload->'delivery'->>'sentAt', '') is not null;

update public.company_context_runs run
set
  status = 'canceled',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'resultReason', 'superseded_by_calibration_pipeline',
    'summary', '최초 후보 검토는 calibration 전달 12시간 뒤 실행하도록 전환됨',
    'finishedAt', timezone('utc', now())
  )
where run.status = 'queued'
  and run.trigger_reason = 'role_created';

create or replace function public.notify_post_calibration_company_context_work_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_actionable boolean;
begin
  if new.trigger_reason <> 'post_calibration_12h' then
    return new;
  end if;

  v_actionable := (
    new.status in ('queued', 'running')
    or (
      new.status = 'succeeded'
      and coalesce(new.result->'companyNotice'->>'status', '')
        in ('partial', 'not_configured', 'failed')
    )
  );
  if not v_actionable then
    return new;
  end if;

  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.available_at is distinct from new.available_at
     or old.result->'companyNotice' is distinct from new.result->'companyNotice' then
    perform pg_notify(
      'harper_company_role_calibration_work',
      jsonb_build_object(
        'runId', new.id,
        'status', new.status,
        'availableAt', new.available_at,
        'workType', 'post_calibration_12h'
      )::text
    );
  end if;
  return new;
end;
$$;

create or replace function public.record_post_calibration_company_notice_v1(
  p_run_id uuid,
  p_status text,
  p_company_message_id bigint default null,
  p_slack_message_ts text default null,
  p_slack_status text default null,
  p_org_status text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calibration_id text;
  v_existing jsonb;
  v_notice jsonb;
  v_now timestamptz := timezone('utc', now());
  v_result jsonb;
begin
  if p_status not in ('sent', 'partial', 'not_configured', 'failed') then
    raise exception 'unsupported post-calibration notice status: %', p_status;
  end if;
  if coalesce(p_slack_status, '') not in ('sent', 'not_configured', 'failed') then
    raise exception 'unsupported Slack notice status: %', p_slack_status;
  end if;
  if coalesce(p_org_status, '') not in ('sent', 'failed') then
    raise exception 'unsupported /org notice status: %', p_org_status;
  end if;

  select run.result, run.result->>'calibrationId', run.result->'companyNotice'
  into v_result, v_calibration_id, v_existing
  from public.company_context_runs run
  where run.id = p_run_id
    and run.trigger_reason = 'post_calibration_12h'
    and run.status in ('running', 'succeeded')
  for update;

  if v_calibration_id is null then
    raise exception 'post-calibration run or calibrationId not found: %', p_run_id;
  end if;
  v_existing := case
    when jsonb_typeof(v_existing) = 'object' then v_existing
    else '{}'::jsonb
  end;

  v_notice := v_existing || jsonb_build_object(
    'idempotencyKey', 'post_calibration_review:' || v_calibration_id,
    'status', p_status,
    'companyMessageId', coalesce(
      nullif(v_existing->>'companyMessageId', '')::bigint,
      p_company_message_id
    ),
    'slackMessageTs', coalesce(
      nullif(v_existing->>'slackMessageTs', ''),
      nullif(btrim(coalesce(p_slack_message_ts, '')), '')
    ),
    'slackStatus', case
      when v_existing->>'slackStatus' = 'sent' then 'sent'
      else p_slack_status
    end,
    'orgStatus', case
      when v_existing->>'orgStatus' = 'sent' then 'sent'
      else p_org_status
    end,
    'sentAt', case
      when coalesce(v_existing->>'sentAt', '') <> '' then v_existing->'sentAt'
      when p_org_status = 'sent' then to_jsonb(v_now)
      else 'null'::jsonb
    end,
    'lastAttemptAt', v_now,
    'retryAt', case
      when p_status in ('partial', 'not_configured', 'failed')
        then to_jsonb(v_now + interval '12 hours')
      else 'null'::jsonb
    end,
    'error', left(nullif(btrim(coalesce(p_error, '')), ''), 500)
  );

  update public.company_context_runs run
  set result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'companyNotice', v_notice
  )
  where run.id = p_run_id;

  return v_notice;
end;
$$;

drop trigger if exists company_context_runs_notify_post_calibration_v1
  on public.company_context_runs;
create trigger company_context_runs_notify_post_calibration_v1
after insert or update of status, available_at, result
on public.company_context_runs
for each row execute function public.notify_post_calibration_company_context_work_v1();

revoke all on function public.enqueue_post_calibration_company_context_run_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_post_calibration_company_context_run_v1(text)
  from public, anon, authenticated;
revoke all on function public.record_post_calibration_company_notice_v1(
  uuid, text, bigint, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.retry_post_calibration_company_context_run_v1(
  uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.enqueue_post_calibration_company_context_run_v1(uuid)
  to service_role;
grant execute on function public.claim_post_calibration_company_context_run_v1(text)
  to service_role;
grant execute on function public.record_post_calibration_company_notice_v1(
  uuid, text, bigint, text, text, text, text
) to service_role;
grant execute on function public.retry_post_calibration_company_context_run_v1(
  uuid, timestamptz
) to service_role;

comment on function public.enqueue_post_calibration_company_context_run_v1(uuid) is
  'Idempotently preserves and enqueues one initial Company Run at the first calibration Slack sentAt plus 12 hours.';
comment on function public.claim_post_calibration_company_context_run_v1(text) is
  'Claims only due post-calibration initial-review work and rechecks Role, test-only, automation, and delivery gates.';

commit;
