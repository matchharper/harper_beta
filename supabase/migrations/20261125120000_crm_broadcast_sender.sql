-- Each /ops/crm group email can name its own sender ("Name <address>" or an address).
-- Empty means the Worker's default sender. The queue copies it into each delivery,
-- like the subject and body, so a delivery keeps the sender it was queued with.
alter table public.crm_email_broadcasts
  add column if not exists from_email text;

drop function if exists public.list_crm_email_broadcasts(uuid);

create function public.list_crm_email_broadcasts(p_broadcast_id uuid default null::uuid)
returns table(
  id uuid,
  name text,
  subject text,
  from_email text,
  html_content text,
  recipient_preferred_locale text,
  recipient_onboarding_done_only boolean,
  status text,
  scheduled_at timestamp with time zone,
  queued_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  total_count bigint,
  queued_count bigint,
  processing_count bigint,
  paused_count bigint,
  sent_count bigint,
  failed_count bigint,
  cancelled_count bigint
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    broadcast.id,
    broadcast.name,
    broadcast.subject,
    broadcast.from_email,
    broadcast.html_content,
    broadcast.recipient_preferred_locale,
    broadcast.recipient_onboarding_done_only,
    broadcast.status,
    broadcast.scheduled_at,
    broadcast.queued_at,
    broadcast.completed_at,
    broadcast.created_at,
    broadcast.updated_at,
    count(delivery.id)::bigint as total_count,
    count(delivery.id) filter (
      where delivery.status = 'queued' and broadcast.status <> 'paused'
    ) as queued_count,
    count(delivery.id) filter (where delivery.status = 'processing') as processing_count,
    count(delivery.id) filter (
      where delivery.status = 'queued' and broadcast.status = 'paused'
    ) as paused_count,
    count(delivery.id) filter (where delivery.status = 'sent') as sent_count,
    count(delivery.id) filter (where delivery.status = 'failed') as failed_count,
    count(delivery.id) filter (where delivery.status = 'cancelled') as cancelled_count
  from public.crm_email_broadcasts broadcast
  left join public.contact_queue delivery
    on delivery.type = 'crm_broadcast'
   and delivery.payload ->> 'crmBroadcastId' = broadcast.id::text
  where p_broadcast_id is null or broadcast.id = p_broadcast_id
  group by broadcast.id
  order by broadcast.created_at desc, broadcast.id desc;
$function$;

revoke all on function public.list_crm_email_broadcasts(uuid) from public, anon, authenticated;
grant execute on function public.list_crm_email_broadcasts(uuid) to service_role;

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
      'locale', lower(setting.preferred_locale),
      'from', nullif(btrim(coalesce(broadcast.from_email, '')), '')
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
