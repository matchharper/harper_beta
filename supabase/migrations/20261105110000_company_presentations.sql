-- The moments Harper showed something to a company (company_presentations).
--
-- One row each time a candidate or a suggestion is put in front of the
-- company, with what was shown (the card summary, fit, Harper note), on which
-- surface, and from which Brief version, evaluation and shared material. A
-- Slack message or email with several candidates is one row per candidate.
-- Company decisions point at the presentation they were made on, so a Pass
-- on an old card still says what the company saw.
--
-- Rows are written by triggers on the records that are already saved when
-- something is shown, so every writer (web, Worker, role start) is covered
-- without changing it:
--   inbox_card    company_intro_candidates: a ready card, first or republished
--   slack_card    company_first_slack_outbox: sent, one row per candidate
--   email         company_email_action_links: the candidate's buttons in a mail
--   role_start    company_role_start_sessions.first_candidates
--   external_tab  external_candidates: delivered
--   todo          company_todo_suggestions: a new suggestion
-- Chat answers are not recorded yet (no structured record of what was shown).
--
-- Decisions without an explicit presentation_id take the latest presentation
-- of the same subject on the same role before the decision, preferring the
-- surface the decision came from and the same card.
--
-- Candidate rows follow the candidate: they are removed with the Talent
-- account or the external candidate.

create table public.company_presentations (
  id uuid primary key default gen_random_uuid(),
  company_workspace_id uuid not null
    references public.company_workspace(company_workspace_id) on delete cascade,
  role_id uuid not null references public.company_roles(role_id) on delete cascade,
  subject_kind text not null
    check (subject_kind in ('member_candidate', 'external_candidate', 'todo_suggestion', 'proposal')),
  subject_id uuid not null,
  talent_id uuid references public.talent_users(user_id) on delete cascade,
  external_candidate_id uuid references public.external_candidates(id) on delete cascade,
  intro_candidate_id uuid references public.company_intro_candidates(id) on delete set null,
  intro_candidate_revision integer,
  surface text not null
    check (surface in ('inbox_card', 'slack_card', 'email', 'chat', 'todo', 'role_start', 'external_tab')),
  delivery_ref jsonb not null default '{}'::jsonb,
  operation_id uuid,
  brief_revision integer,
  evaluation_id uuid references public.company_role_candidate_evaluations(id) on delete set null,
  material_id uuid references public.talent_role_materials(id) on delete set null,
  shown jsonb not null default '{}'::jsonb,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  presented_at timestamptz not null default now(),
  constraint company_presentations_idempotency unique (role_id, idempotency_key),
  constraint company_presentations_member_talent
    check ((subject_kind = 'member_candidate') = (talent_id is not null)),
  constraint company_presentations_external_candidate
    check ((subject_kind = 'external_candidate') = (external_candidate_id is not null))
);

create index company_presentations_subject_idx
  on public.company_presentations (role_id, subject_kind, subject_id, presented_at desc);
create index company_presentations_workspace_idx
  on public.company_presentations (company_workspace_id, presented_at desc);
create index company_presentations_intro_idx
  on public.company_presentations (intro_candidate_id) where intro_candidate_id is not null;
create index company_presentations_talent_idx
  on public.company_presentations (talent_id) where talent_id is not null;

alter table public.company_presentations enable row level security;
revoke all on public.company_presentations from public, anon, authenticated, service_role;
grant select on public.company_presentations to service_role;

-- Writes one presentation (once per key) and returns its id. The Brief version
-- is the role's current one.
create or replace function public.record_company_presentation_v1(
  p_company_workspace_id uuid,
  p_role_id uuid,
  p_subject_kind text,
  p_subject_id uuid,
  p_surface text,
  p_idempotency_key text,
  p_shown jsonb default '{}'::jsonb,
  p_delivery_ref jsonb default '{}'::jsonb,
  p_intro_candidate_id uuid default null,
  p_intro_candidate_revision integer default null,
  p_evaluation_id uuid default null,
  p_material_id uuid default null,
  p_presented_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.company_presentations (
    company_workspace_id, role_id, subject_kind, subject_id, talent_id, external_candidate_id,
    intro_candidate_id, intro_candidate_revision, surface, delivery_ref, brief_revision,
    evaluation_id, material_id, shown, idempotency_key, presented_at
  ) values (
    p_company_workspace_id, p_role_id, p_subject_kind, p_subject_id,
    case when p_subject_kind = 'member_candidate' then p_subject_id end,
    case when p_subject_kind = 'external_candidate' then p_subject_id end,
    p_intro_candidate_id, p_intro_candidate_revision, p_surface,
    coalesce(p_delivery_ref, '{}'::jsonb),
    (select max(revision.revision) from public.company_role_brief_revisions revision
      where revision.role_id = p_role_id),
    p_evaluation_id, p_material_id, coalesce(p_shown, '{}'::jsonb), p_idempotency_key,
    coalesce(p_presented_at, now())
  )
  on conflict on constraint company_presentations_idempotency do nothing
  returning id into v_id;
  if v_id is null then
    select presentation.id into v_id from public.company_presentations presentation
    where presentation.role_id = p_role_id and presentation.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end;
$$;

revoke all on function public.record_company_presentation_v1(
  uuid, uuid, text, uuid, text, text, jsonb, jsonb, uuid, integer, uuid, uuid, timestamptz
) from public, anon, authenticated, service_role;

-- The evaluation a card was made from: the one of its selection run, else the
-- latest one before it was shown.
create or replace function public.company_card_evaluation_id_v1(
  p_role_id uuid, p_talent_id uuid, p_run_id uuid, p_at timestamptz
) returns uuid
language sql
stable
set search_path = ''
as $$
  select evaluation.id
  from public.company_role_candidate_evaluations evaluation
  where evaluation.role_id = p_role_id and evaluation.talent_id = p_talent_id
    and (evaluation.run_id = p_run_id or evaluation.evaluated_at <= p_at)
  order by (evaluation.run_id = p_run_id) desc nulls last, evaluation.evaluated_at desc
  limit 1;
$$;

revoke all on function public.company_card_evaluation_id_v1(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

-- inbox_card: a card is shown while it is ready; a republished card is shown again.
create or replace function public.record_company_card_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'ready' or new.presentation is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'ready'
     and old.presentation is not distinct from new.presentation then
    return new;
  end if;
  perform public.record_company_presentation_v1(
    new.company_workspace_id, new.role_id, 'member_candidate', new.talent_id, 'inbox_card',
    'card:' || new.id::text || ':' || new.revision::text,
    new.presentation,
    jsonb_build_object('selectionRunId', new.selection_run_id),
    new.id, new.revision,
    public.company_card_evaluation_id_v1(new.role_id, new.talent_id, new.selection_run_id, now()),
    new.shared_material_id
  );
  return new;
end;
$$;

revoke all on function public.record_company_card_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger company_intro_candidates_presentation
  after insert on public.company_intro_candidates
  for each row
  execute function public.record_company_card_presentation_v1();
create trigger company_intro_candidates_presentation_update
  after update of presentation, status on public.company_intro_candidates
  for each row
  when ((old.presentation, old.status) is distinct from (new.presentation, new.status))
  execute function public.record_company_card_presentation_v1();

-- slack_card: one row per candidate of a sent company-first Slack message.
create or replace function public.record_company_slack_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'sent' or old.status = 'sent' then
    return new;
  end if;
  perform public.record_company_presentation_v1(
    candidate.company_workspace_id, candidate.role_id, 'member_candidate', candidate.talent_id,
    'slack_card', 'slack:' || new.id::text || ':' || candidate.id::text,
    coalesce(candidate.presentation, '{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'slackOutboxId', new.id, 'runId', new.run_id, 'slackChannelId', new.channel_id,
      'slackMessageTs', new.slack_message_ts, 'deliveryKind', new.delivery_kind
    )),
    candidate.id, candidate.revision,
    public.company_card_evaluation_id_v1(candidate.role_id, candidate.talent_id, candidate.selection_run_id, now()),
    candidate.shared_material_id,
    coalesce(new.sent_at, now())
  )
  from public.company_intro_candidates candidate
  where candidate.id = any(new.candidate_ids)
    and candidate.company_workspace_id = new.company_workspace_id;
  return new;
end;
$$;

revoke all on function public.record_company_slack_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger company_first_slack_outbox_presentation
  after update of status on public.company_first_slack_outbox
  for each row
  when (new.status = 'sent' and old.status is distinct from 'sent')
  execute function public.record_company_slack_presentation_v1();

-- email: the candidate's buttons in a mail point at the mail's presentation.
alter table public.company_email_action_links
  add column presentation_id uuid references public.company_presentations(id) on delete set null;

create or replace function public.record_company_email_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presentation_id is not null then
    return new;
  end if;
  select public.record_company_presentation_v1(
    candidate.company_workspace_id, candidate.role_id, 'member_candidate', candidate.talent_id,
    'email', 'email:' || new.email_outbox_id::text || ':' || candidate.id::text,
    coalesce(candidate.presentation, '{}'::jsonb),
    jsonb_build_object('emailOutboxId', new.email_outbox_id),
    candidate.id, candidate.revision,
    public.company_card_evaluation_id_v1(candidate.role_id, candidate.talent_id, candidate.selection_run_id, now()),
    candidate.shared_material_id
  )
  into new.presentation_id
  from public.company_intro_candidates candidate
  where candidate.id = new.intro_candidate_id
    and candidate.company_workspace_id = new.company_workspace_id;
  return new;
end;
$$;

revoke all on function public.record_company_email_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger company_email_action_links_presentation
  before insert on public.company_email_action_links
  for each row
  execute function public.record_company_email_presentation_v1();

-- role_start: the first candidates shown in role start. The session is saved
-- whole on every step, so only a changed list runs the function.
create or replace function public.record_company_role_start_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_entry jsonb;
begin
  if jsonb_typeof(new.first_candidates) <> 'array' then
    return new;
  end if;
  select role.company_workspace_id into v_workspace
  from public.company_roles role where role.role_id = new.role_id;
  if v_workspace is null then
    return new;
  end if;
  for v_entry in select value from jsonb_array_elements(new.first_candidates) loop
    continue when jsonb_typeof(v_entry) <> 'object'
      or coalesce(v_entry->>'talentId', '') !~ '^[0-9a-fA-F-]{36}$'
      or not exists (select 1 from public.talent_users talent where talent.user_id = (v_entry->>'talentId')::uuid);
    perform public.record_company_presentation_v1(
      v_workspace, new.role_id, 'member_candidate', (v_entry->>'talentId')::uuid, 'role_start',
      'role_start:' || (v_entry->>'talentId') || ':' || coalesce(nullif(v_entry->>'runId', ''), md5(v_entry::text)),
      v_entry,
      jsonb_strip_nulls(jsonb_build_object('runId', v_entry->'runId'))
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.record_company_role_start_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger company_role_start_sessions_presentation
  after insert on public.company_role_start_sessions
  for each row
  execute function public.record_company_role_start_presentation_v1();
create trigger company_role_start_sessions_presentation_update
  after update of first_candidates on public.company_role_start_sessions
  for each row
  when (old.first_candidates is distinct from new.first_candidates)
  execute function public.record_company_role_start_presentation_v1();

-- external_tab: an external candidate delivered to the company. What was shown
-- is Harper's read of the person, not their profile text.
create or replace function public.record_company_external_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.delivered or (tg_op = 'UPDATE' and old.delivered) then
    return new;
  end if;
  perform public.record_company_presentation_v1(
    new.company_workspace_id, new.role_id, 'external_candidate', new.id, 'external_tab',
    'external:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'headline', new.headline, 'currentCompany', new.current_company,
      'verdict', new.verdict, 'rank', new.rank
    )),
    jsonb_build_object('runId', new.run_id)
  );
  return new;
end;
$$;

revoke all on function public.record_company_external_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger external_candidates_presentation
  after insert or update of delivered on public.external_candidates
  for each row
  when (new.delivered)
  execute function public.record_company_external_presentation_v1();

-- todo: a suggestion put on the Role's To-do list.
create or replace function public.record_company_todo_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_company_presentation_v1(
    new.company_workspace_id, new.role_id, 'todo_suggestion', new.id, 'todo',
    'todo:' || new.id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'kind', new.kind, 'title', new.title, 'plan', new.plan, 'talentIds', to_jsonb(new.talent_ids)
    )),
    jsonb_strip_nulls(jsonb_build_object('source', new.source))
  );
  return new;
end;
$$;

revoke all on function public.record_company_todo_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger company_todo_suggestions_presentation
  after insert on public.company_todo_suggestions
  for each row
  execute function public.record_company_todo_presentation_v1();

-- Decisions point at what the company saw.
create or replace function public.set_company_decision_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.presentation_id is null and new.subject_id is not null then
    select presentation.id into new.presentation_id
    from public.company_presentations presentation
    where presentation.role_id = new.role_id
      and presentation.subject_kind = new.subject_kind
      and presentation.subject_id = new.subject_id
      and presentation.presented_at <= new.created_at
    order by
      (presentation.surface = case new.channel
        when 'email' then 'email' when 'slack' then 'slack_card'
        when 'role_start' then 'role_start' when 'todo' then 'todo'
        else 'inbox_card' end) desc,
      (presentation.intro_candidate_id is not distinct from new.intro_candidate_id) desc,
      presentation.presented_at desc,
      presentation.id desc
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.set_company_decision_presentation_v1()
  from public, anon, authenticated, service_role;

create trigger set_company_decision_presentation
  before insert on public.company_decision_events
  for each row
  execute function public.set_company_decision_presentation_v1();

alter table public.company_decision_events
  add constraint company_decision_events_presentation_fk
  foreign key (presentation_id) references public.company_presentations(id) on delete set null;

-- Cards shown so far, with what they show now (earlier versions were
-- overwritten). Cards that went straight to an accepted connection were not
-- shown as cards. Slack messages and emails before this point are not filled.
insert into public.company_presentations (
  company_workspace_id, role_id, subject_kind, subject_id, talent_id, intro_candidate_id,
  intro_candidate_revision, surface, delivery_ref, brief_revision, evaluation_id, material_id,
  shown, idempotency_key, presented_at
)
select candidate.company_workspace_id, candidate.role_id, 'member_candidate', candidate.talent_id,
  candidate.talent_id, candidate.id, candidate.revision, 'inbox_card',
  jsonb_build_object('selectionRunId', candidate.selection_run_id, 'backfill', true),
  (select max(revision.revision) from public.company_role_brief_revisions revision
    where revision.role_id = candidate.role_id),
  public.company_card_evaluation_id_v1(candidate.role_id, candidate.talent_id, candidate.selection_run_id,
    coalesce(candidate.selected_at, candidate.created_at)),
  candidate.shared_material_id, candidate.presentation,
  'card:' || candidate.id::text || ':' || candidate.revision::text,
  coalesce(candidate.selected_at, candidate.created_at)
from public.company_intro_candidates candidate
where candidate.presentation is not null
  and candidate.presentation <> '{}'::jsonb
  and coalesce(candidate.close_reason, '') <> 'route_replaced'
on conflict on constraint company_presentations_idempotency do nothing;
