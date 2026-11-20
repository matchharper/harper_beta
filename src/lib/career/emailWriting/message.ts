import {
  createComposioClient,
  getComposioConnectedAccount,
  getComposioAccountStatus,
  getComposioGmailReadAccess,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";
import {
  fetchActiveTalentGmailIntegration,
  normalizeGmailSearchResponse,
} from "@/lib/integrations/gmail";
import {
  record,
  text,
  resourceRefSchema,
  ResourceError,
  type ResourceContext,
} from "../resources/types";
export const GMAIL_REPLY_ADAPTER_VERSION = "20261105_00";
export const emailMessageRefSchema = resourceRefSchema.refine(
  (ref) => ref.kind === "email_message",
  "Expected an email_message reference."
);
export function gmailHeader(raw: Record<string, unknown>, name: string) {
  const headers = raw.headers ?? record(raw.payload).headers;
  const entry = (Array.isArray(headers) ? headers : [])
    .map(record)
    .find((header) => text(header.name).toLowerCase() === name.toLowerCase());
  return text(entry?.value) || null;
}
export function normalizeExactMessage(response: unknown) {
  const root = record(response),
    data = record(root.data ?? root),
    raw = record(data.message ?? data);
  const [message] = normalizeGmailSearchResponse({
    response: { messages: [raw] },
    includeContent: true,
    maxResults: 1,
  }).emails;
  if (!message) throw new Error("Gmail returned no readable message identity.");
  return {
    ...message,
    rfcMessageId: gmailHeader(raw, "message-id"),
    references: gmailHeader(raw, "references"),
    inReplyTo: gmailHeader(raw, "in-reply-to"),
    replyTo: gmailHeader(raw, "reply-to"),
    labelIds: (Array.isArray(raw.labelIds ?? raw.label_ids)
      ? (raw.labelIds ?? raw.label_ids)
      : []) as string[],
  };
}
export async function readEmailMessage(context: ResourceContext, raw: unknown) {
  const ref = emailMessageRefSchema.parse(raw),
    [accountId, messageId, ...extra] = ref.id.split("/");
  if (!accountId || !messageId || extra.length)
    throw new ResourceError("Email reference unavailable.", 404);
  const integration = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  if (integration?.composio_connected_account_id !== accountId)
    throw new ResourceError("Email account unavailable.", 404);
  const generation = text(
    record(record(integration).career_mail_sync).generation
  );
  if (ref.revision && ref.revision !== generation)
    throw new ResourceError("Email account generation changed.", 409);
  const account = await getComposioConnectedAccount(accountId);
  if (
    !isOwnedComposioGmailAccount(account, context.userId) ||
    getComposioAccountStatus(account) !== "ACTIVE" ||
    getComposioGmailReadAccess(account) !== "granted"
  )
    throw new ResourceError("Gmail read permission unavailable.", 404);
  const response = await createComposioClient().executeTool({
    accountId,
    userId: context.userId,
    slug: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
    version: GMAIL_REPLY_ADAPTER_VERSION,
    arguments: { message_id: messageId, user_id: "me", format: "full" },
  });
  const message = normalizeExactMessage(response);
  if (message.messageId !== messageId)
    throw new Error("Gmail returned a different message.");
  const current = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  if (
    current?.composio_connected_account_id !== accountId ||
    text(record(record(current).career_mail_sync).generation) !== generation
  )
    throw new ResourceError("Email connection changed during read.", 409);
  return {
    ...message,
    accountId,
    generation,
    ref: {
      kind: "email_message" as const,
      id: ref.id,
      ...(generation ? { revision: generation } : {}),
    },
  };
}
