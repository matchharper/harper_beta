import { buildOrgHref, type OrgRoleLocation } from "@/lib/org/routes";

/**
 * A registered role screen has the candidate side's frame: the role's Harper
 * chat on the left, a 채팅 | 후보 pill, and a right column that shows the
 * To-do (채팅), the candidate lists (후보), or 역할 정보 / 설정.
 */
export type OrgRolePane = "chat" | "candidates" | "role" | "settings";

/**
 * The lists under 후보, left to right: the two decision lists, 외부 후보 (only
 * where external sourcing is on), 저장, 파이프라인. 진행 종료 is the last stage
 * of 파이프라인, not a list of its own.
 */
export type OrgRoleCandidateTab =
  | "pending_connection"
  | "company_intro"
  | "external"
  | "saved"
  | "pipeline";

/** What the right column shows for a resolved role address. */
export function orgRolePane(location: Pick<OrgRoleLocation, "tab">): OrgRolePane {
  if (location.tab === "chat") return "chat";
  if (location.tab === "role" || location.tab === "settings") return location.tab;
  // inbox and pipeline; `start` never resolves for a registered role.
  return "candidates";
}

/**
 * Which list under 후보 a role address opens. A former 진행 종료 link
 * (`tab=pipeline&pipelineStage=closed`) opens 파이프라인, which shows 진행 종료.
 */
export function orgRoleCandidateTab(
  location: Pick<OrgRoleLocation, "tab" | "inboxStage" | "review">
): OrgRoleCandidateTab {
  if (location.tab === "pipeline") return "pipeline";
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
    case "saved":
      return { ...reset, tab: "inbox", review: "saved" };
    case "external":
      return { ...reset, tab: "inbox", inboxStage: "external" };
    default:
      return { ...reset, tab: "inbox", inboxStage: tab };
  }
}

/**
 * Where a decision's 보기 goes: 저장 for a save (no stage), 파이프라인 for every
 * move, a pass or an end included (진행 종료 is a stage there).
 */
export function orgRoleDecisionListTab(stage: string | null | undefined): OrgRoleCandidateTab {
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

/**
 * "Harper에게 묻기" from Home (which has no chat): the person's role chat,
 * which starts its input with them. Only ids go in the address; the role
 * screen reads the name from the candidate it already has.
 */
export function orgRoleAskHarperHref(args: {
  orgId: string;
  recommendationId: string;
  roleId: string;
  talentId: string;
}) {
  const base = buildOrgHref({ orgId: args.orgId, page: "role", roleId: args.roleId, tab: "chat" });
  const ask = new URLSearchParams({
    askRecommendationId: args.recommendationId,
    askTalentId: args.talentId,
  });
  return `${base}${base.includes("?") ? "&" : "?"}${ask}`;
}

/** The person an "Harper에게 묻기" address asks about, if any. */
export function orgRoleAskTarget(query: Record<string, string | string[] | undefined>) {
  const text = (value: string | string[] | undefined) =>
    typeof value === "string" ? value.trim() : "";
  const recommendationId = text(query.askRecommendationId);
  const talentId = text(query.askTalentId);
  return recommendationId && talentId ? { recommendationId, talentId } : null;
}

/** The ask keys, dropped once the screen moves on so the chat is not asked again. */
export const ORG_ROLE_ASK_KEYS = ["askRecommendationId", "askTalentId"] as const;
