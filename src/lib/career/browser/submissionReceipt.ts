import type { ExternalOperation, ExternalToolContext } from "../externalOperations/store";

/** The browser agent's own receipt answer, kept as given and read case-insensitively. */
export function browserRunSubmission(result: Record<string, unknown>): "yes" | "no" | "unclear" | null {
  const value = typeof result.submitted === "string" ? result.submitted.trim().toLowerCase() : "";
  return value === "yes" || value === "no" || value === "unclear" ? value : null;
}

const verificationOf = (result: Record<string, unknown>) =>
  typeof result.verificationCode === "string" ? result.verificationCode.trim().toLowerCase() : "";

/** Whether the run stopped at a screen waiting for a code the site emailed, without submitting. */
export function browserRunAwaitsEmailCode(result: Record<string, unknown>) {
  return verificationOf(result) === "email" && browserRunSubmission(result) !== "yes";
}

/** Whether the run stopped at a screen waiting for the applicant to open a link the site emailed, without submitting. */
export function browserRunAwaitsEmailLink(result: Record<string, unknown>) {
  return verificationOf(result) === "email_link" && browserRunSubmission(result) !== "yes";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A run whose receipt says the site received the application moves the linked opportunity to 지원함 (applied),
 * as the candidate would with the stage button. Only a saved or unstaged opportunity moves: a later stage the
 * candidate or company already set (connected, offer, closed, hidden) is never moved back.
 */
export async function markSubmittedApplications(
  context: Pick<ExternalToolContext, "admin" | "userId">,
  execution: ExternalOperation
) {
  if (execution.kind !== "browser_run" || browserRunSubmission(execution.result) !== "yes") return [];
  const roleIds = [...new Set((Array.isArray(execution.request.role_refs) ? execution.request.role_refs : [])
    .filter((id): id is string => typeof id === "string" && UUID.test(id)))];
  if (!roleIds.length) return [];
  const { data, error } = await (context.admin.from("talent_opportunity_recommendation") as any)
    .select("id,saved_stage").eq("talent_id", context.userId).in("role_id", roleIds);
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as { id: string; saved_stage: string | null }[])
    .filter((row) => !row.saved_stage || row.saved_stage === "saved")
    .map((row) => ({ recommendationId: row.id, savedStage: "applied" }));
  if (!items.length) return [];
  const { setOpportunityStages } = await import("../matching/opportunityStages");
  return (await setOpportunityStages({ admin: context.admin as any, userId: context.userId, items, actor: "harper_submission" })).stageUpdates;
}
