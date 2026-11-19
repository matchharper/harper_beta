-- A matching note is the one running record of a search. Harper writes its
-- thinking; the server adds what was actually done and how the user reacted.
alter table public.talent_matching_note_entries
  add column kind text not null default 'harper',
  add column created_at timestamptz not null default now(),
  -- Consecutive steps of one working session share an entry until Harper adds a thought.
  add column group_key text;

drop function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint);
create function public.read_career_matching_note(
  p_talent uuid, p_matching uuid, p_before bigint default null, p_limit integer default 30,
  p_entry bigint default null, p_offset integer default 0, p_expected_revision bigint default null
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_revision bigint;
  v_entries jsonb := '[]';
  v_next_before bigint;
  v_last bigint;
  v_count integer := 0;
  -- A page of 30 entries fits the initial Career context. Long text stays
  -- addressable by number with a separate single-entry read.
  v_limit integer := least(p_limit, 30);
  v_width integer := case when p_entry is null then 1000 else 4000 end;
  v_offset integer := coalesce(p_offset, 0);
  v_entry record;
begin
  select coalesce(n.revision, 0) into v_revision
  from public.talent_matchings m
  join public.talent_users u on u.user_id = m.talent_id and u.deleted_at is null
  left join public.talent_matching_notes n on n.matching_id = m.id
  where m.id = p_matching and m.talent_id = p_talent;
  if not found then raise exception 'Matching is unavailable.'; end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'Matching note changed (expected revision %, current revision %). Read the affected entries again.', p_expected_revision, v_revision;
  end if;
  if p_limit is null or p_limit < 1 or v_offset < 0 or p_before < 0 or p_entry < 0 then
    raise exception 'Use a positive page size and nonnegative note numbers and offsets.';
  end if;
  if p_before is not null and p_entry is not null then
    raise exception 'Choose a page before a number or read an individual entry.';
  end if;
  if v_offset > 0 and (p_entry is null or p_expected_revision is null) then
    raise exception 'Continue a long entry with its number, next offset and expectedNoteRevision.';
  end if;

  for v_entry in
    select e.number, e.kind, e.created_at, substr(e.body, v_offset + 1, v_width + 1) as excerpt
    from public.talent_matching_note_entries e
    where e.matching_id = p_matching and (p_entry is null or e.number = p_entry)
      and (p_before is null or e.number < p_before)
    order by e.number desc limit v_limit + 1
  loop
    if v_count = v_limit then
      v_next_before := v_last;
      exit;
    end if;
    v_count := v_count + 1;
    v_last := v_entry.number;
    v_entries := v_entries || jsonb_build_object(
      'number', v_entry.number, 'kind', v_entry.kind, 'createdAt', v_entry.created_at,
      'text', left(v_entry.excerpt, v_width),
      'nextOffset', case when length(v_entry.excerpt) > v_width then v_offset + v_width end
    );
  end loop;
  if p_entry is not null and v_count = 0 then
    raise exception 'Matching note entry [%] is unavailable.', p_entry;
  end if;
  return jsonb_build_object('matchingId', p_matching, 'revision', v_revision, 'entries', v_entries, 'nextBefore', v_next_before);
end $$;

-- Harper may rewrite any entry, including recorded steps it summarizes. The
-- underlying search receipts and recommendation rows remain the source facts.
create or replace function public.edit_career_matching_note(
  p_talent uuid, p_matching uuid, p_operation text, p_edits jsonb, p_expected_revision bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_note public.talent_matching_notes;
  v_previous public.talent_matching_operations;
  v_command jsonb;
  v_edit jsonb;
  v_action text;
  v_number bigint;
  v_changes jsonb := '[]';
  v_receipt jsonb;
begin
  if nullif(btrim(p_operation), '') is null then raise exception 'Missing note operation identity.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('career-matching:' || p_talent::text, 0));
  perform 1 from public.talent_matchings m
    join public.talent_users u on u.user_id = m.talent_id and u.deleted_at is null
    where m.id = p_matching and m.talent_id = p_talent for key share of m;
  if not found then raise exception 'Matching is unavailable.'; end if;
  v_command := jsonb_build_object('action', 'edit_note', 'matchingId', p_matching,
    'digest', encode(sha256(convert_to(jsonb_build_array(p_expected_revision, p_edits)::text, 'UTF8')), 'hex'));
  select * into v_previous from public.talent_matching_operations where talent_id = p_talent and operation_id = p_operation;
  if found then
    if v_previous.command <> v_command then raise exception 'Operation identity reused with different command.'; end if;
    return v_previous.result;
  end if;
  if jsonb_typeof(p_edits) is distinct from 'array' or p_edits = '[]'::jsonb then
    raise exception 'Supply at least one note edit.';
  end if;
  insert into public.talent_matching_notes(matching_id) values (p_matching) on conflict do nothing;
  select * into strict v_note from public.talent_matching_notes where matching_id = p_matching for update;
  if p_expected_revision is not null and v_note.revision <> p_expected_revision then
    raise exception 'Matching note changed (expected revision %, current revision %). Read the affected entries again.', p_expected_revision, v_note.revision;
  end if;

  for v_edit in select value from jsonb_array_elements(p_edits) loop
    v_action := v_edit->>'action';
    if v_action in ('add', 'update') and
       (jsonb_typeof(v_edit->'text') is distinct from 'string' or btrim(v_edit->>'text') = '') then
      raise exception 'Supply the sentence text to add or update.';
    end if;
    if v_action = 'add' then
      v_number := v_note.next_number;
      insert into public.talent_matching_note_entries(matching_id, number, body)
        values (p_matching, v_number, v_edit->>'text');
      v_note.next_number := v_number + 1;
    elsif v_action in ('update', 'delete') then
      if p_expected_revision is null then
        raise exception 'Read the matching note and supply expectedNoteRevision to update or delete numbered entries.';
      end if;
      v_number := (v_edit->>'number')::bigint;
      if v_number is null or v_number < 0 then raise exception 'Supply a nonnegative note entry number.'; end if;
      if v_action = 'update' then
        update public.talent_matching_note_entries set body = v_edit->>'text', kind = 'harper', group_key = null
          where matching_id = p_matching and number = v_number;
      else
        delete from public.talent_matching_note_entries where matching_id = p_matching and number = v_number;
      end if;
      if not found then raise exception 'Matching note entry [%] is unavailable.', v_number; end if;
    else
      raise exception 'Unknown matching note edit.';
    end if;
    v_changes := v_changes || jsonb_build_object('action', v_action, 'number', v_number);
  end loop;
  update public.talent_matching_notes set revision = v_note.revision + 1, next_number = v_note.next_number
    where matching_id = p_matching;
  v_receipt := jsonb_build_object('matchingId', p_matching, 'revision', v_note.revision + 1, 'changes', v_changes);
  insert into public.talent_matching_operations(talent_id, operation_id, command, result)
    values (p_talent, p_operation, v_command, v_receipt);
  return v_receipt;
end $$;

-- Server-recorded facts: one executed step ('activity') or a user reaction ('user').
-- A retried step with the same operation identity is recorded once. Steps of the
-- same session (p_group) extend the latest entry unless the step carries Harper's
-- own thought, which starts a new entry that later steps of the burst join.
create function public.append_career_matching_note_v1(
  p_talent uuid, p_matching uuid, p_operation text, p_kind text, p_body text,
  p_group text default null, p_new_entry boolean default false
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  v_number bigint;
  v_previous public.talent_matching_operations;
  v_latest public.talent_matching_note_entries;
begin
  if p_kind not in ('activity', 'user') or nullif(btrim(p_body), '') is null then
    raise exception 'Supply a recorded note kind and text.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('career-matching:' || p_talent::text, 0));
  perform 1 from public.talent_matchings m
    join public.talent_users u on u.user_id = m.talent_id and u.deleted_at is null
    where m.id = p_matching and m.talent_id = p_talent for key share of m;
  if not found then raise exception 'Matching is unavailable.'; end if;
  if p_operation is not null then
    select * into v_previous from public.talent_matching_operations where talent_id = p_talent and operation_id = p_operation;
    if found then return (v_previous.result->>'number')::bigint; end if;
  end if;
  insert into public.talent_matching_notes(matching_id) values (p_matching) on conflict do nothing;
  if p_group is not null and p_kind = 'activity' and not p_new_entry then
    select * into v_latest from public.talent_matching_note_entries
      where matching_id = p_matching order by number desc limit 1;
  end if;
  if v_latest.number is not null and v_latest.kind = 'activity' and v_latest.group_key = p_group then
    v_number := v_latest.number;
    update public.talent_matching_note_entries set body = body || E'\n' || p_body
      where matching_id = p_matching and number = v_number;
  else
    -- Appending changes no existing entry, so Harper's expectedNoteRevision for
    -- rewriting or deleting earlier entries stays valid while steps are recorded.
    update public.talent_matching_notes set next_number = next_number + 1
      where matching_id = p_matching returning next_number - 1 into v_number;
    insert into public.talent_matching_note_entries(matching_id, number, body, kind, group_key)
      values (p_matching, v_number, p_body, p_kind, p_group);
  end if;
  if p_operation is not null then
    insert into public.talent_matching_operations(talent_id, operation_id, command, result)
      values (p_talent, p_operation, jsonb_build_object('action', 'append_note', 'matchingId', p_matching),
        jsonb_build_object('number', v_number));
  end if;
  return v_number;
end $$;

-- Reactions arrive through UI buttons, email and tools; record them where the
-- recommendation was made so the next search reads them beside its reasoning.
create function public.record_career_matching_feedback_note() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_matching uuid;
  v_label text;
  v_change text;
begin
  if new.feedback is not distinct from old.feedback and new.saved_stage is not distinct from old.saved_stage then
    return new;
  end if;
  -- A Harper-connected company can be confidential; name only public employers.
  select coalesce(nullif(btrim(r.name), ''), 'role') || case when r.source_type = 'internal' then ' (Harper-connected role)'
      else coalesce(' at ' || nullif(btrim(w.company_name), ''), '') end
    into v_label
  from public.company_roles r left join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
  where r.role_id = new.role_id;
  v_change := concat_ws('; ',
    case when new.feedback is distinct from old.feedback then
      case new.feedback
        when 'like' then 'liked' when 'positive' then 'liked'
        when 'dislike' then 'disliked' when 'negative' then 'disliked'
        when 'keep' then 'kept for later'
        else 'cleared their reaction' end
    end,
    case when new.saved_stage is distinct from old.saved_stage and new.saved_stage is not null then 'marked ' || new.saved_stage end);
  if nullif(v_change, '') is null and new.feedback_reason is not distinct from old.feedback_reason then return new; end if;
  v_change := coalesce(nullif(v_change, ''), 'gave a reason for') || ' ' || coalesce(v_label, new.role_id::text)
    || case when new.feedback_reason is distinct from old.feedback_reason and nullif(btrim(new.feedback_reason), '') is not null
      then ' (reason: ' || new.feedback_reason || ')' else '' end;
  for v_matching in
    select distinct m.matching_id from public.talent_opportunity_memberships m
    where m.talent_id = new.talent_id and m.role_id = new.role_id and m.matching_id is not null
  loop
    perform public.append_career_matching_note_v1(new.talent_id, v_matching, null, 'user', 'User ' || v_change || '.');
  end loop;
  return new;
end $$;
create trigger record_career_matching_feedback_note after update of feedback, saved_stage, feedback_reason
  on public.talent_opportunity_recommendation for each row execute function public.record_career_matching_feedback_note();

revoke all on function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint),
  public.append_career_matching_note_v1(uuid, uuid, text, text, text, text, boolean),
  public.record_career_matching_feedback_note() from public, anon, authenticated;
grant execute on function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint),
  public.append_career_matching_note_v1(uuid, uuid, text, text, text, text, boolean) to service_role;
