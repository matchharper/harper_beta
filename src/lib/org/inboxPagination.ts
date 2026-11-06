import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "./candidateBoardSort";
import type { OrgBoardItem, OrgBoardResponse } from "./server";
import type { OrgCandidateDetailResult } from "./candidatePreview";

export const ORG_INBOX_PAGE_SIZE = 10;
export type OrgInboxStage = "pending_connection" | "company_intro" | "saved";
/** The two lists a company decides on; saved is a bookmark, not a decision. */
export type OrgDecisionStage = Exclude<OrgInboxStage, "saved">;
export type OrgInboxCounts = Record<OrgInboxStage, number> & {
  /** Harper가 확인 중: a number only, never the people behind it. */
  reviewing: number;
};
export type OrgInboxPage = OrgBoardResponse & {
  counts: OrgInboxCounts;
  /** Workspace counts only: the same rule per Role (Home). */
  countsByRoleId?: Record<string, OrgInboxCounts>;
  nextOffset: number | null;
  details?: Record<string, OrgCandidateDetailResult>;
};

/**
 * Whether the decision numbers (waiting, to request) count saved candidates.
 * Decided (Shaun, 11/6): they do not, like the inbox tab. This one value
 * drives Home, the overview, the inbox badges, the To-do, Slack, email and
 * the chat index together.
 */
export const ORG_DECISION_COUNTS_INCLUDE_SAVED = false;

/** The one counting rule: is this item one of N on that decision list? */
export function countsTowardDecision(
  item: Pick<OrgBoardItem, "savedAt" | "stage">,
  stage: OrgDecisionStage,
  includeSaved = ORG_DECISION_COUNTS_INCLUDE_SAVED
) {
  return item.stage === stage && (includeSaved || !item.savedAt);
}

export function getOrgInboxCounts(
  items: OrgBoardResponse["items"],
  reviewing = 0
): OrgInboxCounts {
  const counts = {
    pending_connection: 0,
    company_intro: 0,
    saved: 0,
    reviewing,
  };
  for (const item of items) {
    if (item.savedAt) counts.saved += 1;
    if (countsTowardDecision(item, "pending_connection"))
      counts.pending_connection += 1;
    if (countsTowardDecision(item, "company_intro")) counts.company_intro += 1;
  }
  return counts;
}

/** The same rule per Role; Roles with no candidates are left out. */
export function getOrgInboxCountsByRole(
  items: OrgBoardResponse["items"],
  reviewingByRoleId: Readonly<Record<string, number>> = {}
): Record<string, OrgInboxCounts> {
  const byRole = new Map<string, OrgBoardItem[]>();
  for (const item of items)
    byRole.set(item.roleId, [...(byRole.get(item.roleId) ?? []), item]);
  for (const roleId of Object.keys(reviewingByRoleId))
    if (!byRole.has(roleId)) byRole.set(roleId, []);
  return Object.fromEntries(
    [...byRole].map(([roleId, roleItems]) => [
      roleId,
      getOrgInboxCounts(roleItems, reviewingByRoleId[roleId] ?? 0),
    ])
  );
}

/**
 * Home's list: per Role, a waiting group and a to-request group, each with N
 * by the same rule. A to-request group opens its ten best-ranked first.
 */
export function buildOrgHomeInboxGroups<R extends { roleId: string }>(
  roles: readonly R[],
  boardItems: readonly OrgBoardItem[]
) {
  return roles.flatMap((role) => {
    const items = boardItems.filter((item) => item.roleId === role.roleId);
    return (["pending_connection", "company_intro"] as const).flatMap(
      (stage) => {
        const all = items.filter((item) => item.stage === stage);
        const remaining = all
          .filter((item) => countsTowardDecision(item, stage))
          .sort((a, b) =>
            compareOrgCandidates(
              a,
              b,
              stage === "company_intro" ? "recommended" : "latest"
            )
          );
        return remaining.length
          ? [
              {
                id: `${role.roleId}:${stage}`,
                role,
                stage,
                total: all.length,
                remaining: remaining.length,
                items:
                  stage === "company_intro" ? remaining.slice(0, 10) : remaining,
              },
            ]
          : [];
      }
    );
  });
}

/** Filter and sort the authorized board before selecting a page, never after it. */
export function paginateOrgInbox(
  board: OrgBoardResponse,
  stage: OrgInboxStage,
  sort: OrgCandidateSort,
  offset: number
): OrgInboxPage {
  const items = board.items
    .filter((item) =>
      stage === "saved"
        ? Boolean(item.savedAt)
        : !item.savedAt && item.stage === stage
    )
    .sort((a, b) => compareOrgCandidates(a, b, sort));
  const nextOffset = offset + ORG_INBOX_PAGE_SIZE;
  return {
    ...board,
    counts: getOrgInboxCounts(
      board.items,
      board.roleId ? (board.reviewingCountByRoleId?.[board.roleId] ?? 0) : 0
    ),
    items: items.slice(offset, nextOffset),
    totalCount: items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
  };
}
