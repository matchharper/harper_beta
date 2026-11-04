-- One durable public-statistics snapshot, shared by every web instance.
-- Only the daily database job reads the source populations.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE public.company_landing_stats (
  name text PRIMARY KEY,
  talent_count bigint NOT NULL,
  average_conversation_messages integer,
  assessed_pair_count bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_landing_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_landing_stats FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.company_landing_stats TO service_role;

COMMENT ON TABLE public.company_landing_stats IS
  'Latest successful landing statistics. The current row is refreshed daily at 05:00 Asia/Seoul; operators may edit it in Table Editor.';

CREATE FUNCTION public.refresh_company_landing_stats()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $function$
  WITH conversations AS (
    SELECT user_id, count(*) AS message_count
    FROM public.talent_messages m
    WHERE EXISTS (
      SELECT 1 FROM public.talent_setting s
      WHERE s.user_id = m.user_id AND s.is_onboarding_done = true
    )
      AND (
        (message_type IN ('chat', 'call_transcript') AND role IN ('user', 'assistant'))
        OR (message_type = 'opportunity_feedback_note' AND role = 'user')
      )
      AND length(btrim(content)) > 0
    GROUP BY user_id
    HAVING count(*) FILTER (
      WHERE role = 'user' AND message_type IN ('chat', 'call_transcript')
    ) > 0
      AND count(*) FILTER (
        WHERE role = 'assistant' AND message_type IN ('chat', 'call_transcript')
      ) > 0
  )
  INSERT INTO public.company_landing_stats (
    name, talent_count, average_conversation_messages, assessed_pair_count, updated_at
  )
  SELECT
    'current',
    (SELECT count(*) FROM public.talent_users),
    (SELECT round(avg(message_count))::integer FROM conversations),
    (SELECT count(*)
     FROM public.talent_external_fit e
     FULL JOIN public.talent_opportunity_fit f
       ON e.talent_id = f.talent_id AND e.role_id = f.opportunity_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.company_roles r
       WHERE r.source_type = 'internal'
         AND r.information->>'testOnly' = 'true'
         AND r.role_id = coalesce(e.role_id, f.opportunity_id)
     )),
    statement_timestamp()
  ON CONFLICT (name) DO UPDATE SET
    talent_count = excluded.talent_count,
    average_conversation_messages = excluded.average_conversation_messages,
    assessed_pair_count = excluded.assessed_pair_count,
    updated_at = excluded.updated_at;
$function$;

-- The invoker is the migration/cron owner. Web credentials can only read the row.
REVOKE ALL ON FUNCTION public.refresh_company_landing_stats()
  FROM PUBLIC, anon, authenticated, service_role;

-- Populate real values before switching the web reader. A failed refresh cannot
-- replace any previously committed snapshot: calculation and write are one statement.
SELECT public.refresh_company_landing_stats();

-- Supabase's cron timezone is GMT: 20:00 UTC is 05:00 Asia/Seoul the next day.
SELECT cron.schedule(
  'company-landing-stats-daily',
  '0 20 * * *',
  'SELECT public.refresh_company_landing_stats()'
);
