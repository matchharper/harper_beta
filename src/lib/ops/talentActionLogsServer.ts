import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  OPS_TALENT_ACTION_SECTIONS,
  isOpsTalentActionSourceGroup,
  isOpsTalentActionView,
  type OpsTalentActionId,
  type OpsTalentActionLogsResponse,
  type OpsTalentActionMetric,
  type OpsTalentActionSourceGroup,
  type OpsTalentActionView,
  type OpsTalentActionWeek,
} from "@/lib/ops/talentActionLogs";

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

const CACHE_TTL_MS = 2 * 60 * 1_000;
const RESPONSE_CACHE_LIMIT = 24;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const MIN_WEEKS = 2;
const MAX_WEEKS = 26;

const actionIds = new Set<OpsTalentActionId>(
  OPS_TALENT_ACTION_SECTIONS.flatMap((section) =>
    section.actions.map((action) => action.id)
  )
);

const responseCache = new Map<
  string,
  { expiresAt: number; value: OpsTalentActionLogsResponse }
>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBoundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseMetric(value: unknown): OpsTalentActionMetric | null {
  if (!isRecord(value) || !actionIds.has(value.actionId as OpsTalentActionId)) {
    return null;
  }
  const userCount = Number(value.userCount);
  const percentage = Number(value.percentage);
  if (!Number.isFinite(userCount) || !Number.isFinite(percentage)) return null;
  return {
    actionId: value.actionId as OpsTalentActionId,
    percentage,
    userCount,
  };
}

function parseWeek(value: unknown): OpsTalentActionWeek | null {
  if (!isRecord(value) || typeof value.weekStart !== "string") return null;
  const cohortTotal = Number(value.cohortTotal);
  if (!Number.isFinite(cohortTotal) || !Array.isArray(value.items)) return null;
  return {
    cohortTotal,
    items: value.items
      .map(parseMetric)
      .filter(Boolean) as OpsTalentActionMetric[],
    weekStart: value.weekStart,
  };
}

function parseResponse(value: unknown): OpsTalentActionLogsResponse {
  if (
    !isRecord(value) ||
    !isRecord(value.filters) ||
    typeof value.generatedAt !== "string" ||
    !isOpsTalentActionSourceGroup(value.filters.group) ||
    !isOpsTalentActionView(value.filters.view) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.weeks)
  ) {
    throw new Error("액션 로그 응답 형식이 올바르지 않습니다.");
  }

  const cohortTotal = Number(value.cohortTotal);
  const days = Number(value.filters.days);
  const weeks = Number(value.filters.weeks);
  if (
    !Number.isFinite(cohortTotal) ||
    !Number.isFinite(days) ||
    !Number.isFinite(weeks)
  ) {
    throw new Error("액션 로그 응답 값이 올바르지 않습니다.");
  }

  return {
    cohortTotal,
    filters: {
      days,
      group: value.filters.group,
      view: value.filters.view,
      weeks,
    },
    generatedAt: value.generatedAt,
    items: value.items
      .map(parseMetric)
      .filter(Boolean) as OpsTalentActionMetric[],
    weeks: value.weeks.map(parseWeek).filter(Boolean) as OpsTalentActionWeek[],
  };
}

function storeCachedResponse(
  cacheKey: string,
  value: OpsTalentActionLogsResponse
) {
  if (responseCache.size >= RESPONSE_CACHE_LIMIT) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

export function normalizeOpsTalentActionLogFilters(args: {
  days?: unknown;
  group?: unknown;
  view?: unknown;
  weeks?: unknown;
}) {
  const group = isOpsTalentActionSourceGroup(args.group)
    ? args.group
    : "product";
  const view = isOpsTalentActionView(args.view) ? args.view : "summary";
  return {
    days: parseBoundedInteger(args.days, 30, MIN_DAYS, MAX_DAYS),
    group,
    view,
    weeks: parseBoundedInteger(args.weeks, 12, MIN_WEEKS, MAX_WEEKS),
  } satisfies {
    days: number;
    group: OpsTalentActionSourceGroup;
    view: OpsTalentActionView;
    weeks: number;
  };
}

export async function fetchOpsTalentActionLogs(args: {
  days?: unknown;
  group?: unknown;
  signal?: AbortSignal;
  view?: unknown;
  weeks?: unknown;
}) {
  const filters = normalizeOpsTalentActionLogFilters(args);
  const cacheKey = JSON.stringify(filters);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const admin = getTalentSupabaseAdmin() as unknown as UntypedRpcClient;
  const query = admin.rpc("get_ops_talent_action_logs_v1", {
    p_days: filters.days,
    p_group: filters.group,
    p_view: filters.view,
    p_weeks: filters.weeks,
  });
  const { data, error } = await (args.signal
    ? query.abortSignal(args.signal)
    : query);
  if (error) {
    throw new Error(error.message || "액션 로그를 집계하지 못했습니다.");
  }

  const parsed = parseResponse(data);
  storeCachedResponse(cacheKey, parsed);
  return parsed;
}
