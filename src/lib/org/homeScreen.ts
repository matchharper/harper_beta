/**
 * Home in the candidate side's frame: which right column a Home address opens
 * and the address each one writes. Links sent before the frame keep their
 * place: no tab (today's inbox) and ?queue=… open 후보, ?tab=feed opens 소식,
 * and /org/inbox?inboxStage=… (redirected here) keeps its list.
 */

type QueryValue = string | string[] | undefined;

/** chat: the To-do cards. todo: the same cards as their own pane, one column only. */
export type OrgHomePane = "chat" | "candidates" | "todo";
export type OrgHomeCandidateTab = "pending_connection" | "company_intro" | "feed";

export type OrgHomeLocation = {
  pane: OrgHomePane;
  tab: OrgHomeCandidateTab;
  /** The role whose group a ?queue= or ?roleId= link points at. */
  focusRoleId: string | null;
  /** 소식 for one role. */
  feedRoleId: string | null;
};

function text(value: QueryValue) {
  return typeof value === "string" ? value.trim() : "";
}

export function orgHomeLocation(query: Record<string, QueryValue>): OrgHomeLocation {
  const tab = text(query.tab);
  const [queueRoleId = "", queueStage = ""] = text(query.queue).split(":");
  const stage: OrgHomeCandidateTab =
    queueStage === "company_intro" || text(query.inboxStage) === "company_intro"
      ? "company_intro"
      : "pending_connection";
  const focusRoleId = queueRoleId || text(query.roleId) || null;
  if (tab === "feed") {
    return { pane: "candidates", tab: "feed", focusRoleId: null, feedRoleId: text(query.feedRole) || null };
  }
  if (tab === "chat" || tab === "todo") {
    return { pane: tab, tab: stage, focusRoleId: null, feedRoleId: null };
  }
  return { pane: "candidates", tab: stage, focusRoleId, feedRoleId: null };
}

/** The query a pane writes; 후보 opens the list given. */
export function orgHomePaneQuery(
  pane: OrgHomePane,
  tab: OrgHomeCandidateTab = "pending_connection"
): Record<string, string | undefined> {
  if (pane === "candidates") return orgHomeCandidateTabQuery(tab);
  return { tab: pane, inboxStage: undefined, queue: undefined, roleId: undefined, feedRole: undefined };
}

/** The query a 후보 list writes. 연결을 기다리는 후보 is the plain Home address. */
export function orgHomeCandidateTabQuery(
  tab: OrgHomeCandidateTab,
  feedRoleId?: string | null
): Record<string, string | undefined> {
  const reset = { inboxStage: undefined, queue: undefined, roleId: undefined, feedRole: undefined };
  if (tab === "feed") return { ...reset, tab: "feed", feedRole: feedRoleId ?? undefined };
  if (tab === "company_intro") return { ...reset, tab: "candidates", inboxStage: "company_intro" };
  return { ...reset, tab: undefined };
}
