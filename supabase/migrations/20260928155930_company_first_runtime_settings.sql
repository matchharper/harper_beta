-- Reuse the worker's durable operational settings; no candidate/model judgment is stored here.
alter table public.worker_runtime_settings
  add column company_first jsonb not null default '{
    "scheduled_enabled": true,
    "schedule_cron": "0 9 * * 1",
    "schedule_timezone": "Asia/Seoul",
    "scheduled_role_limit": 3,
    "requested_role_limit": 6,
    "ready_backlog_limit": 30
  }'::jsonb;

alter table public.worker_runtime_settings
  add constraint worker_runtime_settings_company_first_contract check (
    jsonb_typeof(company_first) = 'object'
    and company_first ?& array[
      'scheduled_enabled', 'schedule_cron', 'schedule_timezone',
      'scheduled_role_limit', 'requested_role_limit', 'ready_backlog_limit'
    ]
    and jsonb_typeof(company_first->'scheduled_enabled') = 'boolean'
    and jsonb_typeof(company_first->'schedule_cron') = 'string'
    and length(company_first->>'schedule_cron') between 1 and 120
    and (company_first->>'schedule_cron') ~ '^[0-9*/,[:space:]-]+$'
    and jsonb_typeof(company_first->'schedule_timezone') = 'string'
    and length(company_first->>'schedule_timezone') between 1 and 100
    and jsonb_typeof(company_first->'scheduled_role_limit') = 'number'
    and (company_first->>'scheduled_role_limit') ~ '^[0-9]+$'
    and (company_first->>'scheduled_role_limit')::numeric between 1 and 50
    and jsonb_typeof(company_first->'requested_role_limit') = 'number'
    and (company_first->>'requested_role_limit') ~ '^[0-9]+$'
    and (company_first->>'requested_role_limit')::numeric between 1 and 50
    and jsonb_typeof(company_first->'ready_backlog_limit') = 'number'
    and (company_first->>'ready_backlog_limit') ~ '^[0-9]+$'
    and (company_first->>'ready_backlog_limit')::numeric between 1 and 500
  );

-- Existing RLS grants reads only to harper_worker. Ops writes use the
-- service-role client after requireInternalApiUser; no client write policy is added.
comment on column public.worker_runtime_settings.company_first is
  'Company-first schedule and quantity limits. Scheduler reloads every minute; consumers snapshot before each claim.';
