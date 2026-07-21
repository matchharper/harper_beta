create or replace function public.sync_referral_application_attribution_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_user_id uuid;
  aggregated_hired_at timestamptz;
  aggregated_reward_paid_at timestamptz;
  has_paid_reward boolean;
  existing_paid_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.hired_at is null
      and new.reward_paid is false
      and new.reward_paid_at is null then
      return new;
    end if;
    target_user_id := new.referred_user_id;
  elsif tg_op = 'UPDATE' then
    if new.hired_at is not distinct from old.hired_at
      and new.reward_paid is not distinct from old.reward_paid
      and new.reward_paid_at is not distinct from old.reward_paid_at then
      return new;
    end if;
    target_user_id := new.referred_user_id;
  else
    if old.hired_at is null
      and old.reward_paid is false
      and old.reward_paid_at is null then
      return old;
    end if;
    target_user_id := old.referred_user_id;
  end if;

  select
    min(application.hired_at)::timestamptz,
    (min(application.reward_paid_at)
      filter (where application.reward_paid))::timestamptz,
    coalesce(bool_or(application.reward_paid), false)
  into
    aggregated_hired_at,
    aggregated_reward_paid_at,
    has_paid_reward
  from public.talent_referral_application application
  where application.referred_user_id = target_user_id;

  select attribution.paid_at
  into existing_paid_at
  from public.talent_network_referral_attributions attribution
  where attribution.referred_user_id = target_user_id;

  update public.talent_network_referral_attributions attribution
  set
    hired_at = aggregated_hired_at,
    paid_at = case
      when has_paid_reward then
        coalesce(aggregated_reward_paid_at, existing_paid_at, now())
      else null
    end
  where attribution.referred_user_id = target_user_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists talent_referral_application_sync_attribution_status
  on public.talent_referral_application;

create trigger talent_referral_application_sync_attribution_status
after insert or update or delete on public.talent_referral_application
for each row execute function public.sync_referral_application_attribution_status();

with application_status as (
  select
    application.referred_user_id,
    min(application.hired_at)::timestamptz as hired_at,
    (min(application.reward_paid_at)
      filter (where application.reward_paid))::timestamptz as paid_at,
    coalesce(bool_or(application.reward_paid), false) as has_paid_reward
  from public.talent_referral_application application
  group by application.referred_user_id
)
update public.talent_network_referral_attributions attribution
set
  hired_at = coalesce(status.hired_at, attribution.hired_at),
  paid_at = case
    when status.has_paid_reward then
      coalesce(status.paid_at, attribution.paid_at, now())
    else attribution.paid_at
  end
from application_status status
where attribution.referred_user_id = status.referred_user_id
  and (status.hired_at is not null or status.has_paid_reward);

comment on function public.sync_referral_application_attribution_status() is
  'Keeps referral-level hire and payout stats in sync with per-role referral applications.';
