-- Resend delivers approved creator outreach. Replies still arrive at the
-- existing Google Workspace alias and are read through the Gmail inbox watch.
alter table public.gtm_outreach_dispatches
  add column if not exists provider_rfc_message_id text;

create index if not exists gtm_outreach_dispatches_provider_rfc_message_idx
  on public.gtm_outreach_dispatches (
    provider,
    connection_ref,
    provider_rfc_message_id
  )
  where provider_rfc_message_id is not null and archived_at is null;

-- The sender is a system choice, not a per-draft or per-reviewer setting.
update public.gtm_outreach_dispatches
set sender_email = 'harper@matchharper.com'
where archived_at is null
  and status in ('ready_for_review', 'needs_revision', 'approved', 'failed');

create or replace function public.gtm_outreach_force_harper_sender()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or new.status in ('ready_for_review', 'needs_revision', 'approved', 'failed') then
    new.sender_email := 'harper@matchharper.com';
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_outreach_force_harper_sender
  on public.gtm_outreach_dispatches;
create trigger gtm_outreach_force_harper_sender
before insert or update of sender_email, status on public.gtm_outreach_dispatches
for each row execute function public.gtm_outreach_force_harper_sender();

-- The RPC signature is unchanged to keep an in-flight Gmail release safe
-- during the rollout. Resend supplies an RFC Message-ID in brackets; Gmail
-- supplies a provider thread ID instead.
create or replace function public.gtm_outreach_worker_mark_sent(
  p_dispatch_id uuid,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_sent_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch public.gtm_outreach_dispatches;
  delivery_provider text;
begin
  select * into dispatch
  from public.gtm_outreach_dispatches
  where id = p_dispatch_id and archived_at is null
  for update;
  if not found then
    raise exception 'Outreach dispatch not found';
  end if;

  delivery_provider := case
    when p_provider_thread_id ~ '^<[^>]+>$' then 'resend'
    else 'gmail'
  end;
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null
    or nullif(btrim(coalesce(p_provider_thread_id, '')), '') is null then
    raise exception '% provider IDs are required', initcap(delivery_provider);
  end if;
  if dispatch.provider_message_id is not null
    and dispatch.provider_message_id <> p_provider_message_id then
    raise exception 'Dispatch already has a different % message ID', initcap(delivery_provider);
  end if;

  perform set_config('gtm.actor', delivery_provider || '-outreach-worker', true);
  insert into public.gtm_activities (
    entity,
    entity_id,
    kind,
    body,
    payload,
    occurred_at,
    source_ref,
    provider,
    connection_ref,
    external_id,
    thread_id,
    request_id,
    outreach_template_id
  ) values (
    case when dispatch.collaboration_id is null
      then 'gtm_creators' else 'gtm_collaborations' end,
    coalesce(dispatch.collaboration_id, dispatch.creator_id),
    'message_sent',
    dispatch.body,
    jsonb_build_object(
      'dispatch_id', dispatch.id,
      'subject', dispatch.subject,
      'recipient', dispatch.recipient_email,
      'sender', dispatch.sender_email,
      'rfc_message_id', dispatch.rfc_message_id,
      'provider_rfc_message_id', case
        when delivery_provider = 'resend' then p_provider_thread_id else null end,
      'approved_by', dispatch.approved_by,
      'selection_reason', dispatch.selection_reason,
      'personalization_evidence', dispatch.personalization_evidence
    ),
    coalesce(p_sent_at, now()),
    delivery_provider || ':' || p_provider_message_id,
    delivery_provider,
    dispatch.sender_email,
    p_provider_message_id,
    case when delivery_provider = 'gmail' then p_provider_thread_id else null end,
    dispatch.send_request_id,
    dispatch.outreach_template_id
  ) on conflict (provider, connection_ref, external_id) do nothing;

  update public.gtm_outreach_dispatches
  set status = case when replied_at is null then 'sent' else 'replied' end,
      provider = delivery_provider,
      connection_ref = sender_email,
      provider_message_id = p_provider_message_id,
      provider_thread_id = case
        when delivery_provider = 'gmail' then p_provider_thread_id else null end,
      provider_rfc_message_id = case
        when delivery_provider = 'resend' then p_provider_thread_id else null end,
      sent_at = coalesce(sent_at, p_sent_at, now()),
      next_attempt_at = null,
      sending_started_at = null,
      failed_at = null,
      last_error = null
  where id = dispatch.id
  returning * into dispatch;

  return to_jsonb(dispatch);
end;
$$;

-- Gmail remains the reply receiver. It recognizes both historic Gmail sends
-- and new Resend sends by the RFC reply headers.
create or replace function public.gtm_outreach_ingest_gmail_reply(
  p_mailbox text,
  p_message_id text,
  p_thread_id text,
  p_from_email text,
  p_to_email text,
  p_subject text,
  p_body text,
  p_received_at timestamptz,
  p_rfc_message_id text default null,
  p_in_reply_to text default null,
  p_references text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch public.gtm_outreach_dispatches;
  activity public.gtm_activities;
  creator public.gtm_creators;
  primary_handle text;
  inserted boolean := false;
  notify_needed boolean;
begin
  select * into activity
  from public.gtm_activities
  where provider = 'gmail'
    and connection_ref = lower(btrim(p_mailbox))
    and external_id = p_message_id;

  if not found then
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.archived_at is null
      and candidate.provider in ('gmail', 'resend')
      and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
      and candidate.status in ('sent', 'replied')
      and (
        candidate.provider_thread_id = p_thread_id
        or candidate.rfc_message_id = p_in_reply_to
        or candidate.provider_rfc_message_id = p_in_reply_to
        or coalesce(p_references, '') like '%' || candidate.rfc_message_id || '%'
        or coalesce(p_references, '') like '%' || candidate.provider_rfc_message_id || '%'
      )
    order by candidate.sent_at desc nulls last, candidate.ref desc
    limit 1;
    if not found then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;

    if lower(coalesce(p_from_email, '')) <> lower(dispatch.recipient_email)
      and not exists (
        select 1
        from jsonb_array_elements(creator.contacts) contact
        where lower(coalesce(contact ->> 'channel', '')) = 'email'
          and lower(coalesce(contact ->> 'address', '')) =
            lower(btrim(coalesce(p_from_email, '')))
          and lower(coalesce(contact ->> 'status', '')) not in (
            'invalid', 'bounced', 'revoked'
          )
      ) then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    perform set_config('gtm.actor', 'gmail-outreach-reply-sync', true);
    insert into public.gtm_activities (
      entity,
      entity_id,
      kind,
      body,
      payload,
      occurred_at,
      source_ref,
      provider,
      connection_ref,
      external_id,
      thread_id,
      outreach_template_id
    ) values (
      case when dispatch.collaboration_id is null
        then 'gtm_creators' else 'gtm_collaborations' end,
      coalesce(dispatch.collaboration_id, dispatch.creator_id),
      'message_received',
      p_body,
      jsonb_build_object(
        'dispatch_id', dispatch.id,
        'subject', p_subject,
        'from', p_from_email,
        'to', p_to_email,
        'rfc_message_id', p_rfc_message_id,
        'in_reply_to', p_in_reply_to,
        'references', p_references
      ),
      coalesce(p_received_at, now()),
      'gmail:' || p_message_id,
      'gmail',
      lower(btrim(p_mailbox)),
      p_message_id,
      p_thread_id,
      dispatch.outreach_template_id
    ) returning * into activity;
    inserted := true;

    update public.gtm_outreach_dispatches
    set status = 'replied',
        replied_at = least(
          coalesce(replied_at, p_received_at, now()),
          coalesce(p_received_at, now())
        )
    where id = dispatch.id
    returning * into dispatch;
  else
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.id = (activity.payload ->> 'dispatch_id')::uuid;
    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;
  end if;

  select account.handle into primary_handle
  from public.gtm_accounts account
  where account.creator_id = creator.id
    and account.archived_at is null
    and nullif(btrim(account.handle), '') is not null
  order by account.created_at, account.ref
  limit 1;

  notify_needed := not exists (
    select 1
    from public.gtm_activities notification
    where notification.kind = 'notification_sent'
      and notification.provider = 'slack'
      and notification.external_id = activity.id::text
  );

  return jsonb_build_object(
    'matched', true,
    'inserted', inserted,
    'notify_needed', notify_needed,
    'activity_id', activity.id,
    'activity_ref', activity.ref,
    'dispatch_id', dispatch.id,
    'dispatch_ref', dispatch.ref,
    'creator_id', creator.id,
    'creator_ref', creator.ref,
    'creator_name', creator.name,
    'primary_handle', primary_handle,
    'subject', activity.payload ->> 'subject',
    'body', activity.body,
    'from_email', activity.payload ->> 'from',
    'received_at', activity.occurred_at,
    'outbound_subject', dispatch.subject,
    'outbound_body', dispatch.body,
    'selection_reason', dispatch.selection_reason
  );
end;
$$;

comment on table public.gtm_outreach_dispatches is
  'Exact creator email draft, human approval, Resend delivery, and Gmail reply state. One row is one intended first-contact email.';
