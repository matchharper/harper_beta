begin;

-- Supersede the previous local-ledger/72-hour lifecycle draft.
drop trigger if exists company_roles_sync_internal_matching_status_v1
  on public.company_roles;
drop trigger if exists company_internal_roles_touch_auto_enabled_v1
  on public.company_internal_roles;
drop function if exists public.sync_company_internal_role_matching_status_v1();
drop function if exists public.touch_company_internal_role_auto_enabled_v1();

drop trigger if exists company_internal_roles_enqueue_matching_v1
  on public.company_internal_roles;
drop trigger if exists company_roles_enqueue_matching_on_status_v1
  on public.company_roles;
drop function if exists public.claim_company_role_matching_run_v1(text, integer);
drop function if exists public.enqueue_due_company_role_matching_runs_v1(timestamptz);
drop function if exists public.enqueue_company_role_matching_on_status_v1();
drop function if exists public.enqueue_company_role_matching_on_internal_role_v1();
drop function if exists public.enqueue_company_role_matching_run_v1(uuid, text, text);
drop table if exists public.company_role_matching_runs;

-- Keep the correctly named pending limit as the only physical column.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_internal_roles'
      and column_name = 'max_peding_talents'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_internal_roles'
      and column_name = 'max_pending_talents'
  ) then
    alter table public.company_internal_roles
      rename column max_peding_talents to max_pending_talents;
  end if;
end;
$$;

alter table public.company_internal_roles
  add column if not exists max_pending_talents integer,
  add column if not exists role_status_changed_at timestamptz
    default timezone('utc', now()),
  drop column if exists last_long_inactive_reactivated_at,
  drop column if exists last_auto_enabled_at;

comment on column public.company_internal_roles.max_pending_talents is
  'Maximum unique talents currently allowed in the internal pending-connection stage before a company context run skips candidate search.';
comment on column public.company_internal_roles.role_status_changed_at is
  'When the current company_roles.status began; used to detect reactivation after seven continuous days paused or ended.';

alter table public.talent_opportunity_fit
  add column if not exists company_side_evaluation_metadata jsonb;

-- One current verbalized context document per internal role.
create table if not exists public.company_role_behavior_contexts (
  role_id uuid primary key
    references public.company_roles(role_id) on delete cascade,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  text_context text not null default '',
  context_version bigint not null default 0,
  context_hash text not null default '',
  source_fingerprint text not null default '',
  source_snapshot jsonb not null default '{}'::jsonb,
  changed_domains text[] not null default '{}',
  builder_version text not null default 'company_role_context_v2',
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Preserve any company-wide and role-specific text already written by the
-- superseded two-document implementation before dropping the extra table.
do $$
begin
  if to_regclass('public.company_behavior_contexts') is not null then
    insert into public.company_role_behavior_contexts (
      role_id,
      company_workspace_id,
      text_context,
      context_version,
      context_hash,
      source_fingerprint,
      source_snapshot,
      changed_domains,
      builder_version,
      last_checked_at,
      last_changed_at,
      created_at,
      updated_at
    )
    select
      role.role_id,
      role.company_workspace_id,
      case
        when btrim(coalesce(company_context.text_context, '')) = '' then
          coalesce(role_context.text_context, '')
        when btrim(coalesce(role_context.text_context, '')) = '' then
          '## 회사 공통으로 확인된 판단' || E'\n\n' || company_context.text_context
        else
          '## 회사 공통으로 확인된 판단' || E'\n\n' || company_context.text_context ||
          E'\n\n## 현재 역할에서 확인된 판단\n\n' || role_context.text_context
      end as combined_text,
      greatest(
        coalesce(role_context.context_version, 0),
        coalesce(company_context.context_version, 0)
      ) + 1,
      md5(
        case
          when btrim(coalesce(company_context.text_context, '')) = '' then
            coalesce(role_context.text_context, '')
          when btrim(coalesce(role_context.text_context, '')) = '' then
            '## 회사 공통으로 확인된 판단' || E'\n\n' || company_context.text_context
          else
            '## 회사 공통으로 확인된 판단' || E'\n\n' || company_context.text_context ||
            E'\n\n## 현재 역할에서 확인된 판단\n\n' || role_context.text_context
        end
      ),
      coalesce(role_context.source_fingerprint, company_context.source_fingerprint, ''),
      jsonb_build_object(
        'migration', '20260814180000_company_context_run_queue',
        'previousCompanySnapshot', coalesce(company_context.source_snapshot, '{}'::jsonb),
        'previousRoleSnapshot', coalesce(role_context.source_snapshot, '{}'::jsonb)
      ),
      array['migration_two_contexts_to_one']::text[],
      'company_role_context_v2',
      greatest(role_context.last_checked_at, company_context.last_checked_at),
      greatest(role_context.last_changed_at, company_context.last_changed_at),
      coalesce(role_context.created_at, company_context.created_at, timezone('utc', now())),
      timezone('utc', now())
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    left join public.company_role_behavior_contexts role_context
      on role_context.role_id = role.role_id
    left join public.company_behavior_contexts company_context
      on company_context.company_workspace_id = role.company_workspace_id
    where company_context.company_workspace_id is not null
       or role_context.role_id is not null
    on conflict (role_id) do update set
      company_workspace_id = excluded.company_workspace_id,
      text_context = excluded.text_context,
      context_version = excluded.context_version,
      context_hash = excluded.context_hash,
      source_fingerprint = excluded.source_fingerprint,
      source_snapshot = excluded.source_snapshot,
      changed_domains = excluded.changed_domains,
      builder_version = excluded.builder_version,
      last_checked_at = excluded.last_checked_at,
      last_changed_at = excluded.last_changed_at,
      updated_at = excluded.updated_at;

    drop table public.company_behavior_contexts;
  end if;
end;
$$;

comment on table public.company_role_behavior_contexts is
  'One current verbalized company-and-role behavior context document per internal role.';

create index if not exists company_role_behavior_contexts_workspace_idx
  on public.company_role_behavior_contexts(company_workspace_id, updated_at desc);
alter table public.company_role_behavior_contexts enable row level security;
grant all on table public.company_role_behavior_contexts to service_role;

-- Exactly six top-level columns. Detailed timestamps, counts, summaries, and
-- failure information live in result so the queue stays intentionally small.
create table if not exists public.company_context_runs (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  status text not null default 'queued',
  trigger_reason text not null,
  available_at timestamptz not null default timezone('utc', now()),
  result jsonb not null default '{}'::jsonb
);

create unique index if not exists company_context_runs_one_open_role_idx
  on public.company_context_runs(role_id)
  where status in ('queued', 'running');
create index if not exists company_context_runs_claim_idx
  on public.company_context_runs(status, available_at, role_id);
create index if not exists company_context_runs_role_history_idx
  on public.company_context_runs(role_id, ((result->>'finishedAt')) desc);

alter table public.company_context_runs enable row level security;
grant all on table public.company_context_runs to service_role;
comment on table public.company_context_runs is
  'Six-column durable queue and execution history for Codex company context runs.';

create or replace function public.enqueue_company_context_run_v1(
  p_role_id uuid,
  p_trigger_reason text,
  p_available_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
  ) then
    raise exception 'company context run requires an internal role: %', p_role_id;
  end if;

  if p_trigger_reason <> 'manual' and not exists (
    select 1
    from public.company_internal_roles internal_role
    where internal_role.role_id = p_role_id
      and coalesce(internal_role.is_auto, false) = true
  ) then
    raise exception 'automatic company context run requires is_auto=true: %', p_role_id;
  end if;

  insert into public.company_context_runs (
    role_id,
    status,
    trigger_reason,
    available_at,
    result
  ) values (
    p_role_id,
    'queued',
    p_trigger_reason,
    p_available_at,
    jsonb_build_object('queuedAt', timezone('utc', now()))
  )
  on conflict (role_id) where status in ('queued', 'running')
  do nothing
  returning id into v_id;

  if v_id is null then
    select run.id
    into v_id
    from public.company_context_runs run
    where run.role_id = p_role_id
      and run.status in ('queued', 'running')
    order by run.available_at, run.id
    limit 1;
  end if;

  return v_id;
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
    case
      when last_success.finished_at is null then 'role_created'
      else 'weekly'
    end,
    p_now,
    jsonb_build_object('queuedAt', p_now)
  from public.company_roles role
  join public.company_internal_roles internal_role
    on internal_role.role_id = role.role_id
  left join lateral (
    select max((run.result->>'finishedAt')::timestamptz) as finished_at
    from public.company_context_runs run
    where run.role_id = role.role_id
      and run.status = 'succeeded'
      and run.result ? 'finishedAt'
  ) last_success on true
  where lower(btrim(coalesce(role.source_type, ''))) = 'internal'
    and lower(btrim(coalesce(role.status, ''))) = 'active'
    and coalesce(role.is_expired, false) = false
    and coalesce(internal_role.is_auto, false) = true
    and (
      last_success.finished_at is null
      or last_success.finished_at <= p_now - interval '7 days'
    )
  on conflict (role_id) where status in ('queued', 'running')
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.claim_company_context_run_v1(
  p_runner text,
  p_role_id uuid default null
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
    join public.company_internal_roles internal_role
      on internal_role.role_id = run.role_id
    where run.status = 'queued'
      and run.available_at <= timezone('utc', now())
      and (p_role_id is null or run.role_id = p_role_id)
      and (
        run.trigger_reason = 'manual'
        or coalesce(internal_role.is_auto, false) = true
      )
    order by run.available_at, run.id
    for update skip locked
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

create or replace function public.finish_company_context_run_v1(
  p_run_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb
)
returns public.company_context_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_context_runs;
begin
  if p_status not in ('succeeded', 'failed', 'canceled') then
    raise exception 'unsupported terminal company context run status: %', p_status;
  end if;

  update public.company_context_runs run
  set
    status = p_status,
    result = coalesce(run.result, '{}'::jsonb) || coalesce(p_result, '{}'::jsonb) ||
      jsonb_build_object('finishedAt', timezone('utc', now()))
  where run.id = p_run_id
    and run.status = 'running'
  returning run.* into v_row;

  if v_row.id is null then
    raise exception 'running company context run not found: %', p_run_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.enqueue_company_context_run_on_role_insert_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.is_auto, false) = true then
    perform public.enqueue_company_context_run_v1(
      new.role_id,
      'role_created',
      timezone('utc', now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists company_internal_roles_enqueue_context_run_v1
  on public.company_internal_roles;
create trigger company_internal_roles_enqueue_context_run_v1
after insert on public.company_internal_roles
for each row
execute function public.enqueue_company_context_run_on_role_insert_v1();

create or replace function public.track_company_role_status_and_enqueue_context_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_previous_status_started_at timestamptz;
begin
  if not exists (
    select 1
    from public.company_internal_roles internal_role
    where internal_role.role_id = new.role_id
      and coalesce(internal_role.is_auto, false) = true
  ) then
    return new;
  end if;

  select internal_role.role_status_changed_at
  into v_previous_status_started_at
  from public.company_internal_roles internal_role
  where internal_role.role_id = new.role_id;

  -- paused -> ended (or ended -> paused) is still one continuous inactive
  -- period. Preserve its start so a later active transition sees the full
  -- paused/ended duration instead of only the final status segment.
  if not (
    lower(btrim(coalesce(old.status, ''))) in ('paused', 'ended')
    and lower(btrim(coalesce(new.status, ''))) in ('paused', 'ended')
  ) then
    update public.company_internal_roles internal_role
    set role_status_changed_at = v_now
    where internal_role.role_id = new.role_id;
  end if;

  if lower(btrim(coalesce(old.status, ''))) in ('paused', 'ended')
     and lower(btrim(coalesce(new.status, ''))) = 'active'
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

drop trigger if exists company_roles_track_status_and_enqueue_context_v1
  on public.company_roles;
create trigger company_roles_track_status_and_enqueue_context_v1
after update of status on public.company_roles
for each row
when (old.status is distinct from new.status)
execute function public.track_company_role_status_and_enqueue_context_v1();

create or replace function public.cancel_company_context_run_when_auto_disabled_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.is_auto, false) = true
     and coalesce(new.is_auto, false) = false then
    update public.company_context_runs run
    set
      status = 'canceled',
      result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
        'resultReason', 'auto_disabled',
        'summary', 'is_auto가 꺼져 자동 실행 대기열에서 제거됨',
        'finishedAt', timezone('utc', now())
      )
    where run.role_id = new.role_id
      and run.status = 'queued'
      and run.trigger_reason <> 'manual';
  end if;
  return new;
end;
$$;

drop trigger if exists company_internal_roles_cancel_context_run_v1
  on public.company_internal_roles;
create trigger company_internal_roles_cancel_context_run_v1
after update of is_auto on public.company_internal_roles
for each row
when (old.is_auto is distinct from new.is_auto)
execute function public.cancel_company_context_run_when_auto_disabled_v1();

grant execute on function public.enqueue_company_context_run_v1(uuid, text, timestamptz)
  to service_role;
grant execute on function public.enqueue_due_company_context_runs_v1(timestamptz)
  to service_role;
grant execute on function public.claim_company_context_run_v1(text, uuid)
  to service_role;
grant execute on function public.finish_company_context_run_v1(uuid, text, jsonb)
  to service_role;

-- Remove automatic work that the superseded active-only due query queued.
-- A manual run remains allowed even when role automation is disabled.
update public.company_context_runs run
set
  status = 'canceled',
  result = coalesce(run.result, '{}'::jsonb) || jsonb_build_object(
    'resultReason', 'auto_disabled',
    'summary', 'is_auto=false 역할에 잘못 생성된 자동 실행을 취소함',
    'finishedAt', timezone('utc', now())
  )
from public.company_internal_roles internal_role
where internal_role.role_id = run.role_id
  and coalesce(internal_role.is_auto, false) = false
  and run.status = 'queued'
  and run.trigger_reason <> 'manual';

-- Make every currently active, auto-enabled internal role immediately
-- runnable. The open-run unique index keeps this idempotent.
select public.enqueue_due_company_context_runs_v1(timezone('utc', now()));

commit;
