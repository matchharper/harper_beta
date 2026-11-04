import { CareerEffectWaiting, reserveWorkEffect, readBoundEffect, bindWorkEffect } from "../externalOperations/effects";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  createComposioClient,
  COMPOSIO_GMAIL_WRITE_TOOL_VERSION,
  getComposioAccountStatus,
  getComposioConnectedAccount,
  getComposioGmailWriteAccess,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import {
  attachmentRefSchema,
  prepareAttachments,
} from "../externalOperations/attachments";
import {
  createOperation,
  updateOperation,
  assertExternalToolActive,
  type ExternalToolContext,
  type ExternalOperation,
} from "../externalOperations/store";
export const WRITE_EMAIL_TOOL = {
  name: "write_email",
  description:
    TOOL_DESCRIPTIONS.write_email,
  parameters: {
    type: "object",
    properties: {
      effect_key: { type: "string", description: "Stable effect identity within delegated work. Reuse the same key if this is an alternative to a browser submission." },
      to: { type: "array", items: { type: "string" } },
      cc: { type: "array", items: { type: "string" } },
      bcc: { type: "array", items: { type: "string" } },
      subject: { type: "string" },
      body: { type: "string" },
      is_html: { type: "boolean" },
      documents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            document_id: { type: "string" },
            revision: { type: "integer" },
            snapshot_id: { type: "string", description: "Exact pinned file from the reviewed form; preserves its bytes after source edits." },
          },
          required: ["document_id"],
          additionalProperties: false,
        },
      },
    },
    required: ["to", "subject", "body"],
    additionalProperties: false,
  },
};
export const emailInputSchema = z.object({
  effect_key: z.string().optional(),
  to: z.array(z.string()),
  cc: z.array(z.string()).default([]),
  bcc: z.array(z.string()).default([]),
  subject: z.string(),
  body: z.string(),
  is_html: z.boolean().optional(),
  documents: z.array(attachmentRefSchema).optional(),
}).strict();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value : undefined);
export function formatEmailToolResult(result: {
  status: string;
  operation?: ExternalOperation;
  reason?: string;
}) {
  const op = result.operation;
  return [
    `Gmail: ${result.status}`,
    result.reason,
    op && typeof op.result.summary === "string" ? op.result.summary : "",
  ]
    .filter(Boolean)
    .join("\n");
}
export async function getGmailWritingConnection(
  context: Pick<ExternalToolContext, "admin" | "userId">
) {
  const integration = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  if (!integration?.composio_connected_account_id)
    return { status: "connection_required" as const };
  const account = await getComposioConnectedAccount(
    integration.composio_connected_account_id
  );
  if (
    !isOwnedComposioGmailAccount(account, context.userId) ||
    getComposioAccountStatus(account) !== "ACTIVE"
  )
    return { status: "connection_required" as const };
  const access = getComposioGmailWriteAccess(account, "send");
  if (access !== "granted")
    return {
      status:
        access === "missing"
          ? ("permissions_required" as const)
          : ("permissions_unknown" as const),
    };
  return {
    status: "ready" as const,
    accountId: integration.composio_connected_account_id,
  };
}
export async function executeWriteEmail(
  raw: unknown,
  context: ExternalToolContext
) {
  const input = emailInputSchema.parse(raw);
  const effect = await reserveWorkEffect(context, input.effect_key, input);
  const bound = await readBoundEffect(context, effect);
  if (bound) return { operation: bound, status: bound.status, modelOutput: `This effect already belongs to ${bound.kind} ${bound.id}; status ${bound.status}. Read that receipt before further action.` };
  const connection = await getGmailWritingConnection(context);
  if (connection.status !== "ready") {
    const result = {
      status: connection.status,
      reason:
        "Gmail connection with send permission is required.",
    };
    return { ...result, modelOutput: formatEmailToolResult(result) };
  }
  const provider = createComposioClient();
  const execute = (slug: string, args: Record<string, unknown>) =>
    provider.executeTool<Record<string, unknown>>({
      accountId: connection.accountId,
      arguments: args,
      slug,
      userId: context.userId,
      version: COMPOSIO_GMAIL_WRITE_TOOL_VERSION,
    });
  if (!(input.to.length + input.cc.length + input.bcc.length))
    throw new Error("At least one recipient is required by Gmail");
  const files = await prepareAttachments(context, input.documents ?? []);
  const snapshot = {
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    is_html: input.is_html ?? false,
    documents: files.map(({ bytes, ...file }) => file),
  };
  const sendKey = createHash("sha256")
    .update(
      JSON.stringify({
        account: connection.accountId,
        snapshot,
        conversation: context.conversationId,
        // Scope retries to the originating turn without asking the model for IDs.
        source: context.userMessageId ?? context.requestId,
      })
    )
    .digest("hex");
  let operation = await createOperation(context, {
    kind: "email_send",
    idempotencyKey: `send:${sendKey}`,
    request: { action: "send", snapshot },
  });
  if (operation.status !== "reserved") {
    const result = { status: operation.status, operation };
    return { ...result, modelOutput: formatEmailToolResult(result) };
  }
  operation = await updateOperation(context, operation, {
    status: "preparing",
    provider_refs: { account_id: connection.accountId },
  });
  try {
    const slug = "GMAIL_SEND_EMAIL";
    const attachments = [];
    for (const file of files)
      attachments.push(
        await provider.uploadGmailFile({
          name: file.name,
          mimeType: file.mimeType,
          bytes: file.bytes,
          toolSlug: slug,
        })
      );
    const current = await getGmailWritingConnection(context);
    if (
      current.status !== "ready" ||
      current.accountId !== connection.accountId
    )
      throw new Error("Gmail connection changed before dispatch");
    await assertExternalToolActive(context);
    await bindWorkEffect(context, effect, operation);
    operation = await updateOperation(context, operation, {
      status: "dispatching",
    });
    const response = await execute(slug, {
      user_id: "me",
      ...(input.to[0]
        ? { recipient_email: input.to[0], extra_recipients: input.to.slice(1) }
        : {}),
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      body: input.body,
      is_html: input.is_html ?? false,
      include_signature: false,
      ...(attachments.length ? { attachment: attachments } : {}),
    });
    const payload = record(response.data ?? response);
    const id = str(payload.id) ?? str(payload.message_id);
    if (!id) throw new Error("Gmail did not return the operation identifier");
    operation = await updateOperation(context, operation, {
      status: "succeeded",
      provider_refs: {
        account_id: connection.accountId,
        message_id: id,
      },
      result: {
        summary:
          "Gmail accepted the email for sending.",
      },
    });
  } catch (error) {
    if (error instanceof CareerEffectWaiting) {
      await updateOperation(context, operation, { status: "reserved" });
      throw error;
    }
    operation = await updateOperation(context, operation, {
      status: operation.status === "dispatching" ? "uncertain" : "failed",
      result: {
        summary:
          operation.status === "dispatching"
            ? "The Gmail send outcome is unknown; the email may already have been sent."
            : "Preparation failed before the email was sent to Gmail.",
      },
    });
  }
  const result = { status: operation.status, operation };
  return { ...result, modelOutput: formatEmailToolResult(result) };
}
