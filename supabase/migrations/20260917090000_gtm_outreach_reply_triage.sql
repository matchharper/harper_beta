-- Classify creator replies without making commercial or publication decisions.
-- The durable facts stay in the existing activity timeline: the inbound email,
-- its compact triage trace, the Slack delivery, and any publication candidate.

create or replace function public.gtm_guard_outreach_internal_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := current_setting('gtm.actor', true);
begin
  if new.kind = 'reply_triaged'
    and actor is distinct from 'outreach-reply-triage' then
    raise exception 'reply_triaged is reserved for the outreach reply processor';
  end if;
  if new.kind = 'delivery_failed'
    and actor is distinct from 'gmail-outreach-delivery-sync' then
    raise exception 'delivery_failed is reserved for the Gmail delivery processor';
  end if;
  return new;
end;
$$;

drop trigger if exists gtm_guard_outreach_internal_activity
  on public.gtm_activities;
create trigger gtm_guard_outreach_internal_activity
before insert or update of kind on public.gtm_activities
for each row execute function public.gtm_guard_outreach_internal_activity();

revoke all on function public.gtm_guard_outreach_internal_activity()
  from public, anon, authenticated;

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
      and candidate.provider = 'gmail'
      and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
      and candidate.status in ('sent', 'replied')
      and (
        candidate.provider_thread_id = p_thread_id
        or candidate.rfc_message_id = p_in_reply_to
        or coalesce(p_references, '') like '%' || candidate.rfc_message_id || '%'
      )
    order by candidate.sent_at desc nulls last, candidate.ref desc
    limit 1;
    if not found then
      return jsonb_build_object('matched', false, 'inserted', false);
    end if;

    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;

    -- A reply may come from a manager or another known address. Keep the
    -- thread/header match and accept only addresses already evidenced on this
    -- creator; an arbitrary participant in the Gmail thread is still rejected.
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

-- Gmail delivery status notifications are machine receipts rather than creator
-- replies. Match them to an already-sent dispatch, retain the receipt once,
-- and only mark an address bounced for an explicit permanent 5.x status.
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
      and candidate.provider = 'gmail'
      and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
      and candidate.status in ('sent', 'replied', 'failed')
      and (
        candidate.provider_thread_id = p_thread_id
        or candidate.rfc_message_id = p_in_reply_to
        or coalesce(p_references, '') like '%' || candidate.rfc_message_id || '%'
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
      from jsonb_array_elements(creator.contacts) with ordinality item(contact, ordinal);

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

create or replace function public.gtm_outreach_record_reply_triage(
  p_reply_activity_id uuid,
  p_type text,
  p_summary text,
  p_mentioned_urls jsonb default '[]'::jsonb,
  p_model text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reply public.gtm_activities;
  dispatch public.gtm_outreach_dispatches;
  triage public.gtm_activities;
  candidate_content_id uuid;
  candidate_content_ref bigint;
  candidate_count integer := 0;
  candidate_tracking_ready boolean := false;
  publication_verification_required boolean;
  follow_up_action_id text;
begin
  if p_type not in (
    'positive', 'negotiation', 'question', 'negative',
    'published', 'other', 'unclassified'
  ) then
    raise exception 'Unknown outreach reply triage type';
  end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null
    or length(p_summary) > 240 then
    raise exception 'Reply triage summary must contain 1 to 240 characters';
  end if;
  if jsonb_typeof(coalesce(p_mentioned_urls, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_mentioned_urls, '[]'::jsonb)) > 5
    or exists (
      select 1
      from jsonb_array_elements(coalesce(p_mentioned_urls, '[]'::jsonb)) url
      where jsonb_typeof(url) <> 'string'
        or trim(both '"' from url::text) !~ '^https://[^[:space:]]+$'
    ) then
    raise exception 'Reply triage URLs must be an array of at most five HTTPS URLs';
  end if;

  select * into reply
  from public.gtm_activities
  where id = p_reply_activity_id
    and kind = 'message_received'
    and archived_at is null
  for update;
  if not found then
    raise exception 'Outreach reply activity not found';
  end if;

  select * into triage
  from public.gtm_activities
  where kind = 'reply_triaged'
    and provider = 'contents_engine'
    and connection_ref = 'reply_triage'
    and external_id = reply.id::text;
  if found then
    return jsonb_build_object(
      'triage_activity_id', triage.id,
      'triage_type', triage.payload ->> 'type',
      'candidate_content_id', nullif(triage.payload ->> 'candidate_content_id', '')::uuid,
      'candidate_content_ref', nullif(triage.payload ->> 'candidate_content_ref', '')::bigint,
      'publication_verification_required',
        coalesce((triage.payload ->> 'publication_verification_required')::boolean, false)
    );
  end if;

  select * into dispatch
  from public.gtm_outreach_dispatches
  where id = nullif(reply.payload ->> 'dispatch_id', '')::uuid;
  if not found then
    raise exception 'Reply dispatch not found';
  end if;

  publication_verification_required := p_type = 'published';
  if publication_verification_required then
    select
      count(*)::integer,
      (array_agg(content.id order by content.ref))[1],
      min(content.ref)
    into candidate_count, candidate_content_id, candidate_content_ref
    from public.gtm_contents content
    where content.creator_id = dispatch.creator_id
      and content.archived_at is null
      and content.published_at is null
      and content.publish_status <> 'published'
      and (
        dispatch.collaboration_id is null
        or content.collaboration_id = dispatch.collaboration_id
      );

    if candidate_count <> 1 then
      candidate_content_id := null;
      candidate_content_ref := null;
    else
      select jsonb_array_length(content.tracking_links) > 0
      into candidate_tracking_ready
      from public.gtm_contents content
      where content.id = candidate_content_id;
    end if;
  end if;

  perform set_config('gtm.actor', 'outreach-reply-triage', true);
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
    reply.entity,
    reply.entity_id,
    'reply_triaged',
    btrim(p_summary),
    jsonb_build_object(
      'reply_activity_id', reply.id,
      'dispatch_id', dispatch.id,
      'type', p_type,
      'summary', btrim(p_summary),
      'mentioned_urls', coalesce(p_mentioned_urls, '[]'::jsonb),
      'model', nullif(btrim(coalesce(p_model, '')), ''),
      'candidate_content_id', candidate_content_id,
      'candidate_content_ref', candidate_content_ref,
      'candidate_tracking_ready', candidate_tracking_ready,
      'publication_verification_required', publication_verification_required
    ),
    now(),
    'activity:' || reply.id::text,
    'contents_engine',
    'reply_triage',
    reply.id::text,
    reply.thread_id,
    reply.outreach_template_id
  ) returning * into triage;

  -- Every inbound reply needs an explicit human/Agent disposition even when
  -- the classifier fails or the reply is negative. Reuse the collaboration's
  -- ordinary action list so the reply is visible in Today without introducing
  -- a reply-specific workflow table or semantic state machine.
  if dispatch.collaboration_id is not null then
    update public.gtm_collaborations collaboration
    set action_items = collaboration.action_items || jsonb_build_array(
      jsonb_build_object(
        'id', reply.id::text,
        'text', 'Review creator email reply and decide the next response',
        'status', 'open',
        'due_at', now() + interval '1 day',
        'source_activity_id', reply.id
      )
    )
    where collaboration.id = dispatch.collaboration_id
      and collaboration.archived_at is null
      and jsonb_array_length(collaboration.action_items) < 100
      and not exists (
        select 1
        from jsonb_array_elements(collaboration.action_items) action
        where action ->> 'id' = reply.id::text
      )
    returning reply.id::text into follow_up_action_id;
  end if;

  return jsonb_build_object(
    'triage_activity_id', triage.id,
    'triage_type', p_type,
    'candidate_content_id', candidate_content_id,
    'candidate_content_ref', candidate_content_ref,
    'candidate_tracking_ready', candidate_tracking_ready,
    'publication_verification_required', publication_verification_required,
    'follow_up_action_id', follow_up_action_id
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

create or replace function public.gtm_outreach_record_slack_notification(
  p_reply_activity_id uuid,
  p_channel_id text,
  p_slack_ts text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reply public.gtm_activities;
  triage public.gtm_activities;
begin
  select * into reply
  from public.gtm_activities
  where id = p_reply_activity_id and kind = 'message_received';
  if not found then
    raise exception 'Outreach reply activity not found';
  end if;
  select * into triage
  from public.gtm_activities
  where kind = 'reply_triaged'
    and provider = 'contents_engine'
    and connection_ref = 'reply_triage'
    and external_id = reply.id::text;

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
    reply.entity,
    reply.entity_id,
    'notification_sent',
    'Slack notified about creator email reply',
    jsonb_build_object(
      'reply_activity_id', reply.id,
      'triage_activity_id', triage.id,
      'triage_type', triage.payload ->> 'type',
      'triage_summary', triage.payload ->> 'summary',
      'slack_ts', p_slack_ts
    ),
    now(),
    'slack:' || coalesce(p_slack_ts, reply.id::text),
    'slack',
    p_channel_id,
    reply.id::text,
    reply.thread_id,
    reply.outreach_template_id
  ) on conflict (provider, connection_ref, external_id) do nothing;
end;
$$;

-- Append triage fields to the existing Sheet view without changing its stable
-- message columns or creating a second operational timeline.
create or replace view public.gtm_outreach_sheet_v1
with (security_invoker = true) as
select
  activity.id,
  activity.ref,
  activity.kind,
  activity.body,
  activity.occurred_at,
  activity.source_ref,
  activity.provider,
  activity.connection_ref,
  activity.external_id,
  activity.thread_id,
  activity.created_by,
  activity.created_at,
  activity.updated_at,
  activity.row_version,
  activity.archived_at,
  case
    when activity.kind = 'message_draft' then 'draft'
    when activity.kind = 'message_received' then 'inbound'
    when activity.kind = 'delivery_failed' then 'event'
    else 'outbound'
  end as direction,
  creator.id as creator_id,
  creator.ref as creator_ref,
  creator.name as creator_name,
  directory.sheet_primary_platform as primary_platform,
  directory.sheet_primary_handle as primary_handle,
  collaboration.id as collaboration_id,
  collaboration.ref as collaboration_ref,
  collaboration.title as collaboration_title,
  plan.ref as plan_ref,
  plan.name as plan_name,
  coalesce(activity.payload ->> 'channel', activity.provider) as channel,
  coalesce(
    activity.payload ->> 'recipient',
    activity.payload ->> 'to',
    activity.payload ->> 'from',
    activity.payload ->> 'sender',
    activity.payload ->> 'address'
  ) as counterparty,
  activity.payload ->> 'subject' as subject,
  directory.outreach_status as creator_outreach_status,
  directory.next_action,
  directory.next_action_due_at,
  outreach_template.ref as outreach_template_ref,
  outreach_template.name as outreach_template_name,
  triage.payload ->> 'type' as reply_type,
  triage.payload ->> 'summary' as reply_summary,
  triage.payload -> 'mentioned_urls' as reply_mentioned_urls,
  nullif(triage.payload ->> 'candidate_content_ref', '')::bigint
    as publication_candidate_content_ref,
  coalesce(
    (triage.payload ->> 'candidate_tracking_ready')::boolean,
    false
  ) as publication_candidate_tracking_ready,
  coalesce(
    (triage.payload ->> 'publication_verification_required')::boolean,
    false
  ) as publication_verification_required,
  case
    when activity.kind = 'delivery_failed' then
      case when coalesce((activity.payload ->> 'permanent')::boolean, false)
        then 'permanent_failure' else 'temporary_failure' end
    else activity.payload ->> 'delivery_status'
  end as delivery_status,
  coalesce(
    activity.payload ->> 'manual_destination',
    activity.payload ->> 'profile_url'
  ) as manual_destination,
  case when activity.kind = 'delivery_failed'
    then coalesce(activity.payload ->> 'diagnostic_code', activity.body)
  end as delivery_diagnostic
from public.gtm_activities activity
left join public.gtm_collaborations direct_collaboration
  on activity.entity = 'gtm_collaborations'
  and direct_collaboration.id = activity.entity_id
left join public.gtm_contents target_content
  on activity.entity = 'gtm_contents'
  and target_content.id = activity.entity_id
left join public.gtm_collaborations content_collaboration
  on content_collaboration.id = target_content.collaboration_id
left join public.gtm_collaborations collaboration
  on collaboration.id = coalesce(
    direct_collaboration.id,
    content_collaboration.id
  )
left join public.gtm_creators creator
  on creator.id = coalesce(
    case
      when activity.entity = 'gtm_creators' then activity.entity_id
    end,
    direct_collaboration.creator_id,
    target_content.creator_id,
    content_collaboration.creator_id
  )
left join public.gtm_outreach_templates outreach_template
  on outreach_template.id = activity.outreach_template_id
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_plans plan
  on plan.id = coalesce(collaboration.plan_id, target_content.plan_id)
left join lateral (
  select triage_activity.payload
  from public.gtm_activities triage_activity
  where triage_activity.kind = 'reply_triaged'
    and triage_activity.archived_at is null
    and triage_activity.payload ->> 'reply_activity_id' = activity.id::text
  order by triage_activity.occurred_at desc, triage_activity.ref desc
  limit 1
) triage on true
where activity.kind in (
  'message_draft', 'message_sent', 'message_received', 'delivery_failed'
);

revoke all on function public.gtm_outreach_ingest_gmail_delivery_failure(
  text, text, text, text, text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_ingest_gmail_delivery_failure(
  text, text, text, text, text, text, timestamptz, text, text, text
) to service_role;

revoke all on function public.gtm_outreach_record_activity_slack_notification(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_record_activity_slack_notification(
  uuid, text, text
) to service_role;

revoke all on function public.gtm_outreach_record_reply_triage(
  uuid, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_record_reply_triage(
  uuid, text, text, jsonb, text
) to service_role;

revoke all on public.gtm_outreach_sheet_v1
  from public, anon, authenticated;

comment on function public.gtm_outreach_record_reply_triage(
  uuid, text, text, jsonb, text
) is
  'Stores one compact LLM reply triage trace and a deterministic publication candidate; it never accepts terms or marks content published.';
comment on function public.gtm_outreach_ingest_gmail_delivery_failure(
  text, text, text, text, text, text, timestamptz, text, text, text
) is
  'Records Gmail delivery status receipts; only explicit permanent failures mark the exact recipient contact bounced.';

notify pgrst, 'reload schema';
