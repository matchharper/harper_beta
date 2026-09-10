import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import type {
  OpsTalentMetricInterval,
  OpsTalentMetricsResponseBySection,
  OpsTalentMetricsSection,
} from "@/lib/ops/talentMetrics";

type ParsedRange = {
  from: string;
  to: string;
};

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

type RpcQuery = PromiseLike<RpcResult> & {
  abortSignal: (signal: AbortSignal) => RpcQuery;
};

type UntypedRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => RpcQuery;
};

const MAX_RANGE_DAYS = 366;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const CACHE_TTL_MS = 2 * 60 * 1_000;
const RESPONSE_CACHE_LIMIT = 12;

type AnySectionResponse =
  OpsTalentMetricsResponseBySection[OpsTalentMetricsSection];

const responseCache = new Map<
  string,
  { expiresAt: number; value: AnySectionResponse }
>();

const RPC_BY_SECTION: Record<OpsTalentMetricsSection, string> = {
  conversion: "get_ops_talent_metrics_conversion_v1",
  engagement: "get_ops_talent_metrics_engagement_v1",
  retention: "get_ops_talent_metrics_retention_v1",
};

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
  const verification = new Date(parsed + KST_OFFSET_MS);
  if (
    verification.getUTCFullYear() !== year ||
    verification.getUTCMonth() !== month - 1 ||
    verification.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function toKstDateOnly(valueMs: number) {
  return new Date(valueMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseOpsTalentMetricsRange(
  from: string,
  to: string
): ParsedRange {
  let startMs = parseDateOnly(from);
  let endDayMs = parseDateOnly(to);
  if (startMs === null || endDayMs === null) {
    throw new Error("날짜 범위가 올바르지 않습니다.");
  }
  if (endDayMs < startMs) {
    [startMs, endDayMs] = [endDayMs, startMs];
  }
  const durationDays = Math.floor((endDayMs - startMs) / DAY_MS) + 1;
  if (durationDays > MAX_RANGE_DAYS) {
    throw new Error(`조회 기간은 최대 ${MAX_RANGE_DAYS}일까지 가능합니다.`);
  }
  return {
    from: toKstDateOnly(startMs),
    to: toKstDateOnly(endDayMs),
  };
}

function normalizeExclusionTerms(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
  ).sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isCommonResponse(value: unknown) {
  if (!isRecord(value)) return false;
  if (
    !isRecord(value.filters) ||
    typeof value.generatedAt !== "string" ||
    typeof value.filters.from !== "string" ||
    typeof value.filters.to !== "string"
  ) {
    return false;
  }
  return (
    value.filters.interval === "day" ||
    value.filters.interval === "week" ||
    value.filters.interval === "month"
  );
}

function isMetricsResponse(
  section: OpsTalentMetricsSection,
  value: unknown
): value is AnySectionResponse {
  if (!isCommonResponse(value) || !isRecord(value)) return false;
  if (section === "retention") {
    return Array.isArray(value.weeklyRetentionCohorts);
  }
  if (
    !isRecord(value.summary) ||
    !isRecord(value.comparison) ||
    !Array.isArray(value.trend)
  ) {
    return false;
  }
  return (
    section === "conversion" ||
    (Array.isArray(value.dailyActivity) && Array.isArray(value.retention))
  );
}

function storeCachedResponse(cacheKey: string, value: AnySectionResponse) {
  if (responseCache.size >= RESPONSE_CACHE_LIMIT) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

export async function fetchOpsTalentMetricsSection<
  TSection extends OpsTalentMetricsSection,
>(args: {
  excludedEmails?: string[];
  from: string;
  interval?: OpsTalentMetricInterval;
  section: TSection;
  signal?: AbortSignal;
  to: string;
}): Promise<OpsTalentMetricsResponseBySection[TSection]> {
  const range = parseOpsTalentMetricsRange(args.from, args.to);
  const interval = args.interval ?? "week";
  const excludedEmails = normalizeExclusionTerms(args.excludedEmails ?? []);
  const cacheKey = JSON.stringify({
    excludedEmails,
    interval,
    range,
    section: args.section,
  });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as OpsTalentMetricsResponseBySection[TSection];
  }

  const admin = getTalentSupabaseAdmin() as unknown as UntypedRpcClient;
  const query = admin.rpc(RPC_BY_SECTION[args.section], {
    p_excluded_email_terms: excludedEmails,
    p_from: range.from,
    p_interval: interval,
    p_to: range.to,
  });
  const { data, error } = await (args.signal
    ? query.abortSignal(args.signal)
    : query);
  if (error) {
    throw new Error(error.message || "Talent 지표를 집계하지 못했습니다.");
  }
  if (!isMetricsResponse(args.section, data)) {
    throw new Error("Talent 지표 응답 형식이 올바르지 않습니다.");
  }

  storeCachedResponse(cacheKey, data);
  return data as OpsTalentMetricsResponseBySection[TSection];
}
