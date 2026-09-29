-- Route the one-off post-calibration search through the same company-scoped
-- matching Worker used by the Monday 09:00 KST schedule. Profile calibration
-- itself remains owned by the existing calibration queue and local listener.
begin;

alter table public.company_first_search_runs
  add column if not exists source_calibration_id uuid
    references public.company_role_calibrations(id) on delete set null;

create unique index if not exists company_first_search_runs_calibration_unique_idx
  on public.company_first_search_runs (source_calibration_id)
  where source_calibration_id is not null;

comment on column public.company_first_search_runs.source_calibration_id is
  'Calibration whose first successful Slack delivery scheduled this one-off regular company matching run.';

create or replace function public.enqueue_post_calibration_company_matching_run_v1(
  p_calibration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_available_at timestamptz;
  v_eligible boolean := false;
  v_existing_id uuid;
  v_internal_request text;
  v_is_auto boolean := false;
  v_insert_attempt integer;
  v_role_id uuid;
  v_role_information jsonb;
  v_role_is_expired boolean := false;
  v_role_expires_at timestamptz;
  v_role_source_type text;
  v_role_status text;
  v_run_id uuid;
  v_scheduled_slot timestamptz;
  v_sent_at timestamptz;
  v_slot_offset_micros bigint;
  v_workspace_id uuid;
begin
  select
    calibration.role_id,
    nullif(calibration.payload->'delivery'->>'sentAt', '')::timestamptz,
    role.company_workspace_id,
    role.source_type,
    role.status,
    coalesce(role.is_expired, false),
    role.expires_at,
    coalesce(role.information, '{}'::jsonb),
    coalesce(internal_role.is_auto, false),
    internal_role.request
  into
    v_role_id,
    v_sent_at,
    v_workspace_id,
    v_role_source_type,
    v_role_status,
    v_role_is_expired,
    v_role_expires_at,
    v_role_information,
    v_is_auto,
    v_internal_request
  from public.company_role_calibrations calibration
  left join public.company_roles role on role.role_id = calibration.role_id
  left join public.company_internal_roles internal_role
    on internal_role.role_id = calibration.role_id
  where calibration.id = p_calibration_id
    and calibration.status in ('sent', 'completed')
    and calibration.payload->'delivery'->>'status' = 'sent'
  for update of calibration;

  if v_role_id is null or v_sent_at is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('post_calibration_matching:' || p_calibration_id::text, 0)
  );

  select run.id
  into v_existing_id
  from public.company_first_search_runs run
  where run.source_calibration_id = p_calibration_id
  order by run.id
  limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  v_available_at := v_sent_at + interval '12 hours';
  v_eligible :=
    v_workspace_id is not null
    and lower(btrim(coalesce(v_role_source_type, ''))) = 'internal'
    and lower(btrim(coalesce(v_role_status, ''))) = 'active'
    and v_role_is_expired is false
    and (v_role_expires_at is null or v_role_expires_at > timezone('utc', now()))
    and v_is_auto is true
    and nullif(btrim(coalesce(v_internal_request, '')), '') is not null
    and coalesce(lower(btrim(v_role_information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on')
    and exists (
      select 1
      from public.company_slack_integrations integration
      where integration.company_workspace_id = v_workspace_id
        and integration.status = 'active'
        and integration.bot_token_ciphertext is not null
    )
    and exists (
      select 1
      from public.company_slack_channels channel
      where channel.company_workspace_id = v_workspace_id
        and channel.is_enabled is true
        and not exists (
          select 1
          from public.company_role_notification_channels opt_out
          where opt_out.role_id = v_role_id
            and opt_out.channel_id = channel.id
        )
    );

  if v_eligible is not true then
    update public.company_role_calibrations calibration
    set payload = jsonb_set(
      calibration.payload,
      '{postCalibrationSearch}',
      jsonb_build_object(
        'status', 'not_eligible',
        'availableAt', v_available_at,
        'runner', 'company_matching_worker',
        'updatedAt', timezone('utc', now())
      ),
      true
    )
    where calibration.id = p_calibration_id;
    return null;
  end if;

  -- available_at is the exact sentAt + 12h gate. scheduled_slot also seeds
  -- deterministic retrieval, so give each calibration a stable sub-second
  -- identity without changing when the run becomes claimable.
  v_slot_offset_micros := mod(
    (
      get_byte(uuid_send(p_calibration_id), 0)::bigint * 16777216
      + get_byte(uuid_send(p_calibration_id), 1)::bigint * 65536
      + get_byte(uuid_send(p_calibration_id), 2)::bigint * 256
      + get_byte(uuid_send(p_calibration_id), 3)::bigint
    ),
    1000000::bigint
  );
  -- The existing queue also has a workspace/slot/contract unique key. Probe
  -- deterministic microsecond slots so an unrelated run at the same instant
  -- cannot make this calibration intent disappear.
  for v_insert_attempt in 0..999999 loop
    v_scheduled_slot := v_available_at
      + mod(
        v_slot_offset_micros + v_insert_attempt,
        1000000
      )::double precision * interval '1 microsecond';

    insert into public.company_first_search_runs (
      company_workspace_id,
      scheduled_slot,
      trigger_reason,
      contract_version,
      status,
      available_at,
      requested_role_ids,
      source_calibration_id,
      result
    ) values (
      v_workspace_id,
      v_scheduled_slot,
      'post_calibration',
      'company_matching_run_contract_v3',
      'queued',
      v_available_at,
      array[v_role_id],
      p_calibration_id,
      jsonb_build_object(
        'queuedAt', timezone('utc', now()),
        'scheduledFrom', 'calibration_slack_sent_at',
        'availableAt', v_available_at
      )
    )
    on conflict do nothing
    returning id into v_run_id;

    exit when v_run_id is not null;

    select run.id
    into v_run_id
    from public.company_first_search_runs run
    where run.source_calibration_id = p_calibration_id
    order by run.id
    limit 1;

    exit when v_run_id is not null;
  end loop;

  if v_run_id is null then
    raise exception 'company matching queue slot unavailable for calibration %',
      p_calibration_id;
  end if;

  update public.company_role_calibrations calibration
  set payload = jsonb_set(
    calibration.payload,
    '{postCalibrationSearch}',
    jsonb_build_object(
      'status', 'queued',
      'runId', v_run_id,
      'availableAt', v_available_at,
      'triggerReason', 'post_calibration',
      'runner', 'company_matching_worker',
      'updatedAt', timezone('utc', now())
    ),
    true
  )
  where calibration.id = p_calibration_id;

  return v_run_id;
end;
$$;

-- Keep calibration generation and Slack delivery unchanged. Only replace the
-- follow-up side effect created by the first successful Slack receipt.
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
    perform public.enqueue_post_calibration_company_matching_run_v1(
      p_calibration_id
    );
    select calibration.*
    into v_row
    from public.company_role_calibrations calibration
    where calibration.id = p_calibration_id;
  end if;

  return v_row;
end;
$$;

-- Stop creating or waking local Codex work for this follow-up. A run already
-- claimed before this migration may finish; unclaimed rows are migrated below.
drop trigger if exists company_context_runs_enqueue_waiting_post_calibration_v1
  on public.company_context_runs;
drop trigger if exists company_context_runs_notify_post_calibration_v1
  on public.company_context_runs;

-- Keep the old listener's database preflight green during a rolling rollout,
-- but make the legacy enqueue name route to the new queue and make its claim
-- path empty. No new local Codex post-calibration work can be claimed.
create or replace function public.enqueue_post_calibration_company_context_run_v1(
  p_calibration_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.enqueue_post_calibration_company_matching_run_v1(
    p_calibration_id
  );
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
  return;
end;
$$;

create or replace function public.enqueue_waiting_post_calibration_run_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return new;
end;
$$;

create or replace function public.notify_post_calibration_company_context_work_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return new;
end;
$$;

do $$
declare
  v_calibration_id uuid;
begin
  for v_calibration_id in
    select calibration.id
    from public.company_role_calibrations calibration
    where calibration.status in ('sent', 'completed')
      and calibration.payload->'delivery'->>'status' = 'sent'
      and nullif(calibration.payload->'delivery'->>'sentAt', '') is not null
      and not exists (
        select 1
        from public.company_context_runs completed_run
        where completed_run.trigger_reason = 'post_calibration_12h'
          and completed_run.result->>'calibrationId' = calibration.id::text
          and completed_run.status = 'succeeded'
      )
      and not exists (
        select 1
        from public.company_context_runs active_run
        where active_run.trigger_reason = 'post_calibration_12h'
          and active_run.result->>'calibrationId' = calibration.id::text
          and active_run.status = 'running'
      )
      and (
        calibration.payload->'postCalibrationRun'->>'status'
          in ('queued', 'waiting_for_role_run')
        or exists (
          select 1
          from public.company_context_runs unfinished_run
          where unfinished_run.trigger_reason = 'post_calibration_12h'
            and unfinished_run.result->>'calibrationId' = calibration.id::text
            and unfinished_run.status in ('queued', 'failed')
        )
      )
  loop
    perform public.enqueue_post_calibration_company_matching_run_v1(
      v_calibration_id
    );
  end loop;
end;
$$;

update public.company_context_runs run
set
  status = 'canceled',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'resultReason', 'superseded_by_company_matching_worker',
    'summary', 'Calibration 후 탐색을 정기 Company Matching Worker의 1회 실행으로 전환함',
    'finishedAt', timezone('utc', now())
  )
where run.trigger_reason = 'post_calibration_12h'
  and run.status = 'queued';

-- Compatibility-only trigger names let an older calibration listener keep
-- processing calibration rows until it is restarted on the new code. Their
-- functions are intentionally inert.
create trigger company_context_runs_enqueue_waiting_post_calibration_v1
after update of status on public.company_context_runs
for each row execute function public.enqueue_waiting_post_calibration_run_v1();

create trigger company_context_runs_notify_post_calibration_v1
after insert or update of status, available_at, result
on public.company_context_runs
for each row execute function public.notify_post_calibration_company_context_work_v1();

revoke all on function public.enqueue_post_calibration_company_matching_run_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_post_calibration_company_matching_run_v1(uuid)
  to service_role;

comment on function public.enqueue_post_calibration_company_matching_run_v1(uuid) is
  'Queues one regular company-scoped matching run at the first calibration Slack sentAt plus 12 hours.';
comment on function public.enqueue_post_calibration_company_context_run_v1(uuid) is
  'Compatibility alias. Routes legacy callers to the Company Matching queue and creates no Company Context Run.';
comment on function public.claim_post_calibration_company_context_run_v1(text) is
  'Retired compatibility function. Returns no work because post-calibration search is owned by the Company Matching Worker.';

commit;
