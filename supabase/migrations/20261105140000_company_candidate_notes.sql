-- Company notes about a candidate get a company-side home (D20, C3a).
--
-- A note is what a company member writes about a candidate for a role. Its
-- author can edit or delete it, so it is not a decision; it was stored as a
-- talent_progress row (kind org_note) in the candidate's table.
--
-- - company_candidate_notes is the original. Writers (web feed, chat/Slack
--   note tool) write here; an edit bumps revision; a delete marks deleted_at.
-- - company_candidate_note_revisions keeps every version, deleted ones too,
--   for point-in-time reads (D19). Rows go with the candidate account.
-- - Until readers move (C3b), each note is copied into talent_progress as
--   before (same id, kind org_note) by trigger, and removed there when the
--   note is deleted. Readers (feed, notes panel, Harper chat, Ops) keep working
--   unchanged. The copy is only ever written by this trigger.
-- - Existing notes move here with their ids. The Pass reason copy (an org_note
--   with metadata.decision = pass) is not a note: the reason is on the Pass
--   decision; it stays until the feed reads decisions (C3b).

create table public.company_candidate_notes (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  recommendation_id uuid,
  company_user_id uuid not null,
  author_email text,
  text text not null check (char_length(text) between 1 and 2000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index company_candidate_notes_role_talent_idx
  on public.company_candidate_notes (role_id, talent_id, created_at desc) where deleted_at is null;
create index company_candidate_notes_workspace_idx
  on public.company_candidate_notes (company_workspace_id);

create table public.company_candidate_note_revisions (
  id bigint generated always as identity primary key,
  note_id uuid not null,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  company_user_id uuid not null,
  text text not null,
  revision integer not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index company_candidate_note_revisions_note_idx
  on public.company_candidate_note_revisions (note_id, id desc);

alter table public.company_candidate_notes enable row level security;
alter table public.company_candidate_note_revisions enable row level security;
revoke all on public.company_candidate_notes from public, anon, authenticated, service_role;
revoke all on public.company_candidate_note_revisions from public, anon, authenticated, service_role;
-- The app writes notes; it never hard-deletes them (a delete marks deleted_at).
grant select, insert, update on public.company_candidate_notes to service_role;
grant select on public.company_candidate_note_revisions to service_role;

-- An edit of the text is a new revision; the author and place never change.
create or replace function public.prepare_company_candidate_note_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.company_workspace_id := old.company_workspace_id;
    new.role_id := old.role_id;
    new.talent_id := old.talent_id;
    new.company_user_id := old.company_user_id;
    new.created_at := old.created_at;
    if old.deleted_at is not null then
      raise exception using errcode = '23514', message = 'company_candidate_note_deleted';
    end if;
    if new.text is distinct from old.text then
      new.revision := old.revision + 1;
    else
      new.revision := old.revision;
    end if;
    new.updated_at := now();
  else
    new.revision := 1;
  end if;
  return new;
end;
$$;

create trigger company_candidate_notes_prepare
  before insert or update on public.company_candidate_notes
  for each row execute function public.prepare_company_candidate_note_v1();

-- Every version is kept, and the talent_progress copy follows the note.
create or replace function public.sync_company_candidate_note_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- updated_at is the moment of this version (the original time for moved notes).
  insert into public.company_candidate_note_revisions (
    note_id, company_workspace_id, role_id, talent_id, company_user_id, text, revision, deleted_at, created_at
  ) values (
    new.id, new.company_workspace_id, new.role_id, new.talent_id, new.company_user_id,
    new.text, new.revision, new.deleted_at, new.updated_at
  );

  if new.deleted_at is not null then
    delete from public.talent_progress where id = new.id and kind = 'org_note';
  else
    insert into public.talent_progress (
      id, talent_id, role_id, recommendation_id, company_user_id, user_id, kind, text, metadata, created_at
    ) values (
      new.id, new.talent_id, new.role_id, new.recommendation_id, new.company_user_id, new.author_email,
      'org_note', new.text,
      jsonb_build_object('org', true, 'workspaceId', new.company_workspace_id, 'noteId', new.id),
      new.created_at
    )
    on conflict (id) do update set text = excluded.text;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_company_candidate_note_v1()
  from public, anon, authenticated, service_role;

create trigger company_candidate_notes_sync
  after insert on public.company_candidate_notes
  for each row execute function public.sync_company_candidate_note_v1();
create trigger company_candidate_notes_sync_update
  after update on public.company_candidate_notes
  for each row
  when ((old.text, old.deleted_at) is distinct from (new.text, new.deleted_at))
  execute function public.sync_company_candidate_note_v1();

-- Existing notes move here with their ids (their talent_progress rows become
-- the copies). Notes on roles or candidates that no longer exist are left.
insert into public.company_candidate_notes (
  id, company_workspace_id, role_id, talent_id, recommendation_id, company_user_id,
  author_email, text, created_at, updated_at
)
select progress.id, role.company_workspace_id, progress.role_id, progress.talent_id,
  progress.recommendation_id, progress.company_user_id, progress.user_id,
  left(btrim(progress.text), 2000), progress.created_at, progress.created_at
from public.talent_progress progress
join public.company_roles role on role.role_id = progress.role_id
join public.talent_users talent on talent.user_id = progress.talent_id
where progress.kind = 'org_note'
  and progress.company_user_id is not null
  and coalesce(progress.metadata->>'decision', '') <> 'pass'
  and coalesce(btrim(progress.text), '') <> ''
on conflict (id) do nothing;
