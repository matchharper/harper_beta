import { handleCallback, type MessageMetadata } from "@vercel/queue";
import {
  decryptHarperSlackToken,
  setHarperSlackThreadStatus,
} from "@/lib/org/slackHarper";
import { queueHarperSlackEvent } from "@/lib/org/slackHarperEvents";
import { markSlackReplyJobQueueDispatched } from "@/lib/org/slackQueueDispatch";
import { processSlackTurn } from "@/app/api/internal/org-agent/slack-turn/route";
import { getConfiguredPublicSiteUrl } from "@/lib/siteUrl";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  fromHarperSlackEventQueueMessage,
  parseHarperSlackTurnQueueMessage,
  type HarperSlackTurnQueueMessage,
} from "@/lib/org/slackTurnQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

// This is the durable job's LLM execution budget. It deliberately is not a
// Vercel Queue delivery limit: at-least-once redeliveries also happen for
// capacity, stale leases, and short-lived database outages.
const SLACK_TURN_MAX_ATTEMPTS = 5;

class SlackQueueCapacityError extends Error {
  constructor() {
    super("Slack Queue consumer is at its 20-turn concurrency limit");
  }
}

class SlackQueueInFlightError extends Error {
  constructor() {
    super("Slack Queue job is still owned by another delivery");
  }
}

class SlackQueuePermanentError extends Error {}

class SlackQueueRetryError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

type SlackLoadingStatus = {
  botTokenCiphertext: string;
  channelId: string;
  status: string;
  threadTs: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function retryAfterSeconds(attemptCount: number) {
  return Math.min(300, 2 ** Math.max(1, attemptCount) * 5);
}

function nextRetryAt(seconds: number) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

async function setLoadingStatus(loadingStatus: SlackLoadingStatus | null) {
  if (!loadingStatus) return;
  await setHarperSlackThreadStatus({
    channelId: loadingStatus.channelId,
    status: loadingStatus.status,
    threadTs: loadingStatus.threadTs,
    token: decryptHarperSlackToken(loadingStatus.botTokenCiphertext),
  }).catch((error) =>
    console.warn("[harper-slack/queue:set-mention-status]", error)
  );
}

async function clearLoadingStatus(loadingStatus: SlackLoadingStatus | null) {
  if (!loadingStatus) return;
  await setHarperSlackThreadStatus({
    channelId: loadingStatus.channelId,
    status: "",
    threadTs: loadingStatus.threadTs,
    token: decryptHarperSlackToken(loadingStatus.botTokenCiphertext),
  }).catch((error) =>
    console.warn("[harper-slack/queue:clear-mention-status]", error)
  );
}

async function resolveJobId(args: {
  message: HarperSlackTurnQueueMessage;
  metadata: MessageMetadata;
}) {
  if (args.message.kind === "reply_job") {
    return { jobId: args.message.jobId, loadingStatus: null };
  }

  const result = await queueHarperSlackEvent(
    fromHarperSlackEventQueueMessage(args.message)
  );
  if ("jobId" in result && clean(result.jobId)) {
    await markSlackReplyJobQueueDispatched({
      jobId: clean(result.jobId),
      source: "event",
    });
    const loadingStatus =
      "queued" in result &&
      result.queued === true &&
      "loadingStatus" in result &&
      result.loadingStatus
        ? result.loadingStatus
        : null;
    return { jobId: clean(result.jobId), loadingStatus };
  }
  if ("queued" in result || "duplicate" in result) {
    throw new SlackQueueRetryError(
      `Slack event ${args.metadata.messageId} did not return a reply job id`
    );
  }
  return null;
}

async function claimSlackReplyJob(args: {
  jobId: string;
  metadata: MessageMetadata;
}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin.rpc as any)("claim_slack_reply_job_v3", {
    p_job_id: args.jobId,
    p_max_concurrency: 20,
    p_max_retry_count: SLACK_TURN_MAX_ATTEMPTS,
    p_stale_after_seconds: 360,
    p_worker_id: `vercel-queue:${args.metadata.messageId}`,
  });
  if (error) throw error;
  const claimed = Array.isArray(data) ? data[0] : data;
  if (claimed) return { claimed: true as const, job: claimed };

  const { data: job, error: jobError } = await (
    admin.from("slack_reply_jobs" as any) as any
  )
    .select("attempt_count, locked_at, status, worker_target")
    .eq("id", args.jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job || clean(job.worker_target) !== "vercel_queue") {
    return { claimed: false as const, reason: "terminal" as const };
  }
  if (["completed", "failed", "ignored"].includes(clean(job.status))) {
    return { claimed: false as const, reason: "terminal" as const };
  }
  if (Number(job.attempt_count ?? 0) >= SLACK_TURN_MAX_ATTEMPTS) {
    return { claimed: false as const, reason: "exhausted" as const };
  }
  if (clean(job.status) === "processing") {
    return { claimed: false as const, reason: "already_processing" as const };
  }
  return { claimed: false as const, reason: "capacity" as const };
}

async function markSlackReplyJobRetry(args: {
  error: unknown;
  jobId: string;
  retryAfterSeconds: number;
}) {
  const admin = getSupabaseAdmin();
  const message =
    args.error instanceof Error ? args.error.message.slice(0, 1_000) : "Slack Queue processing failed";
  const { error } = await (admin.from("slack_reply_jobs" as any) as any)
    .update({
      last_error: message,
      locked_at: null,
      locked_by: null,
      next_attempt_at: nextRetryAt(args.retryAfterSeconds),
      status: "retry",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)
    .eq("worker_target", "vercel_queue")
    .eq("status", "processing");
  if (error) throw error;
}

async function markSlackReplyJobFailed(args: {
  error: unknown;
  jobId: string;
}) {
  const admin = getSupabaseAdmin();
  const message =
    args.error instanceof Error ? args.error.message.slice(0, 1_000) : "Slack Queue processing failed";
  const { error } = await (admin.from("slack_reply_jobs" as any) as any)
    .update({
      last_error: message,
      locked_at: null,
      locked_by: null,
      status: "failed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobId)
    .eq("worker_target", "vercel_queue");
  if (error) throw error;
}

async function handleClaimedSlackTurnFailure(args: {
  attemptCount: number;
  error: unknown;
  jobId: string;
  loadingStatus: SlackLoadingStatus | null;
}) {
  await clearLoadingStatus(args.loadingStatus);
  const failure =
    args.error instanceof SlackQueueRetryError
      ? args.error
      : new SlackQueueRetryError(
          args.error instanceof Error
            ? args.error.message.slice(0, 1_000)
            : "Slack Queue processing failed"
        );
  if (args.attemptCount >= SLACK_TURN_MAX_ATTEMPTS) {
    await markSlackReplyJobFailed({ error: failure, jobId: args.jobId });
    return;
  }
  const retryAfter = retryAfterSeconds(args.attemptCount);
  await markSlackReplyJobRetry({
    error: failure,
    jobId: args.jobId,
    retryAfterSeconds: retryAfter,
  });
  throw new SlackQueueRetryError(failure.message, retryAfter);
}

async function processQueueMessage(
  rawMessage: unknown,
  metadata: MessageMetadata
) {
  const startedAt = performance.now();
  const message = parseHarperSlackTurnQueueMessage(rawMessage);
  if (!message) throw new SlackQueuePermanentError("Invalid Slack Queue message");

  const resolved = await resolveJobId({ message, metadata });
  if (!resolved) return;
  const { jobId, loadingStatus } = resolved;

  console.info("[harper-slack/queue:delivery]", {
    deliveryCount: metadata.deliveryCount,
    jobId,
    kind: message.kind,
    messageId: metadata.messageId,
  });

  const claim = await claimSlackReplyJob({ jobId, metadata });
  if (!claim.claimed) {
    if (claim.reason === "capacity") throw new SlackQueueCapacityError();
    if (claim.reason === "already_processing") {
      // A rare duplicate delivery must not ACK the shared Queue message while
      // the original Function still owns the job. If that owner crashes, this
      // delivery remains available for the stale-lease recovery path.
      throw new SlackQueueInFlightError();
    }
    if (claim.reason === "exhausted") {
      await markSlackReplyJobFailed({
        error: new Error("Slack Queue retry budget exhausted before claim"),
        jobId,
      });
    }
    return;
  }

  await setLoadingStatus(loadingStatus);
  let response: Response;
  try {
    response = await processSlackTurn({
      jobId,
      phase: "all",
      publicSiteUrl: getConfiguredPublicSiteUrl(),
    });
  } catch (error) {
    return handleClaimedSlackTurnFailure({
      attemptCount: Number(claim.job.attempt_count ?? 0),
      error,
      jobId,
      loadingStatus,
    });
  }
  if (response.ok) {
    console.info("[harper-slack/queue:completed]", {
      deliveryCount: metadata.deliveryCount,
      elapsedMs: Math.round(performance.now() - startedAt),
      jobId,
      messageId: metadata.messageId,
    });
    return;
  }

  const detail = await response.text().catch(() => "");
  const failure = new SlackQueueRetryError(
    `Slack turn failed with ${response.status}: ${detail.slice(0, 500)}`
  );
  return handleClaimedSlackTurnFailure({
    attemptCount: Number(claim.job.attempt_count ?? 0),
    error: failure,
    jobId,
    loadingStatus,
  });
}

export const POST = handleCallback(processQueueMessage, {
  retry: (error, metadata) => {
    if (error instanceof SlackQueuePermanentError) {
      console.error("[harper-slack/queue:permanent]", error);
      return { acknowledge: true };
    }
    // Capacity and an in-flight duplicate are backpressure conditions, not
    // failed LLM attempts. They must not spend the Queue delivery budget or
    // create a second message with the same 24-hour idempotency key.
    if (
      error instanceof SlackQueueCapacityError ||
      error instanceof SlackQueueInFlightError
    ) {
      return { afterSeconds: 5 };
    }
    if (
      error instanceof SlackQueueRetryError &&
      error.retryAfterSeconds !== undefined
    ) {
      return { afterSeconds: error.retryAfterSeconds };
    }
    return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
  },
  visibilityTimeoutSeconds: 390,
});
