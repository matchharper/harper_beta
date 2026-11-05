-- The remaining company decision paths go into company_decision_events (C2).
--
-- C1 recorded Pass and intro requests. This records, in the same transaction
-- as the change that is already saved today:
--   stage changes and stops        talent_progress org_stage_change
--   candidate notes                talent_progress org_note
--   first profile view             talent_progress org_candidate_profile_first_view
--   save / unsave                  talent_progress org_candidate_saved
--   first-three ratings            company_role_start_sessions.evaluations
--   To-do approve / dismiss / mute company_todo_suggestions, company_todo_suggestion_mutes
--   external Pass / request        set_external_candidate_company_decision_v1
-- The existing records stay where they are and are still written; moving
-- readers to the decision record and stopping the old writes is C3.
--
-- Channel: progress rows carry metadata.decisionChannel from the writer.
-- 'system' marks moves that follow the candidate or billing rather than the
-- company (intro booking, accepted intro, billing reconcile); those are not
-- company decisions and are not recorded. A stage change without a channel is
-- recorded as unknown so a missed writer shows up instead of vanishing.
-- Ops review moves (no company user) are not company decisions either.
--
-- Notes stay editable by their author. Every text the note had is kept, so a
-- point-in-time read shows the note as it was then: an edit marks the earlier
-- row superseded and records the new text; a deleted note is marked deleted.
-- Current reads (and Harper) use only rows with neither mark. When the Talent
-- account is deleted, the reasons and notes about that person are erased
-- (redacted) from every decision; the rows stay.

create or replace function public.mark_company_note_decisions_v1(
  p_role_id uuid, p_talent_id uuid, p_progress_id uuid, p_mark text
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.company_decision_events
  set detail = detail || jsonb_build_object(
        p_mark, true, p_mark || 'At', now()
      )
  where role_id = p_role_id
    and subject_kind = 'member_candidate'
    and subject_id = p_talent_id
    and action = 'note'
    and detail->>'progressId' = p_progress_id::text
    and not coalesce((detail->>p_mark)::boolean, false);
$$;

revoke all on function public.mark_company_note_decisions_v1(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.mark_deleted_company_note_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role_id is not null and old.talent_id is not null then
    perform public.mark_company_note_decisions_v1(old.role_id, old.talent_id, old.id, 'deleted');
  end if;
  return old;
end;
$$;

revoke all on function public.mark_deleted_company_note_v1()
  from public, anon, authenticated, service_role;

create index if not exists company_decision_events_member_subject_idx
  on public.company_decision_events (subject_id) where subject_kind = 'member_candidate';

create or replace function public.redact_deleted_talent_decisions_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_decision_events
  set reason_text = null,
      detail = detail || jsonb_build_object('redacted', true, 'redactedAt', now())
  where subject_kind = 'member_candidate'
    and subject_id = old.user_id
    and reason_text is not null;
  return old;
end;
$$;

revoke all on function public.redact_deleted_talent_decisions_v1()
  from public, anon, authenticated, service_role;

create trigger talent_users_redact_company_decisions
  after delete on public.talent_users
  for each row
  execute function public.redact_deleted_talent_decisions_v1();

create or replace function public.record_company_progress_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_channel text := nullif(new.metadata->>'decisionChannel', '');
  v_actor uuid := new.company_user_id;
  v_action text;
  v_detail jsonb := '{}'::jsonb;
  v_reason text;
  v_key text := 'progress:' || new.id::text;
begin
  if new.role_id is null or new.talent_id is null or v_channel = 'system' then
    return new;
  end if;

  if new.kind = 'org_stage_change' then
    -- A rewrite of the same row (retried intro transition) is the same decision.
    if tg_op = 'UPDATE' or v_actor is null then
      return new;
    end if;
    v_action := case when new.metadata->>'stage' = 'process_stopped' then 'stop' else 'stage_change' end;
    v_detail := jsonb_strip_nulls(jsonb_build_object(
      'stage', new.metadata->'stage',
      'previousStage', new.metadata->'previousStage',
      'tag', new.metadata->'tag',
      'introRequested', new.metadata->'introRequested',
      'notifyCandidateOnClosure', new.metadata->'notifyCandidateOnClosure',
      'progressId', new.id
    ));
    v_reason := coalesce(
      nullif(btrim(new.metadata->>'stopNote'), ''),
      nullif(btrim(new.metadata->>'acceptReason'), '')
    );
  elsif new.kind = 'org_note' then
    -- The web Pass reason is also shown as a note; it is already the Pass decision's reason.
    if v_actor is null or new.metadata->>'decision' = 'pass' then
      return new;
    end if;
    if tg_op = 'UPDATE' then
      if old.text is not distinct from new.text then
        return new;
      end if;
      perform public.mark_company_note_decisions_v1(new.role_id, new.talent_id, new.id, 'superseded');
      v_key := v_key || ':edit:' || extract(epoch from clock_timestamp())::text;
    end if;
    v_action := 'note';
    v_reason := new.text;
    v_detail := jsonb_build_object('progressId', new.id, 'edited', tg_op = 'UPDATE');
    v_channel := coalesce(v_channel, 'web');
  elsif new.kind = 'org_candidate_profile_first_view' then
    if tg_op = 'UPDATE' or v_actor is null then
      return new;
    end if;
    v_action := 'view';
    v_detail := jsonb_build_object('progressId', new.id);
    v_channel := coalesce(v_channel, nullif(new.metadata->>'source', ''), 'web');
  elsif new.kind = 'org_candidate_saved' then
    v_actor := coalesce(v_actor, nullif(new.metadata->>'actorUserId', '')::uuid);
    if tg_op = 'UPDATE' and (old.metadata->'saved') is not distinct from (new.metadata->'saved') then
      return new;
    end if;
    v_action := case when new.metadata->>'saved' = 'true' then 'save' else 'unsave' end;
    v_detail := jsonb_strip_nulls(jsonb_build_object('stage', new.metadata->'stage', 'progressId', new.id));
    v_channel := coalesce(v_channel, 'web');
    v_key := v_key || ':' || v_action || ':' || extract(epoch from new.created_at)::text;
  else
    return new;
  end if;

  select role.company_workspace_id into v_workspace
  from public.company_roles role where role.role_id = new.role_id;
  if v_workspace is null then
    return new;
  end if;
  if v_channel is null or v_channel not in ('web', 'todo', 'chat', 'slack', 'email', 'role_start') then
    v_channel := 'unknown';
  end if;

  perform public.record_company_decision_v1(
    v_workspace, new.role_id, 'member_candidate', new.talent_id, v_action,
    v_channel, v_actor, v_key, null, v_reason, '{}', v_detail
  );
  return new;
end;
$$;

revoke all on function public.record_company_progress_decision_v1()
  from public, anon, authenticated, service_role;

create trigger talent_progress_company_decision
  after insert or update of metadata, text on public.talent_progress
  for each row
  when (new.kind in ('org_stage_change', 'org_note', 'org_candidate_profile_first_view', 'org_candidate_saved'))
  execute function public.record_company_progress_decision_v1();

create trigger talent_progress_company_note_deleted
  after delete on public.talent_progress
  for each row
  when (old.kind = 'org_note')
  execute function public.mark_deleted_company_note_v1();

-- First-three ratings in role start: one decision per rating saved (a change
-- of rating or reasons is a new one).
create or replace function public.record_company_role_start_rating_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_talent text;
  v_entry jsonb;
begin
  select role.company_workspace_id into v_workspace
  from public.company_roles role where role.role_id = new.role_id;
  if v_workspace is null or jsonb_typeof(new.evaluations) <> 'object' then
    return new;
  end if;
  for v_talent, v_entry in select key, value from jsonb_each(new.evaluations) loop
    continue when jsonb_typeof(v_entry) <> 'object'
      or v_entry is not distinct from (old.evaluations->v_talent)
      or v_talent !~ '^[0-9a-fA-F-]{36}$';
    perform public.record_company_decision_v1(
      v_workspace, new.role_id, 'member_candidate', v_talent::uuid, 'rate', 'role_start',
      nullif(v_entry->>'by', '')::uuid,
      'role_start:' || v_talent || ':rate:' || md5(v_entry::text),
      null, v_entry->>'reasonText', '{}',
      jsonb_strip_nulls(jsonb_build_object(
        'rating', v_entry->'rating',
        'reasons', v_entry->'reasons',
        'answer', v_entry->'answer',
        'note', v_entry->'note',
        'reasonsSkipped', v_entry->'reasonsSkipped'
      ))
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.record_company_role_start_rating_v1()
  from public, anon, authenticated, service_role;

create trigger company_role_start_sessions_rating_decision
  after update of evaluations on public.company_role_start_sessions
  for each row
  execute function public.record_company_role_start_rating_v1();

-- To-do answers. Only the Role's To-do screen answers suggestions today.
create or replace function public.record_company_todo_decision_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'company_todo_suggestions' then
    if old.status <> 'pending' or new.status not in ('approved', 'dismissed') then
      return new;
    end if;
    perform public.record_company_decision_v1(
      new.company_workspace_id, new.role_id, 'todo_suggestion', new.id,
      case new.status when 'approved' then 'accept' else 'reject' end,
      'todo', new.decided_by, 'todo:' || new.id::text || ':' || new.status,
      null, null, '{}',
      jsonb_strip_nulls(jsonb_build_object('kind', new.kind, 'title', new.title))
    );
  else
    perform public.record_company_decision_v1(
      new.company_workspace_id, new.role_id, 'suggestion_kind', null, 'mute', 'todo',
      new.created_by,
      'todo_mute:' || new.kind || ':' || extract(epoch from new.created_at)::text,
      null, null, '{}', jsonb_build_object('kind', new.kind)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_company_todo_decision_v1()
  from public, anon, authenticated, service_role;

create trigger company_todo_suggestions_decision
  after update of status on public.company_todo_suggestions
  for each row
  execute function public.record_company_todo_decision_v1();

create trigger company_todo_suggestion_mutes_decision
  after insert on public.company_todo_suggestion_mutes
  for each row
  execute function public.record_company_todo_decision_v1();

-- External candidates: the company's Pass or connection request, with the
-- channel it came from, in one transaction with the saved state. Same
-- conditions as before: Pass only while undecided or requested.
create or replace function public.set_external_candidate_company_decision_v1(
  p_external_candidate_id uuid,
  p_company_workspace_id uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_reason_text text,
  p_channel text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role uuid;
begin
  if p_decision = 'passed' then
    update public.external_candidates
    set company_decision = 'passed',
        company_decision_reason = left(nullif(btrim(coalesce(p_reason_text, '')), ''), 500),
        company_decided_at = now(),
        company_decided_by = p_actor_user_id,
        updated_at = now()
    where id = p_external_candidate_id
      and company_workspace_id = p_company_workspace_id
      and (company_decision is null or company_decision = 'intro_requested')
    returning role_id into v_role;
  elsif p_decision = 'intro_requested' then
    update public.external_candidates
    set company_decision = 'intro_requested', updated_at = now()
    where id = p_external_candidate_id
      and company_workspace_id = p_company_workspace_id
    returning role_id into v_role;
  else
    raise exception using errcode = '22023', message = 'external_candidate_decision_invalid';
  end if;
  if v_role is null then
    return false;
  end if;
  perform public.record_company_decision_v1(
    p_company_workspace_id, v_role, 'external_candidate', p_external_candidate_id,
    case p_decision when 'passed' then 'pass' else 'request_intro' end,
    p_channel, p_actor_user_id,
    'external:' || p_external_candidate_id::text || ':' || p_decision,
    null, p_reason_text
  );
  return true;
end;
$$;

revoke all on function public.set_external_candidate_company_decision_v1(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_external_candidate_company_decision_v1(uuid, uuid, text, uuid, text, text)
  to service_role;
