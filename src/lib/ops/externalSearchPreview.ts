import { z } from "zod";

export const externalSearchPreviewRequest = z
  .object({
    talentId: z.string().uuid("사용자를 선택하세요."),
  })
  .strict();

export type ExternalSearchPreviewRow = {
  roleId: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  salaryMinKrw: number | null;
  salaryMaxKrw: number | null;
  salaryText: string | null;
  salaryIsPredicted: boolean;
};

export type ExternalSearchPreviewResult = {
  rows: ExternalSearchPreviewRow[];
};
