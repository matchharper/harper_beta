import type { CareerHistoryOpportunity } from "@/components/career/types";

export const COMPANY_JOBS_PAGE_SIZE = 20;
// Same release threshold as the external recommendation worker.
export const EXTERNAL_JOB_FIT_SCORE = 50;

export type CareerCompanyJob = {
  opportunity: CareerHistoryOpportunity;
  fitScore: number | null;
  isRecommended: boolean;
  /** Title closeness to roles Harper already recommended this person (0–1). */
  titleSimilarity: number | null;
};

export type CareerCompanyJobsPage = {
  items: CareerCompanyJob[];
  nextOffset: number | null;
  totalCount: number;
};
