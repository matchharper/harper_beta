-- GTM plays #4 후보 메일: the posting as the mail described it (title, company, location, description, link),
-- shown on the Harper page the mail's button opens (/jobs/invite/<mail id>) before the person signs up.
-- Null for company mails and for mails whose button opens a Harper job page (/jobs/<slug>).
alter table public.gtm_mails add column if not exists posting jsonb;
