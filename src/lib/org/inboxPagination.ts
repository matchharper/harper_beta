import {
  compareOrgCandidates,
  type OrgCandidateSort,
} from "./candidateBoardSort";
import type { OrgBoardResponse } from "./server";
import type { OrgCandidateDetailResult } from "./candidatePreview";

export const ORG_INBOX_PAGE_SIZE = 10;
export type OrgInboxStage = "pending_connection" | "company_intro" | "saved";
export type OrgInboxCounts = Record<OrgInboxStage, number>;
export type OrgInboxPage = OrgBoardResponse & {
  counts: OrgInboxCounts;
  nextOffset: number | null;
  details?: Record<string, OrgCandidateDetailResult>;
};

export function getOrgInboxCounts(
  items: OrgBoardResponse["items"]
): OrgInboxCounts {
  const counts = { pending_connection: 0, company_intro: 0, saved: 0 };
  for (const item of items) {
    if (item.savedAt) counts.saved += 1;
    else if (
      item.stage === "pending_connection" ||
      item.stage === "company_intro"
    ) {
      counts[item.stage] += 1;
    }
  }
  return counts;
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
    counts: getOrgInboxCounts(board.items),
    items: items.slice(offset, nextOffset),
    totalCount: items.length,
    nextOffset: nextOffset < items.length ? nextOffset : null,
  };
}
