import { z } from "zod";
import { previewQuerySchema, type PreviewQuery } from "./externalSearchPreview";

// Synthetic, fixed planner output: this playground never calls the query LLM.
export const JOB_SEARCH_FIXED_QUERY: PreviewQuery = {
  plan: {
    searchIntentSummary: "한국 백엔드 엔지니어",
    roleTitles: ["Backend Engineer", "백엔드 엔지니어"],
    ftsKeywords: [
      { terms: ["backend", "백엔드"], weight: 2 },
      { terms: ["Python", "TypeScript", "Java"], weight: 1 },
    ],
    countries: [{ countryCode: "KR", weight: 1, remoteOnly: false }],
    includeContract: false,
    includeParttime: false,
    includeIntern: false,
    includeRemote: true,
    remoteOnly: false,
    isPreferEntry: 0,
    postingRecency: {
      maxAgeDays: 30,
      recentDays: null,
      recentWeight: null,
      olderWeight: null,
    },
  },
  targetSalaryKrw: 80_000_000,
};

export const jobSearchFilterRequestSchema = z
  .object({
    query: previewQuerySchema,
    candidateLimit: z.number().int().min(500).max(20000).default(3000),
    salaryWeight: z.number().finite().min(0).max(1).default(0.35),
    talentId: z.string().uuid().nullable().default(null),
    blockedCompanies: z
      .array(z.string().trim().min(1).max(100))
      .max(20)
      .default([]),
  })
  .strict()
  .superRefine(({ query }, ctx) => {
    if (
      !query.plan.includeRemote &&
      (query.plan.remoteOnly || query.plan.countries.some((c) => c.remoteOnly))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "원격 근무 필터가 서로 충돌합니다.",
      });
    }
  });

export type JobSearchFilterRequest = z.infer<
  typeof jobSearchFilterRequestSchema
>;
export type JobSearchFilterRow = {
  role_id: string;
  role_name: string;
  company_name: string | null;
  external_jd_url: string | null;
  location_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_range: string | null;
  salary_is_predicted: boolean | null;
  search_rank: number;
  title_similarity: number;
  fts_score: number;
  salary_utility: number;
};
export type JobSearchFilterResult = {
  rows: JobSearchFilterRow[];
  counts: {
    candidates: number;
  };
  timings: { candidateSearchMs: number; rerankMs: number };
  request: JobSearchFilterRequest;
  sql: string;
  embeddingReused: boolean;
  embeddingMs: number;
  databaseMs: number;
  totalMs: number;
  error: string | null;
};
