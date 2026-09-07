export const OPS_UTM_PERIODS = ["7d", "30d", "3m", "12m"] as const;
export const OPS_UTM_GRANULARITIES = ["day", "week"] as const;

export type OpsUtmPeriod = (typeof OPS_UTM_PERIODS)[number];
export type OpsUtmGranularity = (typeof OPS_UTM_GRANULARITIES)[number];
export type OpsUtmAccess = "internal" | "viewer";

export type OpsUtmSourceRow = {
  createdAt: string | null;
  description: string | null;
  entryCount: number;
  id: string | null;
  isRegistered: boolean;
  lastEnteredAt: string | null;
  source: string;
  updatedAt: string | null;
};

export type OpsUtmSourcePage = {
  access: OpsUtmAccess;
  generatedAt: string;
  nextOffset: number | null;
  rows: OpsUtmSourceRow[];
  total: number;
};

export type OpsUtmMetric = {
  count: number;
  rateFromLanding: number | null;
};

export type OpsUtmChartBucket = {
  key: string;
  label: string;
  landing: number;
  onboardingCompleted: number;
  signup: number;
};

export type OpsUtmSourceDetail = {
  access: OpsUtmAccess;
  buckets: OpsUtmChartBucket[];
  generatedAt: string;
  granularity: OpsUtmGranularity;
  period: OpsUtmPeriod;
  range: {
    endAt: string;
    startAt: string;
  };
  source: OpsUtmSourceRow;
  totals: {
    landing: OpsUtmMetric;
    onboardingCompleted: OpsUtmMetric;
    signup: OpsUtmMetric;
  };
};

export type OpsUtmSourceMutationResponse = {
  source: OpsUtmSourceRow;
};

export function parseOpsUtmPeriod(value: unknown): OpsUtmPeriod {
  return OPS_UTM_PERIODS.includes(value as OpsUtmPeriod)
    ? (value as OpsUtmPeriod)
    : "30d";
}

export function parseOpsUtmGranularity(value: unknown): OpsUtmGranularity {
  return OPS_UTM_GRANULARITIES.includes(value as OpsUtmGranularity)
    ? (value as OpsUtmGranularity)
    : "day";
}
