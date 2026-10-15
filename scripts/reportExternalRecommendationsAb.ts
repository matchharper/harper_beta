/** Read-only cohort comparison. Uses actual stored recommendation outcomes. */
import { getTalentSupabaseAdmin } from "../src/lib/talentOnboarding/admin";
import { executeSql } from "../src/lib/externalRecommendationsV2/retrieval";
const days = Number(
  process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 14
);
if (!Number.isInteger(days) || days < 1 || days > 365)
  throw new Error("Expected --days=1..365");
const sql = `WITH runs AS (
 SELECT r.*,coalesce((metrics->>'externalSelectionDurationMs')::numeric,(metrics->>'durationMs')::numeric) duration_ms
 FROM public.external_recommendation_runs r WHERE created_at>=now()-make_interval(days=>${days})
), logs AS (
 SELECT meta->>'requestId' run_id,count(*) calls,
   sum(estimated_cost_usd) filter(where cost_status<>'unpriced') known_cost,
   count(*) filter(where cost_status='unpriced') unpriced_calls
 FROM public.llm_logs WHERE created_at>=now()-make_interval(days=>${days}) GROUP BY 1
), outcomes AS (
 SELECT external_experiment_run_id run_id,count(*) recommendations,
   count(*) filter(where viewed_at is not null) viewed,count(*) filter(where clicked_at is not null) clicked,
   count(*) filter(where saved_stage in ('saved','applied','connected')) saved,
   count(*) filter(where saved_stage in ('applied','connected')) applied,
   count(*) filter(where feedback='like') positive,count(*) filter(where feedback='dislike') negative
 FROM public.talent_opportunity_recommendation WHERE external_experiment_run_id is not null GROUP BY 1
), receipt AS (
 SELECT r.*,l.calls,l.known_cost,l.unpriced_calls,
 (select sum((x->>'estimatedCostUsd')::numeric) from jsonb_array_elements(coalesce(r.metrics->'externalWorkerCostRecords','[]')) x where (x->>'pricingAvailable')::boolean) worker_external_cost,
 (select count(*) from jsonb_array_elements(coalesce(r.metrics->'externalWorkerCostRecords','[]')) x) worker_external_calls,
 coalesce(o.recommendations,0) recommendations,coalesce(o.viewed,0) viewed,coalesce(o.clicked,0) clicked,
 coalesce(o.saved,0) saved,coalesce(o.applied,0) applied,coalesce(o.positive,0) positive,coalesce(o.negative,0) negative
 FROM runs r LEFT JOIN logs l ON l.run_id=r.id::text LEFT JOIN outcomes o ON o.run_id=r.id
)
SELECT experiment,variant,surface,coalesce(provider,'legacy') provider,
 count(*) runs,count(distinct talent_id) candidates,count(*) filter(where status='completed') completed,
 count(*) filter(where status='failed') failed,count(*) filter(where status='running') running,
 count(*) filter(where status='completed' and recommendations=0) empty_runs,
 percentile_cont(.5) within group(order by duration_ms) p50_ms,percentile_cont(.95) within group(order by duration_ms) p95_ms,
 sum(coalesce(calls,0)+worker_external_calls) logged_calls,
 sum(coalesce(known_cost,0)+coalesce(worker_external_cost,0)) known_cost_usd,
 sum(coalesce(unpriced_calls,0)) unpriced_calls,
 sum(coalesce((metrics->>'scoringUnknownCostAttempts')::int,0)) scoring_attempts_without_receipt,
 count(*) filter(where calls is null and worker_external_calls=0) runs_without_cost_receipt,
 sum((metrics->>'cacheHits')::int) cache_hits,sum((metrics->>'scoredCount')::int) freshly_scored,
 sum(recommendations) recommendations,sum(viewed) viewed,sum(clicked) clicked,sum(saved) saved,sum(applied) applied,sum(positive) positive,sum(negative) negative
FROM receipt GROUP BY experiment,variant,surface,coalesce(provider,'legacy') ORDER BY experiment,surface,variant,provider`;
async function main() {
  if (process.argv.includes("--sql")) {
    console.log(sql);
    return;
  }
  console.log(
    JSON.stringify(
      await executeSql(getTalentSupabaseAdmin(), sql, 100),
      null,
      2
    )
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Report failed");
  process.exitCode = 1;
});
