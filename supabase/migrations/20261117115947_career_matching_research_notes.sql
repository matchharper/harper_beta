-- Keep private note writes independent of matching metadata and its cache trigger.
create table public.talent_matching_notes (
  matching_id uuid primary key references public.talent_matchings(id) on delete cascade,
  revision bigint not null default 0,
  next_number bigint not null default 0
);

create table public.talent_matching_note_entries (
  matching_id uuid not null references public.talent_matching_notes(matching_id) on delete cascade,
  number bigint not null,
  body text not null,
  primary key (matching_id, number)
);

-- Keyset reads should visit the explicitly linked operations of one matching.
create index talent_matching_research_activity on public.talent_external_operations
  (user_id, (request->>'matchingId'), created_at desc, id desc)
  where request->>'matchingId' is not null and kind in ('resource_search','resource_research','resource_evaluation');

alter table public.talent_matching_notes enable row level security;
alter table public.talent_matching_note_entries enable row level security;
revoke all on public.talent_matching_notes, public.talent_matching_note_entries from public, anon, authenticated;
grant select, insert, update, delete on public.talent_matching_notes, public.talent_matching_note_entries to service_role;

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
  -- A page of 30 short entries fits the initial Career context. Long text stays
  -- addressable by number with a separate single-entry read.
  v_limit integer := least(p_limit, 30);
  v_width integer := case when p_entry is null then 320 else 4000 end;
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
    select e.number, substr(e.body, v_offset + 1, v_width + 1) as excerpt
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
      'number', v_entry.number, 'text', left(v_entry.excerpt, v_width),
      'nextOffset', case when length(v_entry.excerpt) > v_width then v_offset + v_width end
    );
  end loop;
  if p_entry is not null and v_count = 0 then
    raise exception 'Matching note entry [%] is unavailable.', p_entry;
  end if;
  return jsonb_build_object('matchingId', p_matching, 'revision', v_revision, 'entries', v_entries, 'nextBefore', v_next_before);
end $$;

create function public.edit_career_matching_note(
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
  -- Other matching executors share this operation log and acquire this owner lock.
  perform pg_advisory_xact_lock(hashtextextended('career-matching:' || p_talent::text, 0));
  perform 1 from public.talent_matchings m
    join public.talent_users u on u.user_id = m.talent_id and u.deleted_at is null
    where m.id = p_matching and m.talent_id = p_talent for key share of m;
  if not found then raise exception 'Matching is unavailable.'; end if;
  -- The receipt can identify a retry without retaining old private sentence text.
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
        update public.talent_matching_note_entries set body = v_edit->>'text' where matching_id = p_matching and number = v_number;
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

revoke all on function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint),
  public.edit_career_matching_note(uuid, uuid, text, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint),
  public.edit_career_matching_note(uuid, uuid, text, jsonb, bigint) to service_role;
