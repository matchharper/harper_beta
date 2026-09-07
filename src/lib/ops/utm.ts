import {
  CAREER_UTM_PARAM_MAX_LENGTH,
  normalizeCareerUtmSource,
} from "@/lib/career/utm";

export const OPS_UTM_PERIODS = ["7d", "30d", "3m", "12m"] as const;
export const OPS_UTM_GRANULARITIES = ["day", "week"] as const;
export const OPS_UTM_DIMENSIONS = [
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type OpsUtmPeriod = (typeof OPS_UTM_PERIODS)[number];
export type OpsUtmGranularity = (typeof OPS_UTM_GRANULARITIES)[number];
export type OpsUtmDimension = (typeof OPS_UTM_DIMENSIONS)[number];
export type OpsUtmAccess = "internal" | "viewer";
export type OpsUtmFilters = Partial<Record<OpsUtmDimension, string>>;

export type OpsUtmUrlState = {
  filters: OpsUtmFilters;
  granularity: OpsUtmGranularity;
  period: OpsUtmPeriod;
  source: string | null;
};

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

export type OpsUtmBreakdown = {
  key: OpsUtmDimension;
  options: Array<{
    entryCount: number;
    value: string;
  }>;
  selectedValue: string | null;
};

export type OpsUtmLandingCompositionRow = {
  count: number;
  key: string;
  label: string;
  rate: number;
};

export type OpsUtmLandingComposition = {
  countries: OpsUtmLandingCompositionRow[];
  devices: OpsUtmLandingCompositionRow[];
  timeRanges: OpsUtmLandingCompositionRow[];
  timeZone: "Asia/Seoul";
};

export type OpsUtmLandingEntryMetadata = {
  countryLang: string | null;
  createdAt: string;
  isMobile: boolean | null;
};

export type OpsUtmSourceDetail = {
  access: OpsUtmAccess;
  breakdowns: OpsUtmBreakdown[];
  buckets: OpsUtmChartBucket[];
  generatedAt: string;
  granularity: OpsUtmGranularity;
  landingComposition: OpsUtmLandingComposition;
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

const OPS_UTM_KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const OPS_UTM_TIME_RANGES = [
  { key: "00-02", label: "00–02시" },
  { key: "03-05", label: "03–05시" },
  { key: "06-08", label: "06–08시" },
  { key: "09-11", label: "09–11시" },
  { key: "12-14", label: "12–14시" },
  { key: "15-17", label: "15–17시" },
  { key: "18-20", label: "18–20시" },
  { key: "21-23", label: "21–23시" },
] as const;

function incrementCompositionCount(
  counts: Map<string, { count: number; label: string }>,
  key: string,
  label: string
) {
  const current = counts.get(key);
  counts.set(key, {
    count: (current?.count ?? 0) + 1,
    label,
  });
}

function toCompositionRows(
  counts: Map<string, { count: number; label: string }>,
  total: number
): OpsUtmLandingCompositionRow[] {
  return Array.from(counts, ([key, value]) => ({
    count: value.count,
    key,
    label: value.label,
    rate: total > 0 ? value.count / total : 0,
  })).sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label, "ko")
  );
}

function resolveCountryCode(countryLang: string | null) {
  const code = String(countryLang ?? "")
    .split("_")[0]
    ?.trim()
    .toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) && code !== "ZZ" ? code : null;
}

function getCountryLabel(code: string) {
  try {
    return new Intl.DisplayNames(["ko"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function buildOpsUtmLandingComposition(
  entries: OpsUtmLandingEntryMetadata[]
): OpsUtmLandingComposition {
  const countryCounts = new Map<string, { count: number; label: string }>();
  const deviceCounts = new Map<string, { count: number; label: string }>();
  const timeRangeCounts = new Map<
    string,
    { count: number; label: string }
  >();

  for (const entry of entries) {
    const countryCode = resolveCountryCode(entry.countryLang);
    incrementCompositionCount(
      countryCounts,
      countryCode ?? "unknown",
      countryCode ? getCountryLabel(countryCode) : "알 수 없음"
    );

    const deviceKey =
      entry.isMobile === true
        ? "mobile"
        : entry.isMobile === false
          ? "desktop"
          : "unknown";
    incrementCompositionCount(
      deviceCounts,
      deviceKey,
      deviceKey === "mobile"
        ? "모바일"
        : deviceKey === "desktop"
          ? "데스크톱"
          : "알 수 없음"
    );

    const timestamp = new Date(entry.createdAt).getTime();
    if (!Number.isFinite(timestamp)) {
      incrementCompositionCount(timeRangeCounts, "unknown", "알 수 없음");
      continue;
    }
    const kstHour = new Date(timestamp + OPS_UTM_KST_OFFSET_MS).getUTCHours();
    const timeRange = OPS_UTM_TIME_RANGES[Math.floor(kstHour / 3)];
    if (!timeRange) {
      incrementCompositionCount(timeRangeCounts, "unknown", "알 수 없음");
      continue;
    }
    incrementCompositionCount(timeRangeCounts, timeRange.key, timeRange.label);
  }

  return {
    countries: toCompositionRows(countryCounts, entries.length),
    devices: toCompositionRows(deviceCounts, entries.length),
    timeRanges: toCompositionRows(timeRangeCounts, entries.length),
    timeZone: "Asia/Seoul",
  };
}

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

function getSingleQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeOpsUtmFilterValue(value: unknown) {
  const normalized = String(getSingleQueryValue(value) ?? "").trim();
  if (!normalized || normalized.length > CAREER_UTM_PARAM_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

export function parseOpsUtmFilters(
  values: Partial<Record<OpsUtmDimension, unknown>>
): OpsUtmFilters {
  const filters: OpsUtmFilters = {};
  for (const key of OPS_UTM_DIMENSIONS) {
    const value = normalizeOpsUtmFilterValue(values[key]);
    if (value) filters[key] = value;
  }
  return filters;
}

export function parseOpsUtmUrlState(
  query: Record<string, unknown>
): OpsUtmUrlState {
  return {
    filters: parseOpsUtmFilters(query),
    granularity: parseOpsUtmGranularity(getSingleQueryValue(query.granularity)),
    period: parseOpsUtmPeriod(getSingleQueryValue(query.period)),
    source: normalizeCareerUtmSource(getSingleQueryValue(query.source)),
  };
}

export function buildOpsUtmUrlQuery(
  state: OpsUtmUrlState,
  searchQuery = ""
) {
  const query: Record<string, string> = {
    granularity: state.granularity,
    period: state.period,
  };
  if (state.source) query.source = state.source;
  for (const key of OPS_UTM_DIMENSIONS) {
    const value = state.filters[key];
    if (value) query[key] = value;
  }
  const normalizedSearchQuery = searchQuery.trim();
  if (normalizedSearchQuery) query.q = normalizedSearchQuery;
  return query;
}

export function readOpsUtmSearchQuery(value: unknown) {
  return String(getSingleQueryValue(value) ?? "").trim();
}
