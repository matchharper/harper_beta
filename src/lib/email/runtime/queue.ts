import { randomUUID } from "crypto";
import { send } from "@vercel/queue";
import { after } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { updateRow } from "./store";
import {
  EmailPermanentError,
  emailRuntimeEnabled,
  emailRuntimeTable,
  nowIso,
  parseEmailRuntimeMessage,
  type EmailAdmin,
  type EmailRuntimeMessage,
} from "./types";

export const EMAIL_RUNTIME_TOPIC = "harper-email-runtime-v1";
export async function dispatchEmailInboundEvent(inboundEventId: string) {
  if (!emailRuntimeEnabled()) return;
  const admin = getTalentSupabaseAdmin();
  const { data, error } = await (admin as any)
    .from("email_reply_jobs")
    .select("id")
    .eq("inbound_event_id", inboundEventId)
    .maybeSingle();
  if (error) throw error;
  if (data) await dispatchInboundEmailReply(data.id, admin);
}
export async function publishEmailRuntimeJob(
  message: EmailRuntimeMessage,
  dispatchId = "inbound"
) {
  if (!emailRuntimeEnabled()) return null;
  const parsed = parseEmailRuntimeMessage(message);
  if (!parsed) throw new EmailPermanentError("Invalid email Queue message");
  if (
    process.env.HARPER_LOCAL_E2E === "1" &&
    process.env.NODE_ENV === "development"
  ) {
    after(async () => {
      const { processEmailRuntimeMessage } = await import("./consumer");
      await processEmailRuntimeMessage(parsed).catch((error) =>
        console.error(
          "[email-runtime/local] durable job will be retried by dispatch",
          error
        )
      );
    });
    return { messageId: `local-email:${parsed.kind}:${parsed.jobId}` };
  }
  return send(EMAIL_RUNTIME_TOPIC, parsed, {
    idempotencyKey: `email-runtime:${parsed.kind}:${parsed.jobId}:${dispatchId}`,
    retentionSeconds: 86_400,
  });
}
export async function dispatchInboundEmailReply(
  jobId: string,
  admin: EmailAdmin = getTalentSupabaseAdmin(),
  publish: typeof publishEmailRuntimeJob = publishEmailRuntimeJob
) {
  if (!emailRuntimeEnabled() || !jobId) return;
  const { data, error } = await (admin as any)
    .from("email_reply_jobs")
    .update({ worker_target: "vercel_queue" })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  try {
    await publish({ version: 1, kind: "reply", jobId });
    await updateRow(admin, "email_reply_jobs", jobId, {
      queue_dispatched_at: nowIso(),
      queue_dispatch_error: null,
    });
  } catch (error) {
    // Ingest is already durable. The dispatcher repairs a publish failure;
    // Resend does not need to redeliver the original webhook to avoid loss.
    await updateRow(admin, "email_reply_jobs", jobId, {
      queue_dispatch_error:
        error instanceof Error
          ? error.message.slice(0, 1000)
          : "Queue publish failed",
    });
    console.error("[email-runtime] publish deferred", { jobId });
  }
}
export async function dispatchEmailRuntimeJobs(
  admin: EmailAdmin = getTalentSupabaseAdmin(),
  publish: typeof publishEmailRuntimeJob = publishEmailRuntimeJob
) {
  if (!emailRuntimeEnabled()) return { dispatched: 0, deferred: 0 };
  const { data, error } = await (admin.rpc as any)(
    "dispatch_email_runtime_jobs_v1",
    { p_limit: 20 }
  );
  if (error) throw error;
  let dispatched = 0,
    deferred = 0;
  for (const raw of data ?? []) {
    const message = parseEmailRuntimeMessage(raw);
    if (!message)
      throw new Error("Database returned an invalid email dispatch");
    const generation = randomUUID();
    try {
      await publish(message, generation);
      dispatched += 1;
    } catch (error) {
      deferred += 1;
      await updateRow(admin, emailRuntimeTable(message.kind), message.jobId, {
        queue_dispatched_at: null,
        queue_dispatch_error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Queue publish failed",
      });
    }
  }
  return { dispatched, deferred };
}
