create table if not exists public.talent_ops_profile_memos (
  talent_id text primary key references public.talent_users(user_id) on delete cascade,
  content text not null default '',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talent_ops_profile_memos_updated_at_idx
  on public.talent_ops_profile_memos (updated_at desc);
