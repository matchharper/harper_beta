begin;

alter table public.talent_documents
  add column if not exists is_deleted boolean;

update public.talent_documents
set is_deleted = false
where is_deleted is null;

alter table public.talent_documents
  alter column is_deleted set default false,
  alter column is_deleted set not null;

create index if not exists talent_documents_active_created_at_idx
  on public.talent_documents (talent_id, created_at desc)
  where is_deleted = false;

comment on column public.talent_documents.is_deleted is
  'Soft-delete marker. Active document reads must filter to false.';

-- Re-uploading the same bytes after a soft delete must create a new active
-- document instead of returning the hidden row from the idempotent upsert.
create or replace function public.upsert_talent_document_by_hash_v1(
  p_talent_id uuid,
  p_kind text,
  p_file_name text,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint,
  p_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.talent_documents%rowtype;
  v_created boolean := false;
begin
  perform 1
  from public.talent_users
  where user_id = p_talent_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'talent_user_not_found';
  end if;

  select * into v_document
  from public.talent_documents
  where talent_id = p_talent_id
    and kind = p_kind
    and content_sha256 = p_content_sha256
    and is_deleted = false
  order by created_at desc
  limit 1;

  if p_kind = 'resume' then
    update public.talent_documents
    set is_primary = false, is_public = false
    where talent_id = p_talent_id
      and kind = 'resume'
      and is_deleted = false
      and is_primary = true
      and (v_document.id is null or id <> v_document.id);
  end if;

  if v_document.id is null then
    insert into public.talent_documents (
      talent_id,
      kind,
      file_name,
      storage_path,
      content_type,
      size_bytes,
      content_sha256,
      is_public,
      is_primary,
      is_deleted
    ) values (
      p_talent_id,
      p_kind,
      p_file_name,
      p_storage_path,
      p_content_type,
      p_size_bytes,
      p_content_sha256,
      p_kind = 'resume',
      p_kind = 'resume',
      false
    ) returning * into v_document;
    v_created := true;
  elsif p_kind = 'resume' then
    update public.talent_documents
    set is_primary = true, is_public = true
    where id = v_document.id
      and is_deleted = false
    returning * into v_document;
  end if;

  if p_kind = 'resume' then
    update public.talent_users
    set
      resume_file_name = v_document.file_name,
      resume_storage_path = v_document.storage_path,
      resume_text = v_document.extracted_text,
      updated_at = now()
    where user_id = p_talent_id;
  end if;

  return jsonb_build_object(
    'created', v_created,
    'document', to_jsonb(v_document)
  );
end;
$$;

commit;
