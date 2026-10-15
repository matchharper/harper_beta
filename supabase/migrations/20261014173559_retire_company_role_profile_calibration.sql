-- Retire Harper-prepared example profiles and their follow-up pipeline.
-- Preserve real-person references, Hiring Briefs, recommendations and history.
begin;
set local lock_timeout = '5s';

drop trigger if exists company_roles_enqueue_calibration_v1 on public.company_roles;
drop trigger if exists company_internal_roles_enqueue_calibration_v1 on public.company_internal_roles;
drop trigger if exists company_context_runs_enqueue_waiting_post_calibration_v1 on public.company_context_runs;
drop trigger if exists company_context_runs_notify_post_calibration_v1 on public.company_context_runs;
drop trigger if exists company_role_calibrations_notify_work_v1 on public.company_role_calibrations;
drop trigger if exists company_role_calibrations_touch_updated_at_v1 on public.company_role_calibrations;

-- Keep completed matching and context runs, including historical source IDs.
update public.company_context_runs
set status = 'canceled',
    result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
      'error', 'company_role_profile_calibration_retired'
    )
where trigger_reason = 'post_calibration_12h'
  and status in ('queued', 'running', 'failed');

update public.company_first_search_runs
set status = 'failed',
    error_code = 'company_role_profile_calibration_retired',
    error_message = 'Prepared profile calibration has been retired.',
    finished_at = now(),
    lease_token = null,
    lease_expires_at = null
where (source_calibration_id is not null
       or trigger_reason in ('post_calibration', 'post_calibration_12h'))
  and status in ('queued', 'running');

update public.company_agent_web_action_jobs
set status = 'superseded',
    completed_at = now(),
    locked_at = null,
    locked_by = null,
    queue_dispatch_status = 'failed',
    last_error = 'company_role_profile_calibration_retired'
where (idempotency_key like '%org-role-calibration/%'
       or idempotency_key like '%post_calibration_review:%'
       or action_name = 'record_role_profile_example_feedback')
  and status in ('queued', 'processing', 'retry');

drop function if exists public.enqueue_company_role_calibration_from_role_v1();
drop function if exists public.enqueue_company_role_calibration_from_internal_role_v1();
drop function if exists public.notify_company_role_calibration_work_v1();
drop function if exists public.touch_company_role_calibration_updated_at_v1();
drop function if exists public.enqueue_waiting_post_calibration_run_v1();
drop function if exists public.notify_post_calibration_company_context_work_v1();
drop function if exists public.apply_company_role_calibration_feedback_v1(uuid,uuid,uuid,timestamp with time zone,text,jsonb,text,boolean,uuid,bigint);
drop function if exists public.enqueue_post_calibration_company_matching_run_v1(uuid);
drop function if exists public.mark_company_role_calibration_delivery_v1(uuid,boolean,text);
drop function if exists public.company_role_is_calibration_eligible_v1(uuid,timestamp with time zone);
drop function if exists public.enqueue_company_role_calibration_v1(uuid,timestamp with time zone);
drop function if exists public.fail_company_role_calibration_v1(uuid,text);
drop function if exists public.claim_company_role_calibration_v1(text);
drop function if exists public.finish_company_role_calibration_v1(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb,jsonb,text);
drop function if exists public.enqueue_post_calibration_company_context_run_v1(uuid);
drop function if exists public.claim_post_calibration_company_context_run_v1(text);
drop function if exists public.record_post_calibration_company_notice_v1(uuid,text,bigint,text,text,text,text);
drop function if exists public.retry_post_calibration_company_context_run_v1(uuid,timestamp with time zone);

alter table public.company_first_search_runs
  drop constraint if exists company_first_search_runs_source_calibration_id_fkey;
drop index if exists public.company_first_search_runs_calibration_unique_idx;
drop index if exists public.company_context_runs_post_calibration_unique_idx;
drop index if exists public.company_messages_post_calibration_notice_unique_idx;

-- Profile sets were captured in an owner-only private backup before removal.
drop table public.company_role_calibrations;

-- Temporary, non-writable compatibility for the currently deployed web code,
-- which still reads this relation in chat context and /org. This view has no
-- data or triggers. Drop it after deploying and verifying removal of readers.
create view public.company_role_calibrations with (security_invoker = true) as
select null::uuid as id,
       null::uuid as company_workspace_id,
       null::uuid as role_id,
       null::text as status,
       null::timestamptz as available_at,
       null::jsonb as payload,
       null::timestamptz as created_at,
       null::timestamptz as updated_at
where false;
revoke all on public.company_role_calibrations from public, anon, authenticated, service_role;
grant select on public.company_role_calibrations to service_role;
comment on view public.company_role_calibrations is
  'Empty read-only compatibility for the pre-retirement web revision. Remove after verifying the web revision without prepared-profile calibration reads is live.';

delete from public.service_answer_examples
where audience = 'company'
  and tags @> array['topic:role-calibration']::text[];

notify pgrst, 'reload schema';
commit;
