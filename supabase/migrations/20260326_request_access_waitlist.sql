alter table public.harper_waitlist_company
  add column if not exists user_id uuid null,
  add column if not exists status text not null default 'pending',
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by text null,
  add column if not exists approval_token text null,
  add column if not exists approval_email_sent_at timestamptz null,
  add column if not exists access_granted_at timestamptz null;

create index if not exists harper_waitlist_company_user_id_idx
  on public.harper_waitlist_company (user_id);

create unique index if not exists harper_waitlist_company_approval_token_key
  on public.harper_waitlist_company (approval_token)
  where approval_token is not null;

do $$
begin
  alter table public.harper_waitlist_company
    add constraint harper_waitlist_company_status_check
    check (status in ('pending', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.harper_waitlist_company
    add constraint harper_waitlist_company_user_id_fkey
    foreign key (user_id) references public.company_users(user_id)
    on delete set null;
exception
  when duplicate_object then null;
end
$$;
