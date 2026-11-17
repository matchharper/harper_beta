import {
  createComposioClient,
  getComposioConnectedAccount,
  getComposioAccountStatus,
  getComposioGmailReadAccess,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";
import { fetchActiveTalentGmailIntegration } from "@/lib/integrations/gmail";
import {
  record,
  text,
  ResourceError,
  type ResourceContext,
} from "../resources/types";
import { GMAIL_REPLY_ADAPTER_VERSION, normalizeExactMessage } from "./message";

export async function ownedGmailConnection(
  context: ResourceContext,
  expectedAccount?: string,
  expectedGeneration?: string
) {
  const integration = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  const accountId = integration?.composio_connected_account_id;
  const generation = text(
    record(record(integration).career_mail_sync).generation
  );
  if (
    !accountId ||
    (expectedAccount && accountId !== expectedAccount) ||
    (expectedGeneration && generation !== expectedGeneration)
  )
    throw new ResourceError("Current Gmail connection unavailable.", 404);
  const account = await getComposioConnectedAccount(accountId);
  if (
    !isOwnedComposioGmailAccount(account, context.userId) ||
    getComposioAccountStatus(account) !== "ACTIVE" ||
    getComposioGmailReadAccess(account) !== "granted"
  )
    throw new ResourceError("Gmail read permission unavailable.", 404);
  return { accountId, generation, integration };
}

export function normalizeThreadPage(response: unknown, threadId: string) {
  const root = record(response),
    data = record(root.data ?? root),
    thread = record(data.thread ?? data);
  if (!Array.isArray(thread.messages))
    throw new Error("Gmail returned no thread message page.");
  const messages = thread.messages.map((raw) => normalizeExactMessage(raw));
  if (messages.some((message) => message.threadId !== threadId))
    throw new Error("Gmail returned a different thread.");
  return {
    messages,
    nextPageToken:
      text(
        thread.nextPageToken ??
          thread.next_page_token ??
          data.nextPageToken ??
          data.next_page_token
      ) || null,
  };
}

export async function readOwnedThreadPage(
  context: ResourceContext,
  input: {
    accountId: string;
    generation: string;
    threadId: string;
    pageToken?: string;
  }
) {
  await ownedGmailConnection(context, input.accountId, input.generation);
  const response = await createComposioClient().executeTool({
    accountId: input.accountId,
    userId: context.userId,
    slug: "GMAIL_FETCH_THREAD",
    version: GMAIL_REPLY_ADAPTER_VERSION,
    arguments: {
      user_id: "me",
      thread_id: input.threadId,
      ...(input.pageToken ? { page_token: input.pageToken } : {}),
    },
  });
  const page = normalizeThreadPage(response, input.threadId);
  const current = await fetchActiveTalentGmailIntegration({
    admin: context.admin,
    talentId: context.userId,
  });
  if (
    current?.composio_connected_account_id !== input.accountId ||
    text(record(record(current).career_mail_sync).generation) !==
      input.generation
  )
    throw new ResourceError("Gmail connection changed during read.", 409);
  return page;
}

/** The provider does not promise thread order. Preserve exact identities and sort
 * by provider timestamps only after every page has been fetched. */
export async function readOwnedThread(
  context: ResourceContext,
  input: { accountId: string; generation: string; threadId: string },
  deadlineAt = Date.now() + 120_000
) {
  const messages = new Map<string, ReturnType<typeof normalizeExactMessage>>(),
    seen = new Set<string>();
  let pageToken: string | undefined;
  do {
    if (Date.now() >= deadlineAt)
      throw new Error(
        "Thread read incomplete; fetch remaining pages before acting."
      );
    const page = await readOwnedThreadPage(context, { ...input, pageToken });
    for (const message of page.messages)
      messages.set(message.messageId, message);
    pageToken = page.nextPageToken ?? undefined;
    if (pageToken && seen.has(pageToken))
      throw new Error("Gmail repeated a thread cursor.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  const complete = [...messages.values()];
  if (
    complete.length > 1 &&
    complete.some(
      (message) =>
        !message.receivedAt || !Number.isFinite(Date.parse(message.receivedAt))
    )
  )
    throw new Error(
      "Gmail message timestamps are incomplete; latest correspondence is not established."
    );
  return complete.sort(
    (a, b) =>
      Date.parse(a.receivedAt ?? "") - Date.parse(b.receivedAt ?? "") ||
      a.messageId.localeCompare(b.messageId)
  );
}
