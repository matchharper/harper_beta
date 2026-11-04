import { internalScoringDatabase } from "./database";
import { enqueue, control, EXECUTOR } from "./repository";

export async function publishInternalEvaluation(runId: string) {
  const { publishCareerMatchingSearch } = await import("../externalSearch");
  await publishCareerMatchingSearch(runId, "internal_evaluation");
}

/** Keep transport separate from receipts and from the deterministic scorer. */
export const internalEvaluationBackend = {
  enqueue: (args: Parameters<typeof enqueue>[1]) =>
    enqueue(internalScoringDatabase(), args),
  control: (userId: string, runId: string, action: "resume" | "cancel") =>
    control(internalScoringDatabase(), userId, runId, action),
  publish: publishInternalEvaluation,
};

export async function recoverInternalEvaluations() {
  const db = internalScoringDatabase();
  const runs = await db.query(
    `SELECT * FROM public.opportunity_discovery_run
    WHERE trigger='career_internal_evaluation' AND trigger_payload->>'executor'=$1
      AND ((status='handed_off' AND (lease_token IS NULL OR lease_heartbeat_at<now()-interval '5 minutes'))
        OR (status<>'handed_off' AND NOT coverage ? 'completionNotifiedAt')
        OR (status IN ('failed','partial') AND jsonb_array_length(coalesce(trigger_payload->'sourceEvents','[]'::jsonb))>0 AND completed_at<now()-interval '15 minutes'))
    ORDER BY created_at LIMIT 50`,
    [EXECUTOR]
  );
  for (let run of runs) {
    if (
      ["failed", "partial"].includes(run.status) &&
      run.trigger_payload.sourceEvents?.length &&
      new Date(run.completed_at).getTime() < Date.now() - 15 * 60_000
    )
      run = await control(db, run.talent_id, run.id, "resume");
    // Queue completion notifications too, so collect_due stays short and retries
    // don't launch another evaluation or write a second conversational response.
    await publishInternalEvaluation(run.id);
  }
  return { dispatched: runs.length };
}
