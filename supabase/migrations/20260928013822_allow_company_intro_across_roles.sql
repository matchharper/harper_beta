-- Registration is independent per Role. The existing active Role–Talent index
-- continues to prevent duplicate cards within one Role.
-- Keep the advisory lock key compatible with running Worker versions; it only
-- serializes transactions and does not restrict cross-Role registrations.
begin;

drop index if exists public.company_intro_candidates_active_workspace_talent_idx;

create or replace function public.guard_candidate_first_against_company_intro_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = new.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal';

  if v_workspace_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_talent_route:' || v_workspace_id::text || ':' || new.talent_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status in ('ready', 'connecting')
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first route already exists for this Role and Talent';
  end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status = 'awaiting_talent'
      and not (
        intro.role_id = new.role_id
        and intro.recommendation_id is null
        and intro.requested_at is not null
        and intro.next_stage_id is not null
        and cardinality(intro.intro_recipient_emails) > 0
        and new.opportunity_type = 'intro_request'
        and new.discovery_run_id = intro.delivery_run_id
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'another company-first route already exists for this Role and Talent';
  end if;

  return new;
end;
$$;

create or replace function public.route_candidate_priority_request_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
begin
  if new.kind <> 'candidate_requested_connection' then
    return new;
  end if;

  select role.company_workspace_id
  into v_workspace_id
  from public.company_roles role
  where role.role_id = new.role_id
    and lower(btrim(coalesce(role.source_type, ''))) = 'internal';

  if v_workspace_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'company_talent_route:' || v_workspace_id::text || ':' || new.talent_id::text,
      0
    )
  );

  -- An explicit Talent request replaces the same Role's company-only ready card.
  -- Preserve other Role routes. Closing this card also prevents delivery of its
  -- sealed but unsent Slack outbox.
  update public.company_intro_candidates intro
  set status = 'closed',
      close_reason = 'route_replaced',
      revision = intro.revision + 1,
      updated_at = timezone('utc', now())
  where intro.company_workspace_id = v_workspace_id
    and intro.role_id = new.role_id
    and intro.talent_id = new.talent_id
    and intro.status = 'ready';

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.role_id = new.role_id
      and intro.talent_id = new.talent_id
      and intro.status in ('awaiting_talent', 'connecting')
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first request already exists for this Role and Talent';
  end if;

  return new;
end;
$$;

-- CREATE OR REPLACE preserves the existing service-only function grants.
commit;
