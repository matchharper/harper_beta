alter table public.contact_queue
  add column if not exists role_id uuid,
  add column if not exists recommendation_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_queue'::regclass
      and conname = 'contact_queue_role_id_fkey'
  ) then
    alter table public.contact_queue
      add constraint contact_queue_role_id_fkey
      foreign key (role_id)
      references public.company_roles(role_id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contact_queue'::regclass
      and conname = 'contact_queue_recommendation_id_fkey'
  ) then
    alter table public.contact_queue
      add constraint contact_queue_recommendation_id_fkey
      foreign key (recommendation_id)
      references public.talent_opportunity_recommendation(id)
      on delete cascade;
  end if;
end;
$$;

alter table public.contact_queue
  drop constraint if exists contact_queue_type_check;

alter table public.contact_queue
  add constraint contact_queue_type_check
  check (
    type = any (
      array[
        'career_signup_no_profile_submit',
        'career_profile_submitted_no_answer',
        'internal_recommendation_call_abandoned',
        'internal_connection_confirmed'
      ]::text[]
    )
  );

alter table public.contact_queue
  drop constraint if exists contact_queue_internal_connection_reference_check;

alter table public.contact_queue
  add constraint contact_queue_internal_connection_reference_check
  check (
    type <> 'internal_connection_confirmed'
    or (role_id is not null and recommendation_id is not null)
  );

create unique index if not exists contact_queue_legacy_user_type_uidx
  on public.contact_queue(user_id, type)
  where type in (
    'career_signup_no_profile_submit',
    'career_profile_submitted_no_answer',
    'internal_recommendation_call_abandoned'
  );

drop index if exists public.contact_queue_user_type_uidx;

create unique index if not exists contact_queue_type_recommendation_uidx
  on public.contact_queue(type, recommendation_id);

create index if not exists contact_queue_internal_connection_lookup_idx
  on public.contact_queue(user_id, role_id, created_at desc)
  where type = 'internal_connection_confirmed';

alter table public.career_email_messages
  drop constraint if exists career_email_messages_mail_type_check;

alter table public.career_email_messages
  add constraint career_email_messages_mail_type_check
  check (
    mail_type = any (
      array[
        'onboarding',
        'onboarding_review',
        'onboarding_profile_ingestion_failed',
        'existing_user_login',
        'sign_up_followup',
        'sign_up_followup_reply',
        'user_reply',
        'auto_reply',
        'opportunity_recommendation',
        'manual_ops',
        'org_intro',
        'internal_connection_confirmed',
        'other'
      ]::text[]
    )
  );

create index if not exists career_email_messages_internal_connection_reply_to_idx
  on public.career_email_messages ((lower(btrim(metadata->>'replyTo'))))
  where direction = 'outbound'
    and mail_type = 'internal_connection_confirmed';

create or replace function public.stop_internal_connection_from_confirmation_email(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_role_id uuid,
  p_contact_queue_id uuid,
  p_stopped_at timestamptz,
  p_email_acceptance_confirmation jsonb,
  p_recipient_response jsonb,
  p_progress_metadata jsonb,
  p_progress_text text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result uuid;
  v_queue_count integer;
  v_role_id uuid;
begin
  select recommendation.role_id
  into v_role_id
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
    and recommendation.role_id = p_role_id
    and recommendation.feedback = 'like'
  for update;

  if not found or v_role_id is distinct from p_role_id then
    raise exception using
      errcode = 'P0002',
      message = 'accepted_internal_connection_not_found';
  end if;

  perform 1
  from public.contact_queue queue
  where queue.id = p_contact_queue_id
    and queue.type = 'internal_connection_confirmed'
    and queue.user_id = p_talent_id
    and queue.recommendation_id = p_recommendation_id
    and queue.role_id = p_role_id
    and queue.status = 'sent'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'internal_connection_confirmation_email_not_found';
  end if;

  v_result := public.change_internal_talent_opportunity_decision(
    p_talent_id,
    p_recommendation_id,
    'stop_process',
    p_stopped_at
  );

  update public.talent_opportunity_recommendation
  set
    email_acceptance_confirmation = coalesce(
      p_email_acceptance_confirmation,
      '{}'::jsonb
    ),
    updated_at = p_stopped_at
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  insert into public.talent_progress (
    kind,
    metadata,
    recommendation_id,
    role_id,
    talent_id,
    text,
    user_id
  )
  values (
    'org_stage_change',
    coalesce(p_progress_metadata, '{}'::jsonb),
    p_recommendation_id,
    p_role_id,
    p_talent_id,
    coalesce(
      nullif(btrim(p_progress_text), ''),
      'Talent가 이메일로 진행 종료를 요청했습니다.'
    ),
    'harper_email_reply_worker'
  );

  update public.contact_queue
  set
    payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
      'recipientResponse',
      coalesce(p_recipient_response, '{}'::jsonb)
    ),
    updated_at = p_stopped_at
  where id = p_contact_queue_id
    and type = 'internal_connection_confirmed'
    and user_id = p_talent_id
    and recommendation_id = p_recommendation_id
    and role_id = p_role_id
    and status = 'sent';

  get diagnostics v_queue_count = row_count;
  if v_queue_count <> 1 then
    raise exception using
      errcode = 'P0002',
      message = 'internal_connection_confirmation_email_update_failed';
  end if;

  return v_result;
end;
$$;

revoke all on function public.stop_internal_connection_from_confirmation_email(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  text
) from public, anon, authenticated;

grant execute on function public.stop_internal_connection_from_confirmation_email(
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz,
  jsonb,
  jsonb,
  jsonb,
  text
) to service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'harper_worker') then
    execute $grant$
      grant execute on function public.stop_internal_connection_from_confirmation_email(
        uuid,
        uuid,
        uuid,
        uuid,
        timestamptz,
        jsonb,
        jsonb,
        jsonb,
        text
      ) to harper_worker
    $grant$;
  end if;
end;
$$;
