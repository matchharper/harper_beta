alter table public.llm_logs
  add column if not exists cost_status text not null default 'priced';

alter table public.llm_logs
  drop constraint if exists llm_logs_cost_status_check;

alter table public.llm_logs
  add constraint llm_logs_cost_status_check
  check (cost_status in ('priced', 'estimated', 'provider_reported', 'unpriced'));

-- The pre-duration xAI voice rows contain no provider usage or session
-- duration, so their zero cost is not a reliable free-cost observation.
update public.llm_logs
set
  cost_status = 'unpriced',
  meta = meta || jsonb_build_object(
    'costReason', 'xai_voice_duration_was_not_recorded',
    'costStatus', 'unpriced_legacy'
  )
where source = 'career/realtime'
  and lower(model) like 'grok-voice%'
  and estimated_cost_usd = 0
  and meta->>'provider' = 'xai'
  and coalesce(meta->>'costStatus', '') = ''
  and meta->'costBreakdown' = '{}'::jsonb;
