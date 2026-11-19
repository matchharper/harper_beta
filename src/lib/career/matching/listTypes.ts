import type { CareerHistoryOpportunity } from "@/components/career/types";

export type CareerMatchingSummary = {
  id: string;
  title: string;
  description: string | null;
};

export type CareerMatchingListPage = {
  matchings: CareerMatchingSummary[];
  nextCursor: string | null;
};

/** Harper's notes linked to one matching, for development inspection. */
export type CareerMatchingNote = {
  notes: Array<{
    id: string;
    kind: string;
    title: string;
    content: string;
    revision: number;
    created_at: string;
    updated_at: string;
  }>;
};

export type CareerMatchingResultsPage = {
  matching?: { id: string; title: string };
  opportunities: Array<{
    id: string;
    /** Role ID, or the company_workspace_id when targetKind is company. */
    roleId: string;
    targetKind?: "role" | "company";
    isRecommended: boolean;
    opportunity: CareerHistoryOpportunity | null;
    title: string | null;
    companyName: string | null;
    companyLogoUrl: string | null;
    location: string | null;
    postedAt: string | null;
    score: number | null;
    externalRankingScore?: number | null;
  }>;
  count: number;
  nextCursor: string | null;
};
