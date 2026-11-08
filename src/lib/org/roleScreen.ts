import type { OrgRoleLocation } from "@/lib/org/routes";

/**
 * A registered role screen has the candidate side's frame: the role's Harper
 * chat on the left, a 채팅 | 후보 pill, and a right column that shows the
 * To-do (채팅), the candidate lists (후보), or 역할 정보 / 설정.
 */
export type OrgRolePane = "chat" | "candidates" | "role" | "settings";

/** The lists under 후보, left to right. 외부 후보 only where external sourcing is on. */
export type OrgRoleCandidateTab =
  | "pending_connection"
  | "company_intro"
  | "saved"
  | "external"
  | "pipeline"
  | "closed";

/** `pipelineStage=closed` on a pipeline link opens 진행 종료 instead of the open stages. */
export const ORG_ROLE_CLOSED_PIPELINE_STAGE = "closed";

/** What the right column shows for a resolved role address. */
export function orgRolePane(location: Pick<OrgRoleLocation, "tab">): OrgRolePane {
  if (location.tab === "chat") return "chat";
  if (location.tab === "role" || location.tab === "settings") return location.tab;
  // inbox and pipeline; `start` never resolves for a registered role.
  return "candidates";
}

/** Which list under 후보 a role address opens. */
export function orgRoleCandidateTab(
  location: Pick<OrgRoleLocation, "tab" | "inboxStage" | "review">,
  pipelineStage?: unknown
): OrgRoleCandidateTab {
  if (location.tab === "pipeline")
    return pipelineStage === ORG_ROLE_CLOSED_PIPELINE_STAGE ? "closed" : "pipeline";
  if (location.inboxStage === "external") return "external";
  if (location.review === "saved") return "saved";
  return location.inboxStage === "company_intro" ? "company_intro" : "pending_connection";
}

/**
 * The query change that opens a list under 후보. `undefined` removes a key.
 * Every value is one the route resolver already reads, so these addresses
 * also work as links.
 */
export function orgRoleCandidateTabQuery(
  tab: OrgRoleCandidateTab
): Record<string, string | undefined> {
  const reset = {
    inboxStage: undefined,
    pipelineStage: undefined,
    review: undefined,
    section: undefined,
    view: undefined,
  };
  switch (tab) {
    case "pipeline":
      return { ...reset, tab: "pipeline" };
    case "closed":
      return { ...reset, tab: "pipeline", pipelineStage: ORG_ROLE_CLOSED_PIPELINE_STAGE };
    case "saved":
      return { ...reset, tab: "inbox", review: "saved" };
    case "external":
      return { ...reset, tab: "inbox", inboxStage: "external" };
    default:
      return { ...reset, tab: "inbox", inboxStage: tab };
  }
}

/**
 * Where a decision's 보기 goes: 진행 종료 for a pass or an end, 저장 for a
 * save (no stage), 파이프라인 for every other move.
 */
export function orgRoleDecisionListTab(stage: string | null | undefined): OrgRoleCandidateTab {
  if (stage === "process_stopped") return "closed";
  if (!stage) return "saved";
  return "pipeline";
}

/** Pipeline stages a company follows under 파이프라인; the rest are inbox, closed or internal. */
export function isOrgRoleOpenPipelineStage(stage: string, internalOpsAccess = false) {
  if (stage === "pending_connection" || stage === "company_intro") return false;
  if (stage === "process_stopped" || stage === "archived") return false;
  if (stage === "accepted") return internalOpsAccess;
  return true;
}
