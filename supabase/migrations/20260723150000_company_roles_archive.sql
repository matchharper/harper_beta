create table if not exists public.company_roles_archive (
  role_id uuid primary key,
  company_workspace_id uuid not null,
  name text not null,
  external_jd_url text null,
  source_provider text null,
  source_job_id text null,
  posted_at timestamptz null,
  expires_at timestamptz null,
  expired_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived_at timestamptz not null default now()
);

comment on table public.company_roles_archive is
  'Minimal cold archive for old, expired external roles that have no foreign-key references.';

comment on column public.company_roles_archive.role_id is
  'Original company_roles.role_id. Reused if the same source posting becomes live again.';

create unique index if not exists company_roles_archive_source_job_uidx
  on public.company_roles_archive (source_provider, source_job_id)
  where source_provider is not null and source_job_id is not null;

create index if not exists company_roles_archive_workspace_idx
  on public.company_roles_archive (company_workspace_id);

create index if not exists company_roles_archive_external_url_idx
  on public.company_roles_archive (external_jd_url)
  where external_jd_url is not null;

create index if not exists company_roles_archive_archived_at_idx
  on public.company_roles_archive (archived_at desc);

create index if not exists company_roles_external_expired_archive_idx
  on public.company_roles (
    (coalesce(expired_at, updated_at)),
    role_id
  )
  where source_type = 'external'
    and status = 'ended'
    and is_expired = true;

alter table public.company_roles_archive enable row level security;

revoke all on table public.company_roles_archive from anon, authenticated;
grant select, insert, update, delete on table public.company_roles_archive to service_role;
