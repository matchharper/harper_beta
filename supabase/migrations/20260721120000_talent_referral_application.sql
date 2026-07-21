create table if not exists public.talent_referral_application (
  id uuid primary key default gen_random_uuid(),
  referred_user_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  recommendation_id uuid references public.talent_opportunity_recommendation(id) on delete set null,
  hired_at date,
  settlement_completed_at date,
  reward_due_at date generated always as (
    case
      when hired_at is null and settlement_completed_at is null then null
      when hired_at is null then settlement_completed_at + 90
      when settlement_completed_at is null then hired_at + 90
      else greatest(hired_at, settlement_completed_at) + 90
    end
  ) stored,
  reward_paid boolean not null default false,
  reward_paid_at date,
  amount text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referred_user_id, role_id)
);

create index if not exists talent_referral_application_role_id_idx
  on public.talent_referral_application (role_id);

create index if not exists talent_referral_application_recommendation_id_idx
  on public.talent_referral_application (recommendation_id);

create or replace function public.touch_talent_referral_application_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists talent_referral_application_touch_updated_at
  on public.talent_referral_application;

create trigger talent_referral_application_touch_updated_at
before update on public.talent_referral_application
for each row execute function public.touch_talent_referral_application_updated_at();

alter table public.talent_referral_application enable row level security;

comment on table public.talent_referral_application is
  'Ops-only referral application settlement data, created lazily on the first operational edit.';

comment on column public.talent_referral_application.reward_due_at is
  'Automatically calculated as 90 days after the later of hired_at and settlement_completed_at.';
