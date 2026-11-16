-- GTM plays: what the person did with a GTM mail after it went out, for the #4 숫자 표 and the send history.
--   first_opened_at / last_opened_at / open_count: the Harper page the mail's button opens (/jobs/invite/<id>,
--     /jobs/<slug>?gtm=<id>, the /org sign-in screen ?gtm=<id>) was on screen in a browser for a second. The page's
--     script reports it (POST /api/gtm/opened), so mail scanners that only fetch the link do not count, and
--     neither do bots or signed-in Harper staff. Repeats within 30 seconds count once.
--   unsubscribed_at: the person used this mail's own opt-out link (the address also goes on
--     external_contact_suppressions, which every GTM send checks).
-- Written only by the server with the service role.
alter table public.gtm_mails add column if not exists first_opened_at timestamptz;
alter table public.gtm_mails add column if not exists last_opened_at timestamptz;
alter table public.gtm_mails add column if not exists open_count integer not null default 0;
alter table public.gtm_mails add column if not exists unsubscribed_at timestamptz;

-- One open of a mail that went out (sending or sent). Returns whether it was counted: false for an unknown id, a
-- mail that never went out, or a repeat within 30 seconds of the last counted open.
create or replace function public.record_gtm_mail_open_v1(p_mail_id uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_last timestamptz;
begin
  select last_opened_at into v_last from public.gtm_mails
  where id = p_mail_id and status in ('sending', 'sent')
  for update;
  if not found then return false; end if;
  if v_last is not null and v_last >= now() - interval '30 seconds' then return false; end if;
  update public.gtm_mails
  set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = now(), open_count = open_count + 1
  where id = p_mail_id;
  return true;
end;
$$;

revoke all on function public.record_gtm_mail_open_v1(uuid) from public, anon, authenticated;
grant execute on function public.record_gtm_mail_open_v1(uuid) to service_role;
