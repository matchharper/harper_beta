import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { CareerAgentReplyJob } from "../agentReplyQueue";
import type { CareerBackgroundRun } from "./types";

export const CAREER_REPLY_UNSEEN_TRIGGER = "career_reply_unseen";
/** How long a finished reply stays unseen before the email is considered. */
export const CAREER_REPLY_UNSEEN_GRACE_SECONDS = 30 * 60;
/** Only work that kept the candidate waiting; a quick reply they closed on is not worth an email. */
export const CAREER_REPLY_UNSEEN_MIN_WORK_SECONDS = 3 * 60;
/** Only recent candidate messages; an older thread is not waiting on this reply.
 * Covers the work time plus the unseen wait. */
export const CAREER_REPLY_UNSEEN_WINDOW_SECONDS = 3 * 60 * 60;

type UnseenReply = { messageId: number; sourceMessageId: number; completedAt?: string };

export function readUnseenReply(run: { trigger_payload?: unknown }): UnseenReply | null {
  const value = (run.trigger_payload as { unseenReply?: Partial<UnseenReply> } | null)?.unseenReply;
  const messageId = Number(value?.messageId), sourceMessageId = Number(value?.sourceMessageId);
  return Number.isSafeInteger(messageId) && Number.isSafeInteger(sourceMessageId)
    ? { messageId, sourceMessageId, completedAt: value?.completedAt } : null;
}

/** Wakes the Career agent once for each reply left unseen after the candidate closed every Harper page.
 * Pages that are only hidden (another tab or app, another Harper screen) stay open and never qualify. */
export async function admitUnseenCareerReplies(
  admin: TalentAdminClient,
  publish: (job: CareerAgentReplyJob) => Promise<unknown> = async job => (await import("../agentReplyQueue")).enqueueCareerAgentReply(job),
) {
  const { data, error } = await (admin.rpc as any)("admit_career_unseen_replies_v2", {
    p_grace_seconds: CAREER_REPLY_UNSEEN_GRACE_SECONDS,
    p_window_seconds: CAREER_REPLY_UNSEEN_WINDOW_SECONDS,
    p_min_work_seconds: CAREER_REPLY_UNSEEN_MIN_WORK_SECONDS,
    p_limit: 20,
  });
  if (error) throw error;
  const runs = (data ?? []) as CareerBackgroundRun[];
  // The run is durable; background recovery republishes a failed handoff.
  const results = await Promise.allSettled(runs.map(run => publish({
    userId: run.talent_id, conversationId: run.conversation_id!, backgroundRunId: run.id,
    replyId: run.trigger_payload.agentInvocation.replyId,
  })));
  return { admitted: runs.length, deferred: results.filter(result => result.status === "rejected").length };
}
