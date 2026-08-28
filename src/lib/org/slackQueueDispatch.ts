import "server-only";

import { publishHarperSlackReplyJob } from "@/lib/org/slackTurnQueue";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;
const MAX_QUEUE_DISPATCH_ATTEMPTS = 5;

export type SlackQueueDispatchSource =
  | "event"
  | "interactivity"
  | "role_creation_bootstrap"
  | "recovery";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nextAttemptAt(seconds: number) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

export async function markSlackReplyJobQueueDispatched(args: {
  admin?: AdminClient;
  jobId: string;
  source: SlackQueueDispatchSource;
}) {
  const admin = args.admin ?? getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await (admin.from("slack_reply_jobs" as any) as any)
    .update({
      // This is a consecutive publish-failure counter. A successful publish
      // resets it, so capacity recovery does not turn into a false permanent
      // dispatch failure.
      queue_dispatch_attempt_count: 0,
      queue_dispatch_status: "dispatched",
      queue_dispatched_at: now,
      queue_last_error: null,
      queue_source: args.source,
      updated_at: now,
    })
    .eq("id", args.jobId)
    .eq("worker_target", "vercel_queue");
  if (error) throw error;
}

export async function dispatchSlackReplyJob(args: {
  admin?: AdminClient;
  jobId: string;
  source: Exclude<SlackQueueDispatchSource, "event">;
}) {
  const jobId = clean(args.jobId);
  if (!jobId) throw new Error("Slack reply job id is required for dispatch");
  const admin = args.admin ?? getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: job, error: jobError } = await (
    admin.from("slack_reply_jobs" as any) as any
  )
    .select("id, queue_dispatch_attempt_count, worker_target")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;

  // The same enqueue RPC is still used while historical EC2 jobs drain. Only
  // Vercel-targeted jobs may be handed to the Vercel Queue consumer.
  if (!job || clean(job.worker_target) !== "vercel_queue") return null;
  const { data: armedJob, error: pendingError } = await (
    admin.from("slack_reply_jobs" as any) as any
  )
    .update({
      queue_dispatch_status: "pending",
      queue_last_error: null,
      queue_next_attempt_at: now,
      queue_source: args.source,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("worker_target", "vercel_queue")
    .select("id")
    .maybeSingle();
  if (pendingError) throw pendingError;
  // A channel route can change while this request is in flight. Do not publish
  // a new Queue message after its job has moved back to another worker target.
  if (!armedJob) return null;

  try {
    const result = await publishHarperSlackReplyJob({
      jobId,
      source: args.source,
    });
    await markSlackReplyJobQueueDispatched({ admin, jobId, source: args.source });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Queue publish failed";
    const dispatchAttemptCount =
      Math.max(0, Number(job.queue_dispatch_attempt_count ?? 0)) + 1;
    const { error: retryError } = await (
      admin.from("slack_reply_jobs" as any) as any
    )
      .update({
        queue_dispatch_status:
          dispatchAttemptCount >= MAX_QUEUE_DISPATCH_ATTEMPTS
            ? "failed"
            : "retry",
        queue_last_error: message,
        queue_next_attempt_at: nextAttemptAt(
          Math.min(300, 2 ** dispatchAttemptCount * 15)
        ),
        queue_source: args.source,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("worker_target", "vercel_queue");
    if (retryError) {
      console.error("[harper-slack/queue-dispatch:mark-retry]", retryError);
    }
    throw error;
  }
}
