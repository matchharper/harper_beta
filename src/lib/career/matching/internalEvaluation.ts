import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { readProfileSnapshot } from "../profiles/store";
import { matchingTable } from "./store";
import { internalEvaluationBackend } from "./internalScoring/backend";
import { receiptStatus } from "./internalScoring/repository";
export async function requestInternalRoleEvaluation(args: {
  admin: TalentAdminClient;
  userId: string;
  conversationId?: string;
  replyId?: string;
  operationId: string;
  roleIds: string[];
  profileId?: string;
  profileRevision?: number;
  publishRecommendation?: boolean;
  /** Existing private card from a direct request; do not suspend its parent reply. */
  requestedOpportunityId?: string;
  signal?: AbortSignal;
  sourceEvents?: unknown[];
  preparationRunId?: string;
}) {
  args.signal?.throwIfAborted();
  const profile = await readProfileSnapshot({
    admin: args.admin,
    userId: args.userId,
    profileId: args.profileId,
    revision: args.profileRevision,
  });
  args.signal?.throwIfAborted();
  const run = await internalEvaluationBackend.enqueue({
    userId: args.userId,
    conversationId: args.conversationId,
    operationId: args.operationId,
    payload: {
      runContract: "career_internal_evaluation_v1",
      roleIds: args.roleIds,
      profileId: profile.profileId,
      profileRevision: profile.revision,
      publishRecommendation: args.publishRecommendation ?? false,
      requestedOpportunityId: args.requestedOpportunityId,
      parentReplyId: args.replyId,
      sourceEvents: args.sourceEvents ?? [],
      preparationRunId: args.preparationRunId,
    },
  });
  if (run.status === "handed_off") {
    try { await internalEvaluationBackend.publish(run.id); }
    catch(error) {
      // The durable evaluator outbox owns retry. Preserve the actual saved run receipt.
      console.error("[internal-evaluation] Queue dispatch recovery required",{runId:run.id,error:error instanceof Error?error.message:String(error)});
    }
  }
  const status = receiptStatus(run);
  return {
    runId: run.id,
    status,
    source: "internal",
    roleIds: args.roleIds,
    profileId: profile.profileId,
    profileRevision: profile.revision,
    careerContinuation: !args.requestedOpportunityId && ["queued", "running"].includes(status)
      ? { kind: "internal_evaluation", id: run.id }
      : undefined,
  };
}
export async function controlInternalEvaluation(args: {
  admin: TalentAdminClient;
  userId: string;
  runId: string;
  action: "resume" | "cancel";
}) {
  const run = await internalEvaluationBackend.control(
    args.userId,
    args.runId,
    args.action
  );
  await internalEvaluationBackend.publish(run.id);
  const status = receiptStatus(run);
  return {
    runId: run.id,
    status,
    source: "internal",
    roleIds: run.trigger_payload?.roleIds,
    careerContinuation: ["queued", "running"].includes(status)
      ? { kind: "internal_evaluation", id: run.id }
      : undefined,
  };
}
export async function readInternalEvaluation(
  admin: TalentAdminClient,
  userId: string,
  runId: string,
  cursor?: string,
  limit = 30
) {
  const { data, error } = await matchingTable(
    admin,
    "opportunity_discovery_run"
  )
    .select(
      "id,status,lease_token,trigger_payload,coverage,error_message,created_at,completed_at"
    )
    .eq("id", runId)
    .eq("talent_id", userId)
    .eq("trigger", "career_internal_evaluation")
    .single();
  if (error) throw new Error(error.message);
  const ids = data.coverage?.evaluationIds ?? [];
  let query = matchingTable(admin, "company_role_candidate_evaluations")
    .select(
      "id,role_id,stage,assessment,evaluated_at,source_profile_id,source_profile_revision,evidence_scope"
    )
    .eq("talent_id", userId)
    .in("id", ids)
    .order("id")
    .limit(limit + 1);
  if (cursor) query = query.gt("id", cursor);
  const evaluations = ids.length ? await query : { data: [], error: null };
  if (evaluations.error) throw new Error(evaluations.error.message);
  return {
    runId: data.id,
    status: receiptStatus(data),
    source: "internal",
    roleIds: data.trigger_payload?.roleIds,
    coverage: data.coverage,
    evaluations: evaluations.data.slice(0, limit),
    evaluationCursor:
      evaluations.data.length > limit ? evaluations.data[limit - 1].id : null,
    error: data.error_message,
  };
}
