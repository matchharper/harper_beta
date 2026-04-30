import type {
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunity,
  CareerRecentOpportunity,
  CareerOpportunitySavedStage,
  CareerTalentNotification,
  SessionResponse,
} from "@/components/career/types";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { isOpportunityType } from "@/lib/opportunityType";

export const getDefaultSavedStage = (
  item: CareerHistoryOpportunity
) => getCareerDefaultSavedStage(item.opportunityType);

const SAVED_STAGES: CareerOpportunitySavedStage[] = [
  "saved",
  "applied",
  "connected",
  "closed",
];

export const createEmptyHistoryOpportunityCounts =
  (): CareerHistoryOpportunityCounts => ({
    archived: 0,
    new: 0,
    saved: 0,
    savedStages: {
      saved: 0,
      applied: 0,
      connected: 0,
      closed: 0,
    },
    total: 0,
  });

const normalizeCount = (value: unknown) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

export const normalizeHistoryOpportunityCounts = (
  value: unknown
): CareerHistoryOpportunityCounts | null => {
  if (!value || typeof value !== "object") return null;

  const record = value as Partial<CareerHistoryOpportunityCounts>;
  const savedStageRecord =
    record.savedStages && typeof record.savedStages === "object"
      ? record.savedStages
      : {};
  const counts = createEmptyHistoryOpportunityCounts();

  counts.new = normalizeCount(record.new);
  counts.saved = normalizeCount(record.saved);
  counts.archived = normalizeCount(record.archived);
  counts.total = normalizeCount(record.total);

  for (const stage of SAVED_STAGES) {
    counts.savedStages[stage] = normalizeCount(
      (savedStageRecord as Record<string, unknown>)[stage]
    );
  }

  if (counts.total === 0) {
    counts.total = counts.new + counts.saved + counts.archived;
  }

  return counts;
};

export const deriveHistoryOpportunityCounts = (
  opportunities: CareerHistoryOpportunity[]
): CareerHistoryOpportunityCounts => {
  const counts = createEmptyHistoryOpportunityCounts();

  for (const item of opportunities) {
    counts.total += 1;

    if (item.feedback === "positive") {
      const stage = item.savedStage ?? getDefaultSavedStage(item);
      counts.saved += 1;
      counts.savedStages[stage] += 1;
      continue;
    }

    if (item.feedback === "negative") {
      counts.archived += 1;
      continue;
    }

    counts.new += 1;
  }

  return counts;
};

export const normalizeRecentOpportunities = (
  value: SessionResponse["recentOpportunities"]
): CareerRecentOpportunity[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerRecentOpportunity => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "string" || !item.id.trim()) return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
    if (typeof item.companyName !== "string" || !item.companyName.trim()) {
      return false;
    }
    if (item.kind !== "match" && item.kind !== "recommendation") return false;
    if (!isOpportunityType(item.opportunityType)) {
      return false;
    }
    if (
      typeof item.matchedAt !== "string" ||
      Number.isNaN(Date.parse(item.matchedAt))
    ) {
      return false;
    }
    return true;
  });
};

export const normalizeHistoryOpportunities = (
  value: SessionResponse["historyOpportunities"]
): CareerHistoryOpportunity[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerHistoryOpportunity => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "string" || !item.id.trim()) return false;
    if (typeof item.roleId !== "string" || !item.roleId.trim()) return false;
    if (typeof item.title !== "string" || !item.title.trim()) return false;
    if (typeof item.companyName !== "string" || !item.companyName.trim()) {
      return false;
    }
    if (item.kind !== "match" && item.kind !== "recommendation") return false;
    if (item.sourceType !== "internal" && item.sourceType !== "external") {
      return false;
    }
    if (typeof item.recommendedAt !== "string") return false;
    if (Number.isNaN(Date.parse(item.recommendedAt))) return false;
    if (!Array.isArray(item.employmentTypes)) return false;
    if (!Array.isArray(item.recommendationReasons)) return false;
    if (typeof item.isAccepted !== "boolean") return false;
    if (typeof item.isInternal !== "boolean") return false;
    if (!isOpportunityType(item.opportunityType)) {
      return false;
    }
    if (
      item.feedback !== null &&
      item.feedback !== "positive" &&
      item.feedback !== "negative"
    ) {
      return false;
    }
    if (
      item.savedStage !== null &&
      item.savedStage !== "saved" &&
      item.savedStage !== "applied" &&
      item.savedStage !== "connected" &&
      item.savedStage !== "closed"
    ) {
      return false;
    }
    return true;
  });
};

export const normalizeNotifications = (
  value: SessionResponse["notifications"]
): CareerTalentNotification[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is CareerTalentNotification => {
    if (!item || typeof item !== "object") return false;
    if (typeof item.id !== "number" || !Number.isFinite(item.id)) return false;
    if (
      typeof item.createdAt !== "string" ||
      Number.isNaN(Date.parse(item.createdAt))
    ) {
      return false;
    }
    if (item.message !== null && typeof item.message !== "string") return false;
    return typeof item.isRead === "boolean";
  });
};
