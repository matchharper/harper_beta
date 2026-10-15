import {
  EXPERIMENT,
  externalVariant,
} from "../externalRecommendationsV2/contract";
import { EXTERNAL_MEASUREMENT_VERSION } from "../externalRecommendationsV2/measurement";
import {
  compareOpsAbTestRates,
  makeOpsAbTestRate,
  type OpsAbTestMetric,
  type OpsAbTestSummary,
  type OpsAbTestVariant,
} from "./abTests";

export type ExternalSurface = "web" | "worker" | "daily";
export type ExternalExperimentRun = {
  id: string;
  talent_id: string;
  experiment: string;
  variant: string;
  surface: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  metrics: Record<string, unknown>;
};
export type ExternalExperimentRecommendation = {
  id: string;
  external_experiment_run_id: string;
  talent_id: string;
  recommended_at: string;
  clicked_at: string | null;
  viewed_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
};
export type ExternalExperimentReceipt = {
  request_id: string;
  estimated_cost_usd: number;
  cost_status: string;
};
const DAY = 86_400_000;
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)];
}
export function buildExternalRecommendationExperiment(args: {
  runs: ExternalExperimentRun[];
  recommendations: ExternalExperimentRecommendation[];
  receipts: ExternalExperimentReceipt[];
  excludedUserIds: Set<string>;
  surface: ExternalSurface;
  now: number;
}): OpsAbTestSummary {
  const scoped = args.runs.filter(
    (r) =>
      r.experiment === EXPERIMENT &&
      r.surface === args.surface &&
      !args.excludedUserIds.has(r.talent_id)
  );
  // Forced developer cohorts and old implementations must not contaminate the comparison.
  const contaminated = new Set(
    scoped
      .filter((r) => r.variant !== externalVariant(r.talent_id))
      .map((r) => r.talent_id)
  );
  const runs = scoped
    .filter(
      (r) =>
        !contaminated.has(r.talent_id) &&
        r.metrics.measurementVersion === EXTERNAL_MEASUREMENT_VERSION
    )
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    );
  const byRun = new Map<string, ExternalExperimentRecommendation[]>();
  const runMap = new Map(runs.map((r) => [r.id, r]));
  for (const rec of args.recommendations) {
    const run = runMap.get(rec.external_experiment_run_id);
    if (!run || run.talent_id !== rec.talent_id) continue;
    const recTime = Date.parse(rec.recommended_at);
    if (
      !Number.isFinite(recTime) ||
      recTime < Date.parse(run.created_at) ||
      recTime > args.now
    )
      continue;
    byRun.set(run.id, [...(byRun.get(run.id) ?? []), rec]);
  }
  const receipts = new Map<string, ExternalExperimentReceipt[]>();
  for (const receipt of args.receipts)
    receipts.set(receipt.request_id, [
      ...(receipts.get(receipt.request_id) ?? []),
      receipt,
    ]);
  const variants = (["control", "v2"] as const).map(
    (variant): OpsAbTestVariant => {
      const group = runs.filter((r) => r.variant === variant);
      const first = new Map<string, ExternalExperimentRun>();
      for (const run of group)
        if (!first.has(run.talent_id)) first.set(run.talent_id, run);
      // One independent unit per user; failures and empty results remain in the denominator.
      const mature = [...first.values()].filter(
        (r) => Date.parse(r.created_at) + 7 * DAY <= args.now
      );
      const acted = (
        run: ExternalExperimentRun,
        field: "clicked_at" | "viewed_at"
      ) =>
        (byRun.get(run.id) ?? []).some((rec) => {
          const at = Date.parse(rec[field] ?? "");
          return (
            at >= Date.parse(rec.recommended_at) &&
            at <= Date.parse(run.created_at) + 7 * DAY
          );
        });
      const primary = makeOpsAbTestRate(
        mature.filter((r) => acted(r, "clicked_at")).length,
        mature.length
      );
      const completed = group.filter((r) => r.status === "completed");
      const failed = group.filter((r) => r.status === "failed");
      const terminal = group.filter((r) =>
        ["completed", "failed", "skipped"].includes(r.status)
      );
      const durations = terminal.flatMap((r) => {
        const value =
          Date.parse(r.finished_at ?? "") - Date.parse(r.created_at);
        return Number.isFinite(value) && value >= 0 ? [value / 1000] : [];
      });
      const stage = (key: string) =>
        completed.flatMap((r) => {
          const v = number(r.metrics[key]);
          return v === null ? [] : [v / 1000];
        });
      const costs = group.map((r) => {
        const web = receipts.get(r.id) ?? [];
        const worker = Array.isArray(r.metrics.externalWorkerCostRecords)
          ? (r.metrics.externalWorkerCostRecords as Record<string, unknown>[])
          : [];
        const known = web.filter(
          (x) =>
            ["priced", "estimated", "provider_reported"].includes(
              x.cost_status
            ) && number(x.estimated_cost_usd) !== null
        );
        const workerKnown = worker.filter(
          (x) =>
            x.pricingAvailable === true && number(x.estimatedCostUsd) !== null
        );
        return {
          present: web.length + worker.length > 0,
          priced: known.length + workerKnown.length > 0,
          usd:
            known.reduce((s, x) => s + x.estimated_cost_usd, 0) +
            workerKnown.reduce((s, x) => s + Number(x.estimatedCostUsd), 0),
          unknown:
            web.length -
            known.length +
            worker.length -
            workerKnown.length +
            (number(r.metrics.scoringUnknownCostAttempts) ?? 0),
        };
      });
      const measuredCosts = costs.filter((c) => c.priced);
      const sum = measuredCosts.reduce((s, c) => s + c.usd, 0);
      const recs = group.flatMap((r) => byRun.get(r.id) ?? []);
      const metric = (
        label: string,
        value: number | null,
        format: OpsAbTestMetric["format"] = "count"
      ): OpsAbTestMetric => ({ label, value, format });
      const ratio = (label: string, n: number, d: number) =>
        metric(label, d ? n / d : null, "rate");
      return {
        id: variant,
        label: variant === "control" ? "A · 기존 추천" : "B · V2 추천",
        description:
          variant === "control"
            ? "기존 검색·평가 경로"
            : "타이틀 검색·연봉 반영·V2 평가 경로",
        sampleCount: first.size,
        primary,
        metrics: [
          metric("배정 사용자", first.size),
          metric("7일 관찰 완료 사용자", mature.length),
          metric("7일 관찰 대기 사용자", first.size - mature.length),
          ratio(
            "첫 실행 7일 내 상세 열람 사용자",
            mature.filter((r) => acted(r, "viewed_at")).length,
            mature.length
          ),
          metric("전체 실행", group.length),
          metric("완료 실행", completed.length),
          metric("실패 실행", failed.length),
          ratio("실패율 · 종료 실행 기준", failed.length, terminal.length),
          ratio(
            "빈 결과율 · 완료 실행 기준",
            completed.filter((r) => !byRun.get(r.id)?.length).length,
            completed.length
          ),
          metric(
            "진행 30분 초과",
            group.filter(
              (r) =>
                ["running", "selected"].includes(r.status) &&
                args.now - Date.parse(r.created_at) > 30 * 60_000
            ).length
          ),
          metric("저장된 추천 공고", recs.length),
          metric(
            "완료당 추천 수",
            completed.length
              ? completed.reduce(
                  (s, r) => s + (byRun.get(r.id)?.length ?? 0),
                  0
                ) / completed.length
              : null,
            "number"
          ),
          metric(
            "실행→종료 p50 · 실패 포함",
            percentile(durations, 0.5),
            "duration_seconds"
          ),
          metric(
            "실행→종료 p95 · 실패 포함",
            percentile(durations, 0.95),
            "duration_seconds"
          ),
          ratio("종료 시간 기록률", durations.length, terminal.length),
          metric(
            "검색 평균 · 기록 있는 실행",
            mean(stage("retrievalMs")),
            "duration_seconds"
          ),
          metric(
            "연봉 추정 평균 · 기록 있는 실행",
            mean(stage("salaryFillMs")),
            "duration_seconds"
          ),
          metric(
            "Scoring 평균 · 기록 있는 실행",
            mean(stage("scoringMs")),
            "duration_seconds"
          ),
          metric(
            "Rerank 평균 · 기록 있는 실행",
            mean(stage("rerankMs")),
            "duration_seconds"
          ),
          metric(
            "API 비용 소계 · 확인 가능분",
            measuredCosts.length ? sum : null,
            "usd"
          ),
          metric(
            "기록 실행당 API 비용 소계",
            mean(measuredCosts.map((c) => c.usd)),
            "usd"
          ),
          ratio(
            "비용 영수증 있는 실행",
            costs.filter((c) => c.present).length,
            group.length
          ),
          metric(
            "가격 미확인 호출·시도",
            costs.reduce((s, c) => s + c.unknown, 0)
          ),
          metric("비용 기록 없는 실행", costs.filter((c) => !c.present).length),
        ],
      };
    }
  ) as [OpsAbTestVariant, OpsAbTestVariant];
  const conclusion = compareOpsAbTestRates({
    first: variants[0].primary,
    firstVariantId: "control",
    second: variants[1].primary,
    secondVariantId: "v2",
  });
  // Rolling, repeatedly inspected estimates are descriptive, never an automatic release gate.
  conclusion.leaderVariantId = null;
  if (conclusion.state !== "collecting") conclusion.state = "descriptive";
  const names = { web: "요청 추천", worker: "Worker 추천", daily: "매일 추천" };
  return {
    id: `${EXTERNAL_MEASUREMENT_VERSION}:${args.surface}`,
    title: `외부 공고 추천 · ${names[args.surface]}`,
    allocation: "사용자 고정 50:50",
    status: !runs.length
      ? "awaiting_data"
      : variants.every((v) => v.sampleCount > 0)
        ? "running"
        : "observing",
    primaryMetricLabel: "첫 실행 후 7일 내 공고·회사 탐색률",
    metricLayout: "table",
    unitLabel: "명",
    variants,
    conclusion,
    firstObservedAt: runs[0]?.created_at ?? null,
    lastObservedAt: runs.at(-1)?.created_at ?? null,
    caveat: `현재 버전만 집계. 이전 버전·강제 배정 ${scoped.length - runs.length}건 제외. 선택 기간·추천 경로별 사용자 첫 실행 1건에서 저장한 공고/회사 정보의 첫 클릭을 7일 관찰하며 실패·빈 결과도 분모에 포함합니다. 7일 미경과 사용자는 대기입니다. 기존 clicked_at은 JD 링크와 회사 정보 열기를 포함합니다. 클릭은 지원 완료가 아니며 저장은 실제 화면 노출을 뜻하지 않습니다. 전체 추천 경로 비교이며 양쪽 모두 공통 타이틀 개선이 포함됩니다. CI는 반복 관찰용 참고치로 자동 승패 판정을 하지 않습니다. 시간은 실행 생성부터 종료까지이며 daily 대기를 포함합니다. 비용은 연결된 API 영수증과 Worker 외부 단계의 확인 가능한 소계이며 누락 호출·공유 캐시 생성·인프라 비용은 포함하지 않습니다. 누락을 0원으로 보지 않습니다.`,
  };
}
