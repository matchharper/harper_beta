-- Company Harper operation ledger and usage (G1a, step 5, D5).
--
-- company_agent_web_action_jobs stays the run ledger: when and why company
-- Harper woke. company_agent_operations is the operation ledger: each piece of
-- work with its own work table (the same two levels as the candidate side).
--
-- - Member searches (company_first_search_runs) and external searches
--   (external_sourcing_runs) get an operation in the same transaction they are
--   created (operation_id), linked to the run that started them
--   (request_options.rootJobId) when there is one. Status and usage follow the
--   work row, so the Worker is not changed for this.
-- - usage has one shape: costUsd, costComplete, inputTokens, cachedInputTokens,
--   outputTokens, elapsedMs (plus a few per-kind counts). A field the source
--   does not report is left out, and costComplete says whether costUsd covers
--   every model call (candidate evaluations are not priced, see below).
-- - company_agent_web_action_jobs.usage: company Harper's own model calls in
--   that run, written by the web when the run ends (also silent runs).
-- - company_agent_usage_v1(company, from, to): runs and usage per kind, for a
--   company's cost.
--
-- Existing searches get their operations here, so the cost history starts
-- with every search already in the database.

create table public.company_agent_operations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete set null,
  run_id uuid references public.company_agent_web_action_jobs(id) on delete set null,
  kind text not null,
  work_id uuid not null,
  status text not null,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint company_agent_operations_kind check (kind in ('member_search', 'external_search')),
  constraint company_agent_operations_work unique (kind, work_id)
);

create index company_agent_operations_workspace_idx
  on public.company_agent_operations (company_workspace_id, created_at desc);
create index company_agent_operations_run_idx
  on public.company_agent_operations (run_id) where run_id is not null;

alter table public.company_agent_operations enable row level security;
revoke all on public.company_agent_operations from public, anon, authenticated, service_role;
grant select on public.company_agent_operations to service_role;

alter table public.company_first_search_runs
  add column operation_id uuid references public.company_agent_operations(id) on delete set null;
alter table public.external_sourcing_runs
  add column operation_id uuid references public.company_agent_operations(id) on delete set null;
alter table public.company_agent_web_action_jobs add column usage jsonb;

-- A JSON number as numeric, anything else null (never fails on bad data).
create or replace function public.company_usage_number_v1(p_value jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'number' then p_value::text::numeric end;
$$;

-- Usage of one piece of work, from what its work row already records.
create or replace function public.company_agent_work_usage_v1(p_kind text, p_work jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  with source as (
    select
      p_work #> '{result,roleSearch,counts}' as counts,
      p_work #> '{model_manifest,llmUsage}' as llm,
      p_work #> '{model_manifest,llmUsage,costSummary}' as llm_summary,
      p_work -> 'cost' as cost,
      case when p_work ->> 'started_at' is not null and p_work ->> 'finished_at' is not null
        then round(extract(epoch from ((p_work ->> 'finished_at')::timestamptz - (p_work ->> 'started_at')::timestamptz)) * 1000)
      end as elapsed_ms,
      -- Whether the cost is complete is only said once the work has ended.
      p_work ->> 'finished_at' is not null
        or p_work ->> 'status' in ('succeeded', 'failed', 'skipped', 'completed', 'cancelled') as ended
  )
  select jsonb_strip_nulls(case p_kind
    when 'member_search' then jsonb_build_object(
      -- Candidate evaluations use a model API that is not priced here (the
      -- Worker records their tokens, not USD), so a search with fresh
      -- evaluations has costComplete = false.
      'costUsd', public.company_usage_number_v1(llm -> 'estimatedCostUsd'),
      'costComplete', case when ended then
        (llm is null or llm ->> 'usageComplete' = 'true')
        and coalesce(public.company_usage_number_v1(counts -> 'evaluations'), 0) = 0 end,
      'inputTokens', nullif(coalesce(public.company_usage_number_v1(llm_summary -> 'inputTokens'), 0)
        + coalesce(public.company_usage_number_v1(counts -> 'inputTokens'), 0), 0),
      'cachedInputTokens', nullif(coalesce(public.company_usage_number_v1(llm_summary -> 'cacheReadInputTokens'), 0)
        + coalesce(public.company_usage_number_v1(counts -> 'cachedInputTokens'), 0), 0),
      'outputTokens', public.company_usage_number_v1(llm_summary -> 'outputTokens'),
      'evaluations', public.company_usage_number_v1(counts -> 'evaluations'),
      'reusedEvaluations', public.company_usage_number_v1(counts -> 'reusedEvaluations'),
      'elapsedMs', elapsed_ms)
    when 'external_search' then jsonb_build_object(
      'costUsd', coalesce(public.company_usage_number_v1(cost -> 'totalUsdPaid'),
        case when cost ? 'llmUsd' or cost ? 'searchUsd' then
          coalesce(public.company_usage_number_v1(cost -> 'llmUsd'), 0)
          + coalesce(public.company_usage_number_v1(cost -> 'searchUsd'), 0) end),
      'costComplete', case when ended then cost ? 'totalUsdPaid' end,
      'llmUsd', public.company_usage_number_v1(cost -> 'llmUsd'),
      'searchUsd', public.company_usage_number_v1(cost -> 'searchUsd'),
      'elapsedMs', elapsed_ms)
    else '{}'::jsonb end)
  from source;
$$;

-- A search gets its operation in the transaction that creates it, once the
-- row is really inserted: an insert skipped by ON CONFLICT DO NOTHING (the
-- scheduler and role activation retry the same slot) opens nothing.
create or replace function public.open_company_agent_operation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case tg_table_name when 'company_first_search_runs' then 'member_search' else 'external_search' end;
  v_root text;
  v_run uuid;
  v_operation uuid;
begin
  if tg_table_name = 'company_first_search_runs' then
    v_root := new.request_options ->> 'rootJobId';
    if v_root ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select job.id into v_run from public.company_agent_web_action_jobs job where job.id = v_root::uuid;
    end if;
  end if;
  insert into public.company_agent_operations (
    company_workspace_id, role_id, run_id, kind, work_id, status, usage, created_at, updated_at
  ) values (
    new.company_workspace_id,
    (select role.role_id from public.company_roles role where role.role_id = new.role_id),
    v_run, v_kind, new.id, coalesce(new.status, 'queued'),
    public.company_agent_work_usage_v1(v_kind, to_jsonb(new)),
    coalesce(new.created_at, now()), now()
  )
  on conflict (kind, work_id) do nothing
  returning id into v_operation;
  if v_operation is null then
    select operation.id into v_operation from public.company_agent_operations operation
    where operation.kind = v_kind and operation.work_id = new.id;
  end if;
  if tg_table_name = 'company_first_search_runs' then
    update public.company_first_search_runs set operation_id = v_operation where id = new.id;
  else
    update public.external_sourcing_runs set operation_id = v_operation where id = new.id;
  end if;
  return null;
end;
$$;

-- Status and usage follow the work row.
create or replace function public.follow_company_agent_operation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_agent_operations operation
  set status = coalesce(new.status, operation.status),
      usage = public.company_agent_work_usage_v1(operation.kind, to_jsonb(new)),
      finished_at = new.finished_at,
      updated_at = now()
  where operation.id = new.operation_id;
  return new;
end;
$$;

revoke all on function public.open_company_agent_operation_v1() from public, anon, authenticated, service_role;
revoke all on function public.follow_company_agent_operation_v1() from public, anon, authenticated, service_role;

-- After the row is inserted, so inserts skipped by a guard or by ON CONFLICT
-- open nothing.
create trigger open_company_agent_operation
  after insert on public.company_first_search_runs
  for each row
  when (new.operation_id is null and new.company_workspace_id is not null)
  execute function public.open_company_agent_operation_v1();
create trigger open_company_agent_operation
  after insert on public.external_sourcing_runs
  for each row
  when (new.operation_id is null and new.company_workspace_id is not null)
  execute function public.open_company_agent_operation_v1();
create trigger follow_company_agent_operation
  after update on public.company_first_search_runs
  for each row
  when (new.operation_id is not null
    and (old.status, old.finished_at) is distinct from (new.status, new.finished_at))
  execute function public.follow_company_agent_operation_v1();
create trigger follow_company_agent_operation
  after update on public.external_sourcing_runs
  for each row
  when (new.operation_id is not null
    and (old.status, old.finished_at, old.cost) is distinct from (new.status, new.finished_at, new.cost))
  execute function public.follow_company_agent_operation_v1();

-- Runs and usage per kind for a company over a time window (by when work
-- started). harper_turn is company Harper's own model calls in its runs.
create or replace function public.company_agent_usage_v1(
  p_company_workspace_id uuid, p_from timestamptz, p_to timestamptz
) returns table (
  kind text, runs bigint, cost_usd numeric, runs_with_complete_cost bigint,
  input_tokens numeric, output_tokens numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with items as (
    select operation.kind, operation.usage
    from public.company_agent_operations operation
    where operation.company_workspace_id = p_company_workspace_id
      and operation.created_at >= p_from and operation.created_at < p_to
    union all
    select 'harper_turn', job.usage
    from public.company_agent_web_action_jobs job
    where job.company_workspace_id = p_company_workspace_id
      and job.created_at >= p_from and job.created_at < p_to
  )
  select items.kind, count(*),
    sum(public.company_usage_number_v1(items.usage -> 'costUsd')),
    count(*) filter (where items.usage ->> 'costComplete' = 'true'),
    sum(public.company_usage_number_v1(items.usage -> 'inputTokens')),
    sum(public.company_usage_number_v1(items.usage -> 'outputTokens'))
  from items
  group by items.kind
  order by items.kind;
$$;

revoke all on function public.company_agent_usage_v1(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.company_agent_usage_v1(uuid, timestamptz, timestamptz) to service_role;

-- Operations for the searches already in the database.
insert into public.company_agent_operations (
  company_workspace_id, role_id, run_id, kind, work_id, status, usage, created_at, updated_at, finished_at
)
select run.company_workspace_id,
  (select role.role_id from public.company_roles role where role.role_id = run.role_id),
  (select job.id from public.company_agent_web_action_jobs job
    where (run.request_options ->> 'rootJobId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and job.id = (run.request_options ->> 'rootJobId')::uuid),
  'member_search', run.id, coalesce(run.status, 'queued'),
  public.company_agent_work_usage_v1('member_search', to_jsonb(run)),
  run.created_at, now(), run.finished_at
from public.company_first_search_runs run
where run.company_workspace_id is not null and run.operation_id is null
on conflict (kind, work_id) do nothing;

insert into public.company_agent_operations (
  company_workspace_id, role_id, run_id, kind, work_id, status, usage, created_at, updated_at, finished_at
)
select run.company_workspace_id,
  (select role.role_id from public.company_roles role where role.role_id = run.role_id),
  null, 'external_search', run.id, coalesce(run.status, 'queued'),
  public.company_agent_work_usage_v1('external_search', to_jsonb(run)),
  run.created_at, now(), run.finished_at
from public.external_sourcing_runs run
where run.company_workspace_id is not null and run.operation_id is null
on conflict (kind, work_id) do nothing;

update public.company_first_search_runs run set operation_id = operation.id
from public.company_agent_operations operation
where operation.kind = 'member_search' and operation.work_id = run.id and run.operation_id is null;
update public.external_sourcing_runs run set operation_id = operation.id
from public.company_agent_operations operation
where operation.kind = 'external_search' and operation.work_id = run.id and run.operation_id is null;
