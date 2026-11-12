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

export type CareerMatchingResultsPage = {
  matching?: { id: string; title: string };
  opportunities: Array<{
    id: string;
    roleId: string;
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
