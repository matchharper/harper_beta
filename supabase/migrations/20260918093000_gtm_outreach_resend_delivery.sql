-- Creator outreach is sent with Resend, while replies continue to arrive at the
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

-- Future drafts always show the one approved sender. The argument remains in
-- the public RPC signature for Sheets compatibility, but is not trusted as a
-- sender choice.
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

create or replace function public.gtm_outreach_worker_claim(
  p_dispatch_id uuid default null,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_limit < 1 or p_limit > 50 then
    raise exception 'p_limit must be between 1 and 50';
  end if;
  perform set_config('gtm.actor', 'resend-outreach-worker', true);

  update public.gtm_outreach_dispatches dispatch
  set status = 'failed',
      failed_at = now(),
      next_attempt_at = null,
      sending_started_at = null,
      last_error = 'Send blocked: creator, recipient contact, or template is no longer eligible'
  where dispatch.archived_at is null
    and (p_dispatch_id is null or dispatch.id = p_dispatch_id)
    and (
      (
        dispatch.status = 'approved'
        and coalesce(dispatch.next_attempt_at, dispatch.scheduled_at, now()) <= now()
      )
      or (
        dispatch.status = 'sending'
        and dispatch.sending_started_at < now() - interval '10 minutes'
      )
    )
    and (
      not exists (
        select 1
        from public.gtm_creators creator
        where creator.id = dispatch.creator_id
          and creator.archived_at is null
          and not creator.do_not_contact
          and exists (
            select 1
            from jsonb_array_elements(creator.contacts) contact
            where lower(coalesce(contact ->> 'channel', '')) = 'email'
              and lower(coalesce(contact ->> 'address', '')) =
                lower(dispatch.recipient_email)
              and lower(coalesce(contact ->> 'status', '')) not in (
                'invalid', 'bounced', 'revoked'
              )
          )
      )
      or not exists (
        select 1
        from public.gtm_outreach_templates template
        where template.id = dispatch.outreach_template_id
          and template.archived_at is null
          and template.status = 'active'
          and lower(template.channel) = 'email'
      )
    );

  with candidates as (
    select dispatch.id
    from public.gtm_outreach_dispatches dispatch
    where dispatch.archived_at is null
      and (p_dispatch_id is null or dispatch.id = p_dispatch_id)
      and (
        (
          dispatch.status = 'approved'
          and coalesce(dispatch.next_attempt_at, dispatch.scheduled_at, now()) <= now()
        )
        or (
          dispatch.status = 'sending'
          and dispatch.sending_started_at < now() - interval '10 minutes'
        )
      )
    order by coalesce(dispatch.next_attempt_at, dispatch.scheduled_at), dispatch.ref
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.gtm_outreach_dispatches dispatch
    set status = 'sending',
        sending_started_at = now(),
        attempt_count = dispatch.attempt_count + 1,
        last_error = null
    from candidates
    where dispatch.id = candidates.id
    returning dispatch.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
  into result
  from claimed;
  return result;
end;
$$;

-- The signature is deliberately unchanged so the existing worker RPC call
-- remains compatible. Its third value is now the RFC Message-ID returned by
-- Resend rather than a Gmail thread ID.
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

create or replace function public.gtm_outreach_worker_mark_failed(
  p_dispatch_id uuid,
  p_error text,
  p_retryable boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch public.gtm_outreach_dispatches;
begin
  perform set_config('gtm.actor', 'resend-outreach-worker', true);
  update public.gtm_outreach_dispatches
  set status = case
        when p_retryable and attempt_count < 5 then 'approved'
        else 'failed'
      end,
      next_attempt_at = case
        when p_retryable and attempt_count < 5 then
          now() + make_interval(mins => least(60, (power(2, attempt_count) * 2)::integer))
        else null
      end,
      sending_started_at = null,
      failed_at = case
        when p_retryable and attempt_count < 5 then null
        else now()
      end,
      last_error = left(coalesce(p_error, 'Unknown Resend send failure'), 2000)
  where id = p_dispatch_id
    and archived_at is null
    and status = 'sending'
  returning * into dispatch;
  if not found then
    raise exception 'Claimed outreach dispatch not found';
  end if;
  return to_jsonb(dispatch);
end;
$$;

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
    if lower(coalesce(p_from_email, '')) <> lower(dispatch.recipient_email) then
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
    'subject', p_subject,
    'body', p_body,
    'from_email', p_from_email,
    'received_at', coalesce(p_received_at, activity.occurred_at)
  );
end;
$$;

comment on table public.gtm_outreach_dispatches is
  'Exact creator email draft, human approval, Resend delivery, and Gmail reply state. One row is one intended first-contact email.';
