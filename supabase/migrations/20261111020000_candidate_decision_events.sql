-- Candidate decisions and what Harper showed the candidate (PR-2; Q2, Q3).
--
-- The candidate-side copy of the company decision record
-- (company_decision_events: 20261105020000, 20261105100000, 20261107020000) and
-- of company_presentations (20261105110000). Rows are written only by triggers
-- on the records the existing writers already save, in the same transaction.
-- Writer changes: three functions get one line each that names their channel
-- (section 4); nothing else in them changes. update_talent_role_feedback_v2,
-- accept_talent_internal_role_recommendation_v2, decide_company_intro_request_v2
-- and decide_company_intro_request_with_material_v1 stay as they are.
-- Section 4 replaces whole definitions, so a guard at the top stops the
-- migration (nothing is created) when one of the three live functions is
-- neither the definition copied from production on 2026-11-11
-- (md5(pg_get_functiondef)) nor one that already has this migration's channel
-- line (a re-run). Otherwise a production change made before this migration is
-- applied would be silently reverted. If it stops, re-copy the current
-- production definition into section 4, keep the one added line, and update
-- the md5 in the guard.
--
-- 1. talent_presentations: one row per recommendation each time it is put in
--    front of the candidate.
--      email         talent_opportunity_delivery, channel email, becomes sent:
--                    payload.recommendationIds and recommendationExposures
--      chat_preview  talent_opportunity_chat_preview: a preview card in chat
--      chat          talent_opportunity_delivery, channel chat, becomes sent.
--                    A chat message and its preview cards share a key
--                    (message id + recommendation), so a message with cards
--                    stays one row per recommendation; a message without cards
--                    (the Career company intro message) is recorded as chat.
--      card          talent_opportunity_recommendation.viewed_at first set: the
--                    candidate opened the card on the web (action "view").
--                    Later opens are not recorded. presented_at is viewed_at
--                    but never later than the database's now(): the web server
--                    sets viewed_at with its own clock, and a decision made
--                    right after opening must still find the card.
--    At most 8 recommendations per delivery (the Worker's preview limit).
--    Not recorded yet (waiting for Shaun): the home to-do list
--    (career_action_items), mailbox intros.
--
-- 2. talent_decision_events: one row per candidate decision on a
--    recommendation (subject recommendation, or internal_role for a Harper
--    role) or on a company's intro request (company_intro_request; subject_id
--    is company_intro_candidates.id).
--    Which writes are the candidate's:
--      - Every candidate decision function sets harper.feedback_source for its
--        transaction (20261007123000:41, 20261029182857:252 and :268), and so
--        does the Worker's email reply path. Its raw value is the channel.
--        'automatic_followup_expiry' is the Worker's own dislike after two
--        follow-ups without an answer, not the candidate's, and is skipped.
--      - Three more candidate writers set it in section 4, one line each:
--          saved_stage          move_talent_role_saved_stage_v1: the candidate
--                               moves a saved item (hide included)
--          ops_candidate_reply  record_ops_candidate_reply_v1: the candidate's
--                               yes to an Ops re-engagement (saved stage back
--                               to connected; feedback stays like)
--          job_link_import      import_talent_job_link: the candidate saves a
--                               job link; it creates the recommendation (liked,
--                               with a saved stage) or updates the existing one
--        A recommendation created already decided (feedback or saved stage
--        set) with a source is recorded from an empty previous state; today
--        only import_talent_job_link does that.
--      - Any other write without a source is Harper, a company or Ops (intro
--        closures on role, privacy or account changes, the ended-role archive,
--        hiding expired external roles) and is not recorded. processed_stage
--        (the company's stage) is not watched.
--      - A write that sets dismissed_at without a new feedback is Harper
--        closing the item, not a decision.
--    The source also goes, as before, into talent_progress
--    (candidate_opportunity_feedback_changed, 20261007123000:70) when the
--    feedback changes. Of the three, only import_talent_job_link changes the
--    feedback, so its rows there now say 'job_link_import' instead of
--    'unspecified'. The readers that sort sources (Worker
--    recommendation_statistics, the feedback outcomes eval) read Harper roles
--    only, and an imported link is an external role.
--    The intro accept/decline is also read from
--    company_intro_candidates.talent_decision_at (status connecting, or closed
--    as talent_declined), which only decide_company_intro_request_v1 writes so;
--    a card closed as route_replaced follows an acceptance already recorded on
--    the recommendation.
--    One row per talent, subject and transaction: a function that writes the
--    recommendation twice, or the recommendation and then the intro card,
--    leaves one row with the transaction's final state.
--    reason_text is the reason as it was at that moment; a later edit is a new
--    row (reason_update) and does not change earlier ones. detail keeps the
--    previous and new values but not the reason text.
--    reason_text stays with Harper: it is not shown to the company. What a
--    candidate wants the company to know goes through the mailbox
--    (agent_contact_messages), written by the candidate's Career Harper.
--    Version numbers in force at the decision: talent_versions_v1 (PR-1,
--    20261111010000) and the Role's latest Brief revision.
--    presentation_id: the latest presentation of that recommendation at the
--    decision, an email one first for an email decision (the company rule,
--    20261105110000:21).
--
-- 3. A failing capture never stops the candidate's action: the trigger catches
--    the error and raises a WARNING instead.
--
-- No backfill. Earlier feedback changes are in talent_progress
-- (candidate_opportunity_feedback_changed) if they are wanted later.
-- Account deletion removes talent_users and these rows with it (cascade); a
-- withdrawal (deleted_at) keeps them, like PR-1. Deleting a Role keeps them
-- with role_id null (recommendation_id too, when the recommendation goes).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $$
begin
  if to_regprocedure('public.talent_versions_v1(uuid, timestamptz)') is null then
    raise exception 'apply 20261111010000_candidate_history_tables.sql first';
  end if;
end;
$$;

-- Section 4 replaces three live functions with copies. Accept each only when it
-- is still the definition copied from production on 2026-11-11 (md5 of
-- pg_get_functiondef), or when it already has this migration's channel line
-- (a re-run), so a later production change is never silently reverted.
do $$
declare
  writer record;
  definition text;
begin
  for writer in
    select * from (values
      ('public.move_talent_role_saved_stage_v1(uuid,uuid,text,boolean)',
        '4b339717880abc97cd742ba8bd467e55',
        'perform set_config(''harper.feedback_source'',''saved_stage'',true);'),
      ('public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean)',
        'cc36bec81a53889aaa60fcb2a3526bbf',
        'perform set_config(''harper.feedback_source'',''ops_candidate_reply'',true);'),
      ('public.import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean)',
        '9a8497fb4a7234fe1bb5a5792d0f57ab',
        'perform set_config(''harper.feedback_source'',''job_link_import'',true);')
    ) as copied(signature, copied_md5, channel_line)
  loop
    if to_regprocedure(writer.signature) is null then
      raise exception 'candidate_writer_changed: % does not exist; re-copy the current production definition into section 4', writer.signature;
    end if;
    definition := pg_get_functiondef(to_regprocedure(writer.signature));
    if md5(definition) <> writer.copied_md5 and position(writer.channel_line in definition) = 0 then
      raise exception 'candidate_writer_changed: % is not the definition copied on 2026-11-11 (md5 % <> %); re-copy the current production definition into section 4, add the channel line, and update the md5 here',
        writer.signature, md5(definition), writer.copied_md5;
    end if;
  end loop;
end;
$$;

-- 1. What was shown to the candidate.
create table if not exists public.talent_presentations (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete set null,
  recommendation_id uuid
    references public.talent_opportunity_recommendation(id) on delete set null,
  surface text not null check (surface in ('email', 'chat', 'chat_preview', 'card')),
  delivery_ref jsonb not null default '{}'::jsonb check (jsonb_typeof(delivery_ref) = 'object'),
  role_brief_revision integer,
  evaluation_id uuid
    references public.company_role_candidate_evaluations(id) on delete set null,
  shown jsonb not null default '{}'::jsonb check (jsonb_typeof(shown) = 'object'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  presented_at timestamptz not null default now(),
  constraint talent_presentations_idempotency unique (idempotency_key)
);

create index if not exists talent_presentations_recommendation_idx
  on public.talent_presentations (recommendation_id, presented_at desc)
  where recommendation_id is not null;
create index if not exists talent_presentations_talent_idx
  on public.talent_presentations (talent_id, presented_at desc);
create index if not exists talent_presentations_role_idx
  on public.talent_presentations (role_id);
create index if not exists talent_presentations_evaluation_idx
  on public.talent_presentations (evaluation_id) where evaluation_id is not null;

alter table public.talent_presentations enable row level security;
revoke all on public.talent_presentations from public, anon, authenticated, service_role;
grant select on public.talent_presentations to service_role;

-- Writes one presentation of a recommendation (once per key). What was shown
-- is a small summary of the recommendation; the Brief revision is the Role's
-- current one. evaluation_id stays null: a recommendation does not point at
-- one evaluation today.
create or replace function public.record_talent_presentation_v1(
  p_talent_id uuid,
  p_recommendation_id uuid,
  p_surface text,
  p_idempotency_key text,
  p_delivery_ref jsonb,
  p_presented_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.talent_presentations (
    talent_id, role_id, recommendation_id, surface, delivery_ref, role_brief_revision,
    shown, idempotency_key, presented_at
  )
  select rec.talent_id, rec.role_id, rec.id, p_surface, coalesce(p_delivery_ref, '{}'::jsonb),
    (select max(revision.revision) from public.company_role_brief_revisions revision
      where revision.role_id = rec.role_id),
    jsonb_strip_nulls(jsonb_build_object(
      'opportunityType', rec.opportunity_type, 'rank', rec.rank, 'score', rec.score
    )),
    p_idempotency_key, coalesce(p_presented_at, now())
  from public.talent_opportunity_recommendation rec
  where rec.id = p_recommendation_id and rec.talent_id = p_talent_id
  on conflict on constraint talent_presentations_idempotency do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_talent_presentation_v1(uuid, uuid, text, text, jsonb, timestamptz)
  from public, anon, authenticated, service_role;

-- email / chat: a delivery that becomes sent, one row per recommendation in it.
create or replace function public.capture_talent_delivery_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := case
    when new.channel = 'chat' and new.payload->>'messageId' ~ '^[0-9]{1,18}$'
      then new.payload->>'messageId' end;
begin
  if new.channel not in ('email', 'chat') then
    return null;
  end if;
  begin
    perform public.record_talent_presentation_v1(
      new.talent_id, picked.id, new.channel,
      case when v_message is not null
        then 'chat_message:' || v_message || ':' || picked.id::text
        else 'delivery:' || new.id::text || ':' || picked.id::text end,
      jsonb_strip_nulls(jsonb_build_object(
        'deliveryId', new.id, 'channel', new.channel, 'discoveryRunId', new.discovery_run_id,
        'messageId', v_message::bigint, 'resendEmailId', new.payload->>'resendEmailId'
      )),
      coalesce(new.sent_at, now())
    )
    from (
      select ids.id
      from (
        select listed.value::uuid as id, listed.ordinality as ord
        from jsonb_array_elements_text(case when jsonb_typeof(new.payload->'recommendationIds') = 'array'
          then new.payload->'recommendationIds' else '[]'::jsonb end) with ordinality as listed(value, ordinality)
        where listed.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        union all
        select (exposure.value->>'recommendationId')::uuid, 1000 + exposure.ordinality
        from jsonb_array_elements(case when jsonb_typeof(new.payload->'recommendationExposures') = 'array'
          then new.payload->'recommendationExposures' else '[]'::jsonb end) with ordinality as exposure(value, ordinality)
        where exposure.value->>'recommendationId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) ids
      join public.talent_opportunity_recommendation rec
        on rec.id = ids.id and rec.talent_id = new.talent_id
      group by ids.id
      order by min(ids.ord)
      limit 8
    ) picked;
  exception when others then
    raise warning 'talent presentation not recorded for delivery %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_delivery_presentation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_opportunity_delivery_presentation on public.talent_opportunity_delivery;
create trigger talent_opportunity_delivery_presentation
  after insert on public.talent_opportunity_delivery
  for each row
  when (new.status = 'sent')
  execute function public.capture_talent_delivery_presentation_v1();
drop trigger if exists talent_opportunity_delivery_presentation_update on public.talent_opportunity_delivery;
create trigger talent_opportunity_delivery_presentation_update
  after update of status on public.talent_opportunity_delivery
  for each row
  when (new.status = 'sent' and old.status is distinct from 'sent')
  execute function public.capture_talent_delivery_presentation_v1();

-- chat_preview: a preview card under a chat message.
create or replace function public.capture_talent_chat_preview_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.record_talent_presentation_v1(
      conversation.user_id, new.recommendation_id, 'chat_preview',
      'chat_message:' || new.assistant_message_id::text || ':' || new.recommendation_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'chatPreviewId', new.id, 'messageId', new.assistant_message_id,
        'conversationId', new.conversation_id, 'discoveryRunId', new.discovery_run_id,
        'previewRank', new.rank
      )),
      new.created_at
    )
    from public.talent_conversations conversation
    where conversation.id = new.conversation_id;
  exception when others then
    raise warning 'talent presentation not recorded for chat preview %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_chat_preview_presentation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_opportunity_chat_preview_presentation on public.talent_opportunity_chat_preview;
create trigger talent_opportunity_chat_preview_presentation
  after insert on public.talent_opportunity_chat_preview
  for each row
  execute function public.capture_talent_chat_preview_presentation_v1();

-- card: the candidate first opens a recommendation card on the web
-- (src/lib/talentOpportunity.ts sets viewed_at only while it is null). One row
-- per recommendation, at viewed_at, never after now(): viewed_at comes from the
-- web server's clock, and the decision lookup keeps presented_at <= now().
create or replace function public.capture_talent_card_presentation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.record_talent_presentation_v1(
      new.talent_id, new.id, 'card', 'card:' || new.id::text, '{}'::jsonb, least(new.viewed_at, now())
    );
  exception when others then
    raise warning 'talent presentation not recorded for card %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_card_presentation_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_opportunity_recommendation_card_presentation on public.talent_opportunity_recommendation;
create trigger talent_opportunity_recommendation_card_presentation
  after update of viewed_at on public.talent_opportunity_recommendation
  for each row
  when (old.viewed_at is null and new.viewed_at is not null)
  execute function public.capture_talent_card_presentation_v1();

-- 2. Candidate decisions.
create table if not exists public.talent_decision_events (
  id bigint generated always as identity primary key,
  talent_id uuid not null references public.talent_users(user_id) on delete cascade,
  role_id uuid references public.company_roles(role_id) on delete set null,
  subject_kind text not null
    check (subject_kind in ('recommendation', 'internal_role', 'company_intro_request')),
  subject_id uuid not null,
  recommendation_id uuid
    references public.talent_opportunity_recommendation(id) on delete set null,
  action text not null check (action in (
    'like', 'dislike', 'clear', 'save', 'unsave', 'accept', 'decline',
    'hide', 'stage_change', 'reason_update'
  )),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  reason_text text
    check (reason_text is null or char_length(reason_text) between 1 and 2000),
  channel text not null check (char_length(channel) between 1 and 100),
  presentation_id uuid references public.talent_presentations(id) on delete set null,
  context_version bigint,
  behavior_context_version bigint,
  setting_revision integer,
  profile_revision bigint,
  role_brief_revision integer,
  transaction_id bigint not null default txid_current(),
  created_at timestamptz not null default now(),
  constraint talent_decision_events_one_per_transaction
    unique (talent_id, subject_kind, subject_id, transaction_id)
);

create index if not exists talent_decision_events_talent_idx
  on public.talent_decision_events (talent_id, created_at desc);
create index if not exists talent_decision_events_recommendation_idx
  on public.talent_decision_events (recommendation_id) where recommendation_id is not null;
create index if not exists talent_decision_events_role_idx
  on public.talent_decision_events (role_id);
create index if not exists talent_decision_events_presentation_idx
  on public.talent_decision_events (presentation_id) where presentation_id is not null;

alter table public.talent_decision_events enable row level security;
revoke all on public.talent_decision_events from public, anon, authenticated, service_role;
grant select on public.talent_decision_events to service_role;

-- The decision from the recommendation's state before and after (feedback,
-- savedStage) and, for an intro request, the card's new status.
--   intro request   like -> accept, dislike -> decline (card: connecting /
--                   closed talent_declined)
--   Harper role     like into connected -> accept, dislike -> decline
--   any             keep -> save, keep cleared -> unsave, like/dislike cleared
--                   -> clear; same feedback: into hidden -> hide, other stage
--                   -> stage_change, reason only -> reason_update
-- Anything else is not a decision (null).
create or replace function public.talent_decision_action_v1(
  p_subject_kind text, p_previous jsonb, p_new jsonb, p_intro jsonb, p_reason_changed boolean
) returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  return case
    when p_intro->>'status' in ('connecting', 'connected') then 'accept'
    when p_intro->>'closeReason' = 'talent_declined' then 'decline'
    when (p_previous->'feedback') is distinct from (p_new->'feedback') then
      case p_new->>'feedback'
        when 'like' then case
          when p_subject_kind = 'company_intro_request'
            or (p_subject_kind = 'internal_role' and p_new->>'savedStage' = 'connected')
            then 'accept' else 'like' end
        when 'dislike' then case
          when p_subject_kind in ('company_intro_request', 'internal_role')
            then 'decline' else 'dislike' end
        when 'keep' then 'save'
        else case when p_new->>'feedback' is null then
          case when p_previous->>'feedback' = 'keep' then 'unsave' else 'clear' end end
      end
    when (p_previous->'savedStage') is distinct from (p_new->'savedStage') then
      case when p_new->>'savedStage' = 'hidden' then 'hide' else 'stage_change' end
    when coalesce(p_reason_changed, false) then 'reason_update'
  end;
end;
$$;

revoke all on function public.talent_decision_action_v1(text, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;

-- Records (or, later in the same transaction, completes) the decision on a
-- recommendation from its current state. p_previous is its state before this
-- write; p_intro the intro card's change, when there is one.
create or replace function public.record_talent_decision_v1(
  p_recommendation_id uuid,
  p_previous jsonb,
  p_reason_changed boolean,
  p_intro jsonb,
  p_channel text,
  p_via text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_talent uuid;
  v_role uuid;
  v_role_source text;
  v_intro_id uuid;
  v_feedback text;
  v_reason text;
  v_saved_stage text;
  v_dismissed_at timestamptz;
  v_subject_kind text;
  v_subject_id uuid;
  v_new jsonb;
  v_previous jsonb;
  v_intro jsonb;
  v_reason_changed boolean;
  v_event_id bigint;
  v_event_detail jsonb;
  v_action text;
  v_detail jsonb;
  v_versions jsonb;
  v_id bigint;
begin
  select rec.talent_id, rec.role_id, role.source_type, intro.id,
    rec.feedback, rec.feedback_reason, rec.saved_stage, rec.dismissed_at
  into v_talent, v_role, v_role_source, v_intro_id,
    v_feedback, v_reason, v_saved_stage, v_dismissed_at
  from public.talent_opportunity_recommendation rec
  left join public.company_roles role on role.role_id = rec.role_id
  left join public.company_intro_candidates intro
    on intro.recommendation_id = rec.id and rec.opportunity_type = 'intro_request'
  where rec.id = p_recommendation_id;
  if v_talent is null then
    return null;
  end if;

  v_subject_kind := case
    when v_intro_id is not null then 'company_intro_request'
    when lower(btrim(coalesce(v_role_source, ''))) = 'internal' then 'internal_role'
    else 'recommendation' end;
  v_subject_id := coalesce(v_intro_id, p_recommendation_id);
  v_new := jsonb_build_object('feedback', v_feedback, 'savedStage', v_saved_stage, 'dismissedAt', v_dismissed_at);
  v_reason := left(nullif(btrim(coalesce(v_reason, '')), ''), 2000);

  -- Same transaction: one row, from its first state to its latest one.
  select event.id, event.detail into v_event_id, v_event_detail
  from public.talent_decision_events event
  where event.talent_id = v_talent and event.subject_kind = v_subject_kind
    and event.subject_id = v_subject_id and event.transaction_id = txid_current();

  v_previous := coalesce(v_event_detail->'previous', p_previous, v_new);
  v_intro := coalesce(p_intro, v_event_detail->'intro');
  v_reason_changed := coalesce((v_event_detail->>'reasonChanged')::boolean, false)
    or coalesce(p_reason_changed, false);
  v_action := public.talent_decision_action_v1(v_subject_kind, v_previous, v_new, v_intro, v_reason_changed);
  v_detail := jsonb_build_object('previous', v_previous, 'new', v_new, 'reasonChanged', v_reason_changed)
    || jsonb_strip_nulls(jsonb_build_object('intro', v_intro, 'via', coalesce(p_via, v_event_detail->>'via')));

  if v_event_id is not null then
    if v_action is null then
      -- The transaction ended where it started.
      delete from public.talent_decision_events where id = v_event_id;
      return null;
    end if;
    update public.talent_decision_events
    set action = v_action, detail = v_detail, reason_text = v_reason
    where id = v_event_id;
    return v_event_id;
  end if;
  if v_action is null then
    return null;
  end if;

  v_versions := public.talent_versions_v1(v_talent, null);
  insert into public.talent_decision_events (
    talent_id, role_id, subject_kind, subject_id, recommendation_id, action, detail,
    reason_text, channel, presentation_id, context_version, behavior_context_version,
    setting_revision, profile_revision, role_brief_revision
  ) values (
    v_talent, v_role, v_subject_kind, v_subject_id, p_recommendation_id, v_action, v_detail,
    v_reason, coalesce(left(nullif(p_channel, ''), 100), 'unspecified'),
    (select presentation.id from public.talent_presentations presentation
      where presentation.recommendation_id = p_recommendation_id
        and presentation.presented_at <= now()
      order by (presentation.surface = 'email' and p_channel in ('email', 'email_reply')) desc,
        presentation.presented_at desc, presentation.id desc
      limit 1),
    (v_versions->>'context')::bigint, (v_versions->>'behavior')::bigint,
    (v_versions->>'setting')::integer, (v_versions->>'profile')::bigint,
    (select max(revision.revision) from public.company_role_brief_revisions revision
      where revision.role_id = v_role)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_talent_decision_v1(uuid, jsonb, boolean, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- A change of feedback, reason, saved stage or dismissal on a recommendation.
create or replace function public.capture_talent_recommendation_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := nullif(current_setting('harper.feedback_source', true), '');
begin
  -- Harper closing the item (role closed, privacy, account) sets dismissed_at
  -- without a new feedback.
  if old.dismissed_at is null and new.dismissed_at is not null
     and old.feedback is not distinct from new.feedback then
    return null;
  end if;
  -- No source: Harper, a company or Ops, not the candidate.
  if v_channel is null or v_channel = 'automatic_followup_expiry' then
    return null;
  end if;
  begin
    perform public.record_talent_decision_v1(
      new.id,
      jsonb_build_object('feedback', old.feedback, 'savedStage', old.saved_stage, 'dismissedAt', old.dismissed_at),
      old.feedback_reason is distinct from new.feedback_reason,
      null, v_channel
    );
  exception when others then
    raise warning 'talent decision not recorded for recommendation %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_recommendation_decision_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_opportunity_recommendation_talent_decision on public.talent_opportunity_recommendation;
create trigger talent_opportunity_recommendation_talent_decision
  after update of feedback, feedback_reason, saved_stage, dismissed_at
  on public.talent_opportunity_recommendation
  for each row
  when ((old.feedback, old.feedback_reason, old.saved_stage, old.dismissed_at)
    is distinct from (new.feedback, new.feedback_reason, new.saved_stage, new.dismissed_at))
  execute function public.capture_talent_recommendation_decision_v1();

-- A recommendation created already decided, with a source (import_talent_job_link
-- saving a job link): recorded from an empty previous state, detail.via
-- 'created'. Other inserts (Worker, Career list, intro requests) set neither
-- feedback nor saved stage, or run without a source.
create or replace function public.capture_talent_recommendation_insert_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel text := nullif(current_setting('harper.feedback_source', true), '');
begin
  if v_channel is null or v_channel = 'automatic_followup_expiry' then
    return null;
  end if;
  begin
    perform public.record_talent_decision_v1(
      new.id,
      jsonb_build_object('feedback', null, 'savedStage', null, 'dismissedAt', null),
      new.feedback_reason is not null,
      null, v_channel, 'created'
    );
  exception when others then
    raise warning 'talent decision not recorded for new recommendation %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_recommendation_insert_decision_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists talent_opportunity_recommendation_talent_decision_insert on public.talent_opportunity_recommendation;
create trigger talent_opportunity_recommendation_talent_decision_insert
  after insert on public.talent_opportunity_recommendation
  for each row
  when (new.feedback is not null or new.saved_stage is not null)
  execute function public.capture_talent_recommendation_insert_decision_v1();

-- The candidate's answer to a company's intro request, on the card.
create or replace function public.capture_talent_intro_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.record_talent_decision_v1(
      new.recommendation_id, null, false,
      jsonb_build_object(
        'introCandidateId', new.id, 'previousStatus', old.status, 'status', new.status,
        'closeReason', new.close_reason, 'revision', new.revision, 'decidedAt', new.talent_decision_at
      ),
      coalesce(nullif(current_setting('harper.feedback_source', true), ''), 'unspecified')
    );
  exception when others then
    raise warning 'talent decision not recorded for intro %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke all on function public.capture_talent_intro_decision_v1()
  from public, anon, authenticated, service_role;

drop trigger if exists company_intro_candidates_talent_decision on public.company_intro_candidates;
create trigger company_intro_candidates_talent_decision
  after update of talent_decision_at on public.company_intro_candidates
  for each row
  when (new.recommendation_id is not null and new.talent_decision_at is not null
    and old.talent_decision_at is distinct from new.talent_decision_at
    and (new.status in ('connecting', 'connected') or new.close_reason = 'talent_declined'))
  execute function public.capture_talent_intro_decision_v1();

-- 4. The channel for three candidate writers. Each definition below is the
--    current one copied as it is, with one added line,
--    perform set_config('harper.feedback_source', <channel>, true), just
--    before the function writes the recommendation. Grants are restated as in
--    the migrations they come from. Copied from:
--      move_talent_role_saved_stage_v1  20261103083918:3-74   (grants :76-77)
--      record_ops_candidate_reply_v1    20261020130031:53-107 (grants :170, :172)
--      import_talent_job_link           20261105070000:9-364  (grants 20261022132918:312-315)
--    md5(pg_get_functiondef) of each copy before the added line equals
--    production's (checked 2026-11-11); the guard at the top of this migration
--    refuses to run if the live definition is no longer that one.

CREATE OR REPLACE FUNCTION public.move_talent_role_saved_stage_v1(p_talent_id uuid, p_recommendation_id uuid, p_saved_stage text, p_record_activity boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activity_id uuid;
  v_previous_stage text;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:' || p_talent_id::text,0));
  if exists (select 1 from public.talent_opportunity_recommendation where id=p_recommendation_id and talent_id=p_talent_id)
    and public.current_talent_recommendation_id_v1(p_recommendation_id) <> p_recommendation_id then
    raise exception using errcode='P0001', message='internal_recommendation_superseded';
  end if;
  if p_saved_stage not in ('saved', 'applied', 'connected', 'offer', 'closed', 'hidden') then
    raise exception 'talent_role_activity_saved_stage_invalid'
      using errcode = '22023';
  end if;

  select recommendation.saved_stage
  into v_previous_stage
  from public.talent_opportunity_recommendation recommendation
  where recommendation.id = p_recommendation_id
    and recommendation.talent_id = p_talent_id
  for update;

  if not found then
    raise exception 'talent_role_activity_recommendation_not_found'
      using errcode = 'P0002';
  end if;

  if v_previous_stage is not distinct from p_saved_stage then
    return jsonb_build_object(
      'activityId', null,
      'previousStage', v_previous_stage,
      'savedStage', p_saved_stage
    );
  end if;

  perform set_config('harper.feedback_source','saved_stage',true);
  update public.talent_opportunity_recommendation
  set saved_stage = p_saved_stage,
      updated_at = timezone('utc', now())
  where id = p_recommendation_id
    and talent_id = p_talent_id;

  if coalesce(p_record_activity, true) then
    insert into public.talent_role_activity (
      recommendation_id,
      kind,
      metadata
    ) values (
      p_recommendation_id,
      'saved_stage_changed',
      jsonb_strip_nulls(
        jsonb_build_object(
          'source', 'career',
          'previousStage', v_previous_stage,
          'savedStage', p_saved_stage
        )
      )
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'activityId', v_activity_id,
    'previousStage', v_previous_stage,
    'savedStage', p_saved_stage
  );
end;
$function$;

revoke all on function public.move_talent_role_saved_stage_v1(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.move_talent_role_saved_stage_v1(uuid,uuid,text,boolean) to service_role;

create or replace function public.record_ops_candidate_reply_v1(
  p_request_id uuid,p_talent_id uuid,p_source_message_id bigint,p_content text,p_resume boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.company_talent_requests; rec public.talent_opportunity_recommendation;
  event_id uuid; prior public.talent_progress; restored boolean:=false; already_restored boolean:=false;
begin
  perform pg_advisory_xact_lock(hashtextextended('talent-role-recommendation-change:'||p_talent_id::text,0));
  perform public.bind_ops_candidate_reply_v1(p_request_id,p_talent_id,p_source_message_id);
  select * into r from public.company_talent_requests where id=p_request_id and talent_id=p_talent_id and ops_only for update;
  if r.id is null then raise exception 'ops_contact_not_found'; end if;
  event_id:=md5('ops-contact:'||r.id::text||':'||p_source_message_id::text)::uuid;
  select * into prior from public.talent_progress where id=event_id;
  if found then return jsonb_build_object('status','recorded','idempotent',true,'restored',coalesce((prior.metadata->>'restored')::boolean,false)); end if;
  if not exists(select 1 from public.talent_messages where id=p_source_message_id and user_id=p_talent_id and role='user' and created_at>=r.created_at)
    then raise exception 'candidate_message_evidence_not_found'; end if;
  if r.workflow_status='cancelled' or r.expires_at<=now()
    then raise exception 'ops_contact_no_longer_current'; end if;
  if not exists(select 1 from public.contact_queue where company_talent_request_id=r.id and type='company_request_candidate_delivery' and status='sent' and sent_at is not null)
    then raise exception 'ops_contact_not_delivered'; end if;
  select * into rec from public.talent_opportunity_recommendation where id=r.recommendation_id and talent_id=p_talent_id and role_id=r.role_id for update;
  if rec.id is null then raise exception 'recommendation_not_found'; end if;
  select exists(select 1 from public.talent_progress where recommendation_id=rec.id and metadata->>'requestId'=r.id::text
    and kind='ops_candidate_reply' and metadata->>'restored'='true') into already_restored;
  if p_resume and not already_restored then
    if public.ops_private_contact_for_recommendation_v1(rec.id) is distinct from r.id then raise exception 'candidate_stage_changed'; end if;
    if not public.company_talent_pair_is_contactable_v1(r.company_workspace_id,r.role_id,p_talent_id,rec.id)
      then raise exception 'candidate_not_contactable'; end if;
    -- Never overwrite a later company/Ops stage decision or candidate withdrawal.
    if rec.feedback is distinct from 'like' or not exists(select 1 from public.talent_opportunity_tag
      where talent_id=p_talent_id and opportunity_id=r.role_id and tag='내부:아카이브' and greatest(created_at,updated_at)<=r.created_at)
      then raise exception 'candidate_stage_changed'; end if;
    delete from public.talent_opportunity_tag where talent_id=p_talent_id and opportunity_id=r.role_id and tag='내부:아카이브';
    insert into public.talent_opportunity_tag(talent_id,opportunity_id,tag) values(p_talent_id,r.role_id,'내부:수락');
    -- Record the private decision before updating the canonical acceptance state.
    -- The handoff trigger below recognizes this request and does not introduce it.
    update public.company_talent_requests set talent_source_message_id=p_source_message_id,
      response_disposition='positive',workflow_status='closed',updated_at=now() where id=r.id;
    perform set_config('harper.feedback_source','ops_candidate_reply',true);
    update public.talent_opportunity_recommendation
      set saved_stage='connected',processed_stage='accepted',feedback_at=now(),updated_at=now() where id=rec.id;
    -- The new explicit consent permits a fresh review. Preserve the old decision
    -- as history, and never supersede a decision made after this outreach began.
    update public.talent_opportunity_matching_review
      set closed_at=now(),close_reason='ops_reengagement_confirmed'
      where recommendation_id=rec.id and decision='reject' and closed_at is null
        and reviewed_at<=r.created_at;
    restored:=true;
  end if;
  insert into public.talent_progress(id,talent_id,role_id,recommendation_id,user_id,kind,text,metadata,open_to_company,open_to_talent)
    values(event_id,p_talent_id,r.role_id,rec.id,p_talent_id::text,'ops_candidate_reply',p_content,
      jsonb_build_object('requestId',r.id,'sourceMessageId',p_source_message_id,'restored',restored,'opsOnly',true),false,false);
  update public.company_talent_requests set talent_source_message_id=p_source_message_id,
    response_disposition=case when restored or already_restored then 'positive' else 'other' end,
    workflow_status=case when restored then 'closed' else workflow_status end,updated_at=now() where id=r.id;
  return jsonb_build_object('status','recorded','idempotent',false,'restored',restored,'alreadyRestored',already_restored);
end $$;

revoke all on function public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.record_ops_candidate_reply_v1(uuid,uuid,bigint,text,boolean) to service_role;

CREATE OR REPLACE FUNCTION public.import_talent_job_link(p_talent_id uuid, p_saved_stage text, p_existing_role_id uuid, p_workspace_id uuid, p_role jsonb, p_workspace jsonb, p_preserve_existing_progress boolean DEFAULT false)
 RETURNS TABLE(role_id uuid, recommendation_id uuid, role_source_provider text, created_role boolean, created_workspace boolean, created_recommendation boolean, saved_stage text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := timezone('utc', now());
  v_role public.company_roles%rowtype;
  v_workspace public.company_workspace%rowtype;
  v_recommendation public.talent_opportunity_recommendation%rowtype;
  v_created_role boolean := false;
  v_created_workspace boolean := false;
  v_created_recommendation boolean := false;
  v_company_db_id integer;
  v_url_variants text[];
begin
  if p_talent_id is null or not exists (
    select 1 from public.talent_users where user_id = p_talent_id
  ) then
    raise exception 'talent_not_found';
  end if;

  -- A null stage copies the posting for this talent's evaluation without
  -- creating a card; the card is published later through the list writer.
  if p_saved_stage is not null
     and p_saved_stage not in ('saved', 'applied', 'connected', 'closed') then
    raise exception 'invalid_saved_stage';
  end if;

  if p_role ? 'hiringPost' and jsonb_typeof(p_role->'hiringPost') <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  if jsonb_typeof(coalesce(p_role, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_workspace, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_import_payload';
  end if;

  select coalesce(array_agg(distinct value), '{}'::text[])
    into v_url_variants
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(p_role->'roleUrlVariants') = 'array'
        then p_role->'roleUrlVariants'
      else '[]'::jsonb
    end
  ) as item(value)
  where nullif(btrim(value), '') is not null;

  perform pg_advisory_xact_lock(
    hashtextextended(
      coalesce(
        nullif(p_role->>'userSubmittedSourceJobId', ''),
        nullif(p_role->>'canonicalUrl', ''),
        p_existing_role_id::text,
        'career_job_link_import'
      ),
      0
    )
  );

  if p_existing_role_id is not null then
    select * into v_role
    from public.company_roles
    where company_roles.role_id = p_existing_role_id
      and lower(coalesce(source_type, '')) = 'external';

    if not found then
      raise exception 'external_role_not_found';
    end if;
  else
    select * into v_role
    from public.company_roles candidate
    where lower(coalesce(candidate.source_type, '')) = 'external'
      and (
        (
          nullif(p_role->>'providerJobId', '') is not null
          and candidate.source_provider = p_role->>'provider'
          and candidate.source_job_id = p_role->>'providerJobId'
        )
        or (
          nullif(p_role->>'userSubmittedSourceJobId', '') is not null
          and candidate.source_provider = 'user_submitted'
          and candidate.source_job_id = p_role->>'userSubmittedSourceJobId'
        )
        or (
          candidate.external_jd_url is not null
          and candidate.external_jd_url = any(v_url_variants)
        )
      )
    order by
      (candidate.source_provider = 'user_submitted') asc,
      candidate.updated_at desc
    limit 1;
  end if;

  if v_role.role_id is null then
    if nullif(btrim(p_role->>'title'), '') is null
       or nullif(btrim(p_role->>'companyName'), '') is null
       or nullif(btrim(p_role->>'canonicalUrl'), '') is null then
      raise exception 'job_details_required';
    end if;

    if p_workspace_id is not null then
      select * into v_workspace
      from public.company_workspace
      where company_workspace_id = p_workspace_id
        and coalesce(is_internal, false) = false;

      if not found then
        raise exception 'external_workspace_not_found';
      end if;
    else
      select * into v_workspace
      from public.company_workspace candidate
      where coalesce(candidate.is_internal, false) = false
        and (
          nullif(p_workspace->>'careerUrl', '') is not null
          and candidate.career_url = p_workspace->>'careerUrl'
        )
      order by candidate.external_roles_enabled desc, candidate.updated_at desc
      limit 1;

      if v_workspace.company_workspace_id is null then
        v_company_db_id := case
          when coalesce(p_workspace->>'companyDbId', '') ~ '^[0-9]+$'
            then (p_workspace->>'companyDbId')::integer
          else null
        end;

        insert into public.company_workspace (
          company_name,
          published_name,
          company_db_id,
          career_url,
          logo_url,
          company_description,
          external_roles_enabled,
          has_career_page,
          is_internal,
          is_scrape_original,
          created_at,
          updated_at
        ) values (
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          left(
            btrim(coalesce(nullif(p_workspace->>'companyName', ''), p_role->>'companyName')),
            240
          ),
          v_company_db_id,
          nullif(left(btrim(p_workspace->>'careerUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyLogoUrl'), 2048), ''),
          nullif(left(btrim(p_workspace->>'companyDescription'), 10000), ''),
          false,
          nullif(btrim(p_workspace->>'careerUrl'), '') is not null,
          false,
          false,
          v_now,
          v_now
        )
        returning * into v_workspace;
        v_created_workspace := true;
      end if;
    end if;

    insert into public.company_roles (
      company_workspace_id,
      name,
      description,
      external_jd_url,
      information,
      is_expired,
      expires_at,
      location_text,
      salary_range,
      source_job_id,
      source_provider,
      source_type,
      status,
      summary,
      type,
      work_mode,
      created_at,
      updated_at
    ) values (
      v_workspace.company_workspace_id,
      left(btrim(p_role->>'title'), 500),
      nullif(left(p_role->>'description', 40000), ''),
      left(btrim(p_role->>'canonicalUrl'), 2048),
      jsonb_build_object(
        'userSubmitted', true,
        'jobLinkImport', jsonb_build_object(
          'canonicalUrl', p_role->>'canonicalUrl',
          'provider', p_role->>'provider',
          'providerCompanyId', p_role->>'providerCompanyId',
          'providerCompanyUrl', p_role->>'providerCompanyUrl',
          'providerJobId', p_role->>'providerJobId',
          'extractedBy', p_role->>'extractedBy'
        )
      )
      || case when jsonb_typeof(p_role->'hiringPost') = 'object'
           then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end
      || case when p_saved_stage is null
           then jsonb_build_object('submittedTalentIds', jsonb_build_array(p_talent_id::text)) else '{}'::jsonb end,
      false,
      -- The daily link check cannot open LinkedIn, so what Harper finds there
      -- (a hiring post, or a LinkedIn job page) ends 30 days after posting.
      -- A deadline the posting itself states ends it sooner (least skips nulls).
      least(
        case
          when jsonb_typeof(p_role->'hiringPost') = 'object'
            then coalesce(nullif(p_role->'hiringPost'->>'postedAt', '')::timestamptz, v_now) + interval '30 days'
          when p_saved_stage is null and p_role->>'provider' = 'linkedin'
            then v_now + interval '30 days'
        end,
        nullif(p_role->>'deadline', '')::timestamptz
      ),
      nullif(left(btrim(p_role->>'location'), 500), ''),
      nullif(left(btrim(p_role->>'salaryRange'), 240), ''),
      left(btrim(p_role->>'userSubmittedSourceJobId'), 500),
      'user_submitted',
      'external',
      'active',
      '{}'::jsonb,
      case
        when jsonb_typeof(p_role->'employmentTypes') = 'array'
          then array(
            select distinct left(btrim(value), 80)
            from jsonb_array_elements_text(p_role->'employmentTypes') as item(value)
            where nullif(btrim(value), '') is not null
            limit 8
          )
        else '{}'::text[]
      end,
      case
        when p_role->>'workMode' in ('remote', 'hybrid', 'onsite')
          then p_role->>'workMode'
        else null
      end,
      v_now,
      v_now
    )
    returning * into v_role;
    v_created_role := true;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_talent_id::text || ':' || v_role.role_id::text, 1)
  );

  if p_saved_stage is null then
    -- Only the importing talent may evaluate and publish a user-submitted copy;
    -- other talents' searches keep excluding it.
    if v_role.source_provider = 'user_submitted'
       and not coalesce(v_role.information->'submittedTalentIds', '[]'::jsonb) ? p_talent_id::text then
      update public.company_roles
      set information = jsonb_set(
            coalesce(information, '{}'::jsonb), '{submittedTalentIds}',
            coalesce(information->'submittedTalentIds', '[]'::jsonb) || to_jsonb(p_talent_id::text))
          || case when jsonb_typeof(p_role->'hiringPost') = 'object' and not coalesce(information, '{}'::jsonb) ? 'hiringPost'
               then jsonb_build_object('hiringPost', p_role->'hiringPost') else '{}'::jsonb end,
          updated_at = v_now
      where company_roles.role_id = v_role.role_id
      returning * into v_role;
    end if;

    select * into v_recommendation
    from public.talent_opportunity_recommendation candidate
    where candidate.talent_id = p_talent_id
      and candidate.role_id = v_role.role_id
    order by candidate.updated_at desc, candidate.created_at desc
    limit 1;

    return query
    select v_role.role_id, v_recommendation.id, v_role.source_provider,
      v_created_role, v_created_workspace, false, v_recommendation.saved_stage;
    return;
  end if;

  select * into v_recommendation
  from public.talent_opportunity_recommendation candidate
  where candidate.talent_id = p_talent_id
    and candidate.role_id = v_role.role_id
  order by candidate.updated_at desc, candidate.created_at desc
  limit 1
  for update;

  perform set_config('harper.feedback_source','job_link_import',true);
  if v_recommendation.id is null then
    insert into public.talent_opportunity_recommendation (
      talent_id,
      role_id,
      kind,
      opportunity_type,
      saved_stage,
      feedback,
      feedback_at,
      evidence,
      fit_reasons,
      fit_summary,
      preference_fit,
      tradeoffs,
      recommended_at,
      created_at,
      updated_at
    ) values (
      p_talent_id,
      v_role.role_id,
      'user_link_import',
      'external_jd',
      p_saved_stage,
      'like',
      v_now,
      '[]'::jsonb,
      '[]'::jsonb,
      null,
      '{}'::jsonb,
      '[]'::jsonb,
      v_now,
      v_now,
      v_now
    )
    returning * into v_recommendation;
    v_created_recommendation := true;
  elsif not (
    coalesce(p_preserve_existing_progress, false)
    and v_recommendation.saved_stage is not null
    and v_recommendation.saved_stage <> 'hidden'
  ) then
    update public.talent_opportunity_recommendation
    set
      saved_stage = p_saved_stage,
      feedback = 'like',
      feedback_at = v_now,
      feedback_reason = null,
      dismissed_at = null,
      recommended_at = v_now,
      updated_at = v_now
    where id = v_recommendation.id
    returning * into v_recommendation;
  end if;

  return query
  select
    v_role.role_id,
    v_recommendation.id,
    v_role.source_provider,
    v_created_role,
    v_created_workspace,
    v_created_recommendation,
    v_recommendation.saved_stage;
end;
$function$;

revoke all on function public.import_talent_job_link(uuid, text, uuid, uuid, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.import_talent_job_link(uuid, text, uuid, uuid, jsonb, jsonb, boolean)
  to service_role;

commit;
