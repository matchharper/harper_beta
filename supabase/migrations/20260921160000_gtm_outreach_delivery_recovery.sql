-- Keep delivery failures attached to the same GTM outreach ledger regardless
-- of whether the original message was sent by Gmail or Resend. These routines
-- were created during the first operational recovery and are checked in here
-- so a fresh environment has the same contract as the live database.

create or replace function public.gtm_outreach_ingest_gmail_delivery_failure(
  p_mailbox text,
  p_message_id text,
  p_thread_id text,
  p_status text default null,
  p_final_recipient text default null,
  p_diagnostic_code text default null,
  p_received_at timestamptz default now(),
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
  updated_contacts jsonb;
  inserted boolean := false;
  notify_needed boolean;
  permanent boolean := coalesce(p_status, '') like '5.%';
begin
  select * into activity
  from public.gtm_activities
  where provider = 'gmail'
    and connection_ref = lower(btrim(p_mailbox))
    and external_id = p_message_id;

  if found and activity.kind <> 'delivery_failed' then
    return jsonb_build_object('matched', false, 'inserted', false);
  end if;

  if not found then
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.archived_at is null
      and candidate.provider in ('gmail', 'resend')
      and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
      and candidate.status in ('sent', 'replied', 'failed')
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

    if nullif(btrim(coalesce(p_final_recipient, '')), '') is not null
      and lower(btrim(p_final_recipient)) <> lower(dispatch.recipient_email) then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;

    perform set_config('gtm.actor', 'gmail-outreach-delivery-sync', true);
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
      'delivery_failed',
      coalesce(
        nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
        'Gmail delivery status ' || coalesce(p_status, 'unknown')
      ),
      jsonb_build_object(
        'dispatch_id', dispatch.id,
        'status', nullif(btrim(coalesce(p_status, '')), ''),
        'final_recipient', coalesce(
          nullif(lower(btrim(coalesce(p_final_recipient, ''))), ''),
          dispatch.recipient_email
        ),
        'diagnostic_code', nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
        'permanent', permanent,
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

    if permanent then
      update public.gtm_outreach_dispatches current_dispatch
      set status = case
            when current_dispatch.status = 'replied' then 'replied'
            else 'failed'
          end,
          failed_at = coalesce(current_dispatch.failed_at, p_received_at, now()),
          last_error = left(
            coalesce(
              nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
              'Permanent Gmail delivery failure ' || coalesce(p_status, '')
            ),
            2000
          )
      where current_dispatch.id = dispatch.id
      returning * into dispatch;

      select coalesce(
        jsonb_agg(
          case
            when lower(coalesce(contact ->> 'channel', '')) = 'email'
              and lower(coalesce(contact ->> 'address', '')) =
                lower(dispatch.recipient_email)
              then contact || jsonb_build_object(
                'status', 'bounced',
                'as_of', coalesce(p_received_at, now()),
                'bounce_source_ref', 'gmail:' || p_message_id,
                'delivery_status', p_status
              )
            else contact
          end
          order by ordinal
        ),
        '[]'::jsonb
      ) into updated_contacts
      from jsonb_array_elements(creator.contacts)
        with ordinality item(contact, ordinal);

      update public.gtm_creators
      set contacts = updated_contacts
      where id = creator.id;
    end if;
  else
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.id = nullif(activity.payload ->> 'dispatch_id', '')::uuid;
    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;
    permanent := coalesce((activity.payload ->> 'permanent')::boolean, false);
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
    'recipient_email', dispatch.recipient_email,
    'subject', dispatch.subject,
    'status', activity.payload ->> 'status',
    'diagnostic_code', activity.payload ->> 'diagnostic_code',
    'permanent', permanent,
    'received_at', activity.occurred_at
  );
end;
$$;

create or replace function public.gtm_outreach_record_activity_slack_notification(
  p_activity_id uuid,
  p_channel_id text,
  p_slack_ts text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity public.gtm_activities;
begin
  select * into activity
  from public.gtm_activities
  where id = p_activity_id
    and kind = 'delivery_failed'
    and archived_at is null;
  if not found then
    raise exception 'Outreach delivery activity not found';
  end if;

  perform set_config('gtm.actor', 'gmail-outreach-delivery-sync', true);
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
    activity.entity,
    activity.entity_id,
    'notification_sent',
    'Slack notified about creator email delivery failure',
    jsonb_build_object(
      'activity_id', activity.id,
      'activity_kind', activity.kind,
      'slack_ts', p_slack_ts
    ),
    now(),
    'slack:' || coalesce(p_slack_ts, activity.id::text),
    'slack',
    p_channel_id,
    activity.id::text,
    activity.thread_id,
    activity.outreach_template_id
  ) on conflict (provider, connection_ref, external_id) do nothing;
end;
$$;

revoke all on function public.gtm_outreach_ingest_gmail_delivery_failure(
  text, text, text, text, text, text, timestamptz, text, text, text
), public.gtm_outreach_record_activity_slack_notification(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.gtm_outreach_ingest_gmail_delivery_failure(
  text, text, text, text, text, text, timestamptz, text, text, text
), public.gtm_outreach_record_activity_slack_notification(uuid, text, text)
to service_role;

notify pgrst, 'reload schema';
