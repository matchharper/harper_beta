/**
 * Home: which pane a Home address opens and the address each one writes. The
 * pill is 소식 | 후보 | 역할 and the plain Home address is 소식; 할 일 opens
 * from the header. Home has no chat (the roles keep theirs). Links sent before
 * keep their place: ?queue=…, ?inboxStage=… and /org/inbox (redirected here
 * with tab=candidates) open 후보, ?tab=feed opens 소식, and ?tab=todo and the
 * former ?tab=chat open 할 일.
 *
 * `roleId` is the one role filter for 소식, 후보 and 역할; it stays while the
 * pill changes. Older 소식 links named it `feedRole`.
 */

import { buildOrgHref } from "@/lib/org/routes";

type QueryValue = string | string[] | undefined;

/** feed · candidates · roles: the pill. todo: 할 일, from the header. */
export type OrgHomePane = "feed" | "candidates" | "roles" | "todo";
export type OrgHomePill = Extract<OrgHomePane, "feed" | "candidates" | "roles">;
export type OrgHomeCandidateTab = "pending_connection" | "company_intro";

export type OrgHomeLocation = {
  pane: OrgHomePane;
  tab: OrgHomeCandidateTab;
  /** The role whose group a ?queue= link points at (not a filter). */
  focusRoleId: string | null;
  /** The role 소식, 후보 and 역할 are narrowed to; null for every role. */
  roleId: string | null;
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
  const roleId = text(query.roleId) || text(query.feedRole) || null;
  // ?tab=chat showed 할 일 beside the chat; Home has no chat now, so it opens 할 일.
  const pane: OrgHomePane =
    tab === "chat" || tab === "todo"
      ? "todo"
      : tab === "roles"
        ? "roles"
        : tab === "candidates" || queueRoleId || text(query.inboxStage)
          ? "candidates"
          : "feed";
  return {
    pane,
    tab: stage,
    focusRoleId: pane === "candidates" ? queueRoleId || null : null,
    roleId,
  };
}

/** What a list or a link no longer needs once another pane or list opens. */
const RESET = { inboxStage: undefined, queue: undefined, feedRole: undefined, feedList: undefined };

/**
 * The query a pane writes; 후보 opens the list given. The role filter is kept
 * (written as `roleId`), so 소식 · 후보 · 역할 show the same role.
 */
export function orgHomePaneQuery(
  pane: OrgHomePane,
  tab: OrgHomeCandidateTab = "pending_connection",
  roleId: string | null = null
): Record<string, string | undefined> {
  if (pane === "candidates") return orgHomeCandidateTabQuery(tab, roleId);
  // 소식 is the plain Home address.
  return { ...RESET, tab: pane === "feed" ? undefined : pane, roleId: roleId ?? undefined };
}

/** The query a 후보 list writes. */
export function orgHomeCandidateTabQuery(
  tab: OrgHomeCandidateTab,
  roleId: string | null = null
): Record<string, string | undefined> {
  const keep = { ...RESET, roleId: roleId ?? undefined };
  if (tab === "company_intro") return { ...keep, tab: "candidates", inboxStage: "company_intro" };
  return { ...keep, tab: "candidates" };
}

/** Home's 역할 (every role with its numbers), where the 역할 page used to be. */
export function orgHomeRolesHref(orgId: string | null | undefined) {
  const base = buildOrgHref({ orgId, page: "home" });
  return `${base}${base.includes("?") ? "&" : "?"}tab=roles`;
}
