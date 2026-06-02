alter table public.talent_ops_profile_memos
  add column if not exists id uuid;

update public.talent_ops_profile_memos
set id = gen_random_uuid()
where id is null;

alter table public.talent_ops_profile_memos
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_ops_profile_memos'::regclass
      and conname = 'talent_ops_profile_memos_pkey'
  ) then
    alter table public.talent_ops_profile_memos
      drop constraint talent_ops_profile_memos_pkey;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.talent_ops_profile_memos'::regclass
      and conname = 'talent_ops_profile_memos_pkey'
  ) then
    alter table public.talent_ops_profile_memos
      add constraint talent_ops_profile_memos_pkey primary key (id);
  end if;
end $$;

create index if not exists talent_ops_profile_memos_talent_updated_at_idx
  on public.talent_ops_profile_memos (talent_id, updated_at desc);
