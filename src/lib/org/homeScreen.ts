/**
 * Home: which pane a Home address opens and the address each one writes. The
 * pill is 소식 | 역할 and the plain Home address is 소식, with 할 일 beside it
 * (below 1024px 할 일 opens from the header). Home has no chat and no
 * candidate lists: each role keeps its own chat and lists. Links sent before
 * keep a place: ?tab=feed opens 소식; ?tab=todo and the former ?tab=chat open
 * 할 일; the former 후보 (?tab=candidates, ?queue=…, ?inboxStage=…, and
 * /org/inbox, redirected here) opens 역할 for that role, whose card links to
 * its lists.
 *
 * `roleId` is the one role filter for 소식 (and its 할 일) and 역할; it stays
 * while the pill changes. Older 소식 links named it `feedRole`.
 */

import { buildOrgHref } from "@/lib/org/routes";

type QueryValue = string | string[] | undefined;

/** feed · roles: the pill. todo: 소식's 할 일, from the header below 1024px. */
export type OrgHomePane = "feed" | "roles" | "todo";
export type OrgHomePill = Extract<OrgHomePane, "feed" | "roles">;

export type OrgHomeLocation = {
  pane: OrgHomePane;
  /** The role 소식, 할 일 and 역할 are narrowed to; null for every role. */
  roleId: string | null;
};

function text(value: QueryValue) {
  return typeof value === "string" ? value.trim() : "";
}

export function orgHomeLocation(query: Record<string, QueryValue>): OrgHomeLocation {
  const tab = text(query.tab);
  const [queueRoleId = ""] = text(query.queue).split(":");
  // The former 후보 lists live on each role now; 역할 shows that role's numbers.
  const formerCandidates = tab === "candidates" || Boolean(queueRoleId) || Boolean(text(query.inboxStage));
  // ?tab=chat showed 할 일 beside the chat; Home has no chat now, so it opens 할 일.
  const pane: OrgHomePane =
    tab === "chat" || tab === "todo"
      ? "todo"
      : tab === "roles" || formerCandidates
        ? "roles"
        : "feed";
  return {
    pane,
    roleId: text(query.roleId) || text(query.feedRole) || queueRoleId || null,
  };
}

/** What a former link no longer needs once another pane opens. */
const RESET = { inboxStage: undefined, queue: undefined, feedRole: undefined, feedList: undefined };

/**
 * The query a pane writes. The role filter is kept (written as `roleId`), so
 * 소식 and 역할 show the same role.
 */
export function orgHomePaneQuery(
  pane: OrgHomePane,
  roleId: string | null = null
): Record<string, string | undefined> {
  // 소식 is the plain Home address.
  return { ...RESET, tab: pane === "feed" ? undefined : pane, roleId: roleId ?? undefined };
}

/** Home's 역할 (every role with its numbers), where the 역할 page used to be. */
export function orgHomeRolesHref(orgId: string | null | undefined) {
  const base = buildOrgHref({ orgId, page: "home" });
  return `${base}${base.includes("?") ? "&" : "?"}tab=roles`;
}
