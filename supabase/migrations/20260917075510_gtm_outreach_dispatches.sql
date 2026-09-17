-- Human-approved creator email dispatches and Gmail reply synchronization.
-- The row stores the irreducible external-send contract: exact recipient,
-- template version, approved copy, approval, provider IDs, and delivery state.
create table if not exists public.gtm_outreach_dispatches (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity unique,
  creator_id uuid not null references public.gtm_creators(id),
  collaboration_id uuid references public.gtm_collaborations(id),
  outreach_template_id uuid not null
    references public.gtm_outreach_templates(id),
  template_version text not null,
  recipient_email text not null,
  sender_email text not null,
  subject text not null,
  body text not null,
  selection_reason text not null,
  personalization_evidence text,
  status text not null default 'ready_for_review',
  review_note text,
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  next_attempt_at timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  provider text,
  connection_ref text,
  provider_message_id text,
  provider_thread_id text,
  rfc_message_id text not null unique,
  draft_activity_id uuid references public.gtm_activities(id),
  prepare_request_id uuid not null unique,
  prepare_input_hash text not null,
  send_request_id uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  row_version bigint not null default 1,
  archived_at timestamptz,
  check (recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (sender_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (length(btrim(subject)) > 0),
  check (length(btrim(body)) > 0),
  check (length(btrim(selection_reason)) > 0),
  check (attempt_count >= 0),
  check (status in (
    'ready_for_review',
    'needs_revision',
    'approved',
    'sending',
    'sent',
    'replied',
    'skipped',
    'failed'
  ))
);

create table if not exists public.gtm_outreach_mailboxes (
  email text primary key,
  provider text not null default 'gmail',
  history_id text,
  watch_expiration timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  check (provider = 'gmail')
);

create index if not exists gtm_outreach_dispatches_due_idx
  on public.gtm_outreach_dispatches(next_attempt_at, ref)
  where archived_at is null and status in ('approved', 'sending');

create index if not exists gtm_outreach_dispatches_creator_idx
  on public.gtm_outreach_dispatches(creator_id, created_at desc)
  where archived_at is null;

create index if not exists gtm_outreach_dispatches_thread_idx
  on public.gtm_outreach_dispatches(
    provider,
    connection_ref,
    provider_thread_id,
    sent_at desc
  )
  where provider_thread_id is not null and archived_at is null;

drop trigger if exists gtm_stamp_row on public.gtm_outreach_dispatches;
create trigger gtm_stamp_row
before insert or update on public.gtm_outreach_dispatches
for each row execute function public.gtm_stamp();

alter table public.gtm_outreach_dispatches enable row level security;
alter table public.gtm_outreach_mailboxes enable row level security;
revoke all on public.gtm_outreach_dispatches, public.gtm_outreach_mailboxes
  from public, anon, authenticated;

create or replace view public.gtm_outreach_review_sheet_v1
with (security_invoker = true) as
select
  dispatch.id,
  dispatch.ref,
  creator.id as creator_id,
  creator.ref as creator_ref,
  creator.name as creator_name,
  directory.sheet_primary_platform as primary_platform,
  directory.sheet_primary_handle as primary_handle,
  dispatch.recipient_email,
  template.id as outreach_template_id,
  template.ref as outreach_template_ref,
  template.name as outreach_template_name,
  dispatch.template_version,
  collaboration.id as collaboration_id,
  collaboration.ref as collaboration_ref,
  collaboration.title as collaboration_title,
  plan.ref as plan_ref,
  plan.name as plan_name,
  dispatch.sender_email,
  dispatch.selection_reason,
  dispatch.personalization_evidence,
  dispatch.subject,
  dispatch.body,
  null::text as review_action,
  dispatch.review_note,
  dispatch.status,
  dispatch.approved_by,
  dispatch.approved_at,
  dispatch.scheduled_at,
  dispatch.attempt_count,
  dispatch.last_error,
  dispatch.sent_at,
  dispatch.replied_at,
  dispatch.provider_message_id,
  dispatch.provider_thread_id,
  dispatch.created_by,
  dispatch.created_at,
  dispatch.updated_at,
  dispatch.row_version,
  dispatch.archived_at
from public.gtm_outreach_dispatches dispatch
join public.gtm_creators creator on creator.id = dispatch.creator_id
join public.gtm_outreach_templates template
  on template.id = dispatch.outreach_template_id
left join public.gtm_creator_directory_sheet_v1 directory
  on directory.id = creator.id
left join public.gtm_collaborations collaboration
  on collaboration.id = dispatch.collaboration_id
left join public.gtm_plans plan on plan.id = collaboration.plan_id;

revoke all on public.gtm_outreach_review_sheet_v1
  from public, anon, authenticated;

-- Keep the chronological Outreach Log focused on actual message content.
-- Review-state events live in Outreach Review and must not be mislabeled as
-- outbound messages merely because their activity kind starts with message_.
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
  outreach_template.name as outreach_template_name
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
where activity.kind in ('message_draft', 'message_sent', 'message_received');

revoke all on public.gtm_outreach_sheet_v1
  from public, anon, authenticated;

create or replace function public.gtm_outreach_prepare(
  p_token text,
  p_creator_id uuid,
  p_outreach_template_id uuid,
  p_recipient_email text,
  p_sender_email text,
  p_subject text,
  p_body text,
  p_selection_reason text,
  p_request_id uuid,
  p_collaboration_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_personalization_evidence text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  creator public.gtm_creators;
  template public.gtm_outreach_templates;
  collaboration public.gtm_collaborations;
  existing public.gtm_outreach_dispatches;
  dispatch public.gtm_outreach_dispatches;
  draft public.gtm_activities;
  input_hash text;
begin
  select * into credential
  from public.gtm_access_tokens
  where token_hash = encode(
      sha256(convert_to(coalesce(p_token, ''), 'UTF8')),
      'hex'
    )
    and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'Invalid or expired GTM access token' using errcode = '28000';
  end if;
  if not credential.can_write then
    raise exception 'GTM token is read only' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Preparation request_id is required';
  end if;

  input_hash := encode(sha256(convert_to(jsonb_build_object(
    'creator_id', p_creator_id,
    'collaboration_id', p_collaboration_id,
    'outreach_template_id', p_outreach_template_id,
    'recipient_email', lower(btrim(coalesce(p_recipient_email, ''))),
    'sender_email', lower(btrim(coalesce(p_sender_email, ''))),
    'subject', p_subject,
    'body', p_body,
    'selection_reason', p_selection_reason,
    'personalization_evidence', p_personalization_evidence,
    'scheduled_at', p_scheduled_at
  )::text, 'UTF8')), 'hex');

  select * into existing
  from public.gtm_outreach_dispatches
  where prepare_request_id = p_request_id;
  if found then
    if existing.prepare_input_hash <> input_hash
      or existing.created_by is distinct from credential.name then
      raise exception 'Idempotency key reused with different outreach input';
    end if;
    select * into dispatch
    from public.gtm_outreach_dispatches
    where id = existing.id;
    return to_jsonb(dispatch);
  end if;

  select * into creator
  from public.gtm_creators
  where id = p_creator_id and archived_at is null;
  if not found then
    raise exception 'Creator not found';
  end if;
  if creator.do_not_contact then
    raise exception 'Creator is marked do_not_contact';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(creator.contacts) contact
    where lower(coalesce(contact ->> 'channel', '')) = 'email'
      and lower(coalesce(contact ->> 'address', '')) =
        lower(btrim(coalesce(p_recipient_email, '')))
      and lower(coalesce(contact ->> 'status', '')) not in (
        'invalid', 'bounced', 'revoked'
      )
  ) then
    raise exception 'Recipient must be a current email contact on the creator';
  end if;

  select * into template
  from public.gtm_outreach_templates
  where id = p_outreach_template_id and archived_at is null;
  if not found then
    raise exception 'Outreach template not found';
  end if;
  if template.status <> 'active' or lower(template.channel) <> 'email' then
    raise exception 'Outreach template must be an active email template';
  end if;

  if p_collaboration_id is not null then
    select * into collaboration
    from public.gtm_collaborations
    where id = p_collaboration_id and archived_at is null;
    if not found or collaboration.creator_id <> p_creator_id then
      raise exception 'Collaboration must belong to the selected creator';
    end if;
  end if;
  if nullif(btrim(coalesce(p_subject, '')), '') is null
    or nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'Final subject and body are required';
  end if;
  if nullif(btrim(coalesce(p_selection_reason, '')), '') is null then
    raise exception 'Template selection reason is required';
  end if;
  if coalesce(p_sender_email, '') !~*
    '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid sender email is required';
  end if;
  if lower(btrim(p_sender_email)) !~ '^[^[:space:]@]+@matchharper\.com$' then
    raise exception 'Sender must be a matchharper.com mailbox';
  end if;

  perform set_config('gtm.actor', credential.name, true);
  insert into public.gtm_outreach_dispatches (
    creator_id,
    collaboration_id,
    outreach_template_id,
    template_version,
    recipient_email,
    sender_email,
    subject,
    body,
    selection_reason,
    personalization_evidence,
    scheduled_at,
    prepare_request_id,
    prepare_input_hash,
    rfc_message_id
  ) values (
    p_creator_id,
    p_collaboration_id,
    p_outreach_template_id,
    coalesce(
      nullif(btrim(template.template_version), ''),
      'row-version-' || template.row_version::text
    ),
    lower(btrim(p_recipient_email)),
    lower(btrim(p_sender_email)),
    btrim(p_subject),
    p_body,
    btrim(p_selection_reason),
    nullif(btrim(coalesce(p_personalization_evidence, '')), ''),
    p_scheduled_at,
    p_request_id,
    input_hash,
    '<gtm-' || replace(gen_random_uuid()::text, '-', '') || '@matchharper.com>'
  ) returning * into dispatch;

  insert into public.gtm_activities (
    entity,
    entity_id,
    kind,
    body,
    payload,
    provider,
    connection_ref,
    request_id,
    outreach_template_id
  ) values (
    case when p_collaboration_id is null
      then 'gtm_creators' else 'gtm_collaborations' end,
    coalesce(p_collaboration_id, p_creator_id),
    'message_draft',
    dispatch.body,
    jsonb_build_object(
      'dispatch_id', dispatch.id,
      'subject', dispatch.subject,
      'recipient', dispatch.recipient_email,
      'sender', dispatch.sender_email,
      'template_version', dispatch.template_version,
      'selection_reason', dispatch.selection_reason,
      'personalization_evidence', dispatch.personalization_evidence,
      'status', 'ready_for_review'
    ),
    'gmail',
    dispatch.sender_email,
    p_request_id,
    dispatch.outreach_template_id
  ) returning * into draft;

  update public.gtm_outreach_dispatches
  set draft_activity_id = draft.id
  where id = dispatch.id
  returning * into dispatch;

  return to_jsonb(dispatch);
end;
$$;

create or replace function public.gtm_outreach_review(
  p_token text,
  p_dispatch_id uuid,
  p_expected_version bigint,
  p_action text,
  p_request_id uuid,
  p_subject text default null,
  p_body text default null,
  p_scheduled_at timestamptz default null,
  p_review_note text default null,
  p_actor_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  credential public.gtm_access_tokens;
  dispatch public.gtm_outreach_dispatches;
  creator public.gtm_creators;
  template public.gtm_outreach_templates;
  prior public.gtm_activities;
  event_kind text;
  reviewer text;
  input_hash text;
begin
  select * into credential
  from public.gtm_access_tokens
  where token_hash = encode(
      sha256(convert_to(coalesce(p_token, ''), 'UTF8')),
      'hex'
    )
    and revoked_at is null
    and expires_at > now();
  if not found then
    raise exception 'Invalid or expired GTM access token' using errcode = '28000';
  end if;
  if not credential.can_write then
    raise exception 'GTM token is read only' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Review request_id is required';
  end if;
  if p_action not in ('approve', 'request_revision', 'revise', 'skip') then
    raise exception 'Unknown outreach review action';
  end if;

  input_hash := encode(sha256(convert_to(jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'expected_version', p_expected_version,
    'action', p_action,
    'subject', p_subject,
    'body', p_body,
    'scheduled_at', p_scheduled_at,
    'review_note', p_review_note,
    'actor_email', lower(btrim(coalesce(p_actor_email, '')))
  )::text, 'UTF8')), 'hex');

  select * into prior
  from public.gtm_activities
  where request_id = p_request_id;
  if found then
    if prior.payload ->> 'input_hash' <> input_hash
      or prior.payload ->> 'credential_id' <> credential.id::text then
      raise exception 'Idempotency key reused with different review input';
    end if;
    select * into dispatch
    from public.gtm_outreach_dispatches
    where id = p_dispatch_id;
    return to_jsonb(dispatch);
  end if;

  select * into dispatch
  from public.gtm_outreach_dispatches
  where id = p_dispatch_id and archived_at is null
  for update;
  if not found then
    raise exception 'Outreach dispatch not found';
  end if;
  if p_expected_version is null or dispatch.row_version <> p_expected_version then
    raise exception 'Row version conflict. Reload before applying your change.'
      using errcode = '40001';
  end if;
  if dispatch.status in ('sending', 'sent', 'replied', 'skipped') then
    raise exception 'This outreach is already being sent or has been sent';
  end if;

  -- The scoped credential is the authenticated reviewer identity. The Google
  -- account reported by Apps Script is useful context but is client input and
  -- therefore cannot be the audit authority.
  reviewer := credential.name;

  perform set_config('gtm.actor', reviewer, true);
  if p_action = 'approve' then
    select * into creator
    from public.gtm_creators
    where id = dispatch.creator_id and archived_at is null;
    if not found or creator.do_not_contact then
      raise exception 'Creator is unavailable or marked do_not_contact';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(creator.contacts) contact
      where lower(coalesce(contact ->> 'channel', '')) = 'email'
        and lower(coalesce(contact ->> 'address', '')) =
          lower(dispatch.recipient_email)
        and lower(coalesce(contact ->> 'status', '')) not in (
          'invalid', 'bounced', 'revoked'
        )
    ) then
      raise exception 'Recipient is no longer a current creator email contact';
    end if;
    select * into template
    from public.gtm_outreach_templates
    where id = dispatch.outreach_template_id and archived_at is null;
    if not found or template.status <> 'active'
      or lower(template.channel) <> 'email' then
      raise exception 'Outreach template is no longer active for email';
    end if;

    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'approved',
        approved_by = reviewer,
        approved_at = now(),
        scheduled_at = coalesce(p_scheduled_at, scheduled_at, now()),
        next_attempt_at = coalesce(p_scheduled_at, scheduled_at, now()),
        failed_at = null,
        last_error = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_approved';
  elsif p_action = 'request_revision' then
    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'needs_revision',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_revision_requested';
  elsif p_action = 'revise' then
    if nullif(btrim(coalesce(p_subject, '')), '') is null
      and nullif(coalesce(p_body, ''), '') is null then
      raise exception 'A revised subject or body is required';
    end if;
    update public.gtm_outreach_dispatches
    set subject = coalesce(nullif(btrim(p_subject), ''), subject),
        body = coalesce(nullif(p_body, ''), body),
        review_note = p_review_note,
        status = 'ready_for_review',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null,
        failed_at = null,
        last_error = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_draft';
  else
    update public.gtm_outreach_dispatches
    set review_note = p_review_note,
        status = 'skipped',
        approved_by = null,
        approved_at = null,
        next_attempt_at = null
    where id = dispatch.id
    returning * into dispatch;
    event_kind := 'message_skipped';
  end if;

  insert into public.gtm_activities (
    entity,
    entity_id,
    kind,
    body,
    payload,
    occurred_at,
    provider,
    connection_ref,
    request_id,
    outreach_template_id
  ) values (
    case when dispatch.collaboration_id is null
      then 'gtm_creators' else 'gtm_collaborations' end,
    coalesce(dispatch.collaboration_id, dispatch.creator_id),
    event_kind,
    dispatch.body,
    jsonb_build_object(
      'dispatch_id', dispatch.id,
      'subject', dispatch.subject,
      'recipient', dispatch.recipient_email,
      'sender', dispatch.sender_email,
      'scheduled_at', dispatch.scheduled_at,
      'review_note', dispatch.review_note,
      'reviewer', reviewer,
      'claimed_actor_email', nullif(lower(btrim(coalesce(p_actor_email, ''))), ''),
      'input_hash', input_hash,
      'credential_id', credential.id
    ),
    now(),
    'gmail',
    dispatch.sender_email,
    p_request_id,
    dispatch.outreach_template_id
  );

  return to_jsonb(dispatch);
end;
$$;

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
  perform set_config('gtm.actor', 'gmail-outreach-worker', true);

  -- Approval can be scheduled for later. Re-check the hard send gates at the
  -- moment of execution so a newly revoked contact or template never sends.
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
begin
  select * into dispatch
  from public.gtm_outreach_dispatches
  where id = p_dispatch_id and archived_at is null
  for update;
  if not found then
    raise exception 'Outreach dispatch not found';
  end if;
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null
    or nullif(btrim(coalesce(p_provider_thread_id, '')), '') is null then
    raise exception 'Gmail message and thread IDs are required';
  end if;
  if dispatch.provider_message_id is not null
    and dispatch.provider_message_id <> p_provider_message_id then
    raise exception 'Dispatch already has a different Gmail message ID';
  end if;

  perform set_config('gtm.actor', 'gmail-outreach-worker', true);
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
      'approved_by', dispatch.approved_by,
      'selection_reason', dispatch.selection_reason,
      'personalization_evidence', dispatch.personalization_evidence
    ),
    coalesce(p_sent_at, now()),
    'gmail:' || p_provider_message_id,
    'gmail',
    dispatch.sender_email,
    p_provider_message_id,
    p_provider_thread_id,
    dispatch.send_request_id,
    dispatch.outreach_template_id
  ) on conflict (provider, connection_ref, external_id) do nothing;

  update public.gtm_outreach_dispatches
  set status = case when replied_at is null then 'sent' else 'replied' end,
      provider = 'gmail',
      connection_ref = sender_email,
      provider_message_id = p_provider_message_id,
      provider_thread_id = p_provider_thread_id,
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
  perform set_config('gtm.actor', 'gmail-outreach-worker', true);
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
      last_error = left(coalesce(p_error, 'Unknown Gmail send failure'), 2000)
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
begin
  select * into reply
  from public.gtm_activities
  where id = p_reply_activity_id and kind = 'message_received';
  if not found then
    raise exception 'Outreach reply activity not found';
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
    reply.entity,
    reply.entity_id,
    'notification_sent',
    'Slack notified about creator email reply',
    jsonb_build_object(
      'reply_activity_id', reply.id,
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

create or replace function public.gtm_sheet_view(
  p_token text,
  p_view text,
  p_id uuid default null,
  p_limit integer default 500,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  credential public.gtm_access_tokens;
  read_table text;
  result jsonb;
  next_offset integer;
begin
  select * into credential
  from public.gtm_access_tokens
  where token_hash = encode(
      sha256(convert_to(coalesce(p_token, ''), 'UTF8')),
      'hex'
    )
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invalid or expired GTM access token' using errcode = '28000';
  end if;

  read_table := case p_view
    when 'creator_directory' then 'gtm_creator_directory_sheet_v1'
    when 'connected_creators' then 'gtm_connected_creator_sheet_v1'
    when 'outreach_log' then 'gtm_outreach_sheet_v1'
    when 'outreach_review' then 'gtm_outreach_review_sheet_v1'
    else null
  end;

  if read_table is null then
    raise exception 'Unknown GTM Sheet view';
  end if;
  if p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500';
  end if;
  if p_offset < 0 then
    raise exception 'p_offset cannot be negative';
  end if;

  update public.gtm_access_tokens
  set last_used_at = now()
  where id in (
    select id
    from public.gtm_access_tokens
    where id = credential.id
      and (
        last_used_at is null
        or last_used_at < now() - interval '5 minutes'
      )
    for update skip locked
  );

  if p_id is not null then
    execute format(
      'select to_jsonb(row) from public.%I row where id = $1',
      read_table
    ) into result using p_id;
    return jsonb_build_object('record', result, 'as_of', now());
  end if;

  if p_view = 'outreach_log' then
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb)'
        || ' from (select * from public.%I'
        || ' where archived_at is null'
        || ' order by occurred_at desc, ref desc limit $1 offset $2) row',
      read_table
    ) into result using p_limit, p_offset;
  elsif p_view = 'outreach_review' then
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb)'
        || ' from (select * from public.%I'
        || ' where archived_at is null'
        || ' order by case status when ''approved'' then 1'
        || ' when ''ready_for_review'' then 2 when ''needs_revision'' then 3'
        || ' when ''failed'' then 4 else 5 end, ref desc'
        || ' limit $1 offset $2) row',
      read_table
    ) into result using p_limit, p_offset;
  else
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(row)), ''[]''::jsonb)'
        || ' from (select * from public.%I'
        || ' where archived_at is null'
        || ' order by ref limit $1 offset $2) row',
      read_table
    ) into result using p_limit, p_offset;
  end if;

  next_offset := case
    when jsonb_array_length(result) = p_limit then p_offset + p_limit
  end;

  return jsonb_build_object(
    'rows', result,
    'offset', p_offset,
    'next_offset', next_offset,
    'as_of', now()
  );
end;
$$;

revoke all on function public.gtm_outreach_prepare(
  text, uuid, uuid, text, text, text, text, text, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_prepare(
  text, uuid, uuid, text, text, text, text, text, uuid, uuid, timestamptz, text
) to anon, authenticated, service_role;

revoke all on function public.gtm_outreach_review(
  text, uuid, bigint, text, uuid, text, text, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.gtm_outreach_review(
  text, uuid, bigint, text, uuid, text, text, timestamptz, text, text
) to anon, authenticated, service_role;

revoke all on function public.gtm_outreach_worker_claim(uuid, integer),
  public.gtm_outreach_worker_mark_sent(uuid, text, text, timestamptz),
  public.gtm_outreach_worker_mark_failed(uuid, text, boolean),
  public.gtm_outreach_ingest_gmail_reply(
    text, text, text, text, text, text, text, timestamptz, text, text, text
  ),
  public.gtm_outreach_record_slack_notification(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.gtm_outreach_worker_claim(uuid, integer),
  public.gtm_outreach_worker_mark_sent(uuid, text, text, timestamptz),
  public.gtm_outreach_worker_mark_failed(uuid, text, boolean),
  public.gtm_outreach_ingest_gmail_reply(
    text, text, text, text, text, text, text, timestamptz, text, text, text
  ),
  public.gtm_outreach_record_slack_notification(uuid, text, text)
to service_role;

revoke all on function public.gtm_sheet_view(
  text, text, uuid, integer, integer
) from public;
grant execute on function public.gtm_sheet_view(
  text, text, uuid, integer, integer
) to anon, authenticated, service_role;

comment on table public.gtm_outreach_dispatches is
  'Exact creator email draft, human approval, schedule, Gmail delivery, and reply state. One row is one intended first-contact email.';
comment on table public.gtm_outreach_mailboxes is
  'Internal Gmail watch cursor and expiry for the authenticated Contents Engine Gmail user mailbox.';
comment on view public.gtm_outreach_review_sheet_v1 is
  'Human review queue for final creator email copy and the explicit send decision.';
comment on function public.gtm_outreach_prepare(
  text, uuid, uuid, text, text, text, text, text, uuid, uuid, timestamptz, text
) is 'Creates one reviewable, idempotent creator email draft and message_draft activity.';
comment on function public.gtm_outreach_review(
  text, uuid, bigint, text, uuid, text, text, timestamptz, text, text
) is 'Applies the explicit team review decision with optimistic concurrency and audit activity.';

notify pgrst, 'reload schema';
