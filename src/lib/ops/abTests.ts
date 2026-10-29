export const OPS_AB_TESTS = [
  { key: "history-feedback", title: "외부 공고 피드백 버튼" },
  { key: "external", title: "외부 공고 추천" },
  { key: "voice", title: "Career Voice 모델" },
  { key: "jobs", title: "Jobs 목록·상세 UI" },
  { key: "landing-stats", title: "홈 랜딩 통계 표시" },
  { key: "onboarding", title: "Career 온보딩 공개 설정 순서" },
] as const;

export type OpsAbTestKey = (typeof OPS_AB_TESTS)[number]["key"];

export type OpsAbTestConclusionState =
  | "descriptive"
  | "collecting"
  | "leader"
  | "no_clear_difference";

export type OpsAbTestRate = {
  denominator: number;
  numerator: number;
  rate: number | null;
};

export type OpsAbTestConclusion = {
  confidenceHigh: number | null;
  confidenceLow: number | null;
  delta: number | null;
  leaderVariantId: string | null;
  observedLeaderVariantId: string | null;
  state: OpsAbTestConclusionState;
};

export type OpsAbTestMetric = {
  format: "count" | "duration_seconds" | "number" | "rate" | "usd";
  label: string;
  value: number | null;
  description?: string;
  detail?: string;
  displayValue?: string;
};

export type OpsAbTestVariant = {
  description: string;
  id: string;
  label: string;
  metrics: OpsAbTestMetric[];
  summaryMetrics?: OpsAbTestMetric[];
  primary: OpsAbTestRate;
  sampleCount: number;
};

export type OpsAbTestSummary = {
  allocation: string;
  caveat: string;
  conclusion: OpsAbTestConclusion;
  firstObservedAt: string | null;
  id: string;
  lastObservedAt: string | null;
  primaryMetricLabel: string;
  metricLayout?: "table" | "summary";
  measurementVersion?: string | null;
  status: "running" | "awaiting_data" | "observing" | "ended";
  title: string;
  unitLabel: string;
  variants: [OpsAbTestVariant, OpsAbTestVariant];
};

export type OpsAbTestsResponse = {
  days: number;
  experiments: OpsAbTestSummary[];
  generatedAt: string;
};

function wilsonInterval(successes: number, total: number) {
  if (total <= 0) return null;

  const z = 1.96;
  const proportion = successes / total;
  const zSquared = z * z;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt(
      (proportion * (1 - proportion)) / total + zSquared / (4 * total * total)
    );

  return {
    high: Math.min(1, center + margin),
    low: Math.max(0, center - margin),
  };
}

export function makeOpsAbTestRate(
  numerator: number,
  denominator: number
): OpsAbTestRate {
  return {
    denominator,
    numerator,
    rate: denominator > 0 ? numerator / denominator : null,
  };
}

export function compareOpsAbTestRates(args: {
  first: OpsAbTestRate;
  firstVariantId: string;
  second: OpsAbTestRate;
  secondVariantId: string;
}): OpsAbTestConclusion {
  const firstInterval = wilsonInterval(
    args.first.numerator,
    args.first.denominator
  );
  const secondInterval = wilsonInterval(
    args.second.numerator,
    args.second.denominator
  );

  if (
    args.first.rate === null ||
    args.second.rate === null ||
    !firstInterval ||
    !secondInterval
  ) {
    return {
      confidenceHigh: null,
      confidenceLow: null,
      delta: null,
      leaderVariantId: null,
      observedLeaderVariantId: null,
      state: "collecting",
    };
  }

  const delta = args.second.rate - args.first.rate;
  const confidenceLow =
    delta -
    Math.sqrt(
      (args.second.rate - secondInterval.low) ** 2 +
        (firstInterval.high - args.first.rate) ** 2
    );
  const confidenceHigh =
    delta +
    Math.sqrt(
      (secondInterval.high - args.second.rate) ** 2 +
        (args.first.rate - firstInterval.low) ** 2
    );
  const leaderVariantId =
    confidenceLow > 0
      ? args.secondVariantId
      : confidenceHigh < 0
        ? args.firstVariantId
        : null;

  return {
    confidenceHigh,
    confidenceLow,
    delta,
    leaderVariantId,
    observedLeaderVariantId:
      delta > 0 ? args.secondVariantId : delta < 0 ? args.firstVariantId : null,
    state: leaderVariantId ? "leader" : "no_clear_difference",
  };
}
