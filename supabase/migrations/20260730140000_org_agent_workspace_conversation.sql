-- The organization agent is workspace-scoped, not permanently bound to a role.
--
-- Existing role conversations are merged into one conversation per workspace.
-- Historical message/summary role_id values are kept as optional provenance;
-- new messages use role_id = null unless a caller intentionally supplies one.

begin;

alter table public.company_conversations
  alter column role_id drop not null;

alter table public.company_messages
  alter column role_id drop not null;

alter table public.company_conversation_summaries
  alter column role_id drop not null;

alter table public.company_conversations
  drop constraint if exists company_conversations_role_id_fkey;
alter table public.company_conversations
  add constraint company_conversations_role_id_fkey
  foreign key (role_id)
  references public.company_roles(role_id)
  on delete set null;

alter table public.company_messages
  drop constraint if exists company_messages_role_id_fkey;
alter table public.company_messages
  add constraint company_messages_role_id_fkey
  foreign key (role_id)
  references public.company_roles(role_id)
  on delete set null;

alter table public.company_conversation_summaries
  drop constraint if exists company_conversation_summaries_role_id_fkey;
alter table public.company_conversation_summaries
  add constraint company_conversation_summaries_role_id_fkey
  foreign key (role_id)
  references public.company_roles(role_id)
  on delete set null;

alter table public.company_slack_channels
  alter column default_role_id drop not null;

alter table public.company_slack_threads
  alter column role_id drop not null;

alter table public.company_slack_channels
  drop constraint if exists company_slack_channels_default_role_id_fkey;
alter table public.company_slack_channels
  add constraint company_slack_channels_default_role_id_fkey
  foreign key (default_role_id)
  references public.company_roles(role_id)
  on delete set null;

alter table public.company_slack_threads
  drop constraint if exists company_slack_threads_role_id_fkey;
alter table public.company_slack_threads
  add constraint company_slack_threads_role_id_fkey
  foreign key (role_id)
  references public.company_roles(role_id)
  on delete set null;

alter table public.company_conversations
  drop constraint if exists company_conversations_company_workspace_id_role_id_key;

-- Prefer an existing workspace-scoped conversation if one exists. Otherwise
-- choose the oldest role conversation as the stable target.
create temporary table org_agent_conversation_map on commit drop as
select
  id as source_conversation_id,
  first_value(id) over (
    partition by company_workspace_id
    order by (role_id is null) desc, created_at asc, id asc
  ) as target_conversation_id,
  company_workspace_id
from public.company_conversations;

update public.company_messages message
set conversation_id = mapping.target_conversation_id
from org_agent_conversation_map mapping
where message.conversation_id = mapping.source_conversation_id
  and mapping.source_conversation_id <> mapping.target_conversation_id;

update public.company_conversation_summaries summary
set conversation_id = mapping.target_conversation_id
from org_agent_conversation_map mapping
where summary.conversation_id = mapping.source_conversation_id
  and mapping.source_conversation_id <> mapping.target_conversation_id;

update public.company_conversations target
set summary_cursor_message_id = cursors.max_cursor
from (
  select
    mapping.target_conversation_id,
    max(source.summary_cursor_message_id) as max_cursor
  from org_agent_conversation_map mapping
  join public.company_conversations source
    on source.id = mapping.source_conversation_id
  group by mapping.target_conversation_id
) cursors
where target.id = cursors.target_conversation_id;

delete from public.company_conversations conversation
using org_agent_conversation_map mapping
where conversation.id = mapping.source_conversation_id
  and mapping.source_conversation_id <> mapping.target_conversation_id;

update public.company_conversations conversation
set
  role_id = null,
  metadata = coalesce(conversation.metadata, '{}'::jsonb)
    || jsonb_build_object('scope', 'workspace'),
  updated_at = timezone('utc', now())
where exists (
  select 1
  from org_agent_conversation_map mapping
  where mapping.target_conversation_id = conversation.id
);

-- Recompute the denormalized last-message pointer after merging histories.
update public.company_conversations conversation
set
  last_message_id = (
    select message.id
    from public.company_messages message
    where message.conversation_id = conversation.id
    order by message.id desc
    limit 1
  ),
  last_message_at = (
    select message.created_at
    from public.company_messages message
    where message.conversation_id = conversation.id
    order by message.id desc
    limit 1
  );

create unique index if not exists company_conversations_workspace_scope_uidx
  on public.company_conversations(company_workspace_id)
  where role_id is null;

drop index if exists public.idx_company_conversations_workspace_role;
create index if not exists idx_company_conversations_workspace_role
  on public.company_conversations(company_workspace_id, role_id);

comment on column public.company_conversations.role_id is
  'Deprecated legacy scope. Organization agent conversations are workspace-scoped and use null.';
comment on column public.company_messages.role_id is
  'Optional source role provenance. The conversation itself is not role-scoped.';
comment on column public.company_conversation_summaries.role_id is
  'Optional legacy/source role provenance. Workspace summaries normally use null.';
comment on column public.company_slack_channels.default_role_id is
  'Deprecated optional hint. Harper now resolves positions from each message.';
comment on column public.company_slack_threads.role_id is
  'Deprecated optional hint. Slack agent threads are not position-scoped.';

commit;
