import { after } from "next/server";
import type { OpportunityRunRow } from "@/lib/opportunityDiscovery/types";
import type { CareerAgentReplyJob } from "./agentReplyQueue";

/** The DB admission owns recovery; publish only after onboarding finalization. */
export function scheduleOnboardingContinuation(
  run: OpportunityRunRow,
  dependencies: {
    schedule: (callback: () => Promise<void>) => void;
    publish: (job: CareerAgentReplyJob) => Promise<unknown>;
  } = {
    schedule: after,
    publish: async job => (await import("./agentReplyQueue")).enqueueCareerAgentReply(job),
  },
) {
  if (run.status !== "handed_off") return;
  const payload = run.trigger_payload as Record<string, any>;
  dependencies.schedule(async () => {
    await dependencies.publish({
      userId: run.talent_id!, conversationId: run.conversation_id!,
      replyId: payload.agentInvocation.replyId, backgroundRunId: run.id,
      checkpointKey: `accepted:${run.id}`,
    });
  });
}

/** The ordinary final response is delivered by the transport, not an LLM choice.
 * contact_user's existing delivery key makes a retry reuse the original message. */
export async function deliverContinuationResponse(
  text: string,
  execute: (call: { name: string; input: Record<string, unknown> }) => Promise<unknown>,
) {
  if (!text.trim()) return;
  await execute({ name: "contact_user", input: { channel: "chat", body: text } });
}
