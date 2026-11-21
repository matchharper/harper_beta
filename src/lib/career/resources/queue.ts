import { send } from "@vercel/queue";
import { z } from "zod";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/admin";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import {
  careerExecutionEnvironment,
  ownsCareerExecution,
} from "../executionEnvironment";
import { scheduleCareerDevelopmentJob } from "../developmentQueue.server";
import { operationSchema } from "../externalOperations/store";
import { databaseError, resourceDb, rows } from "./types";
import { processResourceOperation } from "./operations";
import {
  pendingSourceJobs,
  processSourceIndex,
  type SourceJob,
} from "./indexing";

export const CAREER_RESOURCE_TOPIC = "career-resource-jobs-v1";
const jobSchema = z.object({
  kind: z.literal("operation"),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  cursor: z.number().int().nonnegative(),
  executionEnvironment: z.string(),
});
export type ResourceJob = z.infer<typeof jobSchema>;
export async function publishResourceJob(
  input: Omit<ResourceJob, "executionEnvironment"> & {
    executionEnvironment?: string;
  }
) {
  const job = jobSchema.parse({
    ...input,
    executionEnvironment:
      input.executionEnvironment ?? careerExecutionEnvironment(),
  });
  const idempotencyKey = `career-resource:${job.kind}:${job.id}:${job.revision}:${job.cursor}`;
  if (
    scheduleCareerDevelopmentJob(idempotencyKey, () => processResourceJob(job))
  )
    return { messageId: null };
  return send(CAREER_RESOURCE_TOPIC, job, {
    idempotencyKey,
    retentionSeconds: 86400,
  });
}
export async function processResourceJob(raw: unknown) {
  if (
    raw &&
    typeof raw === "object" &&
    "kind" in raw &&
    raw.kind === "mail_sync"
  ) {
    const { mailSyncJobSchema, processMailSync } =
      await import("../emailWriting/sync");
    const job = mailSyncJobSchema.parse(raw);
    return withLlmUsageContext(
      {
        userId: job.userId,
        requestId: `mail-sync:${job.userId}:${job.generation}:${Date.now()}`,
        careerOrigin: "server",
      },
      () => processMailSync(job)
    );
  }
  if (
    raw &&
    typeof raw === "object" &&
    "kind" in raw &&
    raw.kind === "source"
  ) {
    const job = z
      .object({
        kind: z.literal("source"),
        scope: z.enum(["public", "private"]),
        ownerId: z.string().uuid().nullable(),
        resourceKind: z.enum([
          "company",
          "web_resource",
          "document",
          "discovery_request",
        ]),
        id: z.string(),
        revision: z.string(),
        generation: z.string(),
        executionEnvironment: z.string(),
      })
      .parse(raw);
    if (!ownsCareerExecution(job.executionEnvironment)) return;
    // Public source indexing is paused (see publishSourceJob); messages already
    // queued before the pause are dropped without reading or writing anything.
    if (job.scope === "public") return;
    return withLlmUsageContext(
      {
        userId: job.ownerId ?? undefined,
        requestId: `resource-index:${job.resourceKind}:${job.id}:${job.revision}`,
        careerOrigin: "server",
      },
      () => processSourceIndex(getTalentSupabaseAdmin(), job)
    );
  }
  const job = jobSchema.parse(raw);
  if (!ownsCareerExecution(job.executionEnvironment)) return;
  const admin = getTalentSupabaseAdmin();
  const result = await resourceDb(admin)
    .from("talent_external_operations")
    .select("*")
    .eq("id", job.id)
    .in("kind", ["resource_evaluation", "resource_research"])
    .maybeSingle();
  databaseError(result.error);
  if (!result.data) return;
  const op = operationSchema.parse(result.data);
  await withLlmUsageContext(
    {
      userId: op.user_id,
      conversationId: op.conversation_id ?? undefined,
      requestId: op.id,
      sourceMessageId: Number(op.request.source_message_id) || undefined,
      careerOrigin: "server",
      careerChannel: "chat",
    },
    () =>
      processResourceOperation(
        { admin, userId: op.user_id },
        op.id,
        job.revision,
        Date.now() + 650_000
      )
  );
}
/** DB remains the outbox even when publication fails or a provider message expires. */
export async function recoverResourceOperations(
  admin: TalentAdminClient,
  limit = 50
) {
  const result = await resourceDb(admin)
    .from("talent_external_operations")
    .select("id,revision,result,provider_refs")
    .in("kind", ["resource_evaluation", "resource_research"])
    .in("status", ["reserved", "running"])
    .or(
      `provider_refs->>lease_until.is.null,provider_refs->>lease_until.lte.${new Date().toISOString()}`
    )
    .eq("request->>execution_environment", careerExecutionEnvironment())
    .order("updated_at")
    .limit(limit);
  databaseError(result.error);
  let published = 0;
  for (const row of rows(result.data)) {
    const provider = row.provider_refs as Record<string, unknown>;
    if (Date.parse(String(provider?.lease_until ?? "")) > Date.now()) continue;
    await publishResourceJob({
      kind: "operation",
      id: String(row.id),
      revision: Number(row.revision),
      cursor: Number((row.result as Record<string, unknown>)?.cursor ?? 0),
    });
    published++;
  }
  let sourcesPublished = 0;
  // Shared source headers belong to the shared production collector. Local and
  // preview runtimes never drain production source work as a side effect.
  // Private document and discovery headers come from their table triggers, so no
  // bulk header backfill runs here.
  if (careerExecutionEnvironment() === "production") {
    for (const source of await pendingSourceJobs(admin, limit)) {
      await publishSourceJob(source);
      sourcesPublished++;
    }
  }
  const discoveryAdmitted =
    careerExecutionEnvironment() === "production"
      ? await (await import("./discovery")).recoverDiscoveryEvents(admin)
      : 0;
  const mail =
    careerExecutionEnvironment() === "production"
      ? await (await import("../emailWriting/sync")).recoverMailSync(admin)
      : null;
  return { published, sourcesPublished, discoveryAdmitted, mail };
}
export async function publishMailResourceJob(
  job: import("zod").infer<
    typeof import("../emailWriting/sync").mailSyncJobSchema
  >
) {
  // This is a wakeup, not an event identity. The account's DB lease/cursor and
  // message outbox provide deduplication even when deliveries are repeated.
  const idempotencyKey = `career-mail:${job.userId}:${job.generation}:${Math.floor(Date.now() / 60_000)}`;
  if (
    scheduleCareerDevelopmentJob(idempotencyKey, () => processResourceJob(job))
  )
    return { messageId: null };
  return send(CAREER_RESOURCE_TOPIC, job, {
    idempotencyKey,
    retentionSeconds: 86400,
  });
}
export async function publishSourceJob(input: SourceJob) {
  // Public company and web-page indexing is paused (2026-11-21). No Career tool
  // reads that index and no discovery schedule consumes it, while indexing every
  // directory company saturated the production database.
  if (input.scope === "public") return { messageId: null };
  const job = {
    ...input,
    executionEnvironment:
      input.executionEnvironment ?? careerExecutionEnvironment(),
  };
  const idempotencyKey = `career-source:${job.scope}:${job.ownerId ?? "public"}:${job.resourceKind}:${job.id}:${job.revision}:${job.generation}`;
  if (
    scheduleCareerDevelopmentJob(idempotencyKey, () => processResourceJob(job))
  )
    return { messageId: null };
  return send(CAREER_RESOURCE_TOPIC, job, {
    idempotencyKey,
    retentionSeconds: 86400,
  });
}
