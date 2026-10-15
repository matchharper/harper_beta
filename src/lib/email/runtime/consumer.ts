import { randomUUID } from "crypto";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { processEmailReply } from "./reply";
import { processEmailContact } from "./contact";
import { processOnboardingReview } from "./onboarding";
import { readRow, updateEmailJob } from "./store";
import {
  EmailBusyError,
  EmailPermanentError,
  emailRuntimeEnabled,
  emailRuntimeTable,
  nowIso,
  parseEmailRuntimeMessage,
  type EmailAdmin,
  type EmailRow,
  type EmailRuntimeKind,
} from "./types";

async function releaseFailedJob(
  admin: EmailAdmin,
  kind: EmailRuntimeKind,
  job: EmailRow,
  owner: string,
  error: unknown
) {
  const transient = error instanceof EmailBusyError;
  const attempts = Number(
    kind === "onboarding_review" ? job.review_attempts : job.attempts
  );
  const confirmedDelivery = Boolean(
    job.resend_email_id ||
    job.metadata?.reviewProviderId ||
    Object.keys(job.metadata?.referralProviderIds ?? {}).length
  );
  const permanent = error instanceof EmailPermanentError && !confirmedDelivery;
  const exhausted = !transient && !confirmedDelivery && attempts >= 3;
  const text =
    error instanceof Error
      ? error.message.slice(0, 2000)
      : "Email processing failed";
  const lock =
    kind === "onboarding_review"
      ? { review_locked_at: null, review_locked_by: null }
      : { locked_at: null, locked_by: null };
  const state =
    kind === "onboarding_review"
      ? {
          status: permanent || exhausted ? "failed" : "active",
          ...(permanent || exhausted ? { step: "failed" } : {}),
        }
      : {
          status: permanent
            ? kind === "reply"
              ? "skipped"
              : "cancelled"
            : exhausted
              ? "failed"
              : "queued",
        };
  await updateEmailJob(admin, kind, job.id, owner, {
    ...lock,
    ...state,
    last_error: text,
    queue_dispatched_at: null,
    ...(transient && !confirmedDelivery
      ? kind === "onboarding_review"
        ? { review_attempts: Math.max(0, attempts - 1) }
        : { attempts: Math.max(0, attempts - 1) }
      : {}),
    ...(kind === "reply" && permanent
      ? { skip_reason: text, processed_at: nowIso() }
      : {}),
  });
  if (kind === "contact" && exhausted) {
    if (job.company_talent_request_id)
      await (admin as any)
        .from("company_talent_requests")
        .update({ workflow_status: "failed" })
        .eq("id", job.company_talent_request_id)
        .not("workflow_status", "in", "(delivered,closed,cancelled)");
    if (
      job.type === "meeting_schedule_candidate_invitation" &&
      job.payload?.meetingScheduleRoundId
    )
      await (admin as any)
        .from("meeting_schedule_rounds")
        .update({ status: "delivery_failed", updated_at: nowIso() })
        .eq("id", job.payload.meetingScheduleRoundId)
        .eq("delivery_queue_id", job.id)
        .eq("status", "queued");
  }
  return permanent || exhausted;
}

export async function processEmailRuntimeMessage(
  raw: unknown,
  admin: EmailAdmin = getTalentSupabaseAdmin()
) {
  const message = parseEmailRuntimeMessage(raw);
  if (!message) throw new EmailPermanentError("Invalid email Queue message");
  if (!emailRuntimeEnabled()) return;
  const owner = `vercel-email:${randomUUID()}`;
  const { data: claim, error } = await (admin.rpc as any)(
    "claim_email_runtime_job_v1",
    {
      p_kind: message.kind,
      p_id: message.jobId,
      p_owner: owner,
      p_max_attempts: 3,
      p_max_in_flight: Math.min(
        100,
        Math.max(
          1,
          Math.floor(Number(process.env.EMAIL_RUNTIME_CONCURRENCY) || 4)
        )
      ),
    }
  );
  if (error) throw error;
  if (["busy", "capacity"].includes(claim?.state))
    throw new EmailBusyError(`Email execution is ${claim.state}`);
  if (claim?.state !== "claimed") return;
  const job = claim.job as EmailRow;
  try {
    if (message.kind === "reply") await processEmailReply(admin, job, owner);
    else if (message.kind === "contact")
      await processEmailContact(admin, job, owner);
    else await processOnboardingReview(admin, job, owner);
  } catch (error) {
    const current = await readRow(
      admin,
      emailRuntimeTable(message.kind),
      job.id
    );
    // A completed external delivery or another owner is never rewritten as a
    // failed job merely because a callback is being retried.
    if (
      current?.status === "sent" ||
      (message.kind === "onboarding_review" && current?.calendar_cta_sent_at)
    )
      return;
    const lockedBy =
      message.kind === "onboarding_review"
        ? current?.review_locked_by
        : current?.locked_by;
    if (lockedBy !== owner) throw error;
    if (await releaseFailedJob(admin, message.kind, current!, owner, error))
      return;
    throw error;
  }
}
