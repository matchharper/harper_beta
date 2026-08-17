-- Reconcile production environments that received the initial Behavior Context
-- tables and triggers before change_summary was added to the outbox contract.

alter table public.talent_behavior_context_changes
  add column if not exists change_summary text not null default '';

-- Some environments still have the original seven-argument overload. Drop it
-- before installing the defaulted eighth argument so seven-argument trigger
-- calls remain unambiguous during a rolling deployment.
drop function if exists public.try_enqueue_talent_behavior_context_change(
  uuid, text, text, text, text[], timestamptz, text
);

create or replace function public.try_enqueue_talent_behavior_context_change(
  p_talent_id uuid,
  p_source_type text,
  p_source_id text,
  p_operation text,
  p_changed_fields text[],
  p_occurred_at timestamptz,
  p_idempotency_key text,
  p_change_summary text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Source rows can be cascade-deleted while their talent parent is being
  -- removed. An AFTER DELETE trigger must not recreate an FK child and block
  -- the parent deletion.
  if p_talent_id is null or not exists (
    select 1 from public.talent_users where user_id = p_talent_id
  ) then
    return;
  end if;

  insert into public.talent_behavior_context_changes (
    talent_id,
    source_type,
    source_id,
    operation,
    changed_fields,
    change_summary,
    occurred_at,
    idempotency_key
  ) values (
    p_talent_id,
    p_source_type,
    p_source_id,
    p_operation,
    p_changed_fields,
    coalesce(p_change_summary, ''),
    p_occurred_at,
    p_idempotency_key
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public.try_enqueue_talent_behavior_context_change(
  uuid, text, text, text, text[], timestamptz, text, text
) from public;

comment on column public.talent_behavior_context_changes.change_summary is
  'Optional compact before/after evidence retained for source edits and deletions.';
