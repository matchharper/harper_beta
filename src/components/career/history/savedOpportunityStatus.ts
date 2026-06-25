import { getCareerDefaultSavedStage } from "../opportunityTypeMeta";
import type {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStage,
} from "../types";

export type SavedOpportunityManagementStatus =
  | "all"
  | "saved"
  | "planned"
  | "applied"
  | "connected"
  | "closed"
  | "hidden";

export type CareerOpportunityManagementStatus =
  | Exclude<SavedOpportunityManagementStatus, "all">
  | "archived";

type CareerTLike = (key: string, koSource: string) => string;

const fallbackCareerT: CareerTLike = (_key, koSource) => koSource;

type SavedOpportunityStatusOptionsConfig = {
  hiddenLabel?: string;
  includeAll?: boolean;
  includeHidden?: boolean;
  includePlanned?: boolean;
};

const getSavedOpportunityPipelineStatusOptions = (
  t: CareerTLike,
  includePlanned = true
) =>
  [
    {
      id: "saved",
      label: t("career.history.saved_opportunity_status.0obqas2", "관심 있음"),
    },
    ...(includePlanned
      ? [
          {
            id: "planned" as const,
            label: t(
              "career.history.saved_opportunity_status.planned",
              "지원 예정"
            ),
          },
        ]
      : []),
    {
      id: "applied",
      label: t("career.history.saved_opportunity_status.applied", "지원함"),
    },
    {
      id: "connected",
      label: t("career.history.saved_opportunity_status.connected", "진행중"),
    },
    {
      id: "closed",
      label: t("career.history.saved_opportunity_status.1jv953e", "진행 종료"),
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
    ...getSavedOpportunityPipelineStatusOptions(
      t,
      config.includePlanned ?? true
    ),
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
  value === "planned" ||
  value === "applied" ||
  value === "connected" ||
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
  if (normalized === "planned") return "saved";
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
    item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);
  if (isCareerOpportunitySavedStage(stage)) return stage;
  return "saved";
};

export const getCareerOpportunityManagementStatus = (
  item: CareerHistoryOpportunity
): CareerOpportunityManagementStatus => {
  if (item.feedback === "negative") return "archived";
  return getSavedOpportunityManagementStatus(item);
};

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
    t("career.history.saved_opportunity_status.0obqas2", "관심 있음")
  );
};

export const getCareerOpportunityManagementStatusOptions = (
  t: CareerTLike,
  config: {
    hiddenLabel?: string;
    includePlanned?: boolean;
    includeArchived?: boolean;
  } = {}
) =>
  [
    ...getSavedOpportunityStatusOptions(t, {
      hiddenLabel:
        config.hiddenLabel ??
        t("career.history.saved_opportunity_status.hide_action", "보관하기"),
      includeHidden: true,
      includePlanned: config.includePlanned,
    }).filter(
      (
        option
      ): option is {
        id: Exclude<SavedOpportunityManagementStatus, "all">;
        label: string;
      } => option.id !== "all"
    ),
    ...(config.includeArchived
      ? [
          {
            id: "archived" as const,
            label: t(
              "career.history.saved_opportunity_status.archived",
              "제외한 포지션"
            ),
          },
        ]
      : []),
  ] as const satisfies readonly {
    id: CareerOpportunityManagementStatus;
    label: string;
  }[];

export const getCareerOpportunityManagementStatusLabel = (
  status: CareerOpportunityManagementStatus,
  tArg?: CareerTLike
) => {
  const t = tArg ?? fallbackCareerT;
  if (status === "archived") {
    return t(
      "career.history.saved_opportunity_status.archived",
      "제외한 포지션"
    );
  }
  return getSavedOpportunityStatusLabel(status, t);
};
