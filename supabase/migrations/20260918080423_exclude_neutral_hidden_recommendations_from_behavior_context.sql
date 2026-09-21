-- `saved_stage = hidden` with no feedback is an administrative/list-cleanup
-- state, not a talent preference. It remains in the recommendation table for
-- duplicate suppression and the hidden history view, but must not become
-- Behavior Context source evidence.
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
  -- Do not enqueue a change solely because a no-feedback recommendation was
  -- hidden. This is the exact neutral state used for expired/kept postings.
  if tg_op <> 'DELETE'
     and new.feedback is null
     and new.saved_stage = 'hidden' then
    return new;
  end if;

  if tg_op <> 'INSERT' then
    old_recorded := not (
      old.feedback is null
      and old.saved_stage = 'hidden'
    ) and (
      old.feedback is not null
      or old.feedback_reason is not null
      or old.saved_stage is not null
      or old.processed_stage is not null
      or old.viewed_at is not null
      or old.clicked_at is not null
      or old.dismissed_at is not null
    );
  end if;
  if tg_op <> 'DELETE' then
    new_recorded := not (
      new.feedback is null
      and new.saved_stage = 'hidden'
    ) and (
      new.feedback is not null
      or new.feedback_reason is not null
      or new.saved_stage is not null
      or new.processed_stage is not null
      or new.viewed_at is not null
      or new.clicked_at is not null
      or new.dismissed_at is not null
    );
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
