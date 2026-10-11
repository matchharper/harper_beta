-- Read-only aggregate inventory. No personal rows or production writes.
-- This queries current stored values, NOT a point-in-time database snapshot.
-- Raw recommendation timestamps and feedback are NOT validated outcome labels.
WITH base AS (
  SELECT r.*, role.company_workspace_id
  FROM public.talent_opportunity_recommendation r
  JOIN public.company_roles role ON role.role_id = r.role_id
  WHERE role.source_type = 'internal'
    AND coalesce(role.information->>'testOnly', 'false') <> 'true'
    AND r.recommended_at < timestamptz '2026-10-07 00:00:00+00'
), recent AS (
  SELECT * FROM base
  WHERE recommended_at >= timestamptz '2026-08-10 00:00:00+00'
    AND recommended_at < timestamptz '2026-09-23 00:00:00+00'
), recent_runs AS (
  SELECT DISTINCT run.id, run.user_brief, run.query_plan
  FROM public.opportunity_discovery_run run
  JOIN recent r ON r.discovery_run_id = run.id
), monthly AS (
  SELECT to_char(date_trunc('month', recommended_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month_key,
    count(*) AS rows,
    count(DISTINCT talent_id) AS talents,
    count(DISTINCT role_id) AS roles,
    count(*) FILTER (WHERE recommended_at < timestamptz '2026-09-23 00:00:00+00') AS mature14_rows
  FROM base GROUP BY 1
)
SELECT jsonb_build_object(
  'all_internal', (SELECT jsonb_build_object(
    'rows', count(*), 'talents', count(DISTINCT talent_id), 'roles', count(DISTINCT role_id),
    'mature14_rows', count(*) FILTER (WHERE recommended_at < timestamptz '2026-09-23 00:00:00+00'),
    'run_link', count(*) FILTER (WHERE discovery_run_id IS NOT NULL),
    'feedback_missing_time', count(*) FILTER (WHERE feedback IS NOT NULL AND feedback_at IS NULL),
    'system_reason_matches', count(*) FILTER (
      WHERE feedback IN ('dislike', 'negative')
        AND feedback_reason = 'internal follow-up 3회 이후 2개월 이상 반응이 없어 자동으로 disliked로 변경됨')
  ) FROM base),
  'monthly', (SELECT jsonb_agg(monthly ORDER BY month_key) FROM monthly),
  'recent_raw', (SELECT jsonb_build_object(
    'rows', count(*), 'talents', count(DISTINCT talent_id),
    'roles', count(DISTINCT role_id), 'workspaces', count(DISTINCT company_workspace_id),
    'raw_positive14', count(*) FILTER (WHERE feedback IN ('like', 'positive')
      AND feedback_at >= recommended_at AND feedback_at < recommended_at + interval '14 days'),
    'raw_negative14', count(*) FILTER (WHERE feedback IN ('dislike', 'negative')
      AND feedback_at >= recommended_at AND feedback_at < recommended_at + interval '14 days')
  ) FROM recent),
  'recent_input_inventory', (SELECT jsonb_build_object(
    'runs', count(*), 'empty_brief', count(*) FILTER (WHERE user_brief = '{}'::jsonb),
    'has_talent_context', count(*) FILTER (WHERE query_plan ? 'talentContext'),
    'has_raw_outputs', count(*) FILTER (WHERE query_plan ? 'llmRawOutputs')
  ) FROM recent_runs)
) AS inventory;
