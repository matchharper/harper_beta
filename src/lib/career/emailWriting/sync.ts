import { z } from "zod";
import { createComposioClient } from "@/lib/integrations/composio";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import {
  getTalentSupabaseAdmin,
  type TalentAdminClient,
} from "@/lib/talentOnboarding/admin";
import {
  careerExecutionEnvironment,
  ownsCareerExecution,
} from "../executionEnvironment";
import { publishCareerInvocations } from "../work/invocations";
import {
  databaseError,
  record,
  resourceDb,
  rows,
  text,
  type ResourceContext,
} from "../resources/types";
import {
  ownedGmailConnection,
  readOwnedThread,
  readOwnedThreadPage,
} from "./thread";
import { readEmailMessage } from "./message";
import { operationSchema, updateOperation } from "../externalOperations/store";

export const mailSyncJobSchema = z.object({
  kind: z.literal("mail_sync"),
  userId: z.string().uuid(),
  generation: z.string().uuid(),
  executionEnvironment: z.string(),
});

export async function prepareMailWait(
  context: ResourceContext,
  input: { account_id?: string; thread_id?: string; operation_ids?: string[] }
) {
  if (!input.thread_id)
    throw new Error("A provider thread_id is required to wait for Gmail.");
  const connection = await ownedGmailConnection(context, input.account_id);
  if (!connection.generation)
    throw new Error("Gmail event storage is not configured.");
  const sentIds: string[] = [];
  for (const id of input.operation_ids ?? []) {
    const result = await resourceDb(context.admin)
      .from("talent_external_operations")
      .select("provider_refs,status")
      .eq("id", id)
      .eq("user_id", context.userId)
      .single();
    databaseError(result.error);
    const receipt = record(result.data?.provider_refs);
    if (
      receipt.account_id !== connection.accountId ||
      receipt.thread_id !== input.thread_id ||
      result.data?.status !== "succeeded"
    )
      throw new Error(
        "The operation does not confirm a sent message in this account/thread."
      );
    if (text(receipt.message_id)) sentIds.push(text(receipt.message_id));
  }
  const messages = await readOwnedThread(context, {
    ...connection,
    threadId: input.thread_id,
  });
  // A reply can arrive between send and wait. Only messages through the actual
  // sent anchor are baseline; later incoming messages must wake the owner.
  // Without an anchor, existing inbox event identities suppress repeats while
  // the original agent receives current correspondence instead of losing it.
  const anchor = messages.reduce(
    (last, message, index) =>
      sentIds.includes(message.messageId) ? index : last,
    -1
  );
  return {
    kind: "gmail_thread",
    account_id: connection.accountId,
    account_generation: connection.generation,
    thread_id: input.thread_id,
    operation_ids: input.operation_ids ?? [],
    baseline_message_ids: messages
      .slice(0, anchor + 1)
      .map((message) => message.messageId),
    observed_at: new Date().toISOString(),
  };
}

export async function recordMailEvent(
  context: ResourceContext,
  input: {
    accountId: string;
    generation: string;
    messageId: string;
    threadId: string;
    triggerId?: string;
  }
) {
  const result = await resourceDb(context.admin).rpc(
    "career_record_mail_event_v1",
    {
      p_user: context.userId,
      p_account: input.accountId,
      p_generation: input.generation,
      p_message: input.messageId,
      p_thread: input.threadId,
      p_trigger: input.triggerId ?? null,
    }
  );
  databaseError(result.error);
  for (const conversationId of new Set(
    rows(record(result.data).deliveries)
      .map((row) => text(row.conversation_id))
      .filter(Boolean)
  )) {
    await publishCareerInvocations({ ...context, conversationId }).catch(
      (error) =>
        console.warn("[career-mail] Invocation remains in outbox", {
          conversationId,
          error: String(error),
        })
    );
  }
  return result.data;
}

export async function publishMailSync(userId: string, generation: string) {
  const { publishMailResourceJob } = await import("../resources/queue");
  return publishMailResourceJob({
    kind: "mail_sync",
    userId,
    generation,
    executionEnvironment: careerExecutionEnvironment(),
  });
}

/** One account lease and a durable thread/page cursor. A provider page is saved
 * only after all its events have entered the invocation outbox. */
export async function processMailSync(raw: unknown) {
  const job = mailSyncJobSchema.parse(raw);
  if (!ownsCareerExecution(job.executionEnvironment)) return;
  const admin = getTalentSupabaseAdmin(),
    db = resourceDb(admin),
    lease = crypto.randomUUID(),
    deadlineAt = Date.now() + 650_000;
  const claimed = await db.rpc("career_claim_mail_sync_v1", {
    p_user: job.userId,
    p_generation: job.generation,
    p_lease: lease,
  });
  databaseError(claimed.error);
  if (!claimed.data) return;
  const integration = record(claimed.data),
    sync = record(integration.career_mail_sync),
    accountId = text(integration.composio_connected_account_id);
  const context = { admin, userId: job.userId },
    patch: Record<string, unknown> = {};
  let cursor = record(sync.cursor),
    after = text(cursor.after) || undefined,
    currentWork = text(cursor.work_id) || undefined,
    pageToken = text(cursor.page_token) || undefined;
  let complete = false;
  try {
    const first = await db.rpc("career_mail_waiters_v1", {
      p_user: job.userId,
      p_account: accountId,
      p_generation: job.generation,
      p_limit: 1,
    });
    databaseError(first.error);
    if (!rows(first.data).length) {
      if (sync.trigger_id)
        await createComposioClient().disableTrigger(text(sync.trigger_id));
      patch.trigger_id = null;
      patch.trigger_needs_refresh = false;
      patch.cursor = null;
      patch.health = "inactive";
      complete = true;
    } else {
      await ownedGmailConnection(context, accountId, job.generation);
      if (
        (!sync.trigger_id || sync.trigger_needs_refresh) &&
        process.env.COMPOSIO_CAREER_WEBHOOK_SECRET &&
        careerExecutionEnvironment() === "production"
      ) {
        try {
          await createComposioClient().getGmailTriggerType();
          const trigger = await createComposioClient().upsertGmailTrigger({
            accountId,
            userId: job.userId,
          });
          if (!text(trigger.trigger_id))
            throw new Error("Composio returned no trigger identity.");
          // Save before the scan. If the webhook races this write the scan still
          // recovers the message; generation/lease prevents a stale install.
          const updated = await db
            .from("talent_integrations")
            .update({
              career_mail_sync: {
                ...sync,
                ...trigger,
                lease_id: lease,
                lease_until: new Date(Date.now() + 720_000).toISOString(),
              },
            })
            .eq("talent_id", job.userId)
            .eq("provider", "gmail")
            .eq("composio_connected_account_id", accountId)
            .eq("career_mail_sync->>generation", job.generation)
            .eq("career_mail_sync->>lease_id", lease)
            .select("talent_id")
            .maybeSingle();
          databaseError(updated.error);
          if (!updated.data) {
            await createComposioClient().disableTrigger(
              text(trigger.trigger_id)
            );
            return;
          }
          Object.assign(patch, trigger, { trigger_needs_refresh: false });
        } catch (error) {
          patch.trigger_error = String(error);
        }
      }
      while (Date.now() < deadlineAt) {
        const response = await db.rpc("career_mail_waiters_v1", {
          p_user: job.userId,
          p_account: accountId,
          p_generation: job.generation,
          p_after: after ?? null,
          p_limit: 50,
        });
        databaseError(response.error);
        const works = rows(response.data);
        if (!works.length) {
          complete = true;
          break;
        }
        for (const work of works) {
          const id = text(work.id),
            waiting = record(record(work.request).waiting_on);
          if (currentWork && id !== currentWork) pageToken = undefined;
          currentWork = id;
          do {
            if (Date.now() >= deadlineAt) break;
            const page = await readOwnedThreadPage(context, {
              accountId,
              generation: job.generation,
              threadId: text(waiting.thread_id),
              pageToken,
            });
            for (const message of page.messages) {
              if (
                message.labelIds.some(
                  (label) => label === "SENT" || label === "DRAFT"
                )
              )
                continue;
              await recordMailEvent(context, {
                accountId,
                generation: job.generation,
                messageId: message.messageId,
                threadId: text(waiting.thread_id),
              });
            }
            const next = page.nextPageToken ?? undefined;
            if (next && next === pageToken)
              throw new Error("Gmail repeated its thread cursor.");
            pageToken = next;
            // Persist every completed page, not just the invocation's last page.
            const saved = await db
              .from("talent_integrations")
              .update({
                career_mail_sync: {
                  ...sync,
                  ...patch,
                  lease_id: lease,
                  lease_until: new Date(deadlineAt + 60_000).toISOString(),
                  cursor: {
                    after,
                    work_id: currentWork,
                    page_token: pageToken,
                  },
                },
              })
              .eq("talent_id", job.userId)
              .eq("provider", "gmail")
              .eq("career_mail_sync->>generation", job.generation)
              .eq("career_mail_sync->>lease_id", lease)
              .select("talent_id")
              .maybeSingle();
            databaseError(saved.error);
            if (!saved.data) return;
          } while (pageToken);
          if (pageToken || Date.now() >= deadlineAt) break;
          after = id;
          currentWork = undefined;
          pageToken = undefined;
        }
        if (currentWork) break;
        if (works.length < 50) {
          complete = true;
          break;
        }
      }
      patch.health = patch.trigger_error
        ? "recovery_only"
        : (patch.trigger_id ?? sync.trigger_id)
          ? "active"
          : "recovery_only";
      patch.last_success_at = new Date().toISOString();
      patch.last_error = null;
    }
  } catch (error) {
    patch.health = "retry_pending";
    patch.last_error = String(error);
  } finally {
    patch.cursor = complete
      ? null
      : { after, work_id: currentWork, page_token: pageToken };
    patch.next_sync_at = new Date(
      Date.now() + (complete ? 15 * 60_000 : 60_000)
    ).toISOString();
    const result = await db.rpc("career_finish_mail_sync_v1", {
      p_user: job.userId,
      p_generation: job.generation,
      p_lease: lease,
      p_patch: patch,
    });
    databaseError(result.error);
  }
}

export async function recoverMailSync(admin: TalentAdminClient) {
  const db = resourceDb(admin),
    pending = await db.rpc("career_pending_mail_sync_v1", { p_limit: 50 });
  databaseError(pending.error);
  const cleanups = await db
    .from("talent_external_operations")
    .select("id,request")
    .eq("kind", "mail_trigger_cleanup")
    .eq("status", "reserved")
    .eq("request->>execution_environment", careerExecutionEnvironment())
    .order("updated_at")
    .limit(50);
  databaseError(cleanups.error);
  for (const cleanup of rows(cleanups.data)) {
    try {
      const request = record(cleanup.request);
      const active = await db
        .from("talent_integrations")
        .select("talent_id")
        .eq("provider", "gmail")
        .eq("status", "active")
        .eq("composio_connected_account_id", text(request.account_id))
        .maybeSingle();
      databaseError(active.error);
      // Composio upsert may reuse the trigger ID after reconnecting the same
      // account. The current generation's sync owns its enable/disable state.
      if (!active.data)
        await createComposioClient().disableTrigger(text(request.trigger_id));
      const saved = await db
        .from("talent_external_operations")
        .update({
          status: "completed",
          result: {
            checked_at: new Date().toISOString(),
            disposition: active.data
              ? "retained_for_current_connection"
              : "disabled",
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", cleanup.id);
      databaseError(saved.error);
    } catch (error) {
      await db
        .from("talent_external_operations")
        .update({
          result: { error: String(error) },
          updated_at: new Date().toISOString(),
        })
        .eq("id", cleanup.id);
    }
  }
  for (const integration of rows(pending.data))
    await publishMailSync(
      text(integration.talent_id),
      text(record(integration.career_mail_sync).generation)
    );
  const receipts = await recoverSentMailReceipts(admin);
  return {
    accounts: rows(pending.data).length,
    cleanups: rows(cleanups.data).length,
    receipts,
  };
}

/** Provider acceptance is durable before enrichment. Recovery reads only the
 * exact accepted identity; an unknown send is never guessed or retried. */
export async function recoverSentMailReceipts(admin: TalentAdminClient) {
  const pending = await resourceDb(admin)
    .from("talent_external_operations")
    .select("*")
    .eq("kind", "email_send")
    .eq("status", "succeeded")
    .eq("result->>receipt_enrichment", "pending")
    .or(
      `request->>execution_environment.eq.${careerExecutionEnvironment()},request->>execution_environment.is.null`
    )
    .order("updated_at")
    .limit(50);
  databaseError(pending.error);
  let verified = 0;
  for (const raw of rows(pending.data)) {
    const operation = operationSchema.parse(raw);
    if (
      !ownsCareerExecution(
        text(operation.request.execution_environment) || "production"
      )
    )
      continue;
    const context = { admin, userId: operation.user_id },
      account = text(operation.provider_refs.account_id),
      messageId = text(operation.provider_refs.message_id);
    if (!account || !messageId) continue;
    try {
      const message = await readEmailMessage(context, {
        kind: "email_message",
        id: `${account}/${messageId}`,
        revision: text(operation.provider_refs.account_generation) || undefined,
      });
      const mismatch =
        operation.provider_refs.requested_thread_id &&
        operation.provider_refs.requested_thread_id !== message.threadId;
      await updateOperation(context, operation, {
        provider_refs: {
          ...operation.provider_refs,
          thread_id: message.threadId,
          rfc_message_id: message.rfcMessageId,
          in_reply_to: message.inReplyTo,
          references: message.references,
        },
        result: {
          ...operation.result,
          receipt_enrichment: "verified",
          receipt_verified_at: new Date().toISOString(),
          ...(mismatch ? { thread_mismatch: true } : {}),
        },
      });
      verified++;
    } catch (error) {
      await updateOperation(context, operation, {
        result: {
          ...operation.result,
          receipt_enrichment_error: String(error),
        },
      }).catch(() => undefined);
    }
  }
  return { checked: rows(pending.data).length, verified };
}

export async function wakeMailSyncForUser(context: ResourceContext) {
  const integration = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  const generation = text(
    record(record(integration).career_mail_sync).generation
  );
  if (generation) await publishMailSync(context.userId, generation);
}
