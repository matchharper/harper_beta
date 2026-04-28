import type {
  CareerHistoryOpportunity,
  CareerRecentOpportunity,
  CareerTalentNotification,
  SessionResponse,
} from "@/components/career/types";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { isOpportunityType } from "@/lib/opportunityType";

export const getDefaultSavedStage = (
  item: CareerHistoryOpportunity
) => getCareerDefaultSavedStage(item.opportunityType);

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
