import { z } from "zod";

export const JOB_TITLE_SIMILARITY_DEFAULT_LIMIT = 20;
export const JOB_TITLE_SIMILARITY_MAX_LIMIT = 1000;
export const JOB_TITLE_SIMILARITY_DEFAULT_CANDIDATE_LIMIT = 1000;
export const jobTitleSimilarityCandidateLimitSchema = z
  .number()
  .int()
  .min(1)
  .safe()
  .default(JOB_TITLE_SIMILARITY_DEFAULT_CANDIDATE_LIMIT);
export const jobTitleSimilarityLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(JOB_TITLE_SIMILARITY_MAX_LIMIT)
  .default(JOB_TITLE_SIMILARITY_DEFAULT_LIMIT);

export const jobTitleSimilaritySourceSchema = z
  .literal("company_roles")
  .default("company_roles");
export type JobTitleSimilaritySource = z.infer<
  typeof jobTitleSimilaritySourceSchema
>;

export const jobTitleSimilarityRequestSchema = z
  .object({
    source: jobTitleSimilaritySourceSchema,
    text: z.string().trim().min(1, "검색 텍스트를 입력하세요.").max(8000),
    limit: jobTitleSimilarityLimitSchema,
    candidateLimit: jobTitleSimilarityCandidateLimitSchema,
    rerank: z.boolean().default(true),
  })
  .strict();

export type JobTitleSimilarityRow = {
  role_id: string;
  role_name: string;
  company_name: string | null;
  similarity: number;
};

export type JobTitleSimilarityResult = {
  rerank: boolean;
  rows: JobTitleSimilarityRow[];
  timings: {
    candidateSearchMs: number;
    rerankAndFetchMs: number;
  };
};
