import { runCareerJobPostingRecommendations } from "../talentOnboarding/jobPostingRecommendations";
import {
  fetchActiveInitialConversationRun,
  buildInitialRecommendationPendingResult,
} from "../talentOnboarding/initialRecommendationGuard";
import { withLlmUsageContext, getLlmUsageContext } from "../llm/usageContext";
import { resolveWebExternalVariant } from "./devVariant.server";
import { runExternalV2, type SelectedRole } from "./engine";
import {
  completeRun,
  createRun,
  updateRun,
  externalRunContext,
  failRun,
} from "./runs";
import type { TalentAdminClient } from "../talentOnboarding/admin";

export function selectedRows(selected: SelectedRole[]) {
  return selected.map((s, i) => ({
    role_id: s.card.roleId,
    rank: i + 1,
    score: s.score / 100,
    fit_summary: s.fitSummary,
    fit_reasons: [],
    tradeoffs: [s.recommendationNote],
    evidence: {
      externalVersion: "v2",
      recommendationNote: s.recommendationNote,
    },
  }));
}
export async function saveSelected(
  admin: TalentAdminClient,
  runId: string,
  selected: SelectedRole[]
) {
  const saved = await completeRun(admin, runId, selectedRows(selected));
  const ids = new Set(saved.map((r) => r.role_id));
  return selected.filter((s) => ids.has(s.card.roleId));
}
export async function runExperimentJobRecommendations(
  args: Parameters<typeof runCareerJobPostingRecommendations>[0]
) {
  if (
    args.evaluation ||
    process.env.EXTERNAL_RECOMMENDATION_EXPERIMENT === "off"
  )
    return runCareerJobPostingRecommendations(args);
  if (
    await fetchActiveInitialConversationRun({
      admin: args.admin,
      userId: args.userId,
    })
  )
    return buildInitialRecommendationPendingResult({
      locale: args.preferredLocale,
    });
  const variant = await resolveWebExternalVariant(args.admin, args.userId);
  const run = await createRun(args.admin, args.userId, "web", { variant });
  const began = Date.now();
  return withLlmUsageContext(
    { ...getLlmUsageContext(), requestId: run.id, userId: args.userId },
    () =>
      externalRunContext.run({ id: run.id }, async () => {
        try {
          if (variant === "control") {
            const result = await runCareerJobPostingRecommendations(args);
            await updateRun(args.admin, run.id, {
              status: "completed",
              finished_at: new Date().toISOString(),
              role_ids: result.postingRoleIds,
              metrics: {
                durationMs: Date.now() - began,
                recommendationCount: result.recommendationCount,
              },
              plan: result.searchPlan,
            });
            return result;
          }
          const language = args.preferredLocale?.startsWith("en") ? "en" : "ko";
          const result = await runExternalV2({
            admin: args.admin,
            userId: args.userId,
            request: args.request,
            surface: "web",
            language,
            signal: args.abortSignal,
            onProgress: (phase, counts) =>
              args.onProgress?.({ state: "running", phase, ...counts }),
          });
          args.abortSignal?.throwIfAborted();
          const selected = await saveSelected(
            args.admin,
            run.id,
            result.selected
          );
          await updateRun(args.admin, run.id, {
            provider: result.provider,
            metrics: result.metrics,
            plan: result.plan
              ? { ...result.plan, titleVectors: undefined }
              : null,
          });
          const cards = selected.map((s) => s.card);
          args.onProgress?.({
            state: "running",
            phase: "delivery",
            recommendationCount: selected.length,
          });
          return {
            answerDraft: JSON.stringify({
              recommendations: selected.map((s) => ({
                roleId: s.card.roleId,
                companyName: s.card.companyName,
                roleTitle: s.card.roleName,
                recommendationNote: s.recommendationNote,
              })),
              instruction:
                "Use the recommendation notes as grounded user-facing guidance. Do not label them as downsides or reconstruct separate reasons/preferences.",
            }),
            candidateCount: Number(result.metrics.candidateCount ?? 0),
            postingRoleIds: cards.map((c) => c.roleId),
            recommendationCount: cards.length,
            searchPlan: result.plan?.plan ?? { sourceType: "external" },
          };
        } catch (error) {
          await failRun(args.admin, run.id, error);
          throw error;
        }
      })
  );
}
