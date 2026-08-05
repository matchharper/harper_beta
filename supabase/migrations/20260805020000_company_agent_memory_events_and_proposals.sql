begin;

create table if not exists public.company_memories (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id)
    on delete cascade,
  role_id uuid
    references public.company_roles(role_id)
    on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_memories_content_length
    check (
      char_length(content) <= 12000
      and char_length(btrim(content)) >= 1
    )
);

create unique index if not exists company_memories_workspace_one
  on public.company_memories(company_workspace_id)
  where role_id is null;

create unique index if not exists company_memories_role_one
  on public.company_memories(company_workspace_id, role_id)
  where role_id is not null;

create or replace function public.validate_company_memory_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_workspace_id uuid;
  v_role_source_type text;
begin
  if new.role_id is not null then
    select role.company_workspace_id, role.source_type
    into v_role_workspace_id, v_role_source_type
    from public.company_roles role
    where role.role_id = new.role_id
    for update;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'company memory role does not exist';
    end if;

    if v_role_workspace_id is distinct from new.company_workspace_id then
      raise exception using
        errcode = '23514',
        message = 'company memory role belongs to a different workspace';
    end if;

    if lower(btrim(coalesce(v_role_source_type, ''))) <> 'internal' then
      raise exception using
        errcode = '23514',
        message = 'role memory is only available for internal roles';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := transaction_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists company_memories_validate_scope
  on public.company_memories;
create trigger company_memories_validate_scope
before insert or update
on public.company_memories
for each row
execute function public.validate_company_memory_scope_v1();

create or replace function public.guard_company_role_memory_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.company_memories memory
    where memory.role_id = old.role_id
  ) and (
    new.company_workspace_id is distinct from old.company_workspace_id
    or lower(btrim(coalesce(new.source_type, ''))) <> 'internal'
  ) then
    raise exception using
      errcode = '23514',
      message = 'cannot move or externalize a role while role memory exists',
      hint = 'Delete or explicitly relocate the role memory first.';
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_guard_memory_scope
  on public.company_roles;
create trigger company_roles_guard_memory_scope
before update of company_workspace_id, source_type
on public.company_roles
for each row
execute function public.guard_company_role_memory_scope_v1();

create table if not exists public.company_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null
    references public.company_workspace(company_workspace_id)
    on delete cascade,
  content text not null,
  source text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint company_events_source_check
    check (source in ('slack', 'website', 'chat')),
  constraint company_events_content_check
    check (
      char_length(content) between 1 and 300
      and content !~ E'[\\r\\n]'
    )
);

create index if not exists company_events_workspace_recent_idx
  on public.company_events(workspace_id, created_at desc, id desc);

create table if not exists public.company_agent_update_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.company_workspace(company_workspace_id)
    on delete cascade,
  scope_key text not null
    check (char_length(btrim(scope_key)) between 1 and 500),
  status text not null default 'draft'
    check (status in (
      'draft', 'pending', 'applied', 'rejected', 'superseded', 'expired',
      'stale'
    )),
  source text not null
    check (source in ('slack', 'chat')),
  slack_thread_id uuid
    references public.company_slack_threads(id)
    on delete cascade,
  summary text not null
    check (char_length(summary) between 1 and 160 and summary !~ E'[\\r\\n]'),
  preview text
    check (preview is null or char_length(preview) <= 3000),
  presentation_text text
    check (
      presentation_text is null
      or char_length(presentation_text) between 1 and 6000
    ),
  payload jsonb,
  message_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(message_metadata) = 'object'),
  message_model text,
  message_thinking_logs jsonb not null default '[]'::jsonb
    check (jsonb_typeof(message_thinking_logs) = 'array'),
  message_type text not null
    check (message_type in ('chat', 'slack')),
  created_by_user_message_id bigint
    references public.company_messages(id)
    on delete set null,
  presented_message_id bigint
    references public.company_messages(id)
    on delete cascade,
  expires_at timestamptz not null,
  applied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_agent_update_proposals_pending_payload
    check (status not in ('draft', 'pending') or payload is not null),
  constraint company_agent_update_proposals_presentation
    check (
      status not in ('draft', 'pending')
      or (preview is not null and presentation_text is not null)
    ),
  constraint company_agent_update_proposals_delivery
    check (status <> 'pending' or presented_message_id is not null),
  constraint company_agent_update_proposals_draft_source
    check (
      status <> 'draft'
      or (source = 'slack' and presented_message_id is null)
    ),
  constraint company_agent_update_proposals_slack_scope
    check ((source = 'slack') = (slack_thread_id is not null)),
  constraint company_agent_update_proposals_applied_at
    check ((status = 'applied') = (applied_at is not null))
);

create unique index if not exists company_agent_update_proposals_one_pending
  on public.company_agent_update_proposals(workspace_id, scope_key)
  where status = 'pending';

create unique index if not exists company_agent_update_proposals_one_draft
  on public.company_agent_update_proposals(workspace_id, scope_key)
  where status = 'draft';

create index if not exists company_agent_update_proposals_workspace_recent_idx
  on public.company_agent_update_proposals(workspace_id, created_at desc);

create index if not exists company_agent_update_proposals_open_expiry_idx
  on public.company_agent_update_proposals(expires_at)
  where status in ('draft', 'pending');

alter table public.slack_reply_jobs
  add column if not exists response_proposal_id uuid
    references public.company_agent_update_proposals(id)
    on delete set null;

create index if not exists slack_reply_jobs_response_proposal_idx
  on public.slack_reply_jobs(response_proposal_id)
  where response_proposal_id is not null;

alter table public.company_memories enable row level security;
alter table public.company_events enable row level security;
alter table public.company_agent_update_proposals enable row level security;

revoke all on table public.company_memories from public, anon, authenticated;
revoke all on table public.company_events from public, anon, authenticated;
revoke all on table public.company_agent_update_proposals from public, anon, authenticated;

grant select, insert, update, delete on table public.company_memories to service_role;
grant select, insert, update, delete on table public.company_events to service_role;
grant select, insert, update, delete on table public.company_agent_update_proposals to service_role;
grant usage, select on sequence public.company_events_id_seq to service_role;

revoke all on function public.validate_company_memory_scope_v1()
  from public, anon, authenticated;
revoke all on function public.guard_company_role_memory_scope_v1()
  from public, anon, authenticated;

comment on table public.company_memories is
  'Current long-term company-side LLM memory: one workspace document and at most one document per internal role.';
comment on table public.company_events is
  'Compact write-only activity ledger for company data changes; not a reversible audit log.';
comment on table public.company_agent_update_proposals is
  'Short-lived exact update proposals used for request/memory confirmation.';
comment on column public.slack_reply_jobs.response_proposal_id is
  'Draft proposal whose exact response_text must be delivered and activated idempotently.';

commit;
