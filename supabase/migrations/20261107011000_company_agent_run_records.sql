-- What one company Harper run did, and what company Harper's model calls
-- cost (#261 follow-up, S1).
--
-- Searches and runs (company_agent_operations.run_id):
-- - Scheduled member searches already carry their root run
--   (request_options.rootJobId). That key also drives the Worker's scheduled
--   flow, so no other search uses it.
-- - An external search asked inside a run carries the run as
--   input.webActionJobId; its operation is linked when the row is inserted.
-- - A member search queued through an RPC that has no place for the run
--   (Harper's search tool, the role-search kickoff) is linked right after it
--   is queued (link_company_agent_operation_run_v1). A search that joins one
--   already queued keeps the run that started it.
-- - A run of another company is never linked.
-- - Existing member searches are linked where the record says which run asked:
--   Harper's search tool stores the run's hidden anchor message as
--   request_options.sourceMessageId, and a kickoff stores its queued search in
--   action_context.matchingSearchResult. External searches have no such record
--   and stay unlinked.
--
-- Usage outside the run ledger (company_agent_turn_usage):
-- - Slack turns, email replies and connection emails are company Harper turns
--   that are not runs in company_agent_web_action_jobs. Their model calls are
--   collected like a run's and saved once per turn (kind, source_id), where
--   source_id is the turn's own row (slack_reply_jobs, email_reply_jobs,
--   company_email_outbox). Retries and the Slack routing and reply steps add
--   to the same row.
-- - company_agent_usage_v1 reports them as slack_turn, email_reply and
--   connection_email, next to member_search, external_search and harper_turn.

-- The run a new search belongs to, read from its own row.
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
  -- Separate branches: each table has only its own column.
  if tg_table_name = 'company_first_search_runs' then
    v_root := new.request_options ->> 'rootJobId';
  else
    v_root := new.input ->> 'webActionJobId';
  end if;
  if v_root ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select job.id into v_run from public.company_agent_web_action_jobs job
    where job.id = v_root::uuid and job.company_workspace_id = new.company_workspace_id;
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

revoke all on function public.open_company_agent_operation_v1() from public, anon, authenticated, service_role;

-- Links a search queued through an RPC to the run that queued it: once, and
-- only to a run of the same company. True when it linked.
create or replace function public.link_company_agent_operation_run_v1(
  p_kind text, p_work_id uuid, p_run_id uuid
) returns boolean
language sql
security definer
set search_path = ''
as $$
  with linked as (
    update public.company_agent_operations operation
    set run_id = job.id, updated_at = now()
    from public.company_agent_web_action_jobs job
    where operation.kind = p_kind and operation.work_id = p_work_id and operation.run_id is null
      and job.id = p_run_id and job.company_workspace_id = operation.company_workspace_id
    returning operation.id
  )
  select exists (select 1 from linked);
$$;

revoke all on function public.link_company_agent_operation_run_v1(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_company_agent_operation_run_v1(text, uuid, uuid) to service_role;

-- Existing member searches whose record says which run asked for them.
update public.company_agent_operations operation
set run_id = job.id, updated_at = now()
from public.company_first_search_runs run, public.company_agent_web_action_jobs job
where operation.kind = 'member_search' and operation.work_id = run.id and operation.run_id is null
  and job.company_workspace_id = run.company_workspace_id
  and job.anchor_message_id = case when (run.request_options ->> 'sourceMessageId') ~ '^[0-9]{1,18}$'
    then (run.request_options ->> 'sourceMessageId')::bigint end;
update public.company_agent_operations operation
set run_id = job.id, updated_at = now()
from public.company_agent_web_action_jobs job
where job.action_name = 'role_search_kickoff'
  and job.action_context -> 'matchingSearchResult' ->> 'status' = 'queued'
  and operation.kind = 'member_search' and operation.run_id is null
  and operation.company_workspace_id = job.company_workspace_id
  and operation.work_id = case when (job.action_context -> 'matchingSearchResult' ->> 'runId')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (job.action_context -> 'matchingSearchResult' ->> 'runId')::uuid end;

-- Model usage of company Harper turns outside the run ledger, one row per turn.
create table if not exists public.company_agent_turn_usage (
  kind text not null,
  source_id text not null,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete set null,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_agent_turn_usage_pkey primary key (kind, source_id),
  constraint company_agent_turn_usage_kind check (kind in ('slack_turn', 'email_reply', 'connection_email'))
);

create index if not exists company_agent_turn_usage_workspace_idx
  on public.company_agent_turn_usage (company_workspace_id, created_at desc);

alter table public.company_agent_turn_usage enable row level security;
revoke all on public.company_agent_turn_usage from public, anon, authenticated, service_role;
grant select on public.company_agent_turn_usage to service_role;

-- A turn's usage plus a later part of it (a retry, or the reply after the
-- Slack routing step), the same way the web merges a retried run's usage
-- (mergeRunUsage): numbers add up, the cost is complete only if both parts
-- are, and attempts counts the parts.
create or replace function public.company_merge_turn_usage_v1(p_before jsonb, p_current jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_before) is distinct from 'object'
    then p_current || jsonb_build_object('attempts', 1)
    else p_current || jsonb_build_object(
      'cacheWriteTokens', coalesce(public.company_usage_number_v1(p_before -> 'cacheWriteTokens'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'cacheWriteTokens'), 0),
      'cachedInputTokens', coalesce(public.company_usage_number_v1(p_before -> 'cachedInputTokens'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'cachedInputTokens'), 0),
      'calls', coalesce(public.company_usage_number_v1(p_before -> 'calls'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'calls'), 0),
      'costComplete', (p_before -> 'costComplete') is distinct from 'false'::jsonb
        and (p_current -> 'costComplete') = 'true'::jsonb,
      'costUsd', round(coalesce(public.company_usage_number_v1(p_before -> 'costUsd'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'costUsd'), 0), 8),
      'elapsedMs', coalesce(public.company_usage_number_v1(p_before -> 'elapsedMs'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'elapsedMs'), 0),
      'inputTokens', coalesce(public.company_usage_number_v1(p_before -> 'inputTokens'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'inputTokens'), 0),
      'outputTokens', coalesce(public.company_usage_number_v1(p_before -> 'outputTokens'), 0)
        + coalesce(public.company_usage_number_v1(p_current -> 'outputTokens'), 0),
      'models', coalesce((
        select jsonb_agg(distinct model.name order by model.name)
        from (
          select jsonb_array_elements_text(case when jsonb_typeof(p_before -> 'models') = 'array'
            then p_before -> 'models' else '[]'::jsonb end) as name
          union all
          select jsonb_array_elements_text(case when jsonb_typeof(p_current -> 'models') = 'array'
            then p_current -> 'models' else '[]'::jsonb end)
        ) model
      ), '[]'::jsonb),
      'attempts', greatest(1, coalesce(public.company_usage_number_v1(p_before -> 'attempts'), 0)) + 1)
    end;
$$;

revoke all on function public.company_merge_turn_usage_v1(jsonb, jsonb) from public, anon, authenticated;

-- Saves one turn's usage; a later part of the same turn adds to it. A Role
-- of another company is not recorded.
create or replace function public.record_company_agent_turn_usage_v1(
  p_kind text, p_source_id text, p_company_workspace_id uuid, p_role_id uuid, p_usage jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind is null or p_kind not in ('slack_turn', 'email_reply', 'connection_email')
    or nullif(btrim(coalesce(p_source_id, '')), '') is null or p_company_workspace_id is null
    or jsonb_typeof(p_usage) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid_company_turn_usage';
  end if;
  insert into public.company_agent_turn_usage as turn (kind, source_id, company_workspace_id, role_id, usage)
  values (
    p_kind, p_source_id, p_company_workspace_id,
    (select role.role_id from public.company_roles role
      where role.role_id = p_role_id and role.company_workspace_id = p_company_workspace_id),
    public.company_merge_turn_usage_v1(null, p_usage)
  )
  on conflict (kind, source_id) do update
    set usage = public.company_merge_turn_usage_v1(turn.usage, p_usage), updated_at = now()
    where turn.company_workspace_id = excluded.company_workspace_id;
end;
$$;

revoke all on function public.record_company_agent_turn_usage_v1(text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_company_agent_turn_usage_v1(text, text, uuid, uuid, jsonb) to service_role;

-- Runs and usage per kind for a company over a time window, now with the
-- turns outside the run ledger.
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
    union all
    select turn.kind, turn.usage
    from public.company_agent_turn_usage turn
    where turn.company_workspace_id = p_company_workspace_id
      and turn.created_at >= p_from and turn.created_at < p_to
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
