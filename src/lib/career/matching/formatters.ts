import { getLocalizedRoleSummaryContent } from "@/lib/companyRoles/summary";
import { normalizeCareerPromptLocale } from "../promptLocale";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { FIT_RANKING_WEIGHTS, LEGACY_FIT_RANKING_WEIGHTS, scoreForLlm } from "@/lib/externalRecommendationsV2/contract";
const list = (value: any) => (Array.isArray(value) ? value : []);
const brief = (value: any) =>
  list(value)
    .map((r) => `- ${r.ref ?? ""} ${r.label ?? ""}: ${r.content ?? ""}`)
    .join("\n");
/** Deliberately compact evidence projection. Raw receipts stay available to executors. */
export function formatCareerMatchingResult(value: any, locale?: string | null): string {
  if (Array.isArray(value?.stageUpdates)) return value.stageUpdates.map((item: any) =>
    item.error ? `Recommendation ${item.recommendationId ?? item.roleId}: stage unchanged; ${item.error}` :
      `Recommendation ${item.recommendationId}; role ${item.roleId}; saved stage ${item.savedStage}; updated ${item.updatedAt}.`
  ).join("\n");
  if (value?.source === "internal") return "Read existing Harper-connected recommendations with read_recommended_opportunities and get_role_context.";
  if (value?.error && !value.runId)
    return `Matching operation failed: ${value.error}`;
  const lines: string[] = ["Matching result (times: Asia/Seoul)."];
  const runs = list(value?.runs);
  const requestedRun = runs.find((run) => run.id === value?.runId);
  if (value?.runId && !requestedRun)
    lines.push(
      `Run ${value.runId}; source ${value.source}; status ${value.status}.`
    );
  if (value?.roleIds && !(value.source === "external" && Array.isArray(requestedRun?.candidate_role_ids)))
    lines.push(
      value.source === "external" &&
        (value.evaluationCount !== undefined || value.evaluationReadError)
        ? `Search candidates: ${value.roleIds.length}.`
        : `Requested role IDs: ${value.roleIds.join(", ") || "none"}`
    );
  if (value?.profileId && !(requestedRun?.request?.profileId === value.profileId && requestedRun?.request?.profileRevision === value.profileRevision))
    lines.push(
      `Evaluation profile ${value.profileId}, revision ${value.profileRevision}.`
    );
  if (value?.matching) {
    const m = value.matching;
    lines.push(
      `Matching ${m.id}; ${m.title}; revision ${m.revision}; ${m.archived_at ? "archived" : "active"}.`,
      m.description ?? ""
    );
    if (m.criteria) {
      lines.push(
        "Frozen matching criteria:",
        typeof m.criteria === "string"
          ? m.criteria
          : brief(m.criteria.brief ?? m.criteria.searchBrief),
        m.criteria.scope ?? ""
      );
    }
  }
  for (const m of list(value?.matchings))
    lines.push(
      `- ${m.id} | ${m.title} | revision ${m.revision} | ${m.archived_at ? "archived" : "active"} | ${m.description ?? ""}`
    );
  if (value?.currentBrief)
    lines.push(
      "Current Search Brief (may differ from the frozen matching):",
      brief(value.currentBrief)
    );
  for (const m of list(value?.memberships))
    lines.push(
      `- Recommendation ${m.recommendation_id}; role ${m.role_id}; ${m.role?.name ?? ""}; ${m.archived_at ? "previous" : "current"}; feedback ${m.recommendation?.feedback ?? "none"}; saved stage ${m.recommendation?.saved_stage ?? "none"}; ${m.explanation ?? ""}${m.original_recommendation_id && m.original_recommendation_id !== m.recommendation_id ? `; supersedes historical recommendation ${m.original_recommendation_id}` : ""}`
    );
  for (const r of runs) {
    lines.push(
      [
        `Run ${r.id}`,
        value?.runId === r.id && value.source ? `source ${value.source}` : null,
        `status ${value?.runId === r.id ? value.status ?? r.status : r.status}`,
        `started ${formatLlmDateTime(r.created_at)}`,
        `evaluated ${list(r.evaluation_ids).length}/${list(r.candidate_role_ids).length}`,
        r.request?.profileId ? `profile ${r.request.profileId}, revision ${r.request.profileRevision}` : null,
        r.error ? `error: ${r.error}` : null,
      ].filter(Boolean).join("; ")
    );
    if (
      value?.runId === r.id &&
      !value?.matching &&
      r.input_snapshot?.search_brief
    )
      lines.push(
        "Search Brief used for this run:",
        brief(r.input_snapshot.search_brief),
        r.input_snapshot.matching_scope ?? ""
      );
  }
  const evaluations = list(value?.evaluations);
  if (value?.evaluationCount !== undefined)
    lines.push(
      `Evaluations: showing ${evaluations.length} of ${value.evaluationCount}; ${value.remainingEvaluationCount} remaining after this page. Ordered by weighted fit (mutualFit ${Math.round(FIT_RANKING_WEIGHTS.mutualFit * 100)}%, candidateInterest ${FIT_RANKING_WEIGHTS.candidateInterest * 100}%, companyInterest ${FIT_RANKING_WEIGHTS.companyInterest * 100}%), highest first.${evaluations.some(e => e.assessment?.fit?.roleFit !== undefined) ? ` Older six-metric records retain mutualFit ${LEGACY_FIT_RANKING_WEIGHTS.mutualFit * 100}%, candidateInterest ${LEGACY_FIT_RANKING_WEIGHTS.candidateInterest * 100}%, companyInterest ${LEGACY_FIT_RANKING_WEIGHTS.companyInterest * 100}%, roleFit ${LEGACY_FIT_RANKING_WEIGHTS.roleFit * 100}%.` : ""}`
    );
  if (value?.expiredRoleCount !== undefined)
    lines.push(`Expired or closed roles excluded: ${value.expiredRoleCount}. Evaluation totals and remaining counts include only non-expired roles.`);
  if (value?.evaluationReadError)
    lines.push(
      `The stored run status above is unchanged, but its evaluation results could not be read: ${value.evaluationReadError}`
    );
  const criteriaSets: { roleId: string; criteria: any[] }[] = [];
  const criteriaSetByEvaluation = new Map<any, number>();
  for (const evaluation of evaluations) {
    const criteria = list(evaluation.assessment?.criteria);
    if (!criteria.length) continue;
    let index = criteriaSets.findIndex(set => set.roleId === evaluation.role_id &&
      set.criteria.length === criteria.length && set.criteria.every((item, i) =>
        item.name === criteria[i].name && item.criterionDefinition === criteria[i].criterionDefinition));
    if (index < 0) index = criteriaSets.push({ roleId: evaluation.role_id, criteria }) - 1;
    criteriaSetByEvaluation.set(evaluation, index + 1);
  }
  if (evaluations.length)
    lines.push(
      "Private assessment (reasoning-only). Scores use 0–100, higher is stronger: candidateInterest/candidateFit = candidate-side fit; companyInterest/companyFit = employer-side fit; mutualFit = mutual value, including work capability in current external scoring; constraintPass = stated constraints. Older external records may include separate roleFit (work fit) and evidence coverage. Criterion labels are stored judgments, not hiring outcomes; missing scores were not assessed."
    );
  else if (Array.isArray(value?.evaluations))
    lines.push(`No evaluated roles in this result.${value.status === "completed" ? " This run has finished; it is not waiting for further evaluations." : ""}`);
  criteriaSets.forEach((set, index) => lines.push(
    `Criteria set ${index + 1}; role ${set.roleId}:`,
    ...set.criteria.map((criterion, i) => `criteria${i + 1}: ${criterion.name ?? ""}${criterion.criterionDefinition ? ` — ${criterion.criterionDefinition}` : ""}`)
  ));
  for (const e of evaluations) {
    const a = e.assessment ?? {};
    const fit = a.fit ?? a;
    lines.push(
      `- Evaluation ${e.id}; role ${e.role_id}; evaluated ${formatLlmDateTime(e.evaluated_at)}`,
      `  info: ${[e.role?.company_workspace?.company_name, e.role?.name].filter(Boolean).join(" / ") || "role details not included"}`,
      `  Job summary: ${getLocalizedRoleSummaryContent(e.role?.summary, normalizeCareerPromptLocale(locale)) ?? "not available in the conversation language"}`,
      e.estimated_base_salary ? `  ${e.estimated_base_salary}` : "",
      `  assessment: ${["mutualFit", "candidateInterest", "companyInterest", "roleFit", "constraintPass", "candidateFit", "companyFit"]
        .filter(key => typeof fit[key] === "number").map(key => `${key}: ${scoreForLlm(fit[key])}`).join("; ") || "no numeric scores"}`,
      typeof fit.evidence === "string" ? `  Evidence coverage: ${fit.evidence}` : "",
      e.stage ? `  Stage ${e.stage}${a.decision ? `: ${a.decision}` : ""}` : "",
      ...["workScreen", "companyPracticalScreen", "candidatePracticalScreen", "practicalScreen"]
        .filter(key => typeof a[key] === "string").map(key => `  ${key}: ${a[key]}`),
      ...(criteriaSetByEvaluation.has(e) ? [
        `  Criteria set ${criteriaSetByEvaluation.get(e)}: ${list(a.criteria).map((c: any, i: number) => `criteria${i + 1}: ${c.label ?? "not recorded"}`).join("; ")}`,
      ] : []),
      e.source_profile_id ? `  Profile ${e.source_profile_id}; revision ${e.source_profile_revision}; evidence scope ${e.evidence_scope}.` : ""
    );
  }
  for (const publication of list(value?.coverage?.recommendations))
    lines.push(
      `Recommendation ${publication.recommendationId}; role ${publication.roleId}; ${publication.created ? "created" : "reused"}; feedback ${publication.feedback ?? "none"}; saved stage ${publication.savedStage ?? "none"}.`
    );
  for (const failure of list(value?.failures ?? value?.coverage?.failures))
    lines.push(`Incomplete role ${failure.roleId}: ${failure.error}`);
  for (const role of list(value?.coverage?.unavailableRoleIds))
    lines.push(`Role unavailable at execution: ${role}`);
  if (value?.error && requestedRun?.error !== value.error)
    lines.push(`Run error: ${value.error}`);
  if (value?.action)
    lines.push(
      `List operation ${value.action}; recommendations: ${list(value.recommendationIds).join(", ") || "none"}. Feedback and application/intro progress are preserved.`
    );
  for (const key of [
    "listRevision",
    "defaultListRevision",
    "allListsRevision",
    "nextCursor",
    "nextRunCursor",
    "evaluationCursor",
  ])
    if (value?.[key] !== undefined)
      lines.push(`${key}: ${value[key] ?? "end"}`);
  return lines.filter(Boolean).join("\n");
}
