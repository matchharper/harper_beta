import { getCareerDefaultSavedStage } from "../opportunityTypeMeta";
import type {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStage,
} from "../types";

export type SavedOpportunityManagementStatus =
  | "saved"
  | "active"
  | "closed"
  | "hidden";

type CareerTLike = (key: string, koSource: string) => string;

const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

export const getSavedOpportunityStatusOptions = (t: CareerTLike) =>
  [
    {
      id: "saved",
      label: t("career.history.saved_opportunity_status.0obqas2", "저장됨"),
    },
    {
      id: "active",
      label: t(
        "career.history.saved_opportunity_status.0rjulen",
        "프로세스 진행중"
      ),
    },
    {
      id: "closed",
      label: t(
        "career.history.saved_opportunity_status.1jv953e",
        "프로세스 종료"
      ),
    },
    {
      id: "hidden",
      label: t("career.history.saved_opportunity_status.0exoa8f", "숨기기"),
    },
  ] as const satisfies readonly {
    id: SavedOpportunityManagementStatus;
    label: string;
  }[];

export const SAVED_OPPORTUNITY_STATUS_OPTIONS =
  getSavedOpportunityStatusOptions(fallbackCareerT);

export const isSavedOpportunityManagementStatus = (
  value: unknown
): value is SavedOpportunityManagementStatus =>
  value === "saved" ||
  value === "active" ||
  value === "closed" ||
  value === "hidden";

export const getSavedOpportunityStatusFromQuery = (
  value: string | string[] | undefined
): SavedOpportunityManagementStatus => {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "applied" || normalized === "connected") return "active";
  if (normalized === "closed") return "closed";
  if (normalized === "hidden") return "hidden";
  return "saved";
};

export const getSavedOpportunityStatusQueryValue = (
  status: SavedOpportunityManagementStatus
) => {
  if (status === "active") return "applied";
  return status;
};

export const getSavedStageForManagementStatus = (
  status: SavedOpportunityManagementStatus
): CareerOpportunitySavedStage | null => {
  if (status === "active") return "applied";
  if (status === "closed") return "closed";
  if (status === "hidden") return "hidden";
  if (status === "saved") return "saved";
  return null;
};

export const getSavedOpportunityManagementStatus = (
  item: CareerHistoryOpportunity
): SavedOpportunityManagementStatus => {
  const stage =
    item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);
  if (stage === "hidden") return "hidden";
  if (stage === "closed") return "closed";
  if (stage === "applied" || stage === "connected") return "active";
  return "saved";
};

export const getSavedOpportunityStatusLabel = (
  status: SavedOpportunityManagementStatus,
  tArg?: CareerTLike
) => {
  const t = tArg ?? fallbackCareerT;
  return (
    getSavedOpportunityStatusOptions(t).find((option) => option.id === status)
      ?.label ?? t("career.history.saved_opportunity_status.0obqas2", "저장됨")
  );
};
