-- Preserve creator replies that do not look exactly like a direct Gmail reply.
-- Some clients compose a new `Re:` message without reply headers, while a
-- manager or agency may answer a correctly threaded message from a different
-- address. Strong provider identity is sufficient for the latter. The former
-- gets a deliberately narrow fallback: exact known sender, normalized subject,
-- one recent dispatch, and the configured mailbox as recipient.

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
  fallback_dispatch_id uuid;
  fallback_candidate_count integer := 0;
  normalized_subject text;
  match_strategy text;
  inserted boolean := false;
  notify_needed boolean;
begin
  select * into activity
  from public.gtm_activities
  where provider = 'gmail'
    and connection_ref = lower(btrim(p_mailbox))
    and external_id = p_message_id;

  if not found then
    if nullif(btrim(coalesce(p_from_email, '')), '') is null
      or lower(btrim(p_from_email)) = lower(btrim(p_mailbox))
      or lower(btrim(coalesce(p_to_email, ''))) <> lower(btrim(p_mailbox)) then
      return jsonb_build_object(
        'matched', false,
        'inserted', false,
        'reason', 'invalid_participants'
      );
    end if;

    select candidate.* into dispatch
    from public.gtm_outreach_dispatches candidate
    where candidate.archived_at is null
      and candidate.provider in ('gmail', 'resend')
      and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
      and candidate.status in ('sent', 'replied')
      and (
        (
          nullif(btrim(coalesce(p_thread_id, '')), '') is not null
          and candidate.provider_thread_id = p_thread_id
        )
        or (
          nullif(btrim(coalesce(p_in_reply_to, '')), '') is not null
          and (
            candidate.rfc_message_id = p_in_reply_to
            or candidate.provider_rfc_message_id = p_in_reply_to
          )
        )
        or (
          nullif(btrim(coalesce(p_references, '')), '') is not null
          and (
            (
              candidate.rfc_message_id is not null
              and position(candidate.rfc_message_id in p_references) > 0
            )
            or (
              candidate.provider_rfc_message_id is not null
              and position(candidate.provider_rfc_message_id in p_references) > 0
            )
          )
        )
      )
    order by candidate.sent_at desc nulls last, candidate.ref desc
    limit 1;

    if found then
      match_strategy := 'message_identity';
    else
      normalized_subject := regexp_replace(
        lower(btrim(coalesce(p_subject, ''))),
        '^((re|fw|fwd)[[:space:]]*:[[:space:]]*)+',
        '',
        'i'
      );
      if normalized_subject = '' then
        return jsonb_build_object(
          'matched', false,
          'inserted', false,
          'reason', 'missing_identity'
        );
      end if;

      select
        count(*),
        (array_agg(candidate.id order by candidate.sent_at desc))[1]
      into fallback_candidate_count, fallback_dispatch_id
      from public.gtm_outreach_dispatches candidate
      join public.gtm_creators candidate_creator
        on candidate_creator.id = candidate.creator_id
      where candidate.archived_at is null
        and candidate.provider in ('gmail', 'resend')
        and lower(candidate.connection_ref) = lower(btrim(p_mailbox))
        and candidate.status in ('sent', 'replied')
        and candidate.sent_at is not null
        and candidate.sent_at <= coalesce(p_received_at, now())
        and candidate.sent_at >= coalesce(p_received_at, now()) - interval '30 days'
        and regexp_replace(
          lower(btrim(coalesce(candidate.subject, ''))),
          '^((re|fw|fwd)[[:space:]]*:[[:space:]]*)+',
          '',
          'i'
        ) = normalized_subject
        and (
          lower(btrim(p_from_email)) = lower(btrim(candidate.recipient_email))
          or exists (
            select 1
            from jsonb_array_elements(
              coalesce(candidate_creator.contacts, '[]'::jsonb)
            ) contact
            where lower(coalesce(contact ->> 'channel', '')) = 'email'
              and lower(btrim(coalesce(contact ->> 'address', ''))) =
                lower(btrim(p_from_email))
              and lower(coalesce(contact ->> 'status', '')) not in (
                'invalid', 'bounced', 'revoked'
              )
          )
        );

      if fallback_candidate_count <> 1 then
        return jsonb_build_object(
          'matched', false,
          'inserted', false,
          'reason', case
            when fallback_candidate_count = 0 then 'missing_identity'
            else 'ambiguous_subject'
          end
        );
      end if;

      select candidate.* into dispatch
      from public.gtm_outreach_dispatches candidate
      where candidate.id = fallback_dispatch_id;
      match_strategy := 'sender_subject';
    end if;

    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id;

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
        'references', p_references,
        'match_strategy', match_strategy
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
    'selection_reason', dispatch.selection_reason,
    'match_strategy', activity.payload ->> 'match_strategy'
  );
end;
$$;

revoke all on function public.gtm_outreach_ingest_gmail_reply(
  text, text, text, text, text, text, text, timestamptz, text, text, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_ingest_gmail_reply(
  text, text, text, text, text, text, text, timestamptz, text, text, text
) to service_role;

comment on function public.gtm_outreach_ingest_gmail_reply(
  text, text, text, text, text, text, text, timestamptz, text, text, text
) is 'Ingests one Gmail creator reply using provider identity or a unique recent sender-and-subject fallback.';
