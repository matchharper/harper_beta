import { StatusEnum } from "@/types/type";

export type SearchPlanKey = "pro" | "max" | "enterprise" | "free" | null;

const DEFAULT_PARALLEL_SEARCH_LIMIT = 1;
const MAX_PLAN_PARALLEL_SEARCH_LIMIT = 3;
const OVERRIDE_PARALLEL_SEARCH_LIMIT = 10;

function normalizePlanValue(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "")
    .trim();
}

function getOverrideUserIds() {
  return [
    "5219cf7f-90fa-4b71-907a-6f7ad03bb837",
    "111fe5c4-8f66-4392-9a27-e81fb8dfa7dd",
  ];
}

export const ACTIVE_PARALLEL_SEARCH_STATUSES = [
  StatusEnum.DONE,
  StatusEnum.RUNNING,
  StatusEnum.PARTIAL,
  StatusEnum.FOUND,
  StatusEnum.STARTING,
  StatusEnum.QUEUED,
  StatusEnum.RERANKING_STREAMING,
  StatusEnum.PARSING,
  StatusEnum.REFINE,
  StatusEnum.EXPANDING,
  StatusEnum.RERANKING,
] as const;

export function inferSearchPlanKey(
  planLabel?: string | null,
  planId?: string | null
): SearchPlanKey {
  const hay = normalizePlanValue(`${planLabel ?? ""} ${planId ?? ""}`);
  if (hay.includes("free") || hay.includes("프리")) return "free";
  if (hay.includes("max")) return "max";
  if (hay.includes("pro")) return "pro";
  if (hay.includes("enterprise")) return "enterprise";
  return null;
}

export function isParallelSearchOverrideUser(userId?: string | null) {
  if (!userId) return false;
  return getOverrideUserIds().has(userId);
}

export function getMaxParallelSearchCount(args: {
  planKey?: SearchPlanKey | undefined;
  userId?: string | null;
}) {
  if (isParallelSearchOverrideUser(args.userId)) {
    return OVERRIDE_PARALLEL_SEARCH_LIMIT;
  }

  return args.planKey === "max"
    ? MAX_PLAN_PARALLEL_SEARCH_LIMIT
    : DEFAULT_PARALLEL_SEARCH_LIMIT;
}

export function getParallelSearchLimitMessage(args: {
  maxParallel: number;
  locale?: "ko" | "en";
}) {
  const { maxParallel, locale = "ko" } = args;

  if (locale === "en") {
    if (maxParallel === 1) {
      return "A search is already in progress. Please wait until it finishes before starting another one. (Max plan users can run up to 3 searches in parallel.)";
    }

    return `You can run up to ${maxParallel} searches in parallel.`;
  }

  if (maxParallel === 1) {
    return "이미 검색이 진행중입니다. 기존 검색이 종료된 후에 다시 시도해주세요. (Max 플랜의 경우 동시에 3개까지 가능합니다.)";
  }

  return `동시 검색은 최대 ${maxParallel}개까지 가능합니다.`;
}
