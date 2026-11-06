-- Harper's own schedules: effect tiers and limits (G1c, D15).
--
-- company_agent_schedules (#227) held only follow-ups inside an introduction's
-- agent correspondence. The schedule tool now opens in ordinary company
-- conversations too, so a schedule says what its run may do and who asked:
--
-- - effect_tier: 0 look again (read, message the company), 1 also propose,
--   2 also spend or reach outside (search, contact candidates, publish).
-- - created_by: user when a company member's message started the run that
--   saved it, agent when an event or another schedule did. A schedule Harper
--   made on its own is tier 0 or 1; tier 2 needs a person's request.
-- - Limits: at most 5 active schedules per Role, recurring no more often than
--   daily, ending within 30 days (expires_at), optional max_runs. The daily
--   cap of 20 runs per company is applied when runs are started (web).
-- - A schedule tied to an introduction (target_refs.introductionRootId) keeps
--   its existing behavior; these rules do not apply to it.
-- - A company member cancelling a schedule is a company decision
--   (decision record: subject agent_schedule, action cancel): from the To-do,
--   or Harper cancelling it in reply to the member's own chat or Slack
--   message. Harper cancelling during a run started by a button or an event
--   (source.actor = agent) is not, nor is the scheduler closing a schedule
--   (its source is left as it was) or an introduction's follow-up.

alter table public.company_agent_schedules
  add column if not exists effect_tier smallint not null default 2
    check (effect_tier in (0, 1, 2)),
  add column if not exists created_by text check (created_by in ('user', 'agent')),
  add column if not exists expires_at timestamptz,
  add column if not exists max_runs integer check (max_runs is null or max_runs > 0),
  add column if not exists run_count integer not null default 0;

create or replace function public.guard_company_agent_schedule_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.target_refs, '{}'::jsonb) ? 'introductionRootId' then
    return new;
  end if;
  if new.created_by is null then
    raise exception using errcode = '23514', message = 'company_schedule_creator_required';
  end if;
  if new.created_by = 'agent' and new.effect_tier > 1 then
    raise exception using errcode = '23514', message = 'company_schedule_tier_requires_user';
  end if;
  if tg_op = 'INSERT' then
    new.expires_at := coalesce(new.expires_at, now() + interval '30 days');
  end if;
  if new.expires_at is null or new.expires_at > coalesce(
       case when tg_op = 'UPDATE' then old.created_at end, now()) + interval '30 days 1 minute' then
    raise exception using errcode = '23514', message = 'company_schedule_expiry_too_far';
  end if;
  if new.interval_days is not null and new.interval_days < 1 then
    raise exception using errcode = '23514', message = 'company_schedule_interval_too_short';
  end if;
  -- The Role limit is checked when a schedule becomes active, one Role at a
  -- time, so routine updates of active rows (each run's next time and count)
  -- never fail on it.
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform pg_advisory_xact_lock(hashtextextended('company_agent_schedule_role:' || new.role_id::text, 0));
    if (
      select count(*) from public.company_agent_schedules other
      where other.role_id = new.role_id and other.id <> new.id and other.status = 'active'
        and not coalesce(other.target_refs, '{}'::jsonb) ? 'introductionRootId'
    ) >= 5 then
      raise exception using errcode = '23514', message = 'company_schedule_role_limit';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_company_agent_schedule_v1() from public, anon, authenticated, service_role;

create trigger company_agent_schedules_guard
  before insert or update on public.company_agent_schedules
  for each row execute function public.guard_company_agent_schedule_v1();

-- A company member cancelling a schedule goes into the decision record.
alter table public.company_decision_events drop constraint if exists company_decision_events_subject_kind_check;
alter table public.company_decision_events add constraint company_decision_events_subject_kind_check
  check (subject_kind in ('member_candidate', 'external_candidate', 'todo_suggestion',
    'suggestion_kind', 'proposal', 'agent_schedule'));
alter table public.company_decision_events drop constraint if exists company_decision_events_action_check;
alter table public.company_decision_events add constraint company_decision_events_action_check
  check (action in ('request_intro', 'pass', 'save', 'unsave', 'stage_change', 'stop', 'rate',
    'view', 'note', 'accept', 'reject', 'mute', 'unmute', 'cancel'));

create or replace function public.record_company_schedule_cancel_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := coalesce(new.source ->> 'channel', 'chat');
begin
  insert into public.company_decision_events (
    company_workspace_id, role_id, subject_kind, subject_id, action, detail, channel,
    actor_user_id, idempotency_key
  ) values (
    new.company_workspace_id, new.role_id, 'agent_schedule', new.id, 'cancel',
    jsonb_build_object('title', new.title, 'effectTier', new.effect_tier, 'createdBy', new.created_by,
      'revision', new.revision),
    case when v_channel in ('web', 'todo', 'chat', 'slack', 'email') then v_channel else 'unknown' end,
    case when new.source ->> 'userId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then (new.source ->> 'userId')::uuid end,
    'agent_schedule:' || new.id::text || ':cancel:' || new.revision::text
  )
  on conflict (role_id, idempotency_key) do nothing;
  return new;
end;
$$;

revoke all on function public.record_company_schedule_cancel_v1() from public, anon, authenticated, service_role;

create trigger company_agent_schedules_cancel_decision
  after update of status on public.company_agent_schedules
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled'
    and not coalesce(new.target_refs, '{}'::jsonb) ? 'introductionRootId'
    and new.source is distinct from old.source
    and new.source ->> 'kind' = 'company' and coalesce(new.source ->> 'actor', 'user') = 'user')
  execute function public.record_company_schedule_cancel_v1();
