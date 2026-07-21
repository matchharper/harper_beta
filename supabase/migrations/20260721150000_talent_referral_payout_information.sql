create table if not exists public.talent_referral_payout_information (
  id uuid primary key default gen_random_uuid(),
  referral_application_id uuid not null
    references public.talent_referral_application(id) on delete cascade,
  referrer_user_id uuid not null
    references public.talent_users(user_id) on delete restrict,
  access_token_hash text,
  access_token_expires_at timestamptz,
  notification_history jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  tax_entity_type text,
  is_korean_tax_resident boolean,
  legal_name_ciphertext text,
  resident_registration_number_ciphertext text,
  phone_ciphertext text,
  address_ciphertext text,
  business_registration_number_ciphertext text,
  bank_name text,
  bank_account_number_ciphertext text,
  bank_account_holder_ciphertext text,
  privacy_consent_version text,
  privacy_consented_at timestamptz,
  accuracy_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_referral_payout_information_application_unique
    unique (referral_application_id),
  constraint talent_referral_payout_information_access_token_hash_unique
    unique (access_token_hash),
  constraint talent_referral_payout_information_tax_entity_type_check
    check (tax_entity_type is null or tax_entity_type in ('individual', 'sole_proprietor')),
  constraint talent_referral_payout_information_notification_history_check
    check (jsonb_typeof(notification_history) = 'array'),
  constraint talent_referral_payout_information_access_token_check
    check (
      (access_token_hash is null and access_token_expires_at is null)
      or
      (access_token_hash is not null and access_token_expires_at is not null)
    ),
  constraint talent_referral_payout_information_submission_check
    check (
      submitted_at is null
      or (
        tax_entity_type is not null
        and is_korean_tax_resident is true
        and legal_name_ciphertext is not null
        and resident_registration_number_ciphertext is not null
        and phone_ciphertext is not null
        and address_ciphertext is not null
        and bank_name is not null
        and bank_account_number_ciphertext is not null
        and bank_account_holder_ciphertext is not null
        and privacy_consent_version is not null
        and privacy_consented_at is not null
        and accuracy_confirmed_at is not null
        and (
          tax_entity_type <> 'sole_proprietor'
          or business_registration_number_ciphertext is not null
        )
      )
    )
);

create index if not exists talent_referral_payout_information_referrer_user_id_idx
  on public.talent_referral_payout_information (referrer_user_id);

create index if not exists talent_referral_payout_information_submitted_at_idx
  on public.talent_referral_payout_information (submitted_at)
  where submitted_at is not null;

create or replace function public.touch_talent_referral_payout_information_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists talent_referral_payout_information_touch_updated_at
  on public.talent_referral_payout_information;

create trigger talent_referral_payout_information_touch_updated_at
before update on public.talent_referral_payout_information
for each row execute function public.touch_talent_referral_payout_information_updated_at();

alter table public.talent_referral_payout_information enable row level security;

revoke all on table public.talent_referral_payout_information from anon, authenticated;

comment on table public.talent_referral_payout_information is
  'Service-role-only referral reward payout invitation history and encrypted taxpayer/bank details.';

comment on column public.talent_referral_payout_information.access_token_hash is
  'SHA-256 hash of the random bearer token. The plaintext token is never stored.';

comment on column public.talent_referral_payout_information.notification_history is
  'Append-only JSON array of payout information request email delivery metadata.';

comment on column public.talent_referral_payout_information.resident_registration_number_ciphertext is
  'AES-256-GCM encrypted resident or foreigner registration number.';

comment on column public.talent_referral_payout_information.bank_account_number_ciphertext is
  'AES-256-GCM encrypted bank account number.';
