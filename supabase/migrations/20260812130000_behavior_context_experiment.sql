-- Shared behavior memory plus a run-level legacy/behavior experiment contract.

create table if not exists public.talent_behavior_contexts (
  talent_id uuid primary key references public.talent_users(user_id) on delete cascade,
  context_text text not null default '',
  context_version bigint not null default 0,
  context_hash text not null default '',
  last_consumed_change_id bigint not null default 0,
  last_evaluated_at timestamptz,
  last_changed_at timestamptz,
  builder_version text not null default 'behavior_context_lines_v1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.talent_behavior_context_changes (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  source_type text not null,
  source_id text not null,
  operation text not null,
  changed_fields text[] not null default '{}',
  change_summary text not null default '',
  occurred_at timestamptz not null default timezone('utc', now()),
  idempotency_key text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.talent_behavior_context_changes
  add column if not exists change_summary text not null default '';

create index if not exists talent_behavior_context_changes_talent_cursor_idx
  on public.talent_behavior_context_changes (talent_id, id);

alter table public.talent_behavior_contexts enable row level security;
alter table public.talent_behavior_context_changes enable row level security;

grant all on table public.talent_behavior_contexts to service_role;
grant all on table public.talent_behavior_context_changes to service_role;
grant usage, select on sequence public.talent_behavior_context_changes_id_seq to service_role;

-- A manually-created draft of this function existed with seven arguments in
-- some environments.  Drop that exact overload first: otherwise the defaulted
-- eighth argument below makes future seven-argument calls ambiguous.
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
  -- removed.  An AFTER DELETE trigger must not recreate an FK child and block
  -- the parent deletion.
  if p_talent_id is null or not exists (
    select 1 from public.talent_users where user_id = p_talent_id
  ) then
    return;
  end if;
  insert into public.talent_behavior_context_changes (
    talent_id, source_type, source_id, operation, changed_fields,
    change_summary, occurred_at, idempotency_key
  ) values (
    p_talent_id, p_source_type, p_source_id, p_operation,
    p_changed_fields, coalesce(p_change_summary, ''), p_occurred_at, p_idempotency_key
  ) on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public.try_enqueue_talent_behavior_context_change(
  uuid, text, text, text, text[], timestamptz, text, text
) from public;

create or replace function public.enqueue_talent_message_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_messages;
  operation_value text := lower(tg_op);
  old_relevant boolean := false;
  new_relevant boolean := false;
  change_summary_value text := '';
begin
  if tg_op <> 'INSERT' then
    old_relevant := old.role = 'user'
      and lower(coalesce(old.message_type, '')) <> 'mail'
      and lower(coalesce(old.message_type, '')) not in (
        'opportunity_feedback_note', 'resume_upload_note'
      )
      and btrim(coalesce(old.content, '')) <> '';
  end if;
  if tg_op <> 'DELETE' then
    new_relevant := new.role = 'user'
      and lower(coalesce(new.message_type, '')) <> 'mail'
      and lower(coalesce(new.message_type, '')) not in (
        'opportunity_feedback_note', 'resume_upload_note'
      )
      and btrim(coalesce(new.content, '')) <> '';
  end if;

  if tg_op = 'INSERT' then
    if not new_relevant then return new; end if;
    row_value := new;
    operation_value := 'insert';
  elsif tg_op = 'DELETE' then
    if not old_relevant then return old; end if;
    row_value := old;
    operation_value := 'delete';
  elsif old_relevant and not new_relevant then
    row_value := old;
    operation_value := 'delete';
  elsif not old_relevant and new_relevant then
    row_value := new;
    operation_value := 'insert';
  elsif old_relevant and new_relevant then
    if old.content is not distinct from new.content
       and old.message_type is not distinct from new.message_type
       and old.role is not distinct from new.role then
      return new;
    end if;
    row_value := new;
    operation_value := 'update';
  else
    return new;
  end if;
  change_summary_value := case operation_value
    when 'insert' then 'user message added; text=' || coalesce(row_value.content, '')
    when 'delete' then 'user message deleted; previous text=' || coalesce(row_value.content, '')
    else 'user message edited; previous text=' || coalesce(old.content, '') ||
         '; current text=' || coalesce(new.content, '')
  end;
  perform public.try_enqueue_talent_behavior_context_change(
    row_value.user_id,
    'message',
    row_value.id::text,
    operation_value,
    array['content', 'message_type'],
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5('message|' || row_value.id::text || '|' || operation_value || '|' ||
        coalesce(row_value.content, '') || '|' || coalesce(row_value.message_type, '') ||
        '|txid=' || txid_current()::text),
    change_summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_messages_behavior_context_change on public.talent_messages;
create trigger talent_messages_behavior_context_change
after insert or update or delete on public.talent_messages
for each row execute function public.enqueue_talent_message_behavior_context_change();

create or replace function public.enqueue_career_email_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.career_email_messages;
  operation_value text := lower(tg_op);
  old_relevant boolean := false;
  new_relevant boolean := false;
  change_summary_value text := '';
begin
  if tg_op <> 'INSERT' then
    old_relevant := old.direction = 'inbound'
      and (btrim(coalesce(old.subject, '')) <> '' or btrim(coalesce(old.body_text, '')) <> '');
  end if;
  if tg_op <> 'DELETE' then
    new_relevant := new.direction = 'inbound'
      and (btrim(coalesce(new.subject, '')) <> '' or btrim(coalesce(new.body_text, '')) <> '');
  end if;

  if tg_op = 'INSERT' then
    if not new_relevant then return new; end if;
    row_value := new;
    operation_value := 'insert';
  elsif tg_op = 'DELETE' then
    if not old_relevant then return old; end if;
    row_value := old;
    operation_value := 'delete';
  elsif old_relevant and not new_relevant then
    row_value := old;
    operation_value := 'delete';
  elsif not old_relevant and new_relevant then
    row_value := new;
    operation_value := 'insert';
  elsif old_relevant and new_relevant then
    if old.subject is not distinct from new.subject
       and old.body_text is not distinct from new.body_text
       and old.direction is not distinct from new.direction then
      return new;
    end if;
    row_value := new;
    operation_value := 'update';
  else
    return new;
  end if;
  change_summary_value := case operation_value
    when 'insert' then 'inbound email added; subject=' || coalesce(row_value.subject, '') ||
      '; body=' || coalesce(row_value.body_text, '')
    when 'delete' then 'inbound email deleted; previous subject=' || coalesce(row_value.subject, '') ||
      '; previous body=' || coalesce(row_value.body_text, '')
    else 'inbound email edited; previous subject=' || coalesce(old.subject, '') ||
      '; current subject=' || coalesce(new.subject, '') ||
      '; previous body=' || coalesce(old.body_text, '') ||
      '; current body=' || coalesce(new.body_text, '')
  end;
  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'email',
    row_value.id::text,
    operation_value,
    array['subject', 'body_text'],
    case
      when operation_value = 'insert' then coalesce(row_value.occurred_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5('email|' || row_value.id::text || '|' || operation_value || '|' ||
        coalesce(row_value.subject, '') || '|' || coalesce(row_value.body_text, '') ||
        '|txid=' || txid_current()::text),
    change_summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists career_email_messages_behavior_context_change on public.career_email_messages;
create trigger career_email_messages_behavior_context_change
after insert or update or delete on public.career_email_messages
for each row execute function public.enqueue_career_email_behavior_context_change();

create or replace function public.enqueue_recommendation_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_opportunity_recommendation;
  operation_value text := lower(tg_op);
  fields text[] := '{}';
  change_summary_value text := '';
  role_label_value text := '';
begin
  row_value := case when tg_op = 'DELETE' then old else new end;
  select concat_ws(' - ', nullif(btrim(workspace.company_name), ''), nullif(btrim(role.name), ''))
    into role_label_value
  from public.company_roles role
  left join public.company_workspace workspace
    on workspace.company_workspace_id = role.company_workspace_id
  where role.role_id = row_value.role_id;
  role_label_value := coalesce(
    nullif(role_label_value, ''),
    'role ' || coalesce(row_value.role_id::text, 'unknown')
  );
  if tg_op = 'INSERT' then
    if new.feedback is not null then fields := array_append(fields, 'feedback'); end if;
    if new.feedback_reason is not null then fields := array_append(fields, 'feedback_reason'); end if;
    if new.saved_stage is not null then fields := array_append(fields, 'saved_stage'); end if;
    if new.processed_stage is not null then fields := array_append(fields, 'processed_stage'); end if;
    if new.dismissed_at is not null then fields := array_append(fields, 'dismissed_at'); end if;
    if cardinality(fields) = 0 then return new; end if;
  elsif tg_op = 'UPDATE' then
    if old.feedback is distinct from new.feedback then fields := array_append(fields, 'feedback'); end if;
    if old.feedback_reason is distinct from new.feedback_reason then fields := array_append(fields, 'feedback_reason'); end if;
    if old.saved_stage is distinct from new.saved_stage then fields := array_append(fields, 'saved_stage'); end if;
    if old.processed_stage is distinct from new.processed_stage then fields := array_append(fields, 'processed_stage'); end if;
    if old.dismissed_at is distinct from new.dismissed_at then fields := array_append(fields, 'dismissed_at'); end if;
    if cardinality(fields) = 0 then return new; end if;
  else
    if old.feedback is null and old.feedback_reason is null and old.saved_stage is null
       and old.processed_stage is null and old.dismissed_at is null then
      return old;
    end if;
    fields := array['feedback', 'feedback_reason', 'saved_stage', 'processed_stage', 'dismissed_at'];
  end if;
  change_summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'recommendation response added',
      'role=' || role_label_value,
      'feedback=' || coalesce(new.feedback, 'none'),
      'reason=' || coalesce(new.feedback_reason::text, 'none'),
      'saved_stage=' || coalesce(new.saved_stage, 'none'),
      'processed_stage=' || coalesce(new.processed_stage, 'none'),
      'dismissed=' || (new.dismissed_at is not null)::text
    )
    when 'delete' then concat_ws('; ',
      'recommendation response deleted',
      'role=' || role_label_value,
      'previous feedback=' || coalesce(old.feedback, 'none'),
      'previous reason=' || coalesce(old.feedback_reason::text, 'none'),
      'previous saved_stage=' || coalesce(old.saved_stage, 'none'),
      'previous processed_stage=' || coalesce(old.processed_stage, 'none'),
      'previous dismissed=' || (old.dismissed_at is not null)::text
    )
    else concat_ws('; ',
      'recommendation response edited',
      'role=' || role_label_value,
      case when old.feedback is distinct from new.feedback
        then 'feedback: ' || coalesce(old.feedback, 'none') || ' -> ' || coalesce(new.feedback, 'none') end,
      case when old.feedback_reason is distinct from new.feedback_reason
        then 'reason: ' || coalesce(old.feedback_reason::text, 'none') || ' -> ' ||
             coalesce(new.feedback_reason::text, 'none') end,
      case when old.saved_stage is distinct from new.saved_stage
        then 'saved_stage: ' || coalesce(old.saved_stage, 'none') || ' -> ' || coalesce(new.saved_stage, 'none') end,
      case when old.processed_stage is distinct from new.processed_stage
        then 'processed_stage: ' || coalesce(old.processed_stage, 'none') || ' -> ' || coalesce(new.processed_stage, 'none') end,
      case when old.dismissed_at is distinct from new.dismissed_at
        then 'dismissed: ' || (old.dismissed_at is not null)::text || ' -> ' ||
             (new.dismissed_at is not null)::text end
    )
  end;
  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'recommendation',
    row_value.id::text,
    operation_value,
    fields,
    case
      when operation_value = 'insert' then coalesce(row_value.updated_at, row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5('recommendation|' || row_value.id::text || '|' || operation_value || '|' ||
        coalesce(row_value.feedback, '') || '|' || coalesce(row_value.feedback_reason, '') || '|' ||
        coalesce(row_value.saved_stage, '') || '|' || coalesce(row_value.processed_stage, '') || '|' ||
        coalesce(row_value.dismissed_at::text, '') || '|txid=' || txid_current()::text),
    change_summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_recommendation_behavior_context_change
  on public.talent_opportunity_recommendation;
create trigger talent_recommendation_behavior_context_change
after insert or update or delete on public.talent_opportunity_recommendation
for each row execute function public.enqueue_recommendation_behavior_context_change();

create or replace function public.enqueue_activity_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_activity_events;
  operation_value text := lower(tg_op);
  old_relevant boolean := false;
  new_relevant boolean := false;
  change_summary_value text := '';
begin
  if tg_op <> 'INSERT' then
    old_relevant := lower(coalesce(old.event_type, '')) <> 'opportunity_feedback'
      and not (
        lower(coalesce(old.event_type, '') || ' ' || coalesce(old.summary, '')) ~
        '(typo|profile_ingestion|profile_update|profile_link|resume_ingestion|resume_upload|document_upload|link_sync|metadata|login|file_processing|오타|프로필|이력서|로그인)'
      )
      and (
        lower(coalesce(old.impact_level, '')) in ('medium', 'high')
        or coalesce(old.changed_domains, '{}') && array[
          'career_goal', 'career_goals', 'location', 'relocation', 'role',
          'role_preference', 'company_preference', 'work_mode', 'employment_type',
          'compensation', 'matching', 'recommendation'
        ]::text[]
      );
  end if;
  if tg_op <> 'DELETE' then
    new_relevant := lower(coalesce(new.event_type, '')) <> 'opportunity_feedback'
      and not (
        lower(coalesce(new.event_type, '') || ' ' || coalesce(new.summary, '')) ~
        '(typo|profile_ingestion|profile_update|profile_link|resume_ingestion|resume_upload|document_upload|link_sync|metadata|login|file_processing|오타|프로필|이력서|로그인)'
      )
      and (
        lower(coalesce(new.impact_level, '')) in ('medium', 'high')
        or coalesce(new.changed_domains, '{}') && array[
          'career_goal', 'career_goals', 'location', 'relocation', 'role',
          'role_preference', 'company_preference', 'work_mode', 'employment_type',
          'compensation', 'matching', 'recommendation'
        ]::text[]
      );
  end if;

  if tg_op = 'INSERT' then
    if not new_relevant then return new; end if;
    row_value := new;
    operation_value := 'insert';
  elsif tg_op = 'DELETE' then
    if not old_relevant then return old; end if;
    row_value := old;
    operation_value := 'delete';
  elsif old_relevant and not new_relevant then
    row_value := old;
    operation_value := 'delete';
  elsif not old_relevant and new_relevant then
    row_value := new;
    operation_value := 'insert';
  elsif old_relevant and new_relevant then
    row_value := new;
    operation_value := 'update';
  else
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.event_type is not distinct from new.event_type
     and old.summary is not distinct from new.summary
     and old.impact_level is not distinct from new.impact_level
     and old.changed_domains is not distinct from new.changed_domains then
    return new;
  end if;
  change_summary_value := case operation_value
    when 'insert' then 'meaningful activity added; type=' || coalesce(row_value.event_type, '') ||
      '; impact=' || coalesce(row_value.impact_level, '') ||
      '; domains=' || coalesce(array_to_string(row_value.changed_domains, ','), '') ||
      '; summary=' || coalesce(row_value.summary, '')
    when 'delete' then 'meaningful activity removed; previous type=' || coalesce(row_value.event_type, '') ||
      '; previous impact=' || coalesce(row_value.impact_level, '') ||
      '; previous domains=' || coalesce(array_to_string(row_value.changed_domains, ','), '') ||
      '; previous summary=' || coalesce(row_value.summary, '')
    else 'meaningful activity edited; previous=' || concat_ws(', ',
      old.event_type, old.impact_level, array_to_string(old.changed_domains, ','), old.summary
    ) || '; current=' || concat_ws(', ',
      new.event_type, new.impact_level, array_to_string(new.changed_domains, ','), new.summary
    )
  end;
  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'activity',
    row_value.id::text,
    operation_value,
    array['event_type', 'summary', 'impact_level', 'changed_domains'],
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5('activity|' || row_value.id::text || '|' || operation_value || '|' ||
        coalesce(row_value.event_type, '') || '|' || coalesce(row_value.summary, '') || '|' ||
        coalesce(row_value.impact_level, '') || '|' || coalesce(array_to_string(row_value.changed_domains, ','), '') ||
        '|txid=' || txid_current()::text),
    change_summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_activity_events_behavior_context_change
  on public.talent_activity_events;
create trigger talent_activity_events_behavior_context_change
after insert or update or delete on public.talent_activity_events
for each row execute function public.enqueue_activity_behavior_context_change();

alter table public.opportunity_discovery_run
  add column if not exists context_variant text not null default 'legacy',
  add column if not exists behavior_context_version bigint,
  add column if not exists context_metrics jsonb not null default '{}'::jsonb,
  add column if not exists elapsed_seconds numeric;

alter table public.talent_external_fit
  add column if not exists behavior_context_version bigint;
