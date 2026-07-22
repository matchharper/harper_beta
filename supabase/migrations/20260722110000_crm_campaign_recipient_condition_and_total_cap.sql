alter table public.crm_email_campaigns
  add column if not exists recipient_preferred_locale text,
  add column if not exists max_total_sends integer not null default 200;

alter table public.crm_email_campaigns
  drop constraint if exists crm_email_campaigns_recipient_preferred_locale_check,
  add constraint crm_email_campaigns_recipient_preferred_locale_check
    check (recipient_preferred_locale in ('ko', 'en')),
  drop constraint if exists crm_email_campaigns_max_total_sends_check,
  add constraint crm_email_campaigns_max_total_sends_check
    check (max_total_sends between 1 and 1000000);

update public.crm_email_campaigns
set
  recipient_preferred_locale = 'ko',
  max_total_sends = 200;

comment on column public.crm_email_campaigns.recipient_preferred_locale is
  'Optional talent_setting.preferred_locale required for campaign recipients.';
comment on column public.crm_email_campaigns.max_total_sends is
  'Maximum successful deliveries allowed across all recipients.';
