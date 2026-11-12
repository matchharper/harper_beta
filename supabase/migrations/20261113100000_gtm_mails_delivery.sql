-- GTM plays: what Resend reported after a GTM mail went out (Resend webhook → /api/internal/email/resend).
-- bounced: a permanent bounce; complained: the person marked it as spam; failed: Resend could not send it.
-- A bounced or complaining address also goes on external_contact_suppressions, so no GTM mail or external
-- invitation is sent to it again. Temporary bounces and delays are not recorded.
alter table public.gtm_mails add column if not exists delivery_status text;
alter table public.gtm_mails add column if not exists delivery_event_at timestamptz;
alter table public.gtm_mails add column if not exists delivery_detail text;

do $$
begin
  alter table public.gtm_mails add constraint gtm_mails_delivery_status_check
    check (delivery_status is null or delivery_status in ('bounced', 'complained', 'failed'));
exception when duplicate_object then null;
end $$;

-- Resend events find their mail by the provider id.
create index if not exists gtm_mails_provider_message_id_idx
  on public.gtm_mails (provider_message_id) where provider_message_id is not null;
