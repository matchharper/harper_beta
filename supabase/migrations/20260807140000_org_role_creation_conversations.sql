-- Re-introduce an intentional role-scoped conversation for the company-side
-- LLM role-creation mode while preserving the existing workspace conversation
-- used by normal web chat and Slack.

begin;

-- The legacy constraint predates the conversational draft lifecycle. Keep all
-- supported organization statuses and add draft before any role-creation code
-- attempts to insert one.
alter table public.company_roles
  drop constraint if exists company_roles_status_check;
alter table public.company_roles
  add constraint company_roles_status_check
  check (
    status in ('draft', 'top_priority', 'active', 'ended', 'paused')
  ) not valid;
alter table public.company_roles
  validate constraint company_roles_status_check;

create unique index if not exists company_conversations_role_creation_uidx
  on public.company_conversations(company_workspace_id, role_id)
  where role_id is not null;

comment on column public.company_conversations.role_id is
  'Null for the normal workspace/Slack conversation; set for an isolated role_creation conversation.';
comment on column public.company_messages.role_id is
  'Null for normal workspace/Slack chat; set to the owning role for role_creation chat messages.';
comment on column public.company_conversation_summaries.role_id is
  'Null for normal workspace summaries; set for isolated role_creation summaries.';

-- Draft roles must never enter talent-side opportunity search. When a role is
-- activated the same trigger rebuilds its vector from the latest saved fields.
create or replace function public.set_company_roles_opportunity_search_tsv()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.status, 'active')) = 'draft' then
    new.opportunity_search_tsv := null;
    return new;
  end if;

  -- The weekly cold-storage sweep intentionally removes the search vector
  -- from expired roles that must remain because another row references them.
  if tg_op = 'UPDATE' then
    if coalesce(new.is_expired, false) = true
       and old.opportunity_search_tsv is null then
      return new;
    end if;
  end if;

  new.opportunity_search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.request, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(new.location_text, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(new.work_mode, '')), 'D') ||
    setweight(
      to_tsvector(
        'simple',
        array_to_string(coalesce(new."type", '{}'::text[]), ' ')
      ),
      'D'
    );

  return new;
end;
$$;

drop trigger if exists company_roles_set_opportunity_search_tsv
  on public.company_roles;

create trigger company_roles_set_opportunity_search_tsv
before insert or update of
  name,
  request,
  description,
  location_text,
  work_mode,
  type,
  is_expired,
  status
on public.company_roles
for each row
execute function public.set_company_roles_opportunity_search_tsv();

comment on function public.set_company_roles_opportunity_search_tsv() is
  'Maintains role search vectors, excludes drafts, and restores vectors when roles become live again.';

-- A draft role may become active only through the server-owned confirmation
-- endpoint. The RPC sets a transaction-local capability that the trigger
-- checks, so generic role update APIs and LLM tools cannot bypass the button.
create or replace function public.guard_company_role_draft_activation_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft'
     and new.status is distinct from 'draft'
     and coalesce(
       current_setting('app.role_creation_completion', true),
       ''
     ) <> 'allowed'
  then
    raise exception 'draft roles must be activated through role creation confirmation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_company_role_draft_activation_v1
  on public.company_roles;
create trigger guard_company_role_draft_activation_v1
before update of status on public.company_roles
for each row
execute function public.guard_company_role_draft_activation_v1();

create or replace function public.complete_company_role_creation_v1(
  p_role_id uuid,
  p_workspace_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  perform set_config('app.role_creation_completion', 'allowed', true);
  update public.company_roles
  set status = 'active', updated_at = now()
  where role_id = p_role_id
    and company_workspace_id = p_workspace_id
    and source_type = 'internal'
    and is_expired is not true
    and status = 'draft';
  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.complete_company_role_creation_v1(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_company_role_creation_v1(uuid, uuid)
  to service_role;

commit;
