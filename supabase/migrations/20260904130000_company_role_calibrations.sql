begin;

create table public.company_role_calibrations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null
    references public.company_roles(role_id) on delete cascade,
  status text not null default 'queued'
    check (status in (
      'queued', 'running', 'ready', 'sent', 'completed', 'failed', 'canceled'
    )),
  available_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index company_role_calibrations_claim_idx
  on public.company_role_calibrations(status, available_at, created_at);
create unique index company_role_calibrations_one_open_role_idx
  on public.company_role_calibrations(role_id)
  where status in ('queued', 'running', 'ready', 'sent');
create index company_role_calibrations_workspace_role_idx
  on public.company_role_calibrations(company_workspace_id, role_id, created_at desc);

alter table public.company_role_calibrations enable row level security;
grant all on table public.company_role_calibrations to service_role;
comment on table public.company_role_calibrations is
  'One queue/run/public snapshot for a company Role profile-calibration set. Raw candid IDs remain server-only inside payload.';

create or replace function public.touch_company_role_calibration_updated_at_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger company_role_calibrations_touch_updated_at_v1
before update on public.company_role_calibrations
for each row execute function public.touch_company_role_calibration_updated_at_v1();

create or replace function public.company_role_is_calibration_eligible_v1(
  p_role_id uuid,
  p_now timestamptz default timezone('utc', now())
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_roles role
    join public.company_internal_roles internal_role
      on internal_role.role_id = role.role_id
    where role.role_id = p_role_id
      and lower(btrim(coalesce(role.source_type, ''))) = 'internal'
      and lower(btrim(coalesce(role.status, ''))) = 'active'
      and coalesce(role.is_expired, false) = false
      and (role.expires_at is null or role.expires_at > p_now)
      and coalesce(lower(btrim(role.information->>'testOnly')), '')
        not in ('true', '1', 'yes', 'on')
  );
$$;

create or replace function public.enqueue_company_role_calibration_v1(
  p_role_id uuid,
  p_available_at timestamptz default timezone('utc', now())
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing_id uuid;
  v_id uuid;
  v_workspace_id uuid;
begin
  -- Serialize all automatic/manual enqueue attempts for one Role. The product
  -- creates only one initial set per Role and never creates another after any
  -- existing row reaches a terminal state.
  perform pg_advisory_xact_lock(hashtextextended(p_role_id::text, 0));

  select calibration.id
  into v_existing_id
  from public.company_role_calibrations calibration
  where calibration.role_id = p_role_id
  order by calibration.created_at desc, calibration.id
  limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if not public.company_role_is_calibration_eligible_v1(p_role_id) then
    return null;
  end if;

  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = p_role_id;

  insert into public.company_role_calibrations (
    company_workspace_id,
    role_id,
    status,
    available_at,
    payload
  ) values (
    v_workspace_id,
    p_role_id,
    'queued',
    p_available_at,
    jsonb_build_object(
      'schemaVersion', 1,
      'trigger', jsonb_build_object(
        'reason', 'role_created',
        'queuedAt', timezone('utc', now())
      ),
      'run', jsonb_build_object(
        'runner', null,
        'startedAt', null,
        'finishedAt', null,
        'attempt', 0,
        'summary', null,
        'error', null
      ),
      'source', '{}'::jsonb,
      'profiles', '[]'::jsonb,
      'delivery', jsonb_build_object(
        'status', 'pending',
        'attempts', 0,
        'lastAttemptAt', null,
        'sentAt', null,
        'error', null
      )
    )
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.claim_company_role_calibration_v1(
  p_runner text
)
returns setof public.company_role_calibrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_role_calibrations calibration
  set
    status = case
      when public.company_role_is_calibration_eligible_v1(calibration.role_id)
        then 'queued'
      else 'canceled'
    end,
    available_at = timezone('utc', now()),
    payload = jsonb_set(
      coalesce(calibration.payload, '{}'::jsonb),
      '{run}',
      coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
        'error', case
          when public.company_role_is_calibration_eligible_v1(calibration.role_id)
            then 'stale_claim_recovered'
          else 'role_no_longer_eligible'
        end,
        'finishedAt', case
          when public.company_role_is_calibration_eligible_v1(calibration.role_id)
            then null
          else to_jsonb(timezone('utc', now()))
        end
      ),
      true
    )
  where calibration.status = 'running'
    and calibration.updated_at <= timezone('utc', now()) - interval '2 hours';

  update public.company_role_calibrations calibration
  set
    status = 'canceled',
    payload = jsonb_set(
      coalesce(calibration.payload, '{}'::jsonb),
      '{run}',
      coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
        'error', 'role_no_longer_eligible',
        'finishedAt', timezone('utc', now())
      ),
      true
    )
  where calibration.status in ('queued', 'running', 'ready')
    and not public.company_role_is_calibration_eligible_v1(calibration.role_id);

  return query
  with claimable as (
    select calibration.id
    from public.company_role_calibrations calibration
    where calibration.status = 'queued'
      and calibration.available_at <= timezone('utc', now())
      and public.company_role_is_calibration_eligible_v1(calibration.role_id)
    order by calibration.available_at, calibration.created_at, calibration.id
    for update of calibration skip locked
    limit 1
  )
  update public.company_role_calibrations calibration
  set
    status = 'running',
    payload = jsonb_set(
      calibration.payload,
      '{run}',
      coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
        'runner', nullif(btrim(coalesce(p_runner, '')), ''),
        'startedAt', timezone('utc', now()),
        'finishedAt', null,
        'attempt', coalesce((calibration.payload->'run'->>'attempt')::integer, 0) + 1,
        'summary', null,
        'error', null
      ),
      true
    )
  from claimable
  where calibration.id = claimable.id
  returning calibration.*;
end;
$$;

create or replace function public.finish_company_role_calibration_v1(
  p_calibration_id uuid,
  p_expected_calibration_updated_at timestamptz,
  p_expected_role_updated_at timestamptz,
  p_expected_internal_role_updated_at timestamptz,
  p_expected_company_updated_at timestamptz,
  p_source jsonb,
  p_profiles jsonb,
  p_summary text
)
returns public.company_role_calibrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile_count integer;
  v_row public.company_role_calibrations;
begin
  if jsonb_typeof(p_source) <> 'object' then
    raise exception 'calibration source must be an object';
  end if;
  if jsonb_typeof(p_profiles) <> 'array' then
    raise exception 'calibration profiles must be an array';
  end if;
  v_profile_count := jsonb_array_length(p_profiles);
  if v_profile_count < 3 or v_profile_count > 5 then
    raise exception 'calibration requires 3-5 profiles';
  end if;
  if (
    select count(distinct profile->>'profileId') <> v_profile_count
      or count(*) filter (
        where profile->>'profileId' not in ('A', 'B', 'C', 'D', 'E')
          or jsonb_typeof(profile->'display') <> 'object'
          or jsonb_typeof(profile->'source') <> 'object'
          or coalesce(profile->'review'->>'status', '') <> 'unreviewed'
      ) > 0
    from jsonb_array_elements(p_profiles) profile
  ) then
    raise exception 'invalid calibration profile contract';
  end if;

  update public.company_role_calibrations calibration
  set
    status = 'ready',
    payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          calibration.payload,
          '{source}',
          p_source,
          true
        ),
        '{profiles}',
        p_profiles,
        true
      ),
      '{run}',
      coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
        'finishedAt', timezone('utc', now()),
        'summary', nullif(btrim(coalesce(p_summary, '')), ''),
        'error', null
      ),
      true
    )
  where calibration.id = p_calibration_id
    and calibration.status = 'running'
    and calibration.updated_at = p_expected_calibration_updated_at
    and public.company_role_is_calibration_eligible_v1(calibration.role_id)
    and exists (
      select 1
      from public.company_roles role
      join public.company_internal_roles internal_role
        on internal_role.role_id = role.role_id
      where role.role_id = calibration.role_id
        and role.updated_at = p_expected_role_updated_at
        and internal_role.updated_at = p_expected_internal_role_updated_at
        and exists (
          select 1
          from public.company_workspace workspace
          where workspace.company_workspace_id = calibration.company_workspace_id
            and workspace.updated_at = p_expected_company_updated_at
        )
    )
  returning calibration.* into v_row;

  if v_row.id is null then
    raise exception 'calibration source changed or running claim is no longer current';
  end if;
  return v_row;
end;
$$;

create or replace function public.fail_company_role_calibration_v1(
  p_calibration_id uuid,
  p_error text
)
returns public.company_role_calibrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_role_calibrations;
begin
  update public.company_role_calibrations calibration
  set
    status = 'failed',
    payload = jsonb_set(
      calibration.payload,
      '{run}',
      coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
        'finishedAt', timezone('utc', now()),
        'error', left(nullif(btrim(coalesce(p_error, '')), ''), 500)
      ),
      true
    )
  where calibration.id = p_calibration_id
    and calibration.status = 'running'
  returning calibration.* into v_row;
  if v_row.id is null then
    raise exception 'running calibration not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.mark_company_role_calibration_delivery_v1(
  p_calibration_id uuid,
  p_delivered boolean,
  p_error text default null
)
returns public.company_role_calibrations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.company_role_calibrations;
begin
  update public.company_role_calibrations calibration
  set
    status = case
      when calibration.status = 'completed' then 'completed'
      when p_delivered then 'sent'
      else 'ready'
    end,
    payload = jsonb_set(
      calibration.payload,
      '{delivery}',
      coalesce(calibration.payload->'delivery', '{}'::jsonb) || jsonb_build_object(
        'status', case when p_delivered then 'sent' else 'pending' end,
        'attempts', coalesce((calibration.payload->'delivery'->>'attempts')::integer, 0) + 1,
        'lastAttemptAt', timezone('utc', now()),
        'sentAt', case
          when p_delivered then coalesce(
            calibration.payload->'delivery'->'sentAt',
            to_jsonb(timezone('utc', now()))
          )
          else calibration.payload->'delivery'->'sentAt'
        end,
        'error', case
          when p_delivered then null
          else left(nullif(btrim(coalesce(p_error, '')), ''), 500)
        end
      ),
      true
    )
  where calibration.id = p_calibration_id
    and calibration.status in ('ready', 'sent', 'completed')
    and (calibration.payload->'delivery'->>'status' is distinct from 'sent')
  returning calibration.* into v_row;

  if v_row.id is null then
    select calibration.*
    into v_row
    from public.company_role_calibrations calibration
    where calibration.id = p_calibration_id
      and calibration.status in ('sent', 'completed')
      and calibration.payload->'delivery'->>'status' = 'sent';
  end if;
  if v_row.id is null then
    raise exception 'deliverable calibration not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.apply_company_role_calibration_feedback_v1(
  p_calibration_id uuid,
  p_workspace_id uuid,
  p_role_id uuid,
  p_expected_calibration_updated_at timestamptz,
  p_expected_request text,
  p_reviews jsonb,
  p_hiring_brief text,
  p_finish boolean,
  p_reviewed_by uuid,
  p_source_message_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_calibration public.company_role_calibrations;
  v_changed_profiles integer := 0;
  v_now timestamptz := timezone('utc', now());
  v_profiles jsonb;
  v_request_updated boolean := false;
  v_status text;
  v_updated_at timestamptz;
begin
  if p_source_message_id is null or not exists (
    select 1
    from public.company_messages message
    where message.id = p_source_message_id
      and message.company_workspace_id = p_workspace_id
      and message.role = 'user'
  ) then
    raise exception 'feedback source message is outside this workspace';
  end if;
  if jsonb_typeof(p_reviews) <> 'array'
     or jsonb_array_length(p_reviews) > 5
     or (jsonb_array_length(p_reviews) < 1 and not coalesce(p_finish, false)) then
    raise exception 'feedback requires 1-5 profile reviews or an explicit finish';
  end if;
  if (
    select count(distinct review->>'profileId') <> jsonb_array_length(p_reviews)
      or count(*) filter (
        where review->>'status' not in ('good', 'bad')
          or review->>'profileId' not in ('A', 'B', 'C', 'D', 'E')
          or length(coalesce(review->>'reason', '')) > 1000
      ) > 0
    from jsonb_array_elements(p_reviews) review
  ) then
    raise exception 'invalid profile review contract';
  end if;
  if nullif(btrim(coalesce(p_hiring_brief, '')), '') is not null
     and not exists (
       select 1
       from jsonb_array_elements(p_reviews) review
       where nullif(btrim(coalesce(review->>'reason', '')), '') is not null
     ) then
    raise exception 'reasonless feedback cannot change the Hiring Brief';
  end if;

  select calibration.*
  into v_calibration
  from public.company_role_calibrations calibration
  where calibration.id = p_calibration_id
    and calibration.company_workspace_id = p_workspace_id
    and calibration.role_id = p_role_id
    and calibration.status in ('ready', 'sent', 'completed')
  for update;
  if v_calibration.id is null then
    raise exception 'reviewable calibration not found';
  end if;
  if v_calibration.updated_at <> p_expected_calibration_updated_at then
    raise exception 'calibration feedback conflict';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_reviews) review
    where not exists (
      select 1
      from jsonb_array_elements(v_calibration.payload->'profiles') profile
      where profile->>'profileId' = review->>'profileId'
    )
  ) > 0 then
    raise exception 'review references a profile outside this calibration';
  end if;

  select jsonb_agg(
    case
      when target.review is null then profile.value
      else jsonb_set(
        profile.value,
        '{review}',
        coalesce(profile.value->'review', '{}'::jsonb) || jsonb_build_object(
          'status', target.review->>'status',
          'reason', nullif(btrim(coalesce(target.review->>'reason', '')), ''),
          'reviewedAt', v_now,
          'reviewedBy', p_reviewed_by,
          'sourceMessageId', p_source_message_id
        ),
        true
      )
    end
    order by profile.ordinality
  )
  into v_profiles
  from jsonb_array_elements(v_calibration.payload->'profiles')
    with ordinality as profile(value, ordinality)
  left join lateral (
    select review
    from jsonb_array_elements(p_reviews) review
    where review->>'profileId' = profile.value->>'profileId'
    limit 1
  ) target on true;

  select count(*)
  into v_changed_profiles
  from jsonb_array_elements(p_reviews) review
  where exists (
    select 1
    from jsonb_array_elements(v_calibration.payload->'profiles') profile
    where profile->>'profileId' = review->>'profileId'
      and (
        profile->'review'->>'status' is distinct from review->>'status'
        or nullif(btrim(coalesce(profile->'review'->>'reason', '')), '')
          is distinct from nullif(btrim(coalesce(review->>'reason', '')), '')
      )
  );

  if nullif(btrim(coalesce(p_hiring_brief, '')), '') is not null
     and nullif(btrim(p_hiring_brief), '') is distinct from p_expected_request then
    update public.company_internal_roles internal_role
    set
      request = nullif(btrim(p_hiring_brief), ''),
      updated_at = v_now
    where internal_role.role_id = p_role_id
      and internal_role.request is not distinct from p_expected_request;
    if not found then
      raise exception 'Hiring Brief feedback conflict';
    end if;
    v_request_updated := true;
  elsif not exists (
    select 1
    from public.company_internal_roles internal_role
    where internal_role.role_id = p_role_id
      and internal_role.request is not distinct from p_expected_request
  ) then
    raise exception 'Hiring Brief feedback conflict';
  end if;

  v_status := case
    when coalesce(p_finish, false) or not exists (
      select 1
      from jsonb_array_elements(v_profiles) profile
      where coalesce(profile->'review'->>'status', 'unreviewed') = 'unreviewed'
    ) then 'completed'
    else v_calibration.status
  end;

  update public.company_role_calibrations calibration
  set
    status = v_status,
    payload = jsonb_set(v_calibration.payload, '{profiles}', v_profiles, true)
  where calibration.id = v_calibration.id
  returning calibration.updated_at into v_updated_at;

  return jsonb_build_object(
    'calibrationId', v_calibration.id,
    'changedProfiles', v_changed_profiles,
    'hiringBriefUpdated', v_request_updated,
    'status', v_status,
    'updatedAt', v_updated_at
  );
end;
$$;

create or replace function public.enqueue_company_role_calibration_from_role_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.company_role_is_calibration_eligible_v1(new.role_id) then
    update public.company_role_calibrations calibration
    set
      status = 'canceled',
      payload = jsonb_set(
        calibration.payload,
        '{run}',
        coalesce(calibration.payload->'run', '{}'::jsonb) || jsonb_build_object(
          'finishedAt', timezone('utc', now()),
          'error', 'role_no_longer_eligible'
        ),
        true
      )
    where calibration.role_id = new.role_id
      and calibration.status in ('queued', 'running', 'ready');
    return new;
  end if;

  -- The trigger only watches fields that can affect eligibility. Calling the
  -- idempotent enqueue helper on every eligible invocation also covers a Role
  -- that becomes non-test-only or receives a later expiry date.
  perform public.enqueue_company_role_calibration_v1(new.role_id);
  return new;
end;
$$;

create trigger company_roles_enqueue_calibration_v1
after insert or update of status, is_expired, expires_at, information
on public.company_roles
for each row execute function public.enqueue_company_role_calibration_from_role_v1();

create or replace function public.enqueue_company_role_calibration_from_internal_role_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.enqueue_company_role_calibration_v1(new.role_id);
  return new;
end;
$$;

create trigger company_internal_roles_enqueue_calibration_v1
after insert on public.company_internal_roles
for each row execute function public.enqueue_company_role_calibration_from_internal_role_v1();

revoke all on function public.company_role_is_calibration_eligible_v1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.enqueue_company_role_calibration_v1(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_company_role_calibration_v1(text)
  from public, anon, authenticated;
revoke all on function public.finish_company_role_calibration_v1(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.fail_company_role_calibration_v1(uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_company_role_calibration_delivery_v1(uuid, boolean, text)
  from public, anon, authenticated;
revoke all on function public.apply_company_role_calibration_feedback_v1(
  uuid, uuid, uuid, timestamptz, text, jsonb, text, boolean, uuid, bigint
) from public, anon, authenticated;

grant execute on function public.company_role_is_calibration_eligible_v1(uuid, timestamptz)
  to service_role;
grant execute on function public.enqueue_company_role_calibration_v1(uuid, timestamptz)
  to service_role;
grant execute on function public.claim_company_role_calibration_v1(text)
  to service_role;
grant execute on function public.finish_company_role_calibration_v1(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, jsonb, jsonb, text
) to service_role;
grant execute on function public.fail_company_role_calibration_v1(uuid, text)
  to service_role;
grant execute on function public.mark_company_role_calibration_delivery_v1(uuid, boolean, text)
  to service_role;
grant execute on function public.apply_company_role_calibration_feedback_v1(
  uuid, uuid, uuid, timestamptz, text, jsonb, text, boolean, uuid, bigint
) to service_role;

commit;
