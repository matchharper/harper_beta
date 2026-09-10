-- Feed the worker-only derived Behavior Context from the authoritative Brief/Memory
-- store and internal opportunity process history. The database records source
-- changes only; an LLM decides whether they alter a reusable behavioral inference.

-- A previous rollout copied the legacy, inferred Behavior document into Memory.
-- Those rows are identifiable by provenance and are not grounded user facts. Soft
-- delete them (the original Behavior row remains available for audit/rollback) so
-- the new builder cannot learn recursively from its own old inference.
update public.talent_contexts
set deleted_at = coalesce(deleted_at, timezone('utc', now())),
    revision = revision + 1,
    embedding = null,
    embedding_model = null,
    embedding_content_hash = null,
    embedding_updated_at = null,
    updated_at = timezone('utc', now())
where collection = 'memory'
  and deleted_at is null
  and source_refs @> '[{"type":"talent_behavior_context_migration"}]'::jsonb;

create or replace function public.enqueue_talent_context_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_contexts;
  operation_value text;
  fields text[] := '{}';
  summary_value text;
begin
  if tg_op = 'UPDATE' then
    if old.collection is not distinct from new.collection
       and old.label is not distinct from new.label
       and old.key is not distinct from new.key
       and old.content is not distinct from new.content
       and old.importance is not distinct from new.importance
       and old.deleted_at is not distinct from new.deleted_at then
      return new;
    end if;
  end if;

  row_value := case when tg_op = 'DELETE' then old else new end;
  operation_value := case
    when tg_op = 'DELETE' then 'delete'
    when tg_op = 'INSERT' and new.deleted_at is not null then 'delete'
    when tg_op = 'INSERT' then 'insert'
    when old.deleted_at is null and new.deleted_at is not null then 'delete'
    when old.deleted_at is not null and new.deleted_at is null then 'insert'
    else 'update'
  end;

  if tg_op = 'INSERT' then
    fields := array['collection', 'label', 'content', 'importance'];
  elsif tg_op = 'DELETE' then
    fields := array['collection', 'label', 'content', 'importance', 'deleted_at'];
  else
    if old.collection is distinct from new.collection then
      fields := array_append(fields, 'collection');
    end if;
    if old.label is distinct from new.label then
      fields := array_append(fields, 'label');
    end if;
    if old.content is distinct from new.content then
      fields := array_append(fields, 'content');
    end if;
    if old.importance is distinct from new.importance then
      fields := array_append(fields, 'importance');
    end if;
    if old.deleted_at is distinct from new.deleted_at then
      fields := array_append(fields, 'deleted_at');
    end if;
  end if;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'grounded context added',
      'collection=' || coalesce(row_value.collection, ''),
      'ref=' || coalesce(row_value.ref::text, ''),
      case when row_value.label is not null then 'label=' || left(row_value.label, 240) end,
      'content=' || left(coalesce(row_value.content, ''), 1600),
      case when row_value.importance is not null then 'importance=' || row_value.importance::text end
    )
    when 'delete' then concat_ws('; ',
      'grounded context withdrawn',
      'collection=' || coalesce(row_value.collection, ''),
      'ref=' || coalesce(row_value.ref::text, ''),
      case when row_value.label is not null then 'label=' || left(row_value.label, 240) end,
      'previous content=' || left(coalesce(row_value.content, ''), 1600)
    )
    else concat_ws('; ',
      'grounded context edited',
      'collection=' || coalesce(new.collection, ''),
      'ref=' || coalesce(new.ref::text, ''),
      case when old.label is distinct from new.label
        then 'label: ' || left(coalesce(old.label, ''), 240) || ' -> ' || left(coalesce(new.label, ''), 240) end,
      case when old.content is distinct from new.content
        then 'content: ' || left(coalesce(old.content, ''), 1200) || ' -> ' || left(coalesce(new.content, ''), 1200) end,
      case when old.importance is distinct from new.importance
        then 'importance: ' || coalesce(old.importance::text, '') || ' -> ' || coalesce(new.importance::text, '') end
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'talent_context',
    row_value.id::text,
    operation_value,
    fields,
    timezone('utc', now()),
    md5(
      'talent_context|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.revision::text, '') || '|' ||
      coalesce(row_value.deleted_at::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_contexts_behavior_context_change
  on public.talent_contexts;
create trigger talent_contexts_behavior_context_change
after insert or update or delete on public.talent_contexts
for each row execute function public.enqueue_talent_context_behavior_context_change();

create or replace function public.enqueue_opportunity_tag_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_opportunity_tag;
  operation_value text := lower(tg_op);
  role_label_value text := '';
  summary_value text;
begin
  if tg_op = 'UPDATE' then
    if old.talent_id is not distinct from new.talent_id
       and old.opportunity_id is not distinct from new.opportunity_id
       and old.tag is not distinct from new.tag then
      return new;
    end if;
  end if;

  row_value := case when tg_op = 'DELETE' then old else new end;
  select concat_ws(' - ',
           nullif(btrim(coalesce(workspace.published_name, workspace.company_name)), ''),
           nullif(btrim(role.name), '')
         )
    into role_label_value
  from public.company_roles role
  left join public.company_workspace workspace
    on workspace.company_workspace_id = role.company_workspace_id
  where role.role_id = row_value.opportunity_id;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'opportunity process tag added',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'tag=' || coalesce(row_value.tag, '')
    )
    when 'delete' then concat_ws('; ',
      'opportunity process tag removed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'previous tag=' || coalesce(row_value.tag, '')
    )
    else concat_ws('; ',
      'opportunity process tag edited',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'tag: ' || coalesce(old.tag, '') || ' -> ' || coalesce(new.tag, '')
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'opportunity_tag',
    row_value.id::text,
    operation_value,
    array['tag', 'opportunity_id'],
    timezone('utc', now()),
    md5(
      'opportunity_tag|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.tag, '') || '|' || coalesce(row_value.opportunity_id::text, '') ||
      '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_opportunity_tag_behavior_context_change
  on public.talent_opportunity_tag;
create trigger talent_opportunity_tag_behavior_context_change
after insert or update or delete on public.talent_opportunity_tag
for each row execute function public.enqueue_opportunity_tag_behavior_context_change();

-- The unified-memory migration temporarily retired the old source triggers. Turn
-- the grounded message/email streams back on and upgrade recommendation/activity
-- capture. These functions record source changes; they do not classify preference
-- meaning with keywords or heuristic scores.
drop trigger if exists talent_messages_behavior_context_change
  on public.talent_messages;
create trigger talent_messages_behavior_context_change
after insert or update or delete on public.talent_messages
for each row execute function public.enqueue_talent_message_behavior_context_change();

drop trigger if exists career_email_messages_behavior_context_change
  on public.career_email_messages;
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
  old_recorded boolean := false;
  new_recorded boolean := false;
  role_label_value text := '';
  summary_value text;
begin
  if tg_op <> 'INSERT' then
    old_recorded := old.feedback is not null
      or old.feedback_reason is not null
      or old.saved_stage is not null
      or old.processed_stage is not null
      or old.viewed_at is not null
      or old.clicked_at is not null
      or old.dismissed_at is not null;
  end if;
  if tg_op <> 'DELETE' then
    new_recorded := new.feedback is not null
      or new.feedback_reason is not null
      or new.saved_stage is not null
      or new.processed_stage is not null
      or new.viewed_at is not null
      or new.clicked_at is not null
      or new.dismissed_at is not null;
  end if;

  if tg_op = 'INSERT' then
    if not new_recorded then return new; end if;
    row_value := new;
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'processed_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif tg_op = 'DELETE' then
    if not old_recorded then return old; end if;
    row_value := old;
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'processed_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif old_recorded and not new_recorded then
    row_value := old;
    operation_value := 'delete';
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'processed_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif not old_recorded and new_recorded then
    row_value := new;
    operation_value := 'insert';
    fields := array[
      'role_id', 'feedback', 'feedback_reason',
      'saved_stage', 'processed_stage', 'viewed_at', 'clicked_at', 'dismissed_at'
    ];
  elsif old_recorded and new_recorded then
    row_value := new;
    if old.role_id is distinct from new.role_id then fields := array_append(fields, 'role_id'); end if;
    if old.feedback is distinct from new.feedback then fields := array_append(fields, 'feedback'); end if;
    if old.feedback_reason is distinct from new.feedback_reason then fields := array_append(fields, 'feedback_reason'); end if;
    if old.saved_stage is distinct from new.saved_stage then fields := array_append(fields, 'saved_stage'); end if;
    if old.processed_stage is distinct from new.processed_stage then fields := array_append(fields, 'processed_stage'); end if;
    if old.viewed_at is distinct from new.viewed_at then fields := array_append(fields, 'viewed_at'); end if;
    if old.clicked_at is distinct from new.clicked_at then fields := array_append(fields, 'clicked_at'); end if;
    if old.dismissed_at is distinct from new.dismissed_at then fields := array_append(fields, 'dismissed_at'); end if;
    if cardinality(fields) = 0 then return new; end if;
  else
    return new;
  end if;

  select concat_ws(' - ',
           nullif(btrim(coalesce(workspace.published_name, workspace.company_name)), ''),
           nullif(btrim(role.name), '')
         )
    into role_label_value
  from public.company_roles role
  left join public.company_workspace workspace
    on workspace.company_workspace_id = role.company_workspace_id
  where role.role_id = row_value.role_id;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'recommendation recorded',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'feedback=' || coalesce(row_value.feedback, 'none'),
      'reason=' || coalesce(row_value.feedback_reason::text, 'none'),
      'saved_stage=' || coalesce(row_value.saved_stage, 'none'),
      'processed_stage=' || coalesce(row_value.processed_stage, 'none'),
      'viewed=' || (row_value.viewed_at is not null)::text,
      'clicked=' || (row_value.clicked_at is not null)::text,
      'dismissed=' || (row_value.dismissed_at is not null)::text
    )
    when 'delete' then concat_ws('; ',
      'recommendation removed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'previous feedback=' || coalesce(row_value.feedback, 'none'),
      'previous reason=' || coalesce(row_value.feedback_reason::text, 'none'),
      'previous saved_stage=' || coalesce(row_value.saved_stage, 'none'),
      'previous processed_stage=' || coalesce(row_value.processed_stage, 'none')
    )
    else concat_ws('; ',
      'recommendation changed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'fields=' || array_to_string(fields, ','),
      'feedback=' || coalesce(new.feedback, 'none'),
      'reason=' || coalesce(new.feedback_reason::text, 'none'),
      'saved_stage=' || coalesce(new.saved_stage, 'none'),
      'processed_stage=' || coalesce(new.processed_stage, 'none'),
      'viewed=' || (new.viewed_at is not null)::text,
      'clicked=' || (new.clicked_at is not null)::text,
      'dismissed=' || (new.dismissed_at is not null)::text
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'recommendation',
    row_value.id::text,
    operation_value,
    fields,
    case
      when tg_op = 'INSERT'
        then coalesce(row_value.recommended_at, row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'recommendation|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.role_id::text, '') || '|' || coalesce(row_value.recommended_at::text, '') || '|' ||
      coalesce(row_value.feedback, '') || '|' || coalesce(row_value.feedback_reason::text, '') || '|' ||
      coalesce(row_value.saved_stage, '') || '|' || coalesce(row_value.processed_stage, '') || '|' ||
      coalesce(row_value.viewed_at::text, '') || '|' || coalesce(row_value.clicked_at::text, '') || '|' ||
      coalesce(row_value.dismissed_at::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
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
  old_recorded boolean := false;
  new_recorded boolean := false;
  summary_value text;
begin
  if tg_op <> 'INSERT' then
    old_recorded := lower(coalesce(old.event_type, '')) <> 'opportunity_feedback'
      and btrim(coalesce(old.summary, '')) <> '';
  end if;
  if tg_op <> 'DELETE' then
    new_recorded := lower(coalesce(new.event_type, '')) <> 'opportunity_feedback'
      and btrim(coalesce(new.summary, '')) <> '';
  end if;

  if tg_op = 'INSERT' then
    if not new_recorded then return new; end if;
    row_value := new;
    operation_value := 'insert';
  elsif tg_op = 'DELETE' then
    if not old_recorded then return old; end if;
    row_value := old;
    operation_value := 'delete';
  elsif old_recorded and not new_recorded then
    row_value := old;
    operation_value := 'delete';
  elsif not old_recorded and new_recorded then
    row_value := new;
    operation_value := 'insert';
  elsif old_recorded and new_recorded then
    if old.event_type is not distinct from new.event_type
       and old.summary is not distinct from new.summary
       and old.impact_level is not distinct from new.impact_level
       and old.changed_domains is not distinct from new.changed_domains
       and old.message_id is not distinct from new.message_id then
      return new;
    end if;
    row_value := new;
    operation_value := 'update';
  else
    return new;
  end if;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'activity recorded',
      'type=' || coalesce(row_value.event_type, ''),
      'impact=' || coalesce(row_value.impact_level, ''),
      'domains=' || coalesce(array_to_string(row_value.changed_domains, ','), ''),
      'summary=' || left(coalesce(row_value.summary, ''), 1600)
    )
    when 'delete' then concat_ws('; ',
      'activity removed',
      'previous type=' || coalesce(row_value.event_type, ''),
      'previous summary=' || left(coalesce(row_value.summary, ''), 1600)
    )
    else concat_ws('; ',
      'activity changed',
      'type=' || coalesce(new.event_type, ''),
      'impact=' || coalesce(new.impact_level, ''),
      'domains=' || coalesce(array_to_string(new.changed_domains, ','), ''),
      'summary=' || left(coalesce(new.summary, ''), 1600)
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'activity',
    row_value.id::text,
    operation_value,
    array['event_type', 'summary', 'impact_level', 'changed_domains', 'message_id'],
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'activity|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.event_type, '') || '|' || coalesce(row_value.summary, '') || '|' ||
      coalesce(row_value.impact_level, '') || '|' || coalesce(array_to_string(row_value.changed_domains, ','), '') || '|' ||
      coalesce(row_value.message_id::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_activity_events_behavior_context_change
  on public.talent_activity_events;
create trigger talent_activity_events_behavior_context_change
after insert or update or delete on public.talent_activity_events
for each row execute function public.enqueue_activity_behavior_context_change();

create or replace function public.enqueue_talent_progress_behavior_context_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value public.talent_progress;
  operation_value text := lower(tg_op);
  fields text[] := '{}';
  role_label_value text := '';
  summary_value text;
begin
  row_value := case when tg_op = 'DELETE' then old else new end;

  if tg_op = 'INSERT' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  elsif tg_op = 'DELETE' then
    fields := array['kind', 'text', 'metadata', 'role_id', 'recommendation_id'];
  else
    if old.kind is distinct from new.kind then fields := array_append(fields, 'kind'); end if;
    if old.text is distinct from new.text then fields := array_append(fields, 'text'); end if;
    if old.metadata is distinct from new.metadata then fields := array_append(fields, 'metadata'); end if;
    if old.role_id is distinct from new.role_id then fields := array_append(fields, 'role_id'); end if;
    if old.recommendation_id is distinct from new.recommendation_id then fields := array_append(fields, 'recommendation_id'); end if;
    if cardinality(fields) = 0 then return new; end if;
  end if;

  select concat_ws(' - ',
           nullif(btrim(coalesce(workspace.published_name, workspace.company_name)), ''),
           nullif(btrim(role.name), '')
         )
    into role_label_value
  from public.company_roles role
  left join public.company_workspace workspace
    on workspace.company_workspace_id = role.company_workspace_id
  where role.role_id = row_value.role_id;

  summary_value := case operation_value
    when 'insert' then concat_ws('; ',
      'opportunity progress recorded',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'kind=' || coalesce(row_value.kind, ''),
      'text=' || left(coalesce(row_value.text, ''), 1600),
      'metadata=' || left(coalesce(row_value.metadata::text, '{}'), 1600)
    )
    when 'delete' then concat_ws('; ',
      'opportunity progress removed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'previous kind=' || coalesce(row_value.kind, ''),
      'previous text=' || left(coalesce(row_value.text, ''), 1600),
      'previous metadata=' || left(coalesce(row_value.metadata::text, '{}'), 1600)
    )
    else concat_ws('; ',
      'opportunity progress changed',
      case when role_label_value <> '' then 'role=' || role_label_value end,
      'fields=' || array_to_string(fields, ','),
      case when old.kind is distinct from new.kind
        then 'kind: ' || coalesce(old.kind, '') || ' -> ' || coalesce(new.kind, '') end,
      case when old.text is distinct from new.text
        then 'text: ' || left(coalesce(old.text, ''), 1200) || ' -> ' || left(coalesce(new.text, ''), 1200) end,
      case when old.metadata is distinct from new.metadata
        then 'metadata: ' || left(coalesce(old.metadata::text, '{}'), 1200) || ' -> ' || left(coalesce(new.metadata::text, '{}'), 1200) end
    )
  end;

  perform public.try_enqueue_talent_behavior_context_change(
    row_value.talent_id,
    'progress',
    row_value.id::text,
    operation_value,
    fields,
    case
      when operation_value = 'insert' then coalesce(row_value.created_at, timezone('utc', now()))
      else timezone('utc', now())
    end,
    md5(
      'progress|' || row_value.id::text || '|' || operation_value || '|' ||
      coalesce(row_value.kind, '') || '|' || coalesce(row_value.text, '') || '|' ||
      coalesce(row_value.metadata::text, '') || '|' || coalesce(row_value.role_id::text, '') || '|' ||
      coalesce(row_value.recommendation_id::text, '') || '|txid=' || txid_current()::text
    ),
    summary_value
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists talent_progress_behavior_context_change
  on public.talent_progress;
create trigger talent_progress_behavior_context_change
after insert or update or delete on public.talent_progress
for each row execute function public.enqueue_talent_progress_behavior_context_change();

alter table public.opportunity_discovery_run
  alter column context_variant set default 'talent_contexts';
