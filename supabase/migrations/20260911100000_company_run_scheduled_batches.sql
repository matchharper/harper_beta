begin;

-- A Codex scheduled invocation is a logical batch, while the durable execution
-- ledger remains one company_context_runs row per Role. Batch identity lives in
-- result JSON so the established six-column queue contract stays unchanged.
create index if not exists company_context_runs_batch_run_idx
  on public.company_context_runs ((result->>'batchRunId'), status, available_at, id)
  where result ? 'batchRunId';
create unique index if not exists company_context_runs_batch_role_unique_idx
  on public.company_context_runs ((result->>'batchRunId'), role_id)
  where result ? 'batchRunId';

create or replace function public.enqueue_scheduled_company_runs_v1(
  p_batch_run_id uuid,
  p_scheduled_for timestamptz
)
returns table (
  role_id uuid,
  run_id uuid,
  outcome text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_batch_run_id is null or p_scheduled_for is null then
    raise exception 'batch_run_id and scheduled_for are required';
  end if;
  if extract(isodow from p_scheduled_for at time zone 'Asia/Seoul') not in (1, 4)
     or extract(hour from p_scheduled_for at time zone 'Asia/Seoul') <> 8
     or extract(minute from p_scheduled_for at time zone 'Asia/Seoul') <> 0
     or extract(second from p_scheduled_for at time zone 'Asia/Seoul') <> 0 then
    raise exception 'scheduled Company Run must be Monday or Thursday at 08:00 Asia/Seoul';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_batch_run_id::text, 0));

  return query
  with eligible as (
    select role.role_id
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and coalesce(role.is_expired, false) = false
      and (role.expires_at is null or role.expires_at > p_scheduled_for)
      and coalesce(internal_role.is_auto, false) = true
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
  ), existing_batch as (
    select run.role_id, run.id
    from public.company_context_runs run
    join eligible on eligible.role_id = run.role_id
    where run.result->>'batchRunId' = p_batch_run_id::text
  ), open_other as (
    select run.role_id, run.id
    from public.company_context_runs run
    join eligible on eligible.role_id = run.role_id
    where run.status in ('queued', 'running')
      and coalesce(run.result->>'batchRunId', '') <> p_batch_run_id::text
  ), inserted as (
    insert into public.company_context_runs (
      role_id,
      status,
      trigger_reason,
      available_at,
      result
    )
    select
      eligible.role_id,
      case when open_other.id is null then 'queued' else 'canceled' end,
      'scheduled',
      p_scheduled_for,
      jsonb_build_object(
        'contractVersion', 'company-run-v1',
        'batchRunId', p_batch_run_id,
        'scheduledFor', p_scheduled_for,
        'queuedAt', timezone('utc', now()),
        'resultReason', case
          when open_other.id is null then null
          else 'blocked_by_open_run'
        end,
        'summary', case
          when open_other.id is null then null
          else '같은 Role의 기존 실행이 열려 있어 이번 scheduled batch에서는 처리하지 않음'
        end,
        'blockedByRunId', open_other.id,
        'finishedAt', case
          when open_other.id is null then null
          else timezone('utc', now())
        end
      )
    from eligible
    left join open_other on open_other.role_id = eligible.role_id
    where not exists (
      select 1 from existing_batch
      where existing_batch.role_id = eligible.role_id
    )
    on conflict (role_id) where status in ('queued', 'running')
    do nothing
    returning company_context_runs.role_id,
              company_context_runs.id,
              company_context_runs.status
  )
  select
    eligible.role_id,
    coalesce(inserted.id, existing_batch.id, open_other.id),
    case
      when inserted.status = 'queued' then 'enqueued'
      when inserted.status = 'canceled' then 'blocked_by_open_run'
      when existing_batch.id is not null then 'already_recorded'
      else 'blocked_by_open_run'
    end
  from eligible
  left join inserted on inserted.role_id = eligible.role_id
  left join existing_batch on existing_batch.role_id = eligible.role_id
  left join open_other on open_other.role_id = eligible.role_id
  order by eligible.role_id;
end;
$$;

create or replace function public.claim_scheduled_company_run_v1(
  p_runner text,
  p_batch_run_id uuid
)
returns setof public.company_context_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claimable as (
    select run.id
    from public.company_context_runs run
    where run.status = 'queued'
      and run.available_at <= timezone('utc', now())
      and run.result->>'batchRunId' = p_batch_run_id::text
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

revoke all on function public.enqueue_scheduled_company_runs_v1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_scheduled_company_run_v1(text, uuid)
  from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_company_runs_v1(uuid, timestamptz)
  to service_role;
grant execute on function public.claim_scheduled_company_run_v1(text, uuid)
  to service_role;

comment on function public.enqueue_scheduled_company_runs_v1(uuid, timestamptz) is
  'Idempotently creates one Company Run row per eligible active internal Role for a scheduled batch.';
comment on function public.claim_scheduled_company_run_v1(text, uuid) is
  'Atomically claims the next Role row from one scheduled Company Run batch.';

commit;
