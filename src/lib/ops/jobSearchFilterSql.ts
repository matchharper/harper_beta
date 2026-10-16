import { buildFilterFirstRoleSql } from "../externalRecommendationsV2/filterFirstSql";
import type { PreviewQuery } from "./externalSearchPreview";

export function buildJobSearchFilterSql(args: {
  query: PreviewQuery;
  vector: number[];
  userId: string;
  blockedCompanies: string[];
  candidateLimit: number;
  salaryWeight: number;
}) {
  return buildFilterFirstRoleSql({
    ...args,
    ...args.query,
    listOnly: true,
    diagnostics: true,
  });
}
