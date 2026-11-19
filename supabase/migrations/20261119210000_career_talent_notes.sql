-- Harper's notes: one place for what Harper thought and did across explorations,
-- applications and connections. Server facts stay in receipts and recommendations.
-- Replaces the per-matching research note (docs/career-agent-harness-ko.md 4.1).
create table public.talent_notes (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  kind text not null,
  title text not null,
  content text not null default '',
  matching_id uuid references public.talent_matchings(id) on delete set null,
  company_workspace_id uuid references public.company_workspace(company_workspace_id) on delete set null,
  -- Connected sources read in the conversation that wrote the note. Disconnecting
  -- the source removes the note; nothing else reads these references.
  source_refs jsonb not null default '[]',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index talent_notes_recent on public.talent_notes(talent_id, updated_at desc, id);
create index talent_notes_matching on public.talent_notes(matching_id, updated_at desc) where matching_id is not null;
create index talent_notes_company on public.talent_notes(talent_id, company_workspace_id) where company_workspace_id is not null;

alter table public.talent_notes enable row level security;
revoke all on public.talent_notes from public, anon, authenticated;
grant select, insert, update, delete on public.talent_notes to service_role;

-- Create, edit or delete one note. Appending and replacing one exact passage keep
-- the rest of a long note; a whole rewrite needs the revision it was read at.
create function public.write_career_note_v1(
  p_talent uuid, p_note uuid, p_action text, p_expected_revision bigint default null,
  p_kind text default null, p_title text default null, p_content text default null,
  p_append text default null, p_replace_old text default null, p_replace_new text default null,
  p_matching uuid default null, p_company uuid default null, p_source_refs jsonb default '[]'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_note public.talent_notes;
  v_content text;
  v_count integer;
begin
  perform 1 from public.talent_users where user_id = p_talent and deleted_at is null for share;
  if not found then raise exception 'This account is unavailable.'; end if;
  if p_matching is not null then
    perform 1 from public.talent_matchings where id = p_matching and talent_id = p_talent;
    if not found then raise exception 'Matching % is unavailable.', p_matching; end if;
  end if;
  if p_company is not null then
    perform 1 from public.company_workspace where company_workspace_id = p_company;
    if not found then raise exception 'Company % is unavailable.', p_company; end if;
  end if;

  if p_action = 'create' then
    if p_kind not in ('think', 'work') then raise exception 'Choose kind think or work.'; end if;
    if nullif(btrim(coalesce(p_title, '')), '') is null then raise exception 'Give the note a title.'; end if;
    insert into public.talent_notes(talent_id, kind, title, content, matching_id, company_workspace_id, source_refs)
    values (p_talent, p_kind, btrim(p_title), coalesce(p_content, ''), p_matching, p_company, coalesce(p_source_refs, '[]'))
    returning * into v_note;
    return to_jsonb(v_note) - 'source_refs';
  end if;

  select * into v_note from public.talent_notes where id = p_note and talent_id = p_talent for update;
  if not found then raise exception 'Note % is unavailable.', p_note; end if;
  if p_expected_revision is not null and v_note.revision <> p_expected_revision then
    raise exception 'Note % changed (expected revision %, current revision %). Read it again.', p_note, p_expected_revision, v_note.revision;
  end if;

  if p_action = 'delete' then
    if p_expected_revision is null then raise exception 'Deleting a note needs the revision it was read at.'; end if;
    delete from public.talent_notes where id = v_note.id;
    return jsonb_build_object('id', v_note.id, 'deleted', true);
  end if;
  if p_action <> 'update' then raise exception 'Use create, update or delete.'; end if;

  v_content := v_note.content;
  if p_content is not null then
    if p_expected_revision is null then raise exception 'Replacing the whole content needs the revision it was read at.'; end if;
    v_content := p_content;
  end if;
  if p_replace_old is not null then
    if p_replace_old = '' then raise exception 'Quote the exact passage to replace.'; end if;
    v_count := (length(v_content) - length(replace(v_content, p_replace_old, ''))) / length(p_replace_old);
    if v_count <> 1 then
      raise exception 'The passage to replace appears % times in note %. Quote one exact passage.', v_count, p_note;
    end if;
    v_content := replace(v_content, p_replace_old, coalesce(p_replace_new, ''));
  end if;
  if nullif(p_append, '') is not null then
    v_content := case when v_content = '' then p_append else v_content || E'\n\n' || p_append end;
  end if;

  update public.talent_notes set
    title = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
    content = v_content,
    matching_id = coalesce(p_matching, matching_id),
    company_workspace_id = coalesce(p_company, company_workspace_id),
    source_refs = (select coalesce(jsonb_agg(distinct r), '[]') from jsonb_array_elements(source_refs || coalesce(p_source_refs, '[]')) r),
    revision = revision + 1,
    updated_at = now()
  where id = v_note.id
  returning * into v_note;
  return to_jsonb(v_note) - 'source_refs';
end $$;

revoke all on function public.write_career_note_v1(uuid, uuid, text, bigint, text, text, text, text, text, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.write_career_note_v1(uuid, uuid, text, bigint, text, text, text, text, text, text, uuid, uuid, jsonb)
  to service_role;

-- Removing a Gmail grant removes the notes written from it, as it does search receipts.
create function public.clear_career_mail_notes_v1() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.provider = 'gmail' and (tg_op = 'DELETE' or new.status is distinct from old.status
      or new.career_mail_sync->>'generation' is distinct from old.career_mail_sync->>'generation') then
    delete from talent_notes
    where talent_id = old.talent_id
      and source_refs @> jsonb_build_array(jsonb_build_object('type', 'gmail', 'generation', old.career_mail_sync->>'generation'));
  end if;
  return null;
end $$;
create trigger clear_career_mail_notes after update or delete on public.talent_integrations
  for each row execute function public.clear_career_mail_notes_v1();

-- Harper's own thinking from each matching note becomes that matching's work note.
-- Server step records and user reactions stay where they already are.
insert into public.talent_notes(talent_id, kind, title, content, matching_id, created_at, updated_at)
select m.talent_id, 'work', m.title || ' 탐색',
  string_agg(t.thought, E'\n' order by t.number), m.id, min(t.created_at), max(t.created_at)
from (
  select e.matching_id, e.number, e.created_at,
    case when e.kind = 'harper' then e.body else split_part(e.body, E'\n→ ', 1) end as thought
  from public.talent_matching_note_entries e
  where e.kind = 'harper' or (e.kind = 'activity' and position(E'\n→ ' in e.body) > 0)
) t
join public.talent_matchings m on m.id = t.matching_id
where nullif(btrim(t.thought), '') is not null
group by m.id, m.talent_id, m.title;

drop trigger record_career_matching_feedback_note on public.talent_opportunity_recommendation;
drop function public.record_career_matching_feedback_note();
drop function public.append_career_matching_note_v1(uuid, uuid, text, text, text, text, boolean);
drop function public.edit_career_matching_note(uuid, uuid, text, jsonb, bigint);
drop function public.read_career_matching_note(uuid, uuid, bigint, integer, bigint, integer, bigint);
drop table public.talent_matching_note_entries;
drop table public.talent_matching_notes;

-- A Memory row may be about one company; that company's information then carries it.
alter table public.talent_contexts
  add column company_workspace_id uuid references public.company_workspace(company_workspace_id) on delete set null;
create index talent_contexts_company on public.talent_contexts(talent_id, company_workspace_id)
  where company_workspace_id is not null;
