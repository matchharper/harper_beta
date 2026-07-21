alter table public.talent_network_referral_attributions
  add column if not exists paid_at timestamptz;
