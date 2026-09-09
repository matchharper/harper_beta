export type OpsDebugInternalMatchingRoleMode = "all" | "auto" | "manual";

export type InternalMatchingRecommendationSourceRow = {
  clickedAt: string | null;
  companyName: string;
  exposureId: string;
  feedback: string | null;
  feedbackAt: string | null;
  isAuto: boolean;
  processedStage: string | null;
  recommendedAt: string;
  roleId: string;
  roleName: string;
  talentId: string;
  testOnly: boolean;
  updatedAt: string;
  viewedAt: string | null;
};

export type InternalMatchingTagSourceRow = {
  createdAt: string;
  roleId: string;
  tag: string;
  tagId: string;
  talentId: string;
  updatedAt: string;
};

export type InternalMatchingProgressSourceRow = {
  createdAt: string;
  metadata: Record<string, unknown>;
  roleId: string;
  talentId: string;
};

export type OpsDebugInternalMatchingPeriodStats = {
  acceptedArchivedCount: number;
  acceptedArchivedRate: number | null;
  acceptedCount: number;
  acceptanceRate: number | null;
  acceptedStalledCount: number;
  acceptedStalledRate: number | null;
  clickedCount: number;
  clickRate: number | null;
  cohortPairCount: number;
  connectionReachedCount: number;
  connectionReachedRate: number | null;
  exposureCount: number;
  finalOfferReachedCount: number;
  finalOfferReachedRate: number | null;
  medianResponseHours: number | null;
  processEnteredCount: number;
  processEnteredRate: number | null;
  processStoppedCount: number;
  processStoppedRate: number | null;
  rejectedCount: number;
  rejectionRate: number | null;
  repeatedPairCount: number;
  repeatedPairRate: number | null;
  respondedCount: number;
  responseRate: number | null;
  staleNoResponseCount: number;
  staleNoResponseRate: number | null;
  viewedCount: number;
  viewRate: number | null;
};

export type OpsDebugInternalMatchingTrendPoint = {
  acceptedArchivedRate: number | null;
  acceptanceRate: number | null;
  cohortPairCount: number;
  connectionReachedRate: number | null;
  fullLabel: string;
  label: string;
  processEnteredRate: number | null;
  rejectionRate: number | null;
  responseRate: number | null;
  weekStart: string;
};

export type OpsDebugInternalMatchingStageRow = {
  count: number;
  id:
    | "accepted"
    | "archived"
    | "company_process"
    | "final_offer"
    | "pending_connection"
    | "process_stopped"
    | "rejected"
    | "waiting";
  label: string;
  rate: number | null;
};

export type OpsDebugInternalMatchingBreakdownRow = {
  acceptedArchivedRate: number | null;
  acceptanceRate: number | null;
  companyName: string;
  connectionReachedRate: number | null;
  cohortPairCount: number;
  medianResponseHours: number | null;
  rejectionRate: number | null;
  responseRate: number | null;
  roleId: string;
  roleName: string;
};

export type OpsDebugInternalMatchingResponse = {
  breakdown: OpsDebugInternalMatchingBreakdownRow[];
  comparison: OpsDebugInternalMatchingPeriodStats | null;
  filters: {
    from: string | null;
    roleMode: OpsDebugInternalMatchingRoleMode;
    to: string | null;
  };
  generatedAt: string;
  sourceLimitReached: boolean;
  stages: OpsDebugInternalMatchingStageRow[];
  summary: OpsDebugInternalMatchingPeriodStats;
  trend: OpsDebugInternalMatchingTrendPoint[];
};

type DateRange = {
  endExclusiveMs: number;
  from: string;
  startMs: number;
  to: string;
};

type MatchingPair = {
  acceptedAt: string | null;
  clicked: boolean;
  companyName: string;
  currentStage: string;
  exposureCount: number;
  feedback: "accepted" | "rejected" | null;
  feedbackAt: string | null;
  firstRecommendedAt: string;
  isAuto: boolean;
  reachedStages: Set<string>;
  roleId: string;
  roleName: string;
  talentId: string;
  viewed: boolean;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const STALE_NO_RESPONSE_DAYS = 14;
const ACCEPTED_STALLED_DAYS = 7;

const INTERNAL_STAGE_BY_TAG = new Map([
  ["내부:수락", "accepted"],
  ["내부:아카이브", "archived"],
  ["내부:연결대기", "pending_connection"],
  ["내부:연결됨", "connected"],
  ["내부:최종오퍼", "final_offer"],
  ["내부:프로세스중단", "process_stopped"],
  ["내부:거절", "rejected"],
  ["내부:보류", "hold"],
  ["내부:추천", "recommended"],
]);

const CONNECTION_STAGES = new Set([
  "connected",
  "final_offer",
  "pending_connection",
]);
const PROCESS_STAGES = new Set(["connected", "final_offer"]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function timestamp(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function normalizeFeedback(value: unknown): MatchingPair["feedback"] {
  const normalized = text(value).toLowerCase();
  if (normalized === "like" || normalized === "positive") return "accepted";
  if (normalized === "dislike" || normalized === "negative") {
    return "rejected";
  }
  return null;
}

function normalizeStage(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("custom:")) return normalized;
  if (
    [
      "accepted",
      "archived",
      "connected",
      "final_offer",
      "hold",
      "pending_connection",
      "process_stopped",
      "recommended",
      "rejected",
    ].includes(normalized)
  ) {
    return normalized;
  }
  return null;
}

function stageFromTag(value: unknown) {
  const normalized = text(value).replace(/\s+/g, "");
  if (!normalized) return null;
  const builtIn = INTERNAL_STAGE_BY_TAG.get(normalized);
  if (builtIn) return builtIn;
  if (normalized.startsWith("내부단계:")) {
    const id = normalized.slice("내부단계:".length);
    return id ? `custom:${id}` : null;
  }
  return null;
}

function pairKey(talentId: string, roleId: string) {
  return `${talentId}:${roleId}`;
}

function compareNewest(
  left: Pick<
    InternalMatchingRecommendationSourceRow,
    "updatedAt" | "exposureId"
  >,
  right: Pick<
    InternalMatchingRecommendationSourceRow,
    "updatedAt" | "exposureId"
  >
) {
  const byUpdatedAt =
    (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  return right.exposureId.localeCompare(left.exposureId);
}

function compareLatestTag(
  left: InternalMatchingTagSourceRow,
  right: InternalMatchingTagSourceRow
) {
  const byUpdatedAt =
    (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0);
  if (byUpdatedAt !== 0) return byUpdatedAt;
  const byCreatedAt =
    (timestamp(right.createdAt) ?? 0) - (timestamp(left.createdAt) ?? 0);
  if (byCreatedAt !== 0) return byCreatedAt;
  return right.tagId.localeCompare(left.tagId);
}

function dateOnlyToKstStartMs(value: string) {
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

function kstDateOnly(value: number) {
  const shifted = new Date(value + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(
    shifted.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

export function normalizeInternalMatchingDateRange(args: {
  from?: string | null;
  to?: string | null;
}): DateRange | null {
  let from = text(args.from);
  let to = text(args.to);
  if (!from && !to) return null;
  if (!from) from = to;
  if (!to) to = from;

  let startMs = dateOnlyToKstStartMs(from);
  let endDayMs = dateOnlyToKstStartMs(to);
  if (startMs === null || endDayMs === null) return null;
  if (endDayMs < startMs) {
    const swap = startMs;
    startMs = endDayMs;
    endDayMs = swap;
  }
  return {
    endExclusiveMs: endDayMs + DAY_MS,
    from: kstDateOnly(startMs),
    startMs,
    to: kstDateOnly(endDayMs),
  };
}

function previousDateRange(range: DateRange | null) {
  if (!range) return null;
  const duration = range.endExclusiveMs - range.startMs;
  const endExclusiveMs = range.startMs;
  const startMs = endExclusiveMs - duration;
  return {
    endExclusiveMs,
    from: kstDateOnly(startMs),
    startMs,
    to: kstDateOnly(endExclusiveMs - DAY_MS),
  } satisfies DateRange;
}

function isInRange(value: string, range: DateRange | null) {
  if (!range) return true;
  const valueMs = timestamp(value);
  return (
    valueMs !== null &&
    valueMs >= range.startMs &&
    valueMs < range.endExclusiveMs
  );
}

function getFirstRecommendedAt(
  rows: InternalMatchingRecommendationSourceRow[]
) {
  return rows.reduce((first, row) => {
    const rowMs = timestamp(row.recommendedAt);
    const firstMs = timestamp(first);
    if (rowMs === null) return first;
    return firstMs === null || rowMs < firstMs ? row.recommendedAt : first;
  }, rows[0]?.recommendedAt ?? "");
}

function getLatestTagByPair(rows: InternalMatchingTagSourceRow[]) {
  const grouped = new Map<string, InternalMatchingTagSourceRow[]>();
  for (const row of rows) {
    const key = pairKey(row.talentId, row.roleId);
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  const latest = new Map<string, string>();
  for (const [key, tags] of grouped) {
    const stage = tags
      .sort(compareLatestTag)
      .map((row) => stageFromTag(row.tag))
      .find(Boolean);
    if (stage) latest.set(key, stage);
  }
  return latest;
}

function getProgressStagesByPair(rows: InternalMatchingProgressSourceRow[]) {
  const stages = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = pairKey(row.talentId, row.roleId);
    const current = stages.get(key) ?? new Set<string>();
    const stage = normalizeStage(row.metadata.stage);
    const previousStage = normalizeStage(row.metadata.previousStage);
    if (stage) current.add(stage);
    if (previousStage) current.add(previousStage);
    const tagStage = stageFromTag(row.metadata.tag);
    if (tagStage) current.add(tagStage);
    stages.set(key, current);
  }
  return stages;
}

function isCustomStage(value: string) {
  return value.startsWith("custom:");
}

function pairReachedConnection(pair: MatchingPair) {
  return Array.from(pair.reachedStages).some(
    (stage) => CONNECTION_STAGES.has(stage) || isCustomStage(stage)
  );
}

function pairEnteredProcess(pair: MatchingPair) {
  return Array.from(pair.reachedStages).some(
    (stage) => PROCESS_STAGES.has(stage) || isCustomStage(stage)
  );
}

function pairReachedFinalOffer(pair: MatchingPair) {
  return pair.reachedStages.has("final_offer");
}

function pairIsAccepted(pair: MatchingPair) {
  if (pair.currentStage === "rejected") return false;
  if (
    pair.currentStage === "accepted" ||
    pair.currentStage === "pending_connection" ||
    pair.currentStage === "connected" ||
    pair.currentStage === "final_offer" ||
    pair.currentStage === "process_stopped" ||
    isCustomStage(pair.currentStage)
  ) {
    return true;
  }
  if (pair.currentStage === "archived") {
    return pair.feedback === "accepted" || pairReachedConnection(pair);
  }
  return pair.feedback === "accepted";
}

function pairIsRejected(pair: MatchingPair) {
  if (pair.currentStage === "rejected") return true;
  return !pairIsAccepted(pair) && pair.feedback === "rejected";
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function buildStats(pairs: MatchingPair[], nowMs: number) {
  const acceptedPairs = pairs.filter(pairIsAccepted);
  const rejectedPairs = pairs.filter(pairIsRejected);
  const respondedPairs = pairs.filter(
    (pair) => pairIsAccepted(pair) || pairIsRejected(pair)
  );
  const acceptedArchivedPairs = acceptedPairs.filter(
    (pair) => pair.currentStage === "archived"
  );
  const connectionReachedPairs = acceptedPairs.filter(pairReachedConnection);
  const processEnteredPairs = acceptedPairs.filter(pairEnteredProcess);
  const finalOfferReachedPairs = acceptedPairs.filter(pairReachedFinalOffer);
  const processStoppedPairs = acceptedPairs.filter(
    (pair) => pair.currentStage === "process_stopped"
  );
  const repeatedPairs = pairs.filter((pair) => pair.exposureCount > 1);
  const staleNoResponsePairs = pairs.filter((pair) => {
    if (pairIsAccepted(pair) || pairIsRejected(pair)) return false;
    const firstRecommendedAtMs = timestamp(pair.firstRecommendedAt);
    return (
      firstRecommendedAtMs !== null &&
      nowMs - firstRecommendedAtMs >= STALE_NO_RESPONSE_DAYS * DAY_MS
    );
  });
  const acceptedStalledPairs = acceptedPairs.filter((pair) => {
    if (pair.currentStage !== "accepted") return false;
    const acceptedAtMs = timestamp(pair.acceptedAt);
    return (
      acceptedAtMs !== null &&
      nowMs - acceptedAtMs >= ACCEPTED_STALLED_DAYS * DAY_MS
    );
  });
  const responseHours = respondedPairs.flatMap((pair) => {
    const feedbackAtMs = timestamp(pair.feedbackAt);
    const firstRecommendedAtMs = timestamp(pair.firstRecommendedAt);
    if (
      feedbackAtMs === null ||
      firstRecommendedAtMs === null ||
      feedbackAtMs < firstRecommendedAtMs
    ) {
      return [];
    }
    return [(feedbackAtMs - firstRecommendedAtMs) / (60 * 60 * 1_000)];
  });

  return {
    acceptedArchivedCount: acceptedArchivedPairs.length,
    acceptedArchivedRate: rate(
      acceptedArchivedPairs.length,
      acceptedPairs.length
    ),
    acceptedCount: acceptedPairs.length,
    acceptanceRate: rate(acceptedPairs.length, pairs.length),
    acceptedStalledCount: acceptedStalledPairs.length,
    acceptedStalledRate: rate(
      acceptedStalledPairs.length,
      acceptedPairs.length
    ),
    clickedCount: pairs.filter((pair) => pair.clicked).length,
    clickRate: rate(pairs.filter((pair) => pair.clicked).length, pairs.length),
    cohortPairCount: pairs.length,
    connectionReachedCount: connectionReachedPairs.length,
    connectionReachedRate: rate(
      connectionReachedPairs.length,
      acceptedPairs.length
    ),
    exposureCount: pairs.reduce((sum, pair) => sum + pair.exposureCount, 0),
    finalOfferReachedCount: finalOfferReachedPairs.length,
    finalOfferReachedRate: rate(
      finalOfferReachedPairs.length,
      acceptedPairs.length
    ),
    medianResponseHours: median(responseHours),
    processEnteredCount: processEnteredPairs.length,
    processEnteredRate: rate(processEnteredPairs.length, acceptedPairs.length),
    processStoppedCount: processStoppedPairs.length,
    processStoppedRate: rate(processStoppedPairs.length, acceptedPairs.length),
    rejectedCount: rejectedPairs.length,
    rejectionRate: rate(rejectedPairs.length, pairs.length),
    repeatedPairCount: repeatedPairs.length,
    repeatedPairRate: rate(repeatedPairs.length, pairs.length),
    respondedCount: respondedPairs.length,
    responseRate: rate(respondedPairs.length, pairs.length),
    staleNoResponseCount: staleNoResponsePairs.length,
    staleNoResponseRate: rate(staleNoResponsePairs.length, pairs.length),
    viewedCount: pairs.filter((pair) => pair.viewed).length,
    viewRate: rate(pairs.filter((pair) => pair.viewed).length, pairs.length),
  } satisfies OpsDebugInternalMatchingPeriodStats;
}

function startOfKstWeek(value: string) {
  const valueMs = timestamp(value);
  if (valueMs === null) return null;
  const shifted = new Date(valueMs + KST_OFFSET_MS);
  const day = shifted.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const startMs =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysSinceMonday
    ) - KST_OFFSET_MS;
  return kstDateOnly(startMs);
}

function formatWeekLabel(weekStart: string) {
  const [, month, day] = weekStart.split("-");
  return `${month}.${day}`;
}

function buildTrend(pairs: MatchingPair[], nowMs: number) {
  const byWeek = new Map<string, MatchingPair[]>();
  for (const pair of pairs) {
    const weekStart = startOfKstWeek(pair.firstRecommendedAt);
    if (!weekStart) continue;
    const current = byWeek.get(weekStart) ?? [];
    current.push(pair);
    byWeek.set(weekStart, current);
  }

  return Array.from(byWeek.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, weekPairs]) => {
      const stats = buildStats(weekPairs, nowMs);
      return {
        acceptedArchivedRate: stats.acceptedArchivedRate,
        acceptanceRate: stats.acceptanceRate,
        cohortPairCount: stats.cohortPairCount,
        connectionReachedRate: stats.connectionReachedRate,
        fullLabel: `${weekStart} 시작 · ${stats.cohortPairCount}쌍`,
        label: formatWeekLabel(weekStart),
        processEnteredRate: stats.processEnteredRate,
        rejectionRate: stats.rejectionRate,
        responseRate: stats.responseRate,
        weekStart,
      } satisfies OpsDebugInternalMatchingTrendPoint;
    });
}

function stageCategory(
  pair: MatchingPair
): OpsDebugInternalMatchingStageRow["id"] {
  if (pair.currentStage === "archived") return "archived";
  if (pair.currentStage === "process_stopped") return "process_stopped";
  if (pair.currentStage === "final_offer") return "final_offer";
  if (pair.currentStage === "pending_connection") return "pending_connection";
  if (pair.currentStage === "connected" || isCustomStage(pair.currentStage)) {
    return "company_process";
  }
  if (pairIsAccepted(pair)) return "accepted";
  if (pairIsRejected(pair)) return "rejected";
  return "waiting";
}

function buildStageRows(pairs: MatchingPair[]) {
  const labels: Record<OpsDebugInternalMatchingStageRow["id"], string> = {
    accepted: "후보자 수락",
    archived: "아카이브",
    company_process: "회사 프로세스",
    final_offer: "최종 오퍼",
    pending_connection: "연결 대기",
    process_stopped: "프로세스 중단",
    rejected: "후보자 거절",
    waiting: "결정 대기",
  };
  const order = [
    "waiting",
    "accepted",
    "pending_connection",
    "company_process",
    "final_offer",
    "process_stopped",
    "archived",
    "rejected",
  ] as const;
  const counts = new Map<OpsDebugInternalMatchingStageRow["id"], number>();
  for (const pair of pairs) {
    const category = stageCategory(pair);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return order.map((id) => ({
    count: counts.get(id) ?? 0,
    id,
    label: labels[id],
    rate: rate(counts.get(id) ?? 0, pairs.length),
  }));
}

function buildBreakdown(pairs: MatchingPair[], nowMs: number) {
  const byRole = new Map<string, MatchingPair[]>();
  for (const pair of pairs) {
    const current = byRole.get(pair.roleId) ?? [];
    current.push(pair);
    byRole.set(pair.roleId, current);
  }

  return Array.from(byRole.entries())
    .map(([roleId, rolePairs]) => {
      const stats = buildStats(rolePairs, nowMs);
      const first = rolePairs[0];
      return {
        acceptedArchivedRate: stats.acceptedArchivedRate,
        acceptanceRate: stats.acceptanceRate,
        companyName: first.companyName,
        connectionReachedRate: stats.connectionReachedRate,
        cohortPairCount: stats.cohortPairCount,
        medianResponseHours: stats.medianResponseHours,
        rejectionRate: stats.rejectionRate,
        responseRate: stats.responseRate,
        roleId,
        roleName: first.roleName,
      } satisfies OpsDebugInternalMatchingBreakdownRow;
    })
    .sort((left, right) => {
      if (right.cohortPairCount !== left.cohortPairCount) {
        return right.cohortPairCount - left.cohortPairCount;
      }
      const byCompany = left.companyName.localeCompare(right.companyName, "ko");
      return byCompany || left.roleName.localeCompare(right.roleName, "ko");
    })
    .slice(0, 30);
}

function buildPairs(args: {
  progress: InternalMatchingProgressSourceRow[];
  recommendations: InternalMatchingRecommendationSourceRow[];
  roleMode: OpsDebugInternalMatchingRoleMode;
  tags: InternalMatchingTagSourceRow[];
}) {
  const recommendationGroups = new Map<
    string,
    InternalMatchingRecommendationSourceRow[]
  >();
  for (const row of args.recommendations) {
    if (row.testOnly) continue;
    if (args.roleMode === "auto" && !row.isAuto) continue;
    if (args.roleMode === "manual" && row.isAuto) continue;
    const key = pairKey(row.talentId, row.roleId);
    const current = recommendationGroups.get(key) ?? [];
    current.push(row);
    recommendationGroups.set(key, current);
  }

  const latestStageByPair = getLatestTagByPair(args.tags);
  const progressStagesByPair = getProgressStagesByPair(args.progress);

  return Array.from(recommendationGroups.entries()).flatMap(([key, rows]) => {
    const latest = [...rows].sort(compareNewest)[0];
    const firstRecommendedAt = getFirstRecommendedAt(rows);
    if (!latest || !firstRecommendedAt) return [];
    const feedback = normalizeFeedback(latest.feedback);
    const currentStage =
      latestStageByPair.get(key) ??
      normalizeStage(latest.processedStage) ??
      feedback ??
      "recommended";
    const reachedStages = new Set(progressStagesByPair.get(key) ?? []);
    reachedStages.add(currentStage);
    return [
      {
        acceptedAt: feedback === "accepted" ? latest.feedbackAt : null,
        clicked: rows.some((row) => Boolean(row.clickedAt)),
        companyName: latest.companyName || "회사명 없음",
        currentStage,
        exposureCount: rows.length,
        feedback,
        feedbackAt: latest.feedbackAt,
        firstRecommendedAt,
        isAuto: latest.isAuto,
        reachedStages,
        roleId: latest.roleId,
        roleName: latest.roleName || "Role 이름 없음",
        talentId: latest.talentId,
        viewed: rows.some((row) => Boolean(row.viewedAt)),
      } satisfies MatchingPair,
    ];
  });
}

export function compileOpsDebugInternalMatching(args: {
  from?: string | null;
  generatedAt?: string;
  progress: InternalMatchingProgressSourceRow[];
  recommendations: InternalMatchingRecommendationSourceRow[];
  roleMode?: OpsDebugInternalMatchingRoleMode;
  sourceLimitReached?: boolean;
  tags: InternalMatchingTagSourceRow[];
  to?: string | null;
}): OpsDebugInternalMatchingResponse {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const nowMs = timestamp(generatedAt) ?? Date.now();
  const currentRange = normalizeInternalMatchingDateRange({
    from: args.from,
    to: args.to,
  });
  const comparisonRange = previousDateRange(currentRange);
  const roleMode = args.roleMode ?? "all";
  const pairs = buildPairs({
    progress: args.progress,
    recommendations: args.recommendations,
    roleMode,
    tags: args.tags,
  });
  const currentPairs = pairs.filter((pair) =>
    isInRange(pair.firstRecommendedAt, currentRange)
  );
  const comparisonPairs = comparisonRange
    ? pairs.filter((pair) =>
        isInRange(pair.firstRecommendedAt, comparisonRange)
      )
    : null;

  return {
    breakdown: buildBreakdown(currentPairs, nowMs),
    comparison: comparisonPairs ? buildStats(comparisonPairs, nowMs) : null,
    filters: {
      from: currentRange?.from ?? null,
      roleMode,
      to: currentRange?.to ?? null,
    },
    generatedAt,
    sourceLimitReached: args.sourceLimitReached === true,
    stages: buildStageRows(currentPairs),
    summary: buildStats(currentPairs, nowMs),
    trend: buildTrend(currentPairs, nowMs),
  };
}
