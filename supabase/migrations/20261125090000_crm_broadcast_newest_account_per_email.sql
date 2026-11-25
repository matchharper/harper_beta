-- A person who signed up more than once with the same email gets one group email (/ops/crm),
-- on the account they signed up with most recently. That account's own settings decide whether
-- it is sent; an older account with the same email is never used in its place.
-- Test accounts (talent_test_accounts) are already left out: their sharing is pinned to
-- 'dont_share' and contact_queue cancels their rows.

create or replace function public.count_crm_email_broadcast_recipients(
  p_preferred_locale text default null::text,
  p_onboarding_done_only boolean default true
)
returns bigint
language sql
stable security definer
set search_path to ''
as $function$
  select count(*)::bigint
  from public.talent_users talent
  join public.talent_setting setting
    on setting.user_id = talent.user_id
  join (
    select distinct on (lower(btrim(newest.email))) newest.user_id
    from public.talent_users newest
    where newest.deleted_at is null
      and nullif(btrim(coalesce(newest.email, '')), '') is not null
    order by lower(btrim(newest.email)), newest.created_at desc, newest.user_id desc
  ) newest_account
    on newest_account.user_id = talent.user_id
  where talent.deleted_at is null
    and nullif(btrim(coalesce(talent.email, '')), '') is not null
    and talent.email ~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
    and coalesce(setting.profile_visibility, 'open_to_matches') <> 'dont_share'
    and (
      coalesce(setting.get_external_recommendation, true)
      or coalesce(setting.get_internal_recommendation, true)
    )
    and setting.crm_broadcast_unsubscribed_at is null
    and (
      nullif(btrim(coalesce(p_preferred_locale, '')), '') is null
      or lower(setting.preferred_locale) = lower(btrim(p_preferred_locale))
    )
    and (
      not coalesce(p_onboarding_done_only, true)
      or setting.is_onboarding_done is true
    );
$function$;

create or replace function public.queue_crm_email_broadcast(p_broadcast_id uuid)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  broadcast public.crm_email_broadcasts%rowtype;
  inserted_count bigint := 0;
begin
  select * into broadcast
  from public.crm_email_broadcasts
  where id = p_broadcast_id
  for update;

  if not found then
    raise exception 'CRM broadcast not found';
  end if;
  if broadcast.status <> 'draft' then
    raise exception 'Only draft broadcasts can be queued';
  end if;

  insert into public.contact_queue (
    user_id,
    type,
    status,
    scheduled_at,
    payload
  )
  select
    talent.user_id,
    'crm_broadcast',
    'queued',
    greatest(
      coalesce(broadcast.scheduled_at, timezone('utc', now())),
      timezone('utc', now())
    ),
    jsonb_build_object(
      'crmBroadcastId', broadcast.id,
      'subject', broadcast.subject,
      'htmlBody', broadcast.html_content,
      'to', lower(btrim(talent.email)),
      'locale', lower(setting.preferred_locale)
    )
  from public.talent_users talent
  join public.talent_setting setting
    on setting.user_id = talent.user_id
  join (
    select distinct on (lower(btrim(newest.email))) newest.user_id
    from public.talent_users newest
    where newest.deleted_at is null
      and nullif(btrim(coalesce(newest.email, '')), '') is not null
    order by lower(btrim(newest.email)), newest.created_at desc, newest.user_id desc
  ) newest_account
    on newest_account.user_id = talent.user_id
  where talent.deleted_at is null
    and nullif(btrim(coalesce(talent.email, '')), '') is not null
    and talent.email ~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
    and coalesce(setting.profile_visibility, 'open_to_matches') <> 'dont_share'
    and (
      coalesce(setting.get_external_recommendation, true)
      or coalesce(setting.get_internal_recommendation, true)
    )
    and setting.crm_broadcast_unsubscribed_at is null
    and (
      broadcast.recipient_preferred_locale is null
      or lower(setting.preferred_locale) = broadcast.recipient_preferred_locale
    )
    and (
      not broadcast.recipient_onboarding_done_only
      or setting.is_onboarding_done is true
    )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  update public.crm_email_broadcasts
  set
    status = case when inserted_count = 0 then 'completed' else 'queued' end,
    queued_at = timezone('utc', now()),
    completed_at = case
      when inserted_count = 0 then timezone('utc', now())
      else null
    end,
    updated_at = timezone('utc', now())
  where id = broadcast.id;

  return inserted_count;
end;
$function$;
