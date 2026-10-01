import type { CareerHistoryOpportunity } from "@/components/career/types";
import type { CareerPendingAction } from "./pendingActions";

export type CareerPendingMeetingSchedule = {
  companyName: string;
  invitationPath: string;
  roleId: string;
  roleTitle: string;
  scheduleId: string;
};

export type CareerWaitingConnection = {
  companyLogoUrl: string | null;
  companyName: string;
  id: string;
  roleId: string;
  roleTitle: string;
  stage: "preparing" | "awaiting_company";
};

export type CareerPendingActionsSnapshot = {
  actions: CareerPendingAction[];
  meetingSchedules: CareerPendingMeetingSchedule[];
  unavailableCategories: string[];
};

export type CareerTaskProgressSnapshot = {
  connections: CareerWaitingConnection[];
  searchStatus: string | null;
};

export type CareerRecentInfoItem = {
  id: string;
  kind: "company_deliver" | "process_ended" | "role_ended";
  occurredAt: string;
  roleId: string;
  companyName: string;
  roleName: string;
  body: string | null;
};

export type CareerRecentInfoCursor = { at: string; id: string };

export type CareerRecentInfoPage = {
  items: CareerRecentInfoItem[];
  nextCursor: CareerRecentInfoCursor | null;
};

export type CareerExternalFeedbackOpportunity = {
  id: string;
  roleId: string;
  companyName: string;
  companyLogoUrl: string | null;
  recommendedAt: string;
};

export type CareerTasksSnapshot = CareerPendingActionsSnapshot &
  CareerTaskProgressSnapshot & {
    externalFeedback?: CareerExternalFeedbackOpportunity[];
    gmailConnected?: boolean;
  };

export type CareerExternalFeedbackSnapshot = {
  externalFeedback: CareerExternalFeedbackOpportunity[];
};

export const isCareerDecisionAction = (action: CareerPendingAction) =>
  action.kind === "company_request" || action.kind === "internal_opportunity";

export function getCareerTaskSectionOrder(hasDecisions: boolean) {
  return hasDecisions
    ? (["decisions", "suggestions", "working"] as const)
    : (["working", "suggestions"] as const);
}

type WaitingConnectionFacts = Pick<
  CareerHistoryOpportunity,
  | "companyLogoUrl"
  | "companyName"
  | "companyRequestIntroProgress"
  | "feedback"
  | "id"
  | "internalProgress"
  | "isExpired"
  | "roleId"
  | "savedStage"
  | "sourceType"
  | "status"
  | "title"
>;

// Use durable lifecycle facts. Older display codes infer sharing or closure
// from elapsed time and cannot establish whether a company has responded.
export function getCareerWaitingConnection(
  item: WaitingConnectionFacts
): CareerWaitingConnection | null {
  if (
    item.sourceType !== "internal" ||
    item.feedback !== "positive" ||
    item.savedStage === "closed" ||
    item.savedStage === "hidden" ||
    item.status === "ended" ||
    item.status === "deleted"
  ) {
    return null;
  }

  let stage: CareerWaitingConnection["stage"];
  if (item.companyRequestIntroProgress) {
    // A company-requested intro already has company consent. Only the
    // unfinished introduction belongs here; connected intros have moved on.
    if (item.companyRequestIntroProgress.status !== "connecting") return null;
    stage = "preparing";
  } else {
    const progressStage = item.internalProgress?.stage ?? "accepted";
    if (progressStage === "pending_connection") {
      stage = "awaiting_company";
    } else if (progressStage === "accepted" || progressStage === "hold") {
      stage = "preparing";
    } else {
      return null;
    }
  }

  return {
    companyLogoUrl: item.companyLogoUrl,
    companyName: item.companyName,
    id: item.id,
    roleId: item.roleId,
    roleTitle: item.title,
    stage,
  };
}
