import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { enqueueCareerAgentReply, type CareerAgentReplyJob } from "./agentReplyQueue";
import { dispatchCareerCheckpoint } from "./agentContinuation";
import type { CareerReplyCheckpoint } from "./capabilities/runtime";

/** Re-publish durable checkpoints whose first queue handoff may have failed. */
export async function dispatchCareerAgentReplies(
  admin = getTalentSupabaseAdmin(),
  publish: (job: CareerAgentReplyJob) => Promise<unknown> = enqueueCareerAgentReply,
  deadlineAt = Date.now() + 45_000,
) {
  let dispatched = 0;
  let deferred = 0;
  while (Date.now() < deadlineAt) {
    // Twenty concurrent sends fit the existing 60-second cron. Each DB batch
    // leases its rows, so the next page/run advances even after a failed send.
    const { data, error } = await (admin.rpc as any)("claim_career_agent_checkpoint_recovery", { p_limit: 20 });
    if (error) throw error;
    const jobs = (data ?? []) as Array<{
      userId: string; conversationId: string; checkpoint: CareerReplyCheckpoint;
    }>;
    if (!jobs.length) break;
    const results = await Promise.allSettled(jobs.map(job => dispatchCareerCheckpoint({ admin, ...job, publish })));
    for (let index = 0; index < results.length; index += 1) {
      if (results[index].status === "fulfilled") dispatched += 1;
      else {
        deferred += 1;
        console.error("[career-agent/dispatch] queue publish deferred", { replyId: jobs[index].checkpoint.replyId });
      }
    }
  }
  return { dispatched, deferred };
}
