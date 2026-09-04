begin;

set local lock_timeout = '5s';
set local statement_timeout = '5min';

create table if not exists public.crm_email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  html_content text not null,
  recipient_preferred_locale text,
  recipient_onboarding_done_only boolean not null default true,
  status text not null default 'draft',
  scheduled_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint crm_email_broadcasts_name_length_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint crm_email_broadcasts_subject_length_check
    check (char_length(btrim(subject)) between 1 and 200),
  constraint crm_email_broadcasts_html_length_check
    check (char_length(btrim(html_content)) between 1 and 100000),
  constraint crm_email_broadcasts_locale_check
    check (recipient_preferred_locale is null or recipient_preferred_locale in ('ko', 'en')),
  constraint crm_email_broadcasts_status_check
    check (status in ('draft', 'queued', 'paused', 'completed'))
);

create index if not exists crm_email_broadcasts_created_at_idx
  on public.crm_email_broadcasts (created_at desc, id desc);

create index if not exists contact_queue_crm_broadcast_status_idx
  on public.contact_queue (
    ((payload ->> 'crmBroadcastId')),
    status,
    scheduled_at
  )
  where type = 'crm_broadcast';

create unique index if not exists contact_queue_crm_broadcast_recipient_uidx
  on public.contact_queue (
    user_id,
    ((payload ->> 'crmBroadcastId'))
  )
  where type = 'crm_broadcast';

create unique index if not exists career_email_messages_crm_broadcast_delivery_uidx
  on public.career_email_messages (
    ((metadata ->> 'crmBroadcastDeliveryId'))
  )
  where mail_type = 'crm_broadcast'
    and nullif(btrim(metadata ->> 'crmBroadcastDeliveryId'), '') is not null;

comment on table public.crm_email_broadcasts is
  'Internal CRM standalone group email drafts and their frozen audience settings.';
comment on column public.crm_email_broadcasts.status is
  'Durable control state. Per-recipient progress is stored in contact_queue.';

alter table public.crm_email_broadcasts enable row level security;
revoke all on table public.crm_email_broadcasts
  from public, anon, authenticated;
grant select, insert, update on table public.crm_email_broadcasts
  to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    grant select on table public.crm_email_broadcasts to harper_worker;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'crm_email_broadcasts'
        and policyname = 'crm_email_broadcasts_worker_select'
    ) then
      create policy crm_email_broadcasts_worker_select
        on public.crm_email_broadcasts
        for select
        to harper_worker
        using (true);
    end if;
  end if;
end;
$$;

create or replace function public.count_crm_email_broadcast_recipients(
  p_preferred_locale text default null,
  p_onboarding_done_only boolean default true
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from public.talent_users talent
  join public.talent_setting setting
    on setting.user_id = talent.user_id
  where talent.deleted_at is null
    and nullif(btrim(coalesce(talent.email, '')), '') is not null
    and talent.email ~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
    and coalesce(setting.profile_visibility, 'open_to_matches') <> 'dont_share'
    and (
      coalesce(setting.get_external_recommendation, true)
      or coalesce(setting.get_internal_recommendation, true)
    )
    and (
      nullif(btrim(coalesce(p_preferred_locale, '')), '') is null
      or lower(setting.preferred_locale) = lower(btrim(p_preferred_locale))
    )
    and (
      not coalesce(p_onboarding_done_only, true)
      or setting.is_onboarding_done is true
    );
$$;

revoke all on function public.count_crm_email_broadcast_recipients(text, boolean)
  from public, anon, authenticated;
grant execute on function public.count_crm_email_broadcast_recipients(text, boolean)
  to service_role;

create or replace function public.list_crm_email_broadcasts(
  p_broadcast_id uuid default null
)
returns table (
  id uuid,
  name text,
  subject text,
  html_content text,
  recipient_preferred_locale text,
  recipient_onboarding_done_only boolean,
  status text,
  scheduled_at timestamptz,
  queued_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint,
  queued_count bigint,
  processing_count bigint,
  paused_count bigint,
  sent_count bigint,
  failed_count bigint,
  cancelled_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    broadcast.id,
    broadcast.name,
    broadcast.subject,
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
$$;

revoke all on function public.list_crm_email_broadcasts(uuid)
  from public, anon, authenticated;
grant execute on function public.list_crm_email_broadcasts(uuid)
  to service_role;

create or replace function public.queue_crm_email_broadcast(
  p_broadcast_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
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
  where talent.deleted_at is null
    and nullif(btrim(coalesce(talent.email, '')), '') is not null
    and talent.email ~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$'
    and coalesce(setting.profile_visibility, 'open_to_matches') <> 'dont_share'
    and (
      coalesce(setting.get_external_recommendation, true)
      or coalesce(setting.get_internal_recommendation, true)
    )
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
$$;

revoke all on function public.queue_crm_email_broadcast(uuid)
  from public, anon, authenticated;
grant execute on function public.queue_crm_email_broadcast(uuid)
  to service_role;

create or replace function public.set_crm_email_broadcast_paused(
  p_broadcast_id uuid,
  p_paused boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  select status into current_status
  from public.crm_email_broadcasts
  where id = p_broadcast_id
  for update;

  if not found then
    raise exception 'CRM broadcast not found';
  end if;

  if p_paused and current_status = 'queued' then
    update public.crm_email_broadcasts
    set status = 'paused', updated_at = timezone('utc', now())
    where id = p_broadcast_id;

    update public.contact_queue
    set
      scheduled_at = 'infinity'::timestamptz,
      payload = jsonb_set(
        payload,
        '{crmBroadcastResumeScheduledAt}',
        to_jsonb(scheduled_at::text),
        true
      ),
      updated_at = timezone('utc', now())
    where type = 'crm_broadcast'
      and payload ->> 'crmBroadcastId' = p_broadcast_id::text
      and status = 'queued';
  elsif not p_paused and current_status = 'paused' then
    update public.crm_email_broadcasts
    set status = 'queued', updated_at = timezone('utc', now())
    where id = p_broadcast_id;

    update public.contact_queue
    set
      scheduled_at = greatest(
        coalesce(
          nullif(payload ->> 'crmBroadcastResumeScheduledAt', '')::timestamptz,
          timezone('utc', now())
        ),
        timezone('utc', now())
      ),
      payload = payload - 'crmBroadcastResumeScheduledAt',
      updated_at = timezone('utc', now())
    where type = 'crm_broadcast'
      and payload ->> 'crmBroadcastId' = p_broadcast_id::text
      and status = 'queued'
      and payload ? 'crmBroadcastResumeScheduledAt';

    update public.crm_email_broadcasts broadcast
    set
      status = 'completed',
      completed_at = coalesce(broadcast.completed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
    where broadcast.id = p_broadcast_id
      and not exists (
        select 1
        from public.contact_queue pending
        where pending.type = 'crm_broadcast'
          and pending.payload ->> 'crmBroadcastId' = p_broadcast_id::text
          and pending.status in ('queued', 'processing')
      );
  else
    raise exception 'CRM broadcast cannot change pause state from %', current_status;
  end if;
end;
$$;

revoke all on function public.set_crm_email_broadcast_paused(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_crm_email_broadcast_paused(uuid, boolean)
  to service_role;

create or replace function public.sync_crm_email_broadcast_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  broadcast_id_text text;
begin
  broadcast_id_text := nullif(btrim(new.payload ->> 'crmBroadcastId'), '');
  if new.type <> 'crm_broadcast' or broadcast_id_text is null then
    return new;
  end if;

  update public.crm_email_broadcasts broadcast
  set
    status = 'completed',
    completed_at = coalesce(broadcast.completed_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where broadcast.id::text = broadcast_id_text
    and broadcast.status = 'queued'
    and not exists (
      select 1
      from public.contact_queue pending
      where pending.type = 'crm_broadcast'
        and pending.payload ->> 'crmBroadcastId' = broadcast_id_text
        and pending.status in ('queued', 'processing')
    );

  return new;
end;
$$;

revoke all on function public.sync_crm_email_broadcast_completion()
  from public, anon, authenticated;

drop trigger if exists contact_queue_sync_crm_broadcast_completion
  on public.contact_queue;
create trigger contact_queue_sync_crm_broadcast_completion
after update of status on public.contact_queue
for each row
when (new.type = 'crm_broadcast')
execute function public.sync_crm_email_broadcast_completion();

commit;
