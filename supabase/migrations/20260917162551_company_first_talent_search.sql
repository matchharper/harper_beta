-- Company-first talent search and intro-request lifecycle.
begin;

alter table public.company_internal_roles
  add column if not exists is_company_first_search boolean not null default false;

update public.company_internal_roles
set is_company_first_search = false
where is_company_first_search is null;

alter table public.company_internal_roles
  alter column is_company_first_search set not null;

create table if not exists public.company_first_search_runs (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  scheduled_slot timestamptz not null,
  trigger_reason text not null default 'scheduled',
  contract_version text not null default 'company_first_run_contract_v1',
  status text not null default 'queued',
  available_at timestamptz not null default timezone('utc', now()),
  source_cutoff timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  query_plan jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  model_manifest jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  selection_committed_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_first_search_runs_status_check check (
    status in (
      'queued', 'running', 'skipped', 'delivery_pending', 'succeeded', 'failed'
    )
  ),
  constraint company_first_search_runs_trigger_check check (
    trigger_reason in ('scheduled', 'manual', 'recovery', 'shadow')
  ),
  constraint company_first_search_runs_attempt_check check (attempt_count >= 0),
  constraint company_first_search_runs_lease_check check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null)
    or status <> 'running'
  )
);

create unique index if not exists company_first_search_runs_slot_unique_idx
  on public.company_first_search_runs (
    company_workspace_id,
    scheduled_slot,
    contract_version
  );
create index if not exists company_first_search_runs_claim_idx
  on public.company_first_search_runs (status, available_at, scheduled_slot, id)
  where status = 'queued';
create index if not exists company_first_search_runs_recovery_idx
  on public.company_first_search_runs (lease_expires_at, id)
  where status = 'running';

create table if not exists public.company_intro_candidates (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  selection_run_id uuid not null
    references public.company_first_search_runs(id) on delete restrict,
  selected_at timestamptz not null default timezone('utc', now()),
  selection_reason text not null,
  presentation jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  close_reason text,
  revision integer not null default 1,
  recommendation_id uuid unique
    references public.talent_opportunity_recommendation(id) on delete restrict,
  requested_by_company_user_id uuid
    references public.company_users(user_id) on delete set null,
  requested_at timestamptz,
  company_appeal text,
  next_stage_id uuid references public.ops_matching_role_stages(id) on delete restrict,
  intro_recipient_emails text[] not null default '{}'::text[],
  delivery_run_id uuid unique
    references public.opportunity_discovery_run(id) on delete restrict,
  candidate_sent_at timestamptz,
  talent_decision_at timestamptz,
  connected_at timestamptz,
  role_fingerprint text not null,
  talent_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_intro_candidates_status_check check (
    status in ('ready', 'awaiting_talent', 'connecting', 'connected', 'passed', 'closed')
  ),
  constraint company_intro_candidates_close_reason_check check (
    close_reason is null or close_reason in (
      'company_passed', 'talent_declined', 'talent_no_response', 'role_closed',
      'privacy_withdrawn', 'route_replaced', 'operator_closed'
    )
  ),
  constraint company_intro_candidates_revision_check check (revision > 0),
  constraint company_intro_candidates_ready_shape_check check (
    status <> 'ready'
    or (
      recommendation_id is null
      and requested_by_company_user_id is null
      and requested_at is null
      and company_appeal is null
      and next_stage_id is null
      and cardinality(intro_recipient_emails) = 0
      and delivery_run_id is null
      and candidate_sent_at is null
      and talent_decision_at is null
      and connected_at is null
    )
  ),
  constraint company_intro_candidates_request_shape_check check (
    status not in ('awaiting_talent', 'connecting', 'connected')
    or (
      requested_at is not null
      and nullif(btrim(company_appeal), '') is not null
      and next_stage_id is not null
      and cardinality(intro_recipient_emails) > 0
      and delivery_run_id is not null
    )
  )
);

-- Reconcile the earlier pre-release delivery column with the durable discovery
-- run used by the shared internal-recommendation delivery/follow-up pipeline.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_intro_candidates'
      and column_name = 'candidate_delivery_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_intro_candidates'
      and column_name = 'delivery_run_id'
  ) then
    alter table public.company_intro_candidates
      rename column candidate_delivery_id to delivery_run_id;
  end if;
end;
$$;

alter table public.company_intro_candidates
  add column if not exists company_appeal text,
  add column if not exists delivery_run_id uuid;

alter table public.company_intro_candidates
  drop constraint if exists company_intro_candidates_candidate_delivery_id_fkey,
  drop constraint if exists company_intro_candidates_delivery_run_id_fkey,
  drop constraint if exists company_intro_candidates_delivery_run_id_key,
  drop constraint if exists company_intro_candidates_ready_shape_check,
  drop constraint if exists company_intro_candidates_request_shape_check;

alter table public.company_intro_candidates
  add constraint company_intro_candidates_delivery_run_id_fkey
    foreign key (delivery_run_id)
    references public.opportunity_discovery_run(id) on delete restrict,
  add constraint company_intro_candidates_delivery_run_id_key
    unique (delivery_run_id),
  add constraint company_intro_candidates_ready_shape_check check (
    status <> 'ready'
    or (
      recommendation_id is null
      and requested_by_company_user_id is null
      and requested_at is null
      and company_appeal is null
      and next_stage_id is null
      and cardinality(intro_recipient_emails) = 0
      and delivery_run_id is null
      and candidate_sent_at is null
      and talent_decision_at is null
      and connected_at is null
    )
  ),
  add constraint company_intro_candidates_request_shape_check check (
    status not in ('awaiting_talent', 'connecting', 'connected')
    or (
      requested_at is not null
      and nullif(btrim(company_appeal), '') is not null
      and next_stage_id is not null
      and cardinality(intro_recipient_emails) > 0
      and delivery_run_id is not null
    )
  );

drop index if exists public.company_intro_candidates_active_workspace_talent_idx;
drop index if exists public.company_intro_candidates_active_pair_idx;
create unique index if not exists company_intro_candidates_active_workspace_talent_idx
  on public.company_intro_candidates (company_workspace_id, talent_id)
  where status in ('ready', 'awaiting_talent', 'connecting');
create unique index if not exists company_intro_candidates_active_pair_idx
  on public.company_intro_candidates (role_id, talent_id)
  where status in ('ready', 'awaiting_talent', 'connecting');
create index if not exists company_intro_candidates_ready_workspace_idx
  on public.company_intro_candidates (company_workspace_id, selected_at, id)
  where status = 'ready';
create index if not exists company_intro_candidates_role_status_idx
  on public.company_intro_candidates (role_id, status, updated_at, id);

create table if not exists public.company_first_slack_outbox (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.company_first_search_runs(id) on delete cascade,
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  channel_id uuid not null
    references public.company_slack_channels(id) on delete restrict,
  chunk_index integer not null default 0,
  idempotency_key text not null,
  candidate_ids uuid[] not null default '{}'::uuid[],
  role_ids uuid[] not null default '{}'::uuid[],
  message_text text not null,
  blocks jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  sent_at timestamptz,
  slack_message_ts text,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_first_slack_outbox_status_check check (
    status in ('pending', 'sending', 'sent', 'failed', 'canceled')
  ),
  constraint company_first_slack_outbox_chunk_check check (chunk_index >= 0),
  constraint company_first_slack_outbox_attempt_check check (attempt_count >= 0),
  constraint company_first_slack_outbox_message_check check (btrim(message_text) <> '')
);

-- An earlier pre-release draft added the opt-in column as nullable with default
-- true. Normalize that empty, never-run draft before enabling the scheduler.
do $$
declare
  v_default text;
begin
  select pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
  into v_default
  from pg_attrdef attribute_default
  join pg_attribute attribute
    on attribute.attrelid = attribute_default.adrelid
   and attribute.attnum = attribute_default.adnum
  where attribute_default.adrelid = 'public.company_internal_roles'::regclass
    and attribute.attname = 'is_company_first_search';

  if v_default in ('true', 'true::boolean')
    and not exists (select 1 from public.company_first_search_runs)
    and not exists (select 1 from public.company_intro_candidates)
    and not exists (select 1 from public.company_first_slack_outbox) then
    update public.company_internal_roles
    set is_company_first_search = false
    where is_company_first_search is true;
  end if;
end;
$$;

alter table public.company_internal_roles
  alter column is_company_first_search set default false;

create unique index if not exists company_first_slack_outbox_run_channel_chunk_idx
  on public.company_first_slack_outbox (run_id, channel_id, chunk_index);
create unique index if not exists company_first_slack_outbox_idempotency_idx
  on public.company_first_slack_outbox (idempotency_key);
create index if not exists company_first_slack_outbox_delivery_idx
  on public.company_first_slack_outbox (status, available_at, id)
  where status in ('pending', 'failed');
create index if not exists company_first_slack_outbox_stale_claim_idx
  on public.company_first_slack_outbox (claimed_at, id)
  where status = 'sending';

create or replace function public.company_first_outbox_is_deliverable_v1(
  p_outbox_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_first_slack_outbox outbox
    join public.company_slack_channels channel
      on channel.id = outbox.channel_id
     and channel.company_workspace_id = outbox.company_workspace_id
     and channel.is_enabled = true
    join public.company_slack_integrations integration
      on integration.company_workspace_id = outbox.company_workspace_id
     and integration.status = 'active'
     and integration.bot_token_ciphertext is not null
    where outbox.id = p_outbox_id
      and cardinality(outbox.candidate_ids) > 0
      and not exists (
        select 1
        from unnest(outbox.candidate_ids) as candidate(candidate_id)
        left join public.company_intro_candidates intro
          on intro.id = candidate.candidate_id
         and intro.company_workspace_id = outbox.company_workspace_id
        left join public.talent_users talent on talent.user_id = intro.talent_id
        left join public.talent_setting setting on setting.user_id = intro.talent_id
        left join public.company_workspace workspace
          on workspace.company_workspace_id = outbox.company_workspace_id
        left join public.company_roles role on role.role_id = intro.role_id
        left join public.company_internal_roles internal_role
          on internal_role.role_id = intro.role_id
        where intro.id is null
           or intro.status <> 'ready'
           or talent.user_id is null
           or talent.deleted_at is not null
           or setting.user_id is null
           or setting.is_onboarding_done is not true
           or setting.profile_visibility <> 'open_to_matches'
           or setting.get_internal_recommendation is false
           or exists (
             select 1
             from unnest(coalesce(setting.blocked_companies, '{}'::text[])) blocked(name)
             where lower(btrim(blocked.name)) in (
               lower(btrim(workspace.company_name)),
               lower(btrim(coalesce(workspace.published_name, '')))
             )
           )
           or role.role_id is null
           or lower(btrim(coalesce(role.source_type, ''))) <> 'internal'
           or lower(btrim(coalesce(role.status, ''))) <> 'active'
           or coalesce(role.is_expired, false)
           or (role.expires_at is not null and role.expires_at <= timezone('utc', now()))
           or coalesce(lower(btrim(role.information->>'testOnly')), '') in (
             'true', '1', 'yes', 'on'
           )
           or internal_role.is_company_first_search is not true
           or exists (
             select 1
             from public.company_role_notification_channels opt_out
             where opt_out.role_id = intro.role_id
               and opt_out.channel_id = outbox.channel_id
           )
      )
  );
$$;

comment on table public.company_first_search_runs is
  'Company-scoped Company-first selection queue and execution ledger.';
comment on table public.company_intro_candidates is
  'Company-first candidate lifecycle. A ready row is company-visible but not candidate-visible.';
comment on table public.company_first_slack_outbox is
  'Sealed, idempotent Slack delivery chunks for committed Company-first selections.';
comment on column public.company_intro_candidates.selection_reason is
  'Company-safe rationale only; never stores raw Brief, Memory, reply evidence, or chain-of-thought.';
comment on column public.company_intro_candidates.company_appeal is
  'Candidate-visible company-authored context explaining why the company wants the introduction.';

create or replace function public.request_company_intro_v1(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid,
  p_next_stage_id uuid,
  p_intro_recipient_emails text[],
  p_company_appeal text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_intro public.company_intro_candidates%rowtype;
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_setting public.talent_setting%rowtype;
  v_conversation_id uuid;
  v_run_id uuid := gen_random_uuid();
  v_emails text[];
  v_appeal text := nullif(left(btrim(coalesce(p_company_appeal, '')), 4000), '');
begin
  if p_intro_candidate_id is null
    or p_company_workspace_id is null
    or p_company_user_id is null
    or p_next_stage_id is null then
    raise exception using errcode = '22023', message = 'company_intro_missing_input';
  end if;

  v_emails := array(
    select distinct lower(btrim(email))
    from unnest(coalesce(p_intro_recipient_emails, '{}'::text[])) email
    where btrim(email) <> ''
    order by lower(btrim(email))
  );
  if cardinality(v_emails) = 0
    or exists (
      select 1 from unnest(v_emails) email
      where email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ) then
    raise exception using errcode = '22023', message = 'company_intro_invalid_recipients';
  end if;
  if v_appeal is null or char_length(v_appeal) < 20 then
    raise exception using errcode = '22023', message = 'company_intro_appeal_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('company_intro_request:' || p_intro_candidate_id::text, 0)
  );

  select intro.* into v_intro
  from public.company_intro_candidates intro
  where intro.id = p_intro_candidate_id
    and intro.company_workspace_id = p_company_workspace_id
  for update;
  if v_intro.id is null then
    raise exception using errcode = 'P0002', message = 'company_intro_not_found';
  end if;
  if v_intro.status = 'awaiting_talent' then
    return jsonb_build_object(
      'status', 'already_requested',
      'introCandidateId', v_intro.id,
      'deliveryRunId', v_intro.delivery_run_id,
      'recommendationId', v_intro.recommendation_id
    );
  end if;
  if v_intro.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'company_intro_not_requestable';
  end if;

  select role.* into v_role
  from public.company_roles role
  where role.role_id = v_intro.role_id
    and role.company_workspace_id = p_company_workspace_id
  for share;
  if v_role.role_id is null
    or lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
    or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
    or coalesce(v_role.is_expired, false)
    or (v_role.expires_at is not null and v_role.expires_at <= v_now)
    or not exists (
      select 1 from public.company_internal_roles internal_role
      where internal_role.role_id = v_role.role_id
        and internal_role.is_company_first_search is true
    )
    or coalesce(lower(btrim(v_role.information->>'testOnly')), '') in ('true', '1', 'yes', 'on') then
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'role_closed',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    return jsonb_build_object(
      'status', 'role_unavailable', 'introCandidateId', v_intro.id
    );
  end if;
  if not exists (
    select 1 from public.ops_matching_role_stages stage
    where stage.id = p_next_stage_id and stage.role_id = v_intro.role_id
  ) then
    raise exception using errcode = '22023', message = 'company_intro_next_stage_invalid';
  end if;

  select setting.* into v_setting
  from public.talent_setting setting
  join public.talent_users talent on talent.user_id = setting.user_id
  where setting.user_id = v_intro.talent_id
    and talent.deleted_at is null
  for share of setting;
  if v_setting.user_id is null
    or v_setting.is_onboarding_done is not true
    or lower(btrim(coalesce(v_setting.profile_visibility, ''))) <> 'open_to_matches'
    or v_setting.get_internal_recommendation is false then
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'privacy_withdrawn',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    return jsonb_build_object(
      'status', 'talent_unavailable', 'introCandidateId', v_intro.id
    );
  end if;

  select workspace.* into v_workspace
  from public.company_workspace workspace
  where workspace.company_workspace_id = p_company_workspace_id;
  if exists (
    select 1
    from unnest(coalesce(v_setting.blocked_companies, '{}'::text[])) blocked(name)
    where lower(btrim(blocked.name)) in (
      lower(btrim(v_workspace.company_name)),
      lower(btrim(coalesce(v_workspace.published_name, '')))
    )
  ) then
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'privacy_withdrawn',
        revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    return jsonb_build_object(
      'status', 'talent_unavailable', 'introCandidateId', v_intro.id
    );
  end if;

  select conversation.id into v_conversation_id
  from public.talent_conversations conversation
  where conversation.user_id = v_intro.talent_id
  order by conversation.updated_at desc, conversation.created_at desc
  limit 1;

  insert into public.opportunity_discovery_run (
    id, talent_id, conversation_id, run_mode, status, trigger,
    target_recommendation_count, settings_snapshot, trigger_payload,
    dedupe_key
  ) values (
    v_run_id, v_intro.talent_id, v_conversation_id, 'immediate', 'queued',
    'immediate_opportunity_requested', 1,
    jsonb_build_object(
      'getExternalRecommendation', false,
      'profileVisibility', v_setting.profile_visibility,
      'recommendationBatchSize', 1
    ),
    jsonb_build_object(
      'entryPoint', 'company_first_intro_request',
      'opportunityAgentVariant', 'new_harper_agent_v2',
      'source', 'company_first_intro_request',
      'companyIntroCandidateId', v_intro.id,
      'manualInternalRecommendation', jsonb_build_object(
        'allowRepeat', true,
        'companyAppeal', v_appeal,
        'companyIntroCandidateId', v_intro.id,
        'companyName', v_workspace.company_name,
        'reason', v_intro.selection_reason,
        'requestedAt', v_now,
        'requestedBy', p_company_user_id,
        'roleId', v_intro.role_id,
        'roleName', v_role.name,
        'source', 'company_first_intro_request',
        'type', 'company_first_intro_request'
      ),
      'recommendationPolicy', jsonb_build_object(
        'external', 'none', 'internal', 'forced_single_role'
      )
    ),
    'company_first_intro_request:' || v_intro.id::text || ':' || v_intro.revision::text
  );

  update public.company_intro_candidates
  set status = 'awaiting_talent', requested_by_company_user_id = p_company_user_id,
      requested_at = v_now, company_appeal = v_appeal,
      next_stage_id = p_next_stage_id, intro_recipient_emails = v_emails,
      delivery_run_id = v_run_id, close_reason = null,
      revision = revision + 1, updated_at = v_now
  where id = v_intro.id;

  return jsonb_build_object(
    'status', 'requested',
    'introCandidateId', v_intro.id,
    'deliveryRunId', v_run_id,
    'nextStageId', p_next_stage_id,
    'requestedAt', v_now
  );
end;
$$;

create or replace function public.pass_company_intro_v1(
  p_intro_candidate_id uuid,
  p_company_workspace_id uuid,
  p_company_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_intro public.company_intro_candidates%rowtype;
begin
  select intro.* into v_intro
  from public.company_intro_candidates intro
  where intro.id = p_intro_candidate_id
    and intro.company_workspace_id = p_company_workspace_id
  for update;
  if v_intro.id is null then
    raise exception using errcode = 'P0002', message = 'company_intro_not_found';
  end if;
  if v_intro.status = 'passed' then
    return jsonb_build_object('status', 'already_passed', 'introCandidateId', v_intro.id);
  end if;
  if v_intro.status <> 'ready' then
    raise exception using errcode = 'P0001', message = 'company_intro_not_passable';
  end if;
  update public.company_intro_candidates
  set status = 'passed', close_reason = 'company_passed',
      requested_by_company_user_id = p_company_user_id,
      revision = revision + 1, updated_at = v_now
  where id = v_intro.id;
  return jsonb_build_object('status', 'passed', 'introCandidateId', v_intro.id);
end;
$$;

create or replace function public.decide_company_intro_request_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_decision text,
  p_feedback_reason text default null,
  p_email_acceptance_confirmation jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_intro public.company_intro_candidates%rowtype;
  v_role public.company_roles%rowtype;
  v_setting public.talent_setting%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_changed boolean := false;
begin
  if lower(btrim(coalesce(p_decision, ''))) not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'company_intro_decision_invalid';
  end if;
  if p_email_acceptance_confirmation is not null
    and (jsonb_typeof(p_email_acceptance_confirmation) <> 'object'
      or octet_length(p_email_acceptance_confirmation::text) > 4000) then
    raise exception using errcode = '22023', message = 'company_intro_confirmation_invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('talent-role-recommendation-change:' || p_talent_id::text, 0)
  );
  select intro.* into v_intro
  from public.company_intro_candidates intro
  join public.talent_opportunity_recommendation recommendation
    on recommendation.id = intro.recommendation_id
   and recommendation.talent_id = p_talent_id
   and recommendation.opportunity_type = 'intro_request'
  where intro.recommendation_id = p_recommendation_id
    and intro.talent_id = p_talent_id
  for update of intro;
  if v_intro.id is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_not_found');
  end if;

  if lower(btrim(p_decision)) = 'decline' then
    if v_intro.status in ('passed', 'closed') then
      return jsonb_build_object(
        'status', 'no_change', 'reason', coalesce(v_intro.close_reason, 'already_closed'),
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id,
        'nextStageId', v_intro.next_stage_id,
        'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
        'introRecipientEmails', v_intro.intro_recipient_emails
      );
    end if;
    if v_intro.status not in ('awaiting_talent', 'connecting') then
      return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_not_awaiting');
    end if;
    update public.talent_opportunity_recommendation
    set feedback = 'dislike', feedback_at = v_now,
        feedback_reason = nullif(left(btrim(coalesce(p_feedback_reason, '')), 1000), ''),
        saved_stage = null, email_acceptance_confirmation = coalesce(
          p_email_acceptance_confirmation, email_acceptance_confirmation
        ), updated_at = v_now
    where id = p_recommendation_id and talent_id = p_talent_id;
    update public.company_intro_candidates
    set status = 'closed', close_reason = 'talent_declined',
        talent_decision_at = v_now, revision = revision + 1, updated_at = v_now
    where id = v_intro.id;
    delete from public.talent_opportunity_tag
    where talent_id = p_talent_id and opportunity_id = v_intro.role_id
      and (tag like '내부:%' or tag like '내부단계:%');
    v_changed := true;
  else
    if v_intro.status = 'connected' then
      return jsonb_build_object(
        'status', 'no_change', 'reason', 'already_connected',
        'introCandidateId', v_intro.id, 'decisionChanged', false,
        'companyWorkspaceId', v_intro.company_workspace_id,
        'roleId', v_intro.role_id, 'nextStageId', v_intro.next_stage_id
      );
    end if;
    if v_intro.status not in ('awaiting_talent', 'connecting') then
      return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_not_awaiting');
    end if;
    select setting.* into v_setting
    from public.talent_setting setting
    join public.talent_users talent on talent.user_id = setting.user_id
    where setting.user_id = p_talent_id and talent.deleted_at is null;
    select role.* into v_role
    from public.company_roles role where role.role_id = v_intro.role_id;
    select workspace.* into v_workspace
    from public.company_workspace workspace
    where workspace.company_workspace_id = v_intro.company_workspace_id;
    if v_setting.user_id is null
      or v_setting.is_onboarding_done is not true
      or lower(btrim(coalesce(v_setting.profile_visibility, ''))) <> 'open_to_matches'
      or v_setting.get_internal_recommendation is false
      or exists (
        select 1
        from unnest(coalesce(v_setting.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (
          lower(btrim(v_workspace.company_name)),
          lower(btrim(coalesce(v_workspace.published_name, '')))
        )
      )
      or v_workspace.company_workspace_id is null
      or lower(btrim(coalesce(v_role.source_type, ''))) <> 'internal'
      or v_role.role_id is null
      or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
      or coalesce(v_role.is_expired, false)
      or (v_role.expires_at is not null and v_role.expires_at <= v_now)
      or not exists (
        select 1 from public.company_internal_roles internal_role
        where internal_role.role_id = v_role.role_id
          and internal_role.is_company_first_search is true
      )
      or coalesce(lower(btrim(v_role.information->>'testOnly')), '') in ('true', '1', 'yes', 'on') then
      update public.company_intro_candidates
      set status = 'closed',
          close_reason = case
            when v_role.role_id is null
              or lower(btrim(coalesce(v_role.status, ''))) not in ('active', 'paused', 'top_priority')
              or coalesce(v_role.is_expired, false)
              or (v_role.expires_at is not null and v_role.expires_at <= v_now)
              or not exists (
                select 1 from public.company_internal_roles internal_role
                where internal_role.role_id = v_role.role_id
                  and internal_role.is_company_first_search is true
              )
              or coalesce(lower(btrim(v_role.information->>'testOnly')), '') in ('true', '1', 'yes', 'on')
            then 'role_closed'
            else 'privacy_withdrawn'
          end,
          revision = revision + 1,
          updated_at = v_now
      where id = v_intro.id;
      update public.talent_opportunity_recommendation
      set saved_stage = 'closed',
          dismissed_at = coalesce(dismissed_at, v_now),
          updated_at = v_now
      where id = p_recommendation_id and talent_id = p_talent_id;
      return jsonb_build_object('status', 'unavailable', 'reason', 'company_intro_unavailable');
    end if;
    if v_intro.status = 'awaiting_talent' then
      update public.talent_opportunity_recommendation
      set feedback = 'like', feedback_at = v_now,
          feedback_reason = nullif(left(btrim(coalesce(p_feedback_reason, '')), 1000), ''),
          saved_stage = 'connected', email_acceptance_confirmation = coalesce(
            p_email_acceptance_confirmation, email_acceptance_confirmation
          ), updated_at = v_now
      where id = p_recommendation_id and talent_id = p_talent_id;
      delete from public.talent_opportunity_tag
      where talent_id = p_talent_id and opportunity_id = v_intro.role_id
        and (tag like '내부:%' or tag like '내부단계:%');
      insert into public.talent_opportunity_tag (talent_id, opportunity_id, tag)
      values (p_talent_id, v_intro.role_id, '내부:연결대기');
      update public.company_intro_candidates
      set status = 'connecting', close_reason = null,
          talent_decision_at = v_now, revision = revision + 1, updated_at = v_now
      where id = v_intro.id;
      v_changed := true;
    end if;
  end if;

  return jsonb_build_object(
    'status', case when lower(btrim(p_decision)) = 'accept' then 'accepted' else 'declined' end,
    'introCandidateId', v_intro.id,
    'decisionChanged', v_changed,
    'companyWorkspaceId', v_intro.company_workspace_id,
    'roleId', v_intro.role_id,
    'nextStageId', v_intro.next_stage_id,
    'requestedByCompanyUserId', v_intro.requested_by_company_user_id,
    'introRecipientEmails', v_intro.intro_recipient_emails
  );
end;
$$;

create or replace function public.close_company_intro_on_privacy_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.company_intro_candidates intro
  set status = 'closed', close_reason = 'privacy_withdrawn',
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  from public.company_workspace workspace
  where intro.talent_id = new.user_id
    and workspace.company_workspace_id = intro.company_workspace_id
    and intro.status in ('ready', 'awaiting_talent')
    and (
      new.is_onboarding_done is not true
      or
      lower(btrim(coalesce(new.profile_visibility, ''))) <> 'open_to_matches'
      or new.get_internal_recommendation is false
      or exists (
        select 1
        from unnest(coalesce(new.blocked_companies, '{}'::text[])) blocked(name)
        where lower(btrim(blocked.name)) in (
          lower(btrim(workspace.company_name)),
          lower(btrim(coalesce(workspace.published_name, '')))
        )
      )
    );
  update public.talent_opportunity_recommendation recommendation
  set saved_stage = 'closed', dismissed_at = coalesce(dismissed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where recommendation.talent_id = new.user_id
    and recommendation.opportunity_type = 'intro_request'
    and exists (
      select 1 from public.company_intro_candidates intro
      where intro.recommendation_id = recommendation.id
        and intro.close_reason = 'privacy_withdrawn'
    );
  return new;
end;
$$;

drop trigger if exists talent_setting_close_company_intro_on_privacy
  on public.talent_setting;
create trigger talent_setting_close_company_intro_on_privacy
after update of is_onboarding_done, profile_visibility, get_internal_recommendation, blocked_companies
on public.talent_setting
for each row execute function public.close_company_intro_on_privacy_change_v1();

create or replace function public.close_company_intro_on_talent_delete_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is not null or new.deleted_at is null then
    return new;
  end if;
  update public.company_intro_candidates intro
  set status = 'closed', close_reason = 'privacy_withdrawn',
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  where intro.talent_id = new.user_id
    and intro.status in ('ready', 'awaiting_talent', 'connecting');
  update public.talent_opportunity_recommendation recommendation
  set saved_stage = 'closed',
      dismissed_at = coalesce(dismissed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where recommendation.talent_id = new.user_id
    and recommendation.opportunity_type = 'intro_request'
    and exists (
      select 1 from public.company_intro_candidates intro
      where intro.recommendation_id = recommendation.id
        and intro.close_reason = 'privacy_withdrawn'
    );
  return new;
end;
$$;

drop trigger if exists talent_user_close_company_intro_on_delete
  on public.talent_users;
create trigger talent_user_close_company_intro_on_delete
after update of deleted_at on public.talent_users
for each row execute function public.close_company_intro_on_talent_delete_v1();

create or replace function public.close_company_intro_on_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.company_workspace_id is not distinct from new.company_workspace_id
    and lower(btrim(coalesce(new.source_type, ''))) = 'internal'
    and lower(btrim(coalesce(new.status, ''))) in ('active', 'paused', 'top_priority')
    and coalesce(new.is_expired, false) is false
    and (new.expires_at is null or new.expires_at > timezone('utc', now()))
    and coalesce(lower(btrim(new.information->>'testOnly')), '')
      not in ('true', '1', 'yes', 'on') then
    return new;
  end if;

  update public.company_intro_candidates intro
  set status = 'closed', close_reason = 'role_closed',
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  where intro.role_id = new.role_id
    and intro.status in ('ready', 'awaiting_talent', 'connecting');

  update public.talent_opportunity_recommendation recommendation
  set saved_stage = 'closed',
      dismissed_at = coalesce(dismissed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where recommendation.opportunity_type = 'intro_request'
    and exists (
      select 1 from public.company_intro_candidates intro
      where intro.recommendation_id = recommendation.id
        and intro.role_id = new.role_id
        and intro.close_reason = 'role_closed'
    );
  return new;
end;
$$;

drop trigger if exists company_role_close_company_intro_on_change
  on public.company_roles;
create trigger company_role_close_company_intro_on_change
after update of company_workspace_id, source_type, status, is_expired, expires_at, information
on public.company_roles
for each row execute function public.close_company_intro_on_role_change_v1();

create or replace function public.close_company_intro_on_internal_role_change_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_company_first_search is true then
    return new;
  end if;

  update public.company_intro_candidates intro
  set status = 'closed', close_reason = 'role_closed',
      revision = intro.revision + 1, updated_at = timezone('utc', now())
  where intro.role_id = new.role_id
    and intro.status in ('ready', 'awaiting_talent', 'connecting');

  update public.talent_opportunity_recommendation recommendation
  set saved_stage = 'closed',
      dismissed_at = coalesce(dismissed_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  where recommendation.opportunity_type = 'intro_request'
    and exists (
      select 1 from public.company_intro_candidates intro
      where intro.recommendation_id = recommendation.id
        and intro.role_id = new.role_id
        and intro.close_reason = 'role_closed'
    );
  return new;
end;
$$;

drop trigger if exists company_internal_role_close_company_intro_on_change
  on public.company_internal_roles;
create trigger company_internal_role_close_company_intro_on_change
after update of is_company_first_search on public.company_internal_roles
for each row execute function public.close_company_intro_on_internal_role_change_v1();

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
      and intro.talent_id = new.talent_id
      and intro.status in ('ready', 'connecting')
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first route already exists for this company and Talent';
  end if;

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
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
      message = 'another company-first route already exists for this company and Talent';
  end if;

  return new;
end;
$$;

drop trigger if exists talent_recommendation_company_intro_guard
  on public.talent_opportunity_recommendation;
create trigger talent_recommendation_company_intro_guard
before insert or update of role_id, talent_id
on public.talent_opportunity_recommendation
for each row execute function public.guard_candidate_first_against_company_intro_v1();

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

  -- An explicit Talent request is stronger than a company-only ready card. Close
  -- that invisible route so the candidate-owned action can proceed and any sealed
  -- but unsent Slack outbox fails its deliverability check.
  update public.company_intro_candidates intro
  set status = 'closed',
      close_reason = 'route_replaced',
      revision = intro.revision + 1,
      updated_at = timezone('utc', now())
  where intro.company_workspace_id = v_workspace_id
    and intro.talent_id = new.talent_id
    and intro.status = 'ready';

  if exists (
    select 1
    from public.company_intro_candidates intro
    where intro.company_workspace_id = v_workspace_id
      and intro.talent_id = new.talent_id
      and intro.status in ('awaiting_talent', 'connecting')
  ) then
    raise exception using
      errcode = '23505',
      message = 'active company-first request already exists for this company and Talent';
  end if;

  return new;
end;
$$;

drop trigger if exists talent_progress_company_intro_route
  on public.talent_progress;
create trigger talent_progress_company_intro_route
before insert or update of kind, role_id, talent_id
on public.talent_progress
for each row
when (new.kind = 'candidate_requested_connection')
execute function public.route_candidate_priority_request_v1();

revoke all on function public.guard_candidate_first_against_company_intro_v1()
  from public, anon, authenticated;
revoke all on function public.route_candidate_priority_request_v1()
  from public, anon, authenticated;
revoke all on function public.company_first_outbox_is_deliverable_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.request_company_intro_v1(uuid, uuid, uuid, uuid, text[], text)
  from public, anon, authenticated;
revoke all on function public.pass_company_intro_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.decide_company_intro_request_v1(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.close_company_intro_on_privacy_change_v1()
  from public, anon, authenticated;
revoke all on function public.close_company_intro_on_talent_delete_v1()
  from public, anon, authenticated;
revoke all on function public.close_company_intro_on_role_change_v1()
  from public, anon, authenticated;
revoke all on function public.close_company_intro_on_internal_role_change_v1()
  from public, anon, authenticated;
grant execute on function public.company_first_outbox_is_deliverable_v1(uuid)
  to service_role;
grant execute on function public.request_company_intro_v1(uuid, uuid, uuid, uuid, text[], text)
  to service_role;
grant execute on function public.pass_company_intro_v1(uuid, uuid, uuid)
  to service_role;
grant execute on function public.decide_company_intro_request_v1(uuid, uuid, text, text, jsonb)
  to service_role;

alter table public.company_first_search_runs enable row level security;
alter table public.company_intro_candidates enable row level security;
alter table public.company_first_slack_outbox enable row level security;

revoke all on table public.company_first_search_runs
  from public, anon, authenticated;
revoke all on table public.company_intro_candidates
  from public, anon, authenticated;
revoke all on table public.company_first_slack_outbox
  from public, anon, authenticated;

grant select, insert, update, delete on table public.company_first_search_runs
  to service_role;
grant select, insert, update, delete on table public.company_intro_candidates
  to service_role;
grant select, insert, update, delete on table public.company_first_slack_outbox
  to service_role;

commit;
