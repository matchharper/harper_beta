-- Resend reports delayed delivery, bounces, send failures, and complaints by
-- webhook. Attach those durable provider facts to the same outreach dispatch
-- that created the email, then suppress addresses that must not be retried.

create or replace function public.gtm_outreach_ingest_resend_delivery_event(
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_recipient_email text,
  p_diagnostic_code text,
  p_occurred_at timestamptz,
  p_permanent boolean
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
  activity_kind text;
  contact_status text;
  should_fail boolean;
  inserted boolean := false;
  notify_needed boolean := false;
begin
  if nullif(btrim(coalesce(p_provider_event_id, '')), '') is null
    or nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Resend event and email IDs are required';
  end if;
  if p_event_type not in (
    'email.bounced',
    'email.delivery_delayed',
    'email.failed',
    'email.complained'
  ) then
    raise exception 'Unsupported Resend delivery event: %', p_event_type;
  end if;

  select * into activity
  from public.gtm_activities
  where provider = 'resend'
    and connection_ref = 'delivery-events'
    and external_id = p_provider_event_id;

  if found and activity.kind not in ('delivery_failed', 'delivery_delayed') then
    return jsonb_build_object('matched', false, 'inserted', false);
  end if;

  if not found then
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.archived_at is null
      and candidate.provider = 'resend'
      and candidate.provider_message_id = p_provider_message_id
    limit 1;
    if not found then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    if nullif(btrim(coalesce(p_recipient_email, '')), '') is not null
      and lower(btrim(p_recipient_email)) <> lower(dispatch.recipient_email) then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;

    activity_kind := case
      when p_event_type = 'email.delivery_delayed' then 'delivery_delayed'
      else 'delivery_failed'
    end;
    should_fail := p_event_type in ('email.failed', 'email.complained')
      or (p_event_type = 'email.bounced' and p_permanent);
    contact_status := case
      when p_event_type = 'email.complained' then 'revoked'
      when p_event_type = 'email.bounced' and p_permanent then 'bounced'
      else null
    end;

    perform set_config('gtm.actor', 'resend-outreach-delivery-sync', true);
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
      outreach_template_id
    ) values (
      case when dispatch.collaboration_id is null
        then 'gtm_creators' else 'gtm_collaborations' end,
      coalesce(dispatch.collaboration_id, dispatch.creator_id),
      activity_kind,
      coalesce(
        nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
        p_event_type
      ),
      jsonb_build_object(
        'dispatch_id', dispatch.id,
        'event_type', p_event_type,
        'recipient_email', coalesce(
          nullif(lower(btrim(coalesce(p_recipient_email, ''))), ''),
          dispatch.recipient_email
        ),
        'diagnostic_code', nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
        'permanent', p_permanent,
        'provider_message_id', p_provider_message_id
      ),
      coalesce(p_occurred_at, now()),
      'resend-event:' || p_provider_event_id,
      'resend',
      'delivery-events',
      p_provider_event_id,
      dispatch.outreach_template_id
    ) returning * into activity;
    inserted := true;

    if should_fail then
      update public.gtm_outreach_dispatches current_dispatch
      set status = case
            when current_dispatch.status = 'replied' then 'replied'
            else 'failed'
          end,
          failed_at = coalesce(current_dispatch.failed_at, p_occurred_at, now()),
          next_attempt_at = null,
          sending_started_at = null,
          last_error = left(
            coalesce(
              nullif(btrim(coalesce(p_diagnostic_code, '')), ''),
              p_event_type
            ),
            2000
          )
      where current_dispatch.id = dispatch.id
      returning * into dispatch;
    end if;

    if contact_status is not null then
      select coalesce(
        jsonb_agg(
          case
            when lower(coalesce(contact ->> 'channel', '')) = 'email'
              and lower(coalesce(contact ->> 'address', '')) =
                lower(dispatch.recipient_email)
              then contact || jsonb_build_object(
                'status', contact_status,
                'as_of', coalesce(p_occurred_at, now()),
                'delivery_source_ref', 'resend-event:' || p_provider_event_id,
                'delivery_event_type', p_event_type
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
      set contacts = updated_contacts,
          do_not_contact = case
            when p_event_type = 'email.complained' then true
            else do_not_contact
          end
      where id = creator.id;
    end if;
  else
    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.id = nullif(activity.payload ->> 'dispatch_id', '')::uuid;
    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;
    activity_kind := activity.kind;
    p_event_type := activity.payload ->> 'event_type';
    p_permanent := coalesce((activity.payload ->> 'permanent')::boolean, false);
  end if;

  if activity_kind = 'delivery_failed' then
    notify_needed := not exists (
      select 1
      from public.gtm_activities notification
      where notification.kind = 'notification_sent'
        and notification.provider = 'slack'
        and notification.external_id = activity.id::text
    );
  end if;

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
    'status', p_event_type,
    'diagnostic_code', activity.payload ->> 'diagnostic_code',
    'permanent', p_permanent,
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

  perform set_config('gtm.actor', 'outreach-delivery-sync', true);
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

revoke all on function public.gtm_outreach_ingest_resend_delivery_event(
  text, text, text, text, text, timestamptz, boolean
), public.gtm_outreach_record_activity_slack_notification(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.gtm_outreach_ingest_resend_delivery_event(
  text, text, text, text, text, timestamptz, boolean
), public.gtm_outreach_record_activity_slack_notification(uuid, text, text)
to service_role;

notify pgrst, 'reload schema';
