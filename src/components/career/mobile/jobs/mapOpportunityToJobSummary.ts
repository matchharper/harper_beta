import { formatRelativeTime } from "@/lib/utils";
import { getMetaItems } from "@/components/career/CareerHistoryPanel";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import type { CareerMobileJobSummary } from "./CareerMobileJobsView";

export function mapOpportunityToJobSummary(
  item: CareerHistoryOpportunity
): CareerMobileJobSummary {
  const meta = getMetaItems(item);
  const locationParts = [item.location, ...meta].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  const location = locationParts.length > 0 ? locationParts.join(" · ") : null;
  const postedAgo = formatRelativeTime(item.postedAt) || null;
  const sourceLabel =
    item.sourceType === "external"
      ? item.sourceProvider?.trim() || "Web-sourced"
      : "Internal";
  const bullets = item.recommendationReasons
    .map((reason) => reason.trim())
    .filter(Boolean);

  return {
    id: item.id,
    title: item.title,
    company: item.companyName,
    companyLogoUrl: item.companyLogoUrl,
    location,
    salary: null,
    postedAgo,
    sourceLabel,
    bullets,
    roleDetail: item.description ?? "",
  };
}
