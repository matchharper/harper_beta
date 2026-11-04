import { getCareerDefaultSavedStageForOpportunity } from "../opportunityTypeMeta";
import type {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStage,
} from "../types";

export type SavedOpportunityManagementStatus =
  | "all"
  | "saved"
  | "applied"
  | "connected"
  | "offer"
  | "closed"
  | "hidden";

export type CareerOpportunityManagementStatus =
  | Exclude<SavedOpportunityManagementStatus, "all">
  | "archived";

type CareerTLike = (key: string, koSource: string) => string;

const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

export const getMyOpportunityTab = (
  status: SavedOpportunityManagementStatus
) => {
  if (status === "applied" || status === "connected" || status === "offer")
    return "applied";
  if (status === "closed" || status === "hidden") return "hidden";
  return "saved";
};

export const getMyOpportunityTabs = (t: CareerTLike) => [
  {
    id: "applied" as const,
    label: t("career.common.career_history_panel.0y27adb", "진행중"),
  },
  {
    id: "saved" as const,
    label: t(
      "career.common.career_history_panel.saved_positions_tab",
      "저장함"
    ),
  },
  {
    id: "hidden" as const,
    label: t("career.common.career_history_panel.hidden_tab", "종료/보관"),
  },
];

type SavedOpportunityStatusOptionsConfig = {
  hiddenLabel?: string;
  includeAll?: boolean;
  includeHidden?: boolean;
};

const getSavedOpportunityPipelineStatusOptions = (t: CareerTLike) =>
  [
    {
      id: "saved",
      label: t(
        "career.history.saved_opportunity_status.not_applied",
        "지원하지 않음"
      ),
    },
    {
      id: "applied",
      label: t("career.history.saved_opportunity_status.applied", "지원함"),
    },
    {
      id: "connected",
      label: t("career.history.saved_opportunity_status.connected", "진행중"),
    },
    {
      id: "offer",
      label: t("career.history.saved_opportunity_status.offer", "최종 합격"),
    },
    {
      id: "closed",
      label: t("career.history.saved_opportunity_status.ended", "종료/보관"),
    },
  ] as const satisfies readonly {
    id: Exclude<SavedOpportunityManagementStatus, "all" | "hidden">;
    label: string;
  }[];

export const getSavedOpportunityStatusOptions = (
  t: CareerTLike,
  config: SavedOpportunityStatusOptionsConfig = {}
) =>
  [
    ...(config.includeAll
      ? [
          {
            id: "all" as const,
            label: t("career.history.saved_opportunity_status.all", "전체보기"),
          },
        ]
      : []),
    ...getSavedOpportunityPipelineStatusOptions(t),
    ...(config.includeHidden
      ? [
          {
            id: "hidden" as const,
            label:
              config.hiddenLabel ??
              t("career.history.saved_opportunity_status.0exoa8f", "보관함"),
          },
        ]
      : []),
  ] as const satisfies readonly {
    id: SavedOpportunityManagementStatus;
    label: string;
  }[];

export const SAVED_OPPORTUNITY_STATUS_OPTIONS =
  getSavedOpportunityStatusOptions(fallbackCareerT, {
    includeAll: true,
    includeHidden: true,
  });

const isCareerOpportunitySavedStage = (
  value: unknown
): value is Exclude<SavedOpportunityManagementStatus, "all"> =>
  value === "saved" ||
  value === "applied" ||
  value === "connected" ||
  value === "offer" ||
  value === "closed" ||
  value === "hidden";

export const isSavedOpportunityManagementStatus = (
  value: unknown
): value is SavedOpportunityManagementStatus =>
  value === "all" || isCareerOpportunitySavedStage(value);

export const getSavedOpportunityStatusFromQuery = (
  value: string | string[] | undefined
): SavedOpportunityManagementStatus => {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (normalized === "all") return "all";
  if (isCareerOpportunitySavedStage(normalized)) return normalized;
  return "all";
};

export const getSavedOpportunityStatusQueryValue = (
  status: SavedOpportunityManagementStatus
) => status;

export const getSavedStageForManagementStatus = (
  status: SavedOpportunityManagementStatus
): CareerOpportunitySavedStage | null => {
  if (status === "all") return null;
  return status;
};

export const getSavedOpportunityManagementStatus = (
  item: CareerHistoryOpportunity
): Exclude<SavedOpportunityManagementStatus, "all"> => {
  const stage =
    item.savedStage ?? getCareerDefaultSavedStageForOpportunity(item);
  if (isCareerOpportunitySavedStage(stage)) return stage;
  return "saved";
};

export const getCareerOpportunityManagementStatus = (
  item: CareerHistoryOpportunity
): CareerOpportunityManagementStatus => {
  if (item.feedback === "negative") return "archived";
  return getSavedOpportunityManagementStatus(item);
};

export const canChangeCareerOpportunityManagementStatus = (
  item: Pick<CareerHistoryOpportunity, "isInternal" | "sourceType" | "feedback">
) =>
  (!item.isInternal && item.sourceType !== "internal") ||
  item.feedback === "positive";

export const getSavedOpportunityStatusLabel = (
  status: SavedOpportunityManagementStatus,
  tArg?: CareerTLike
) => {
  const t = tArg ?? fallbackCareerT;
  return (
    getSavedOpportunityStatusOptions(t, {
      includeAll: true,
      includeHidden: true,
    }).find((option) => option.id === status)?.label ??
    t("career.history.saved_opportunity_status.not_applied", "지원하지 않음")
  );
};

export const getCareerOpportunityManagementStatusOptions = (
  t: CareerTLike,
  _config: { hiddenLabel?: string; includeArchived?: boolean } = {}
) => getSavedOpportunityPipelineStatusOptions(t);

export const getCareerOpportunityManagementStatusLabel = (
  status: CareerOpportunityManagementStatus,
  tArg?: CareerTLike
) => {
  const t = tArg ?? fallbackCareerT;
  if (status === "archived") {
    return t("career.history.saved_opportunity_status.archived", "숨긴 포지션");
  }
  if (status === "hidden")
    return t("career.history.saved_opportunity_status.ended", "종료/보관");
  return getSavedOpportunityStatusLabel(status, t);
};
