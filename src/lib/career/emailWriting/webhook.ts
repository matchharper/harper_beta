import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  databaseError,
  record,
  resourceDb,
  text,
  type ResourceContext,
} from "../resources/types";
import { recordMailEvent } from "./sync";

/** Composio signs the exact raw body with the raw secret, not a decoded
 * Standard Webhooks secret. See its subscribing-to-events contract. */
export function verifyComposioWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now = Date.now()
) {
  const id = headers.get("webhook-id"),
    timestamp = headers.get("webhook-timestamp"),
    signatures = headers.get("webhook-signature");
  if (
    !id ||
    !timestamp ||
    !signatures ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest();
  return signatures.split(/\s+/).some((signature) => {
    const candidate = Buffer.from(signature.replace(/^v1,/, ""), "base64");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(expected, candidate)
    );
  });
}
const envelopeSchema = z.object({
  type: z.literal("composio.trigger.message"),
  metadata: z.object({
    trigger_slug: z.string(),
    trigger_id: z.string(),
    connected_account_id: z.string(),
  }),
  data: z.record(z.unknown()),
});

export async function acceptGmailWebhook(
  admin: ResourceContext["admin"],
  raw: unknown
) {
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return { ignored: true };
  const { metadata, data } = parsed.data;
  if (metadata.trigger_slug !== "GMAIL_NEW_GMAIL_MESSAGE")
    return { ignored: true };
  const result = await resourceDb(admin)
    .from("talent_integrations")
    .select("talent_id,career_mail_sync")
    .eq("provider", "gmail")
    .eq("status", "active")
    .eq("composio_connected_account_id", metadata.connected_account_id)
    .eq("career_mail_sync->>trigger_id", metadata.trigger_id)
    .maybeSingle();
  databaseError(result.error);
  if (!result.data) return { ignored: true };
  const labels = data.label_ids ?? data.labelIds;
  if (
    Array.isArray(labels) &&
    labels.some((label) => label === "SENT" || label === "DRAFT")
  )
    return { ignored: true };
  const messageId = text(data.message_id ?? data.id),
    threadId = text(data.thread_id ?? data.threadId);
  if (!messageId || !threadId)
    throw new Error("Gmail webhook is missing a message or thread identity.");
  return recordMailEvent(
    { admin, userId: result.data.talent_id },
    {
      accountId: metadata.connected_account_id,
      generation: text(record(result.data.career_mail_sync).generation),
      messageId,
      threadId,
      triggerId: metadata.trigger_id,
    }
  );
}
