-- Durable fact: this account has already been shown this announcement.
-- The client reads its own receipts and atomically claims each first display.
create table public.user_announcement_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  announcement_id text not null check (length(announcement_id) between 1 and 200),
  seen_at timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table public.user_announcement_receipts enable row level security;
revoke all on table public.user_announcement_receipts from anon, authenticated;
grant select, insert on table public.user_announcement_receipts to authenticated;
grant all on table public.user_announcement_receipts to service_role;

create policy "Users read their own announcement receipts"
  on public.user_announcement_receipts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users record their own announcement views"
  on public.user_announcement_receipts for insert to authenticated
  with check ((select auth.uid()) = user_id);
