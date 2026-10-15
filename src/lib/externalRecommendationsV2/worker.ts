import { randomUUID } from "node:crypto";
import type { TalentAdminClient } from "../talentOnboarding/admin";
import { withLlmUsageContext } from "../llm/usageContext";
import { externalVariant } from "./contract";
import { runExternalV2, type EngineArgs, type SelectedRole } from "./engine";
import { createRun, updateRun, failRun } from "./runs";

export function workerCard(s: SelectedRole, rank: number) {
  const c = s.card;
  return {
    roleId: c.roleId,
    sourceType: "external",
    companyWorkspaceId: c.companyWorkspaceId,
    companyName: c.companyName,
    roleName: c.roleName,
    roleDescription: c.roleDescription,
    externalJdUrl: c.row.external_jd_url,
    location: c.location,
    workMode: c.workMode,
    employmentType: c.employmentType,
    postedAt: c.postedAt,
    salaryRange: c.salaryRange,
    seniorityLevel: c.seniorityLevel,
    company: c.company,
    companyData: c.companyData,
    roleSummary: c.roleSummary,
    externalVersion: "v2",
    externalFit: {
      rank,
      score: s.score,
      modelScore: s.score,
      fitSummary: s.fitSummary,
      fitReasons: [],
      tradeoff: s.recommendationNote,
      preferenceFit: {},
    },
  };
}
export async function runWorkerExternalSearch(
  args: EngineArgs & { discoveryRunId?: string; experimentRunId?: string }
) {
  if (
    process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT === "off" ||
    externalVariant(args.userId) !== "v2"
  )
    throw new Error("Candidate is not assigned to external V2");
  let run: { id: string } | null = null;
  if (!args.dryRun) {
    if (args.experimentRunId) {
      const { data, error } = await (
        args.admin.from("external_recommendation_runs" as never) as any
      )
        .select("id")
        .eq("id", args.experimentRunId)
        .eq("talent_id", args.userId)
        .eq("surface", args.surface)
        .eq("variant", "v2")
        .eq("status", "running")
        .single();
      if (error || !data)
        throw new Error("Invalid worker experiment execution");
      run = data;
    } else
      run = await createRun(
        args.admin,
        args.userId,
        args.surface === "web" ? "web" : "worker",
        {
          discovery_run_id: args.discoveryRunId ?? null,
        }
      );
  }
  try {
    const result = await withLlmUsageContext(
      { requestId: run?.id ?? randomUUID(), userId: args.userId },
      () => runExternalV2(args)
    );
    if (run)
      await updateRun(args.admin, run.id, {
        status: "selected",
        provider: result.provider,
        metrics: result.metrics,
        plan: result.plan ? { ...result.plan, titleVectors: undefined } : null,
        role_ids: result.selected.map((s) => s.card.roleId),
      });
    return {
      runId: run?.id ?? null,
      searchPlan: result.plan?.plan ?? null,
      cards: result.selected.map((s, i) => workerCard(s, i + 1)),
      metrics: result.metrics,
    };
  } catch (error) {
    if (run) await failRun(args.admin, run.id, error);
    throw error;
  }
}
