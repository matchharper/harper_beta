alter table public.talent_setting
  add column if not exists status text not null default 'active';

alter table public.talent_setting
  add column if not exists status_updated_at timestamptz not null default timezone('utc', now());

alter table public.talent_setting
  alter column status set default 'active';

alter table public.talent_setting
  alter column status_updated_at set default timezone('utc', now());

update public.talent_setting
set status = 'active'
where status is null
   or status not in ('active', 'passive', 'stopped');

update public.talent_setting
set status_updated_at = coalesce(status_updated_at, updated_at, created_at, timezone('utc', now()));

alter table public.talent_setting
  alter column status set not null;

alter table public.talent_setting
  alter column status_updated_at set not null;

alter table public.talent_setting
  drop constraint if exists talent_setting_status_check;

alter table public.talent_setting
  add constraint talent_setting_status_check
  check (status in ('active', 'passive', 'stopped'));

create index if not exists talent_setting_status_periodic_idx
  on public.talent_setting (status, status_updated_at, periodic_interval_days)
  where profile_visibility <> 'dont_share';
