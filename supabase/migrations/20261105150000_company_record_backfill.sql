-- Earlier company decisions that only live in talent_progress go into the
-- decision record (C3b backfill).
--
-- Since the decision paths PR, new stage changes, first views and saves are
-- recorded as they happen. This copies the earlier ones once, with their
-- original time; the keys are the same as the live recording, so running it
-- again or after live rows exist adds nothing. Earlier rows do not say where
-- the company acted, so their channel is unknown (detail.backfill = true).
-- Ops review moves (no company user) and moves that followed the candidate
-- (decisionChannel = system) are not company decisions.
--
-- The Pass/request copy from the decision record PR is run again here, to
-- pick up rows the previous web version wrote between that migration and its
-- deploy.

insert into public.company_decision_events (
  company_workspace_id, role_id, subject_kind, subject_id, action, detail, reason_text,
  channel, actor_user_id, idempotency_key, created_at
)
select role.company_workspace_id, progress.role_id, 'member_candidate', progress.talent_id,
  case when progress.metadata->>'stage' = 'process_stopped' then 'stop' else 'stage_change' end,
  jsonb_strip_nulls(jsonb_build_object(
    'stage', progress.metadata->'stage',
    'previousStage', progress.metadata->'previousStage',
    'tag', progress.metadata->'tag',
    'introRequested', progress.metadata->'introRequested',
    'notifyCandidateOnClosure', progress.metadata->'notifyCandidateOnClosure',
    'progressId', progress.id,
    'backfill', true
  )),
  left(coalesce(
    nullif(btrim(progress.metadata->>'stopNote'), ''),
    nullif(btrim(progress.metadata->>'acceptReason'), '')
  ), 2000),
  case when progress.metadata->>'decisionChannel' in ('web', 'chat', 'slack', 'email')
    then progress.metadata->>'decisionChannel' else 'unknown' end,
  progress.company_user_id, 'progress:' || progress.id::text, progress.created_at
from public.talent_progress progress
join public.company_roles role on role.role_id = progress.role_id
where progress.kind = 'org_stage_change'
  and progress.company_user_id is not null
  and progress.talent_id is not null
  and coalesce(progress.metadata->>'decisionChannel', '') <> 'system'
on conflict (role_id, idempotency_key) do nothing;

insert into public.company_decision_events (
  company_workspace_id, role_id, subject_kind, subject_id, action, detail,
  channel, actor_user_id, idempotency_key, created_at
)
select role.company_workspace_id, progress.role_id, 'member_candidate', progress.talent_id, 'view',
  jsonb_build_object('progressId', progress.id, 'backfill', true),
  case when progress.metadata->>'source' in ('web', 'slack') then progress.metadata->>'source' else 'unknown' end,
  progress.company_user_id, 'progress:' || progress.id::text, progress.created_at
from public.talent_progress progress
join public.company_roles role on role.role_id = progress.role_id
where progress.kind = 'org_candidate_profile_first_view'
  and progress.company_user_id is not null
  and progress.talent_id is not null
on conflict (role_id, idempotency_key) do nothing;

-- A save row holds only its latest state, so that state is what is copied.
insert into public.company_decision_events (
  company_workspace_id, role_id, subject_kind, subject_id, action, detail,
  channel, actor_user_id, idempotency_key, created_at
)
select role.company_workspace_id, progress.role_id, 'member_candidate', progress.talent_id,
  case when progress.metadata->>'saved' = 'true' then 'save' else 'unsave' end,
  jsonb_strip_nulls(jsonb_build_object('stage', progress.metadata->'stage', 'progressId', progress.id, 'backfill', true)),
  'unknown',
  coalesce(progress.company_user_id, nullif(progress.metadata->>'actorUserId', '')::uuid),
  'progress:' || progress.id::text || ':'
    || case when progress.metadata->>'saved' = 'true' then 'save' else 'unsave' end
    || ':' || extract(epoch from progress.created_at)::text,
  progress.created_at
from public.talent_progress progress
join public.company_roles role on role.role_id = progress.role_id
where progress.kind = 'org_candidate_saved'
  and progress.talent_id is not null
on conflict (role_id, idempotency_key) do nothing;

select public.backfill_company_intro_decisions_from_progress_v1();
