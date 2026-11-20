import { randomUUID } from "node:crypto";
import { z } from "zod";
import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { rankScore, type Fit } from "@/lib/externalRecommendationsV2/contract";

export type CompanyFitRow = {
  companyWorkspaceId: string;
  name: string;
  homepage: string | null;
  openRoleCount: number | null;
  rankScore: number;
  mutualFit: number | null;
  candidateInterest: number | null;
  companyInterest: number | null;
  constraintPass: number | null;
};
export type CompanyFitDebugResponse = {
  input: { talentId: string; companyNames: string[] };
  status: string;
  runId: string | null;
  durationMs: number;
  rows: CompanyFitRow[];
  /** The exact text the Career agent receives from this tool call. */
  modelOutput: string;
};

const inputSchema = z.object({
  talentId: z.string().uuid(),
  companyNames: z.array(z.string().trim().min(1)).min(1).max(50),
});

/** Runs the Career agent's own search_opportunities tool for companies only, as that user. */
export async function runCompanyFitDebug(raw: unknown): Promise<CompanyFitDebugResponse> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new InternalApiError(400, "후보자와 회사 이름을 확인해 주세요.");
  const input = { ...parsed.data, companyNames: [...new Set(parsed.data.companyNames)] };
  const { CAREER_AGENTIC_TOOLS } = await import("@/lib/career/generalTools");
  const began = Date.now();
  const result = (await CAREER_AGENTIC_TOOLS.search_opportunities.execute!(
    { action: "search", companyNames: input.companyNames, kinds: ["companies"] },
    // A fresh tool-call id starts a new run; identical evaluation inputs still reuse cached scores.
    { admin: getSupabaseAdmin() as never, userId: input.talentId, toolCallId: `ops-company-fit:${randomUUID()}` }
  )) as Record<string, any>;
  const rows: CompanyFitRow[] = (Array.isArray(result.evaluations) ? result.evaluations : [])
    .filter((row: any) => row.company_workspace_id)
    .map((row: any) => {
      const fit = (row.assessment?.fit ?? {}) as Partial<Fit>;
      const num = (value: unknown) => (typeof value === "number" ? value : null);
      return {
        companyWorkspaceId: row.company_workspace_id,
        name: row.company?.company_name ?? row.company_workspace_id,
        homepage: row.company?.homepage_url ?? null,
        openRoleCount: num(row.company?.open_role_count),
        rankScore: typeof row.ranking_score === "number" ? row.ranking_score : rankScore(fit as Fit),
        mutualFit: num(fit.mutualFit),
        candidateInterest: num(fit.candidateInterest),
        companyInterest: num(fit.companyInterest),
        constraintPass: num(fit.constraintPass),
      };
    })
    .sort((a: CompanyFitRow, b: CompanyFitRow) => b.rankScore - a.rankScore);
  // CAREER_AGENTIC_TOOLS already projects the result into the agent's text, including name matches.
  const modelOutput = typeof result.modelOutput === "string" ? result.modelOutput : "";
  return {
    input,
    status: String(result.status ?? "unknown"),
    runId: typeof result.runId === "string" ? result.runId : null,
    durationMs: Date.now() - began,
    rows,
    modelOutput: modelOutput || JSON.stringify(result, null, 2),
  };
}
