begin;

alter table public.talent_users
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason_code text,
  add column if not exists deletion_reason_detail text;

create index if not exists talent_users_deleted_at_idx
  on public.talent_users (deleted_at desc)
  where deleted_at is not null;

comment on column public.talent_users.deleted_at is
  'Soft-delete timestamp. A non-null value blocks talent access, matching, and delivery while retaining operational history.';

comment on column public.talent_users.deletion_reason_code is
  'Optional reason selected by the talent when deleting their account.';

comment on column public.talent_users.deletion_reason_detail is
  'Optional free-text feedback supplied with the account deletion request.';

commit;
