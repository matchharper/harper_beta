create table public.company_agent_web_action_jobs (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  conversation_id uuid not null
    references public.company_conversations(id) on delete cascade,
  role_id uuid null references public.company_roles(role_id) on delete cascade,
  actor_user_id uuid not null,
  anchor_message_id bigint not null unique
    references public.company_messages(id) on delete cascade,
  action_name text not null check (char_length(btrim(action_name)) between 1 and 120),
  action_context jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique
    check (char_length(btrim(idempotency_key)) between 1 and 500),
  status text not null default 'queued'
    check (status in (
      'queued',
      'processing',
      'retry',
      'completed_silent',
      'completed_message',
      'superseded',
      'failed'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz null,
  locked_by text null,
  progress_message_id bigint null
    references public.company_messages(id) on delete set null,
  terminal_message_id bigint null
    references public.company_messages(id) on delete set null,
  queue_dispatch_status text not null default 'pending'
    check (queue_dispatch_status in ('pending', 'dispatched', 'retry', 'failed')),
  queue_dispatch_attempt_count integer not null default 0
    check (queue_dispatch_attempt_count >= 0),
  queue_dispatched_at timestamptz null,
  queue_last_error text null,
  queue_next_attempt_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(action_context) = 'object')
);

create index company_agent_web_action_jobs_ready_idx
  on public.company_agent_web_action_jobs (next_attempt_at, created_at)
  where status in ('queued', 'retry');

create index company_agent_web_action_jobs_conversation_active_idx
  on public.company_agent_web_action_jobs (conversation_id, created_at)
  where status in ('queued', 'processing', 'retry');

create index company_agent_web_action_jobs_dispatch_ready_idx
  on public.company_agent_web_action_jobs (queue_next_attempt_at, created_at)
  where queue_dispatch_status in ('pending', 'retry')
    and status in ('queued', 'retry');

create unique index company_messages_agent_turn_phase_uidx
  on public.company_messages (
    (metadata->'agentTurn'->>'runId'),
    (metadata->'agentTurn'->>'phase')
  )
  where role = 'assistant'
    and metadata->'agentTurn'->>'runId' is not null
    and metadata->'agentTurn'->>'phase' is not null;

alter table public.company_agent_web_action_jobs enable row level security;
revoke all on table public.company_agent_web_action_jobs
  from public, anon, authenticated;

create or replace function public.enqueue_company_agent_web_action_v1(
  p_company_workspace_id uuid,
  p_conversation_id uuid,
  p_role_id uuid,
  p_actor_user_id uuid,
  p_action_name text,
  p_action_context jsonb,
  p_idempotency_key text
)
returns table(job_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job_id uuid := gen_random_uuid();
  v_anchor_message_id bigint;
  v_existing_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  if p_company_workspace_id is null
     or p_conversation_id is null
     or p_actor_user_id is null
     or nullif(btrim(p_action_name), '') is null
     or nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'invalid_company_agent_web_action';
  end if;
  if jsonb_typeof(coalesce(p_action_context, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_company_agent_web_action_context';
  end if;
  if not exists (
    select 1
    from public.company_conversations c
    where c.id = p_conversation_id
      and c.company_workspace_id = p_company_workspace_id
      and c.role_id is not distinct from p_role_id
  ) then
    raise exception 'company_agent_web_action_conversation_mismatch';
  end if;

  select j.id into v_existing_id
  from public.company_agent_web_action_jobs j
  where j.idempotency_key = btrim(p_idempotency_key);
  if v_existing_id is not null then
    return query select v_existing_id, false;
    return;
  end if;

  begin
    insert into public.company_messages (
      company_user_id,
      company_workspace_id,
      content,
      conversation_id,
      created_at,
      mentions,
      message_type,
      metadata,
      model,
      role,
      role_id,
      status,
      thinking_logs
    ) values (
      p_actor_user_id,
      p_company_workspace_id,
      btrim(p_action_name),
      p_conversation_id,
      v_now,
      '[]'::jsonb,
      'web_action',
      jsonb_build_object(
        'source', 'org_agent_web_action',
        'webActionJobId', v_job_id
      ),
      null,
      'user',
      p_role_id,
      'completed',
      '[]'::jsonb
    ) returning id into v_anchor_message_id;

    insert into public.company_agent_web_action_jobs (
      id,
      company_workspace_id,
      conversation_id,
      role_id,
      actor_user_id,
      anchor_message_id,
      action_name,
      action_context,
      idempotency_key,
      created_at,
      updated_at
    ) values (
      v_job_id,
      p_company_workspace_id,
      p_conversation_id,
      p_role_id,
      p_actor_user_id,
      v_anchor_message_id,
      btrim(p_action_name),
      coalesce(p_action_context, '{}'::jsonb),
      btrim(p_idempotency_key),
      v_now,
      v_now
    );
  exception when unique_violation then
    select j.id into v_existing_id
    from public.company_agent_web_action_jobs j
    where j.idempotency_key = btrim(p_idempotency_key);
    if v_existing_id is null then
      raise;
    end if;
    return query select v_existing_id, false;
    return;
  end;

  return query select v_job_id, true;
end;
$$;

create or replace function public.claim_company_agent_web_action_v1(
  p_job_id uuid,
  p_worker_id text,
  p_max_attempts integer default 5,
  p_stale_after_seconds integer default 360
)
returns setof public.company_agent_web_action_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.company_agent_web_action_jobs j
    where j.id = p_job_id
      and j.attempt_count < greatest(1, p_max_attempts)
      and (
        (j.status in ('queued', 'retry') and j.next_attempt_at <= timezone('utc', now()))
        or (
          j.status = 'processing'
          and j.locked_at < timezone('utc', now())
            - make_interval(secs => greatest(30, p_stale_after_seconds))
        )
      )
      and not exists (
        select 1
        from public.company_agent_web_action_jobs active
        where active.conversation_id = j.conversation_id
          and active.id <> j.id
          and active.status = 'processing'
          and active.locked_at >= timezone('utc', now())
            - make_interval(secs => greatest(30, p_stale_after_seconds))
      )
      and not exists (
        select 1
        from public.company_agent_web_action_jobs earlier
        where earlier.conversation_id = j.conversation_id
          and earlier.id <> j.id
          and earlier.status in ('queued', 'processing', 'retry')
          and (earlier.created_at, earlier.id) < (j.created_at, j.id)
      )
    for update skip locked
  )
  update public.company_agent_web_action_jobs j
  set status = 'processing',
      attempt_count = j.attempt_count + 1,
      locked_at = timezone('utc', now()),
      locked_by = left(coalesce(nullif(btrim(p_worker_id), ''), 'worker'), 300),
      last_error = null,
      updated_at = timezone('utc', now())
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

revoke all on function public.enqueue_company_agent_web_action_v1(
  uuid, uuid, uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.claim_company_agent_web_action_v1(
  uuid, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.enqueue_company_agent_web_action_v1(
  uuid, uuid, uuid, uuid, text, jsonb, text
) to service_role;
grant execute on function public.claim_company_agent_web_action_v1(
  uuid, text, integer, integer
) to service_role;

comment on table public.company_agent_web_action_jobs is
  'Durable company-side LLM turns triggered only by authenticated /org web actions.';
comment on function public.enqueue_company_agent_web_action_v1(
  uuid, uuid, uuid, uuid, text, jsonb, text
) is
  'Atomically creates a hidden message anchor and idempotent web-action turn job.';
