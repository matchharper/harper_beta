-- Test talent accounts (e.g. persona accounts playing a real person's public profile).
-- A row here is the canonical marker. The database itself keeps such an account away
-- from companies and from anything that runs or sends on its own:
--   * profile_visibility is pinned to dont_share, so company search, internal matching,
--     internal recommendations and profile sharing never include it;
--   * Career schedules stay paused, so no background run spends or contacts;
--   * queued Harper emails to it are cancelled;
--   * analytics already skip users carrying the test-fixture log marker.
-- Application code checks the same table for Slack activity, outward tools and ops lists.
create table if not exists public.talent_test_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  purpose text not null default '',
  created_at timestamptz not null default now()
);

alter table public.talent_test_accounts enable row level security;

create or replace function public.is_talent_test_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.talent_test_accounts where user_id = p_user_id)
$$;

create or replace function public.pin_test_account_setting()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if public.is_talent_test_account(new.user_id) then
    new.profile_visibility := 'dont_share';
  end if;
  return new;
end $$;

drop trigger if exists pin_test_account_setting on public.talent_setting;
create trigger pin_test_account_setting
  before insert or update of profile_visibility on public.talent_setting
  for each row execute function public.pin_test_account_setting();

create or replace function public.pause_test_account_schedule()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'active' and public.is_talent_test_account(new.talent_id) then
    new.status := 'paused';
  end if;
  return new;
end $$;

drop trigger if exists pause_test_account_schedule on public.talent_agent_schedules;
create trigger pause_test_account_schedule
  before insert or update of status on public.talent_agent_schedules
  for each row execute function public.pause_test_account_schedule();

create or replace function public.cancel_test_account_contact()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status in ('queued', 'processing', 'failed')
    and public.is_talent_test_account(new.user_id) then
    new.status := 'cancelled';
    new.cancelled_at := now();
    new.last_error := 'test_account';
  end if;
  return new;
end $$;

drop trigger if exists cancel_test_account_contact on public.contact_queue;
create trigger cancel_test_account_contact
  before insert or update of status on public.contact_queue
  for each row execute function public.cancel_test_account_contact();

-- Marking an existing account applies the same state to rows written before it.
create or replace function public.apply_talent_test_account()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  update public.talent_setting set profile_visibility = 'dont_share'
    where user_id = new.user_id and profile_visibility is distinct from 'dont_share';
  update public.talent_agent_schedules set status = 'paused'
    where talent_id = new.user_id and status = 'active';
  update public.contact_queue set status = 'cancelled', cancelled_at = now(), last_error = 'test_account'
    where user_id = new.user_id and status in ('queued', 'failed');
  insert into public.logs (user_id, type, meta_data)
    select new.user_id, 'analytics_excluded_test_fixture_talent', jsonb_build_object('source', 'talent_test_accounts')
    where not exists (
      select 1 from public.logs where user_id = new.user_id and type = 'analytics_excluded_test_fixture_talent'
    );
  return new;
end $$;

drop trigger if exists apply_talent_test_account on public.talent_test_accounts;
create trigger apply_talent_test_account
  after insert on public.talent_test_accounts
  for each row execute function public.apply_talent_test_account();

-- Persona test runs are test accounts.
insert into public.talent_test_accounts (user_id, email, purpose)
select r.talent_user_id, coalesce(u.email, ''), 'career_persona_test'
from public.career_persona_test_runs r
join auth.users u on u.id = r.talent_user_id
on conflict (user_id) do nothing;
