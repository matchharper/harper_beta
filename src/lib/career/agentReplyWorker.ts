import { z } from "zod";
import { CAREER_TEXT_CHAT_MODEL_IDS } from "./textChatModelConfig";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { runCareerChatTurn } from "./chatTurn";
import { CareerAgentReplyUnavailable } from "./agentTurnRuntime.server";
import { CareerReplyContinuation } from "./capabilities/runtime";
import type { TalentMessageRow } from "@/lib/talentOnboarding/models";
import { processCareerBackgroundRun } from "./background/server";
import { dispatchCareerCheckpoint } from "./agentContinuation";
import { CareerTurnCancelled } from "./turnCancellation.server";

const jobSchema = z.object({
  invocationId: z.string().uuid().optional(),
  assistantModel: z.string().optional(),
  textChatModel: z.enum(CAREER_TEXT_CHAT_MODEL_IDS).optional(),
  userId: z.string().uuid(),
  conversationId: z.string().uuid(),
  sourceMessageId: z.number().int().positive().optional(),
  sourceMessageCursor: z.number().int().nonnegative().optional(),
  replyId: z.string(),
  proactiveContext: z.string().optional(),
  noMessageMarker: z.string().optional(),
  backgroundRunId: z.string().uuid().optional(),
});

/** Both queue transports resume through the same ownership checks and reply claim. */
export async function processCareerAgentReply(raw: unknown) {
  const job = jobSchema.parse(raw);
  const admin = getTalentSupabaseAdmin();
  const { data: conversation, error } = await admin.from("talent_conversations")
    .select("id").eq("id", job.conversationId).eq("user_id", job.userId).maybeSingle();
  if (error) throw error;
  if (!conversation) return;
  if (job.invocationId) {
    const { processCareerInvocation } = await import("./work/invocations");
    return processCareerInvocation({ admin, userId: job.userId, conversationId: job.conversationId }, job.invocationId);
  }
  if (job.backgroundRunId) return processCareerBackgroundRun({ admin, userId: job.userId, conversationId: job.conversationId, runId: job.backgroundRunId });
  let source: TalentMessageRow | undefined;
  if (job.sourceMessageId) {
    const result = await admin.from("talent_messages").select("*")
      .eq("id", job.sourceMessageId).eq("user_id", job.userId)
      .eq("conversation_id", job.conversationId).eq("role", "user").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return;
    source = result.data as TalentMessageRow;
  }
  try {
    await runCareerChatTurn({
      admin, userId: job.userId, conversationId: job.conversationId, userMessage: null,
      existingSourceMessage: source, agentReplyId: job.replyId, sourceMessageCursor: job.sourceMessageCursor,
      textChatModel: job.textChatModel,
      assistantModel: job.assistantModel,
      proactiveContext: job.proactiveContext, noMessageMarker: job.noMessageMarker,
      deadlineAt: Date.now() + 430_000,
      onAgentCheckpoint: async (checkpoint) => {
        await dispatchCareerCheckpoint({ admin, userId: job.userId, conversationId: job.conversationId, checkpoint });
      },
    });
  } catch (error) {
    if (error instanceof CareerTurnCancelled || error instanceof CareerReplyContinuation || (error instanceof CareerAgentReplyUnavailable && error.completed)) return;
    throw error;
  }
}
