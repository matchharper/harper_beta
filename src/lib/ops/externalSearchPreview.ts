import { z } from "zod";
import { countrySearchPlanSchema } from "@/lib/externalRecommendationsV2/searchRequest";
import type { LlmDebugCall } from "@/lib/llm/debugUsage";

// The editable query is the planner's structured search contract, never arbitrary SQL.
export const previewQuerySchema = z
  .object({
    plan: z.preprocess((value) => {
      // Older open editors contain this unused empty field. Accept that exact
      // legacy shape while keeping other unknown fields/conditions invalid.
      if (
        value &&
        typeof value === "object" &&
        "locations" in value &&
        Array.isArray(value.locations) &&
        value.locations.length === 0
      ) {
        const { locations: _legacyLocations, ...plan } = value;
        return plan;
      }
      return value;
    }, countrySearchPlanSchema),
    targetSalaryKrw: z.number().finite().positive().nullable(),
  })
  .strict();
export type PreviewQuery = z.infer<typeof previewQuerySchema>;
export const externalSearchPreviewRequest = z
  .object({
    talentId: z.string().uuid("사용자를 선택하세요."),
    action: z.enum(["prepare", "search"]).default("prepare"),
    // Accept the old editor value, but always execute the shared filter-first path.
    method: z
      .enum(["existing", "filter_first"])
      .default("filter_first")
      .transform(() => "filter_first" as const),
    candidateLimit: z.number().int().min(500).max(3000).default(3000),
    salaryWeight: z.number().finite().min(0).max(1).default(0.35),
    query: previewQuerySchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.action === "search" && !v.query)
      ctx.addIssue({
        code: "custom",
        message: "검색 query를 먼저 생성하세요.",
      });
    if (
      v.query &&
      !v.query.plan.includeRemote &&
      (v.query.plan.remoteOnly ||
        v.query.plan.countries.some((c) => c.remoteOnly))
    )
      ctx.addIssue({
        code: "custom",
        message: "원격 근무 필터가 서로 충돌합니다.",
      });
  });
export type PreviewMethod = "existing" | "filter_first";
export type PreviewTiming = {
  label: string;
  ms: number;
  status: "ok" | "error";
  scope: "request" | "database";
};
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
  score: number | null;
};
export type ExternalSearchPreviewResult = {
  action: "prepare" | "search";
  method: PreviewMethod;
  candidateLimit: number;
  salaryWeight: number;
  rows: ExternalSearchPreviewRow[];
  query: PreviewQuery | null;
  rawOutput: string | null;
  calls: LlmDebugCall[];
  modelCallsStarted: number;
  timings: PreviewTiming[];
  totalMs: number;
  sql: { label: string; text: string }[];
  counts: Record<string, number>;
  embeddingReused: boolean;
  error: string | null;
};
