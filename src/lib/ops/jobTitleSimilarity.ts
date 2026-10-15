import { z } from "zod";

export const jobTitleSimilarityRequestSchema = z
  .object({
    text: z.string().trim().min(1, "검색 텍스트를 입력하세요.").max(8000),
  })
  .strict();

export type JobTitleSimilarityRow = {
  role_id: string;
  role_name: string;
  company_name: string | null;
  similarity: number;
};
