import "server-only";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { EXPERIMENT } from "../externalRecommendationsV2/contract";
import { EXTERNAL_MEASUREMENT_VERSION } from "../externalRecommendationsV2/measurement";
import type {
  ExternalExperimentRun,
  ExternalExperimentRecommendation,
  ExternalExperimentReceipt,
  ExternalSurface,
} from "./externalRecommendationExperiment";

const METRIC_KEYS = [
  "measurementVersion",
  "retrievalMs",
  "salaryFillMs",
  "scoringMs",
  "rerankMs",
  "externalWorkerCostRecords",
  "scoringUnknownCostAttempts",
] as const;
type RunProjection = Omit<ExternalExperimentRun, "metrics"> &
  Record<(typeof METRIC_KEYS)[number], unknown>;

// Read only; never run models/searches while refreshing the dashboard.
async function pages<T>(query: () => any): Promise<T[]> {
  const rows: T[] = [];
  let afterId: string | number | undefined;
  for (;;) {
    const page = query().limit(1000);
    const { data, error } = await (afterId === undefined
      ? page
      : page.gt("id", afterId));
    if (error) throw new Error(`외부 추천 실험 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
    afterId = data[data.length - 1].id;
  }
}
export async function fetchExternalExperimentRows(
  admin: TalentAdminClient,
  start: string,
  end: string,
  surface: ExternalSurface
) {
  const projectedRuns = await pages<RunProjection>(() => {
    const query = (admin.from("external_recommendation_runs" as never) as any)
      .select(
        "id,talent_id,experiment,variant,surface,status,created_at,finished_at," +
          METRIC_KEYS.map((key) => `${key}:metrics->${key}`).join(",")
      )
      .eq("experiment", EXPERIMENT)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("id");
    return surface === "all" ? query : query.eq("surface", surface);
  });
  const runs: ExternalExperimentRun[] = projectedRuns.map((row) => ({
    ...row,
    metrics: Object.fromEntries(METRIC_KEYS.map((key) => [key, row[key]])),
  }));
  const ids = runs
    .filter(
      (r) => r.metrics.measurementVersion === EXTERNAL_MEASUREMENT_VERSION
    )
    .map((r) => r.id);
  const recommendations: ExternalExperimentRecommendation[] = [];
  const receipts: ExternalExperimentReceipt[] = [];
  // Bound concurrency instead of waiting for every run batch sequentially.
  let nextOffset = 0;
  const loadBatch = async () => {
    for (;;) {
      const offset = nextOffset;
      nextOffset += 100;
      if (offset >= ids.length) return;
      const chunk = ids.slice(offset, offset + 100);
      const [recPage, costPage] = await Promise.all([
        pages<ExternalExperimentRecommendation>(() =>
          admin
            .from("talent_opportunity_recommendation")
            .select(
              "id,talent_id,external_experiment_run_id,recommended_at,clicked_at,viewed_at,feedback,feedback_at"
            )
            .in("external_experiment_run_id", chunk)
            .lte("recommended_at", end)
            .order("id")
        ),
        pages<ExternalExperimentReceipt>(() =>
          admin
            .from("llm_logs")
            .select(
              "id,request_id:meta->>requestId,estimated_cost_usd,cost_status"
            )
            .in("meta->>requestId", chunk)
            .gte("created_at", start)
            .lte("created_at", end)
            .order("id")
        ),
      ]);
      recommendations.push(...recPage);
      receipts.push(...costPage);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(6, Math.ceil(ids.length / 100)) }, loadBatch)
  );
  return { runs, recommendations, receipts };
}
