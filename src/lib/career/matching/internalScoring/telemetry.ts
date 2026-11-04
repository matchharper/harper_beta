import type { Database } from "./database";
import {
  evaluateStage,
  internalScoringContract,
  type Stage,
} from "./decisions";
import type { Row } from "./evidence";

/** Existing private LLM log, with original provider input/output for diagnosis. */
export async function scoreWithReceipt(
  db: Database,
  run: Row,
  source: Row,
  stage: Stage,
  signal: AbortSignal
) {
  const calls: Row[] = [];
  try {
    return await evaluateStage(source, stage, {
      signal,
      onCall: (trace) => calls.push(trace),
    });
  } finally {
    for (const call of calls) {
      try {
        const { directUsageCost } =
          await import("@/lib/externalRecommendationsV2/usage");
        const usage = call.usage ?? call.raw?.usage;
        const cost = directUsageCost("openai_decisions", usage);
        await db.query(
          `INSERT INTO public.llm_logs(source,model,user_id,estimated_cost_usd,cost_status,meta)
          VALUES('career_tool',$1,$2::uuid,$3,$4,$5::jsonb)`,
          [
            internalScoringContract.MODEL,
            run.talent_id,
            cost.usd ?? 0,
            cost.status,
            JSON.stringify({
              label: `career_tool:internal_evaluation:stage_${stage}`,
              requestId: run.id,
              conversationId: run.conversation_id,
              roleId: source.role.role_id,
              provider: "openai-decisions",
              executor: "career_internal_beta_v1",
              ...call,
            }),
          ]
        );
      } catch {
        console.warn("[internal-scoring] provider receipt could not be saved", {
          runId: run.id,
          stage,
        });
      }
    }
  }
}
