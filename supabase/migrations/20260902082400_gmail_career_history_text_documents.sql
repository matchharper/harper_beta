begin;

-- Generated text documents have a stable logical origin even when they do not
-- have a corresponding object in Supabase Storage.
alter table public.talent_documents
  add column if not exists origin_type text,
  add column if not exists origin_id text,
  add column if not exists updated_at timestamptz;

-- The production database may already have the touch trigger from the manual
-- rollout. Temporarily remove it so the storage-only migration below does not
-- make an old Gmail analysis look newly analyzed.
drop trigger if exists talent_documents_touch_updated_at
  on public.talent_documents;

update public.talent_documents
set updated_at = created_at
where updated_at is null;

alter table public.talent_documents
  alter column updated_at set default timezone('utc', now()),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_documents'::regclass
      and conname = 'talent_documents_talent_origin_identity_key'
  ) then
    alter table public.talent_documents
      add constraint talent_documents_talent_origin_identity_key
      unique (talent_id, origin_type, origin_id);
  end if;
end
$$;

alter table public.talent_documents
  alter column storage_path drop not null;

-- Existing Gmail analyses become database-backed text documents. The legacy
-- Storage object is intentionally left untouched; application code no longer
-- references it and future analyses do not create or replace Storage objects.
update public.talent_documents
set storage_path = null
where origin_type = 'gmail_career_history'
  and origin_id = 'singleton';

alter table public.talent_documents
  drop constraint if exists talent_documents_storage_backing_check;

alter table public.talent_documents
  add constraint talent_documents_storage_backing_check
  check (
    storage_path is not null
    or (
      kind = 'document'
      and nullif(btrim(origin_type), '') is not null
      and nullif(btrim(origin_id), '') is not null
      and extracted_text is not null
      and is_public = false
      and is_primary = false
    )
  ) not valid;

alter table public.talent_documents
  validate constraint talent_documents_storage_backing_check;

create or replace function public.touch_talent_documents_updated_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger talent_documents_touch_updated_at
before update on public.talent_documents
for each row
execute function public.touch_talent_documents_updated_at_v1();

comment on column public.talent_documents.origin_type is
  'Server-managed source family for generated documents. NULL identifies a user upload.';

comment on column public.talent_documents.origin_id is
  'Stable identity within an origin family. Combined with talent_id and origin_type for idempotent generated-document upserts.';

comment on column public.talent_documents.updated_at is
  'Time when document metadata or extracted content was last updated.';

comment on constraint talent_documents_storage_backing_check
  on public.talent_documents is
  'User uploads require a Storage object. Only private, non-primary generated text documents may be database-backed without one.';

commit;
