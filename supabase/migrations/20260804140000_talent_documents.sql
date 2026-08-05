create table if not exists public.talent_documents (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null
    references public.talent_users(user_id) on delete cascade,
  kind text not null default 'document'
    check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  extracted_text text,
  is_public boolean not null default false,
  is_primary boolean not null default false,
  constraint talent_documents_primary_resume_check
    check (not is_primary or kind = 'resume'),
  created_at timestamptz not null default now()
);

create index if not exists talent_documents_talent_kind_created_idx
  on public.talent_documents (talent_id, kind, created_at desc);

create unique index if not exists talent_documents_one_primary_resume_idx
  on public.talent_documents (talent_id)
  where kind = 'resume' and is_primary;

-- Preserve every legacy resume as the first document for that talent. The
-- talent_users columns remain as a latest-resume compatibility mirror.
insert into public.talent_documents (
  talent_id,
  kind,
  file_name,
  storage_path,
  extracted_text,
  is_public,
  is_primary,
  created_at
)
select
  user_id,
  'resume',
  coalesce(
    nullif(trim(resume_file_name), ''),
    nullif(regexp_replace(resume_storage_path, '^.*/', ''), ''),
    'resume'
  ),
  resume_storage_path,
  nullif(resume_text, ''),
  true,
  true,
  coalesce(updated_at, created_at, now())
from public.talent_users
where nullif(trim(resume_storage_path), '') is not null
on conflict (storage_path) do nothing;

alter table public.talent_documents enable row level security;

revoke all on public.talent_documents from anon, authenticated;
grant all on public.talent_documents to service_role;

comment on table public.talent_documents is
  'Talent-uploaded files. talent_users resume columns mirror the primary resume for legacy readers.';
comment on column public.talent_documents.kind is
  'Document category. The application currently uses resume and document.';
comment on column public.talent_documents.is_public is
  'Whether an organization may access this document. The primary resume is always public.';
comment on column public.talent_documents.is_primary is
  'The representative resume mirrored into talent_users. At most one per talent.';
