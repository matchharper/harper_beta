import type { Database } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { JSDOM } from "jsdom";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  ComposioApiError,
  executeComposioGmailFetchEmails,
  executeComposioGmailFetchThread,
  getComposioAccountStatus,
  getComposioGmailReadAccess,
  getIntegrationErrorDiagnostics,
  getComposioConnectedAccount,
  isOwnedComposioGmailAccount,
} from "@/lib/integrations/composio";

export const TALENT_GMAIL_PROVIDER = "gmail";

export type TalentIntegrationRow =
  Database["public"]["Tables"]["talent_integrations"]["Row"];

export function gmailConnectionGeneration(integration: TalentIntegrationRow | null) {
  return (integration as (TalentIntegrationRow & { career_mail_sync?: { generation?: string } }) | null)?.career_mail_sync?.generation;
}

export function gmailConnectionVersion(integration: TalentIntegrationRow | null) {
  const generation = gmailConnectionGeneration(integration);
  return generation && integration ? `${generation}/${integration.status}` : "absent";
}

export type GmailIntegrationStatus =
  | "active"
  | "expired"
  | "disabled"
  | "not_connected";

export type GmailSearchResult = {
  status:
    | "ok"
    | "connection_required"
    | "permissions_required"
    | "connection_expired"
    | "temporarily_unavailable";
  mailboxGeneration?: string;
  emails: Array<{
    messageId: string;
    resourceRef?: {kind:"email_message";id:string;revision?:string};
    threadId: string | null;
    from: string | null;
    to: string | null;
    cc: string | null;
    subject: string | null;
    receivedAt: string | null;
    snippet: string | null;
    content?: string;
  }>;
  truncated: boolean;
  nextPageToken: string | null;
  assistantInstruction: string;
  modelOutput?: string;
};

export function formatGmailMessageForModel(email: GmailSearchResult["emails"][number] & { replyTo?: string | null }): string {
  return [
    email.resourceRef ? `Resource ref: ${JSON.stringify(email.resourceRef)}` : "",
    `Message ${email.messageId}${email.threadId ? `; thread ${email.threadId}` : ""}`,
    email.receivedAt ? `Received: ${formatLlmDateTime(email.receivedAt)}` : "",
    email.from ? `From: ${email.from}` : "",
    email.to ? `To: ${email.to}` : "",
    email.cc ? `Cc: ${email.cc}` : "",
    email.replyTo ? `Reply-To: ${email.replyTo}` : "",
    email.subject ? `Subject: ${email.subject}` : "",
    email.content ?? email.snippet ?? "No readable content returned.",
  ].filter(Boolean).join("\n");
}

export function formatGmailSearchResult(result: GmailSearchResult): string {
  return [
    `Gmail search: ${result.status}. Times: Asia/Seoul.`,
    result.assistantInstruction,
    ...result.emails.map(formatGmailMessageForModel),
    result.status === "ok" && !result.emails.length ? "No matching messages returned." : "",
    result.truncated ? "This is a partial result page." : "",
    `Next page token: ${result.nextPageToken ?? "none"}`,
  ].filter(Boolean).join("\n\n");
}
function withGmailProjection(result: GmailSearchResult): GmailSearchResult {
  return { ...result, modelOutput: formatGmailSearchResult(result) };
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const cleanText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.slice(0, maxLength);
};

const cleanEmailAddress = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
};

function gmailBodyText(value: unknown, format?: "text/plain" | "text/html") {
  if (typeof value !== "string") return null;
  // Flattened provider responses omit the MIME type. An address in angle
  // brackets is ordinary text, while an HTML start tag introduces markup.
  if (format === "text/plain" || (!format && !/<[a-z][\w:-]*(?:\s|\/?>)/i.test(value))) {
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() || null;
  }
  const fragment = JSDOM.fragment(value);
  fragment.querySelectorAll("script, style").forEach((node) => node.remove());
  for (const anchor of fragment.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href")!;
    const label = anchor.textContent?.trim();
    anchor.replaceWith(label && label !== href ? `${label} (${href})` : href);
  }
  for (const element of fragment.querySelectorAll("br, p, div, li, h1, h2, h3, h4, h5, h6, blockquote")) {
    element.before(" ");
    element.after(" ");
  }
  return fragment.textContent
    ?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

const findHeader = (message: Record<string, unknown>, headerName: string) => {
  const payload = asRecord(message.payload);
  const headers = Array.isArray(message.headers)
    ? message.headers
    : Array.isArray(payload?.headers)
      ? payload.headers
      : [];
  const match = headers.find((header) => {
    const record = asRecord(header);
    return (
      typeof record?.name === "string" &&
      record.name.toLowerCase() === headerName.toLowerCase()
    );
  });
  return ["from", "to", "cc"].includes(headerName.toLowerCase())
    ? cleanEmailAddress(asRecord(match)?.value, 500)
    : cleanText(asRecord(match)?.value, 500);
};

const cleanAddressList = (value: unknown, maxLength: number) => {
  if (Array.isArray(value)) {
    return cleanEmailAddress(
      value
        .filter((item): item is string => typeof item === "string")
        .join(", "),
      maxLength
    );
  }
  return cleanEmailAddress(value, maxLength);
};

const normalizeReceivedAt = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000)
    : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? cleanText(String(value), 120)
    : date.toISOString();
};

function findMessagePayload(response: unknown) {
  const root = asRecord(response);
  const data = asRecord(root?.data);
  const firstResult = Array.isArray(data?.results)
    ? asRecord(data.results[0])
    : null;
  const firstResponse = asRecord(firstResult?.response);
  const candidates = [
    data,
    asRecord(data?.thread),
    asRecord(root?.thread),
    asRecord(data?.data),
    asRecord(data?.response),
    asRecord(firstResponse?.data),
    asRecord(firstResponse?.data_preview),
    asRecord(firstResult?.data),
    asRecord(firstResult?.data_preview),
  ];

  return (
    candidates.find((candidate) => Array.isArray(candidate?.messages)) ??
    data ??
    root
  );
}

function readGmailMimeBody(value: unknown): string | null {
  const part = asRecord(value);
  if (!part || part.filename) return null;
  const body = asRecord(part.body);
  if (typeof body?.data === "string" && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
    const decoded = Buffer.from(body.data, "base64url").toString("utf8");
    return gmailBodyText(decoded, part.mimeType);
  }
  const parts = Array.isArray(part.parts) ? part.parts : [];
  if (part.mimeType === "multipart/alternative") {
    const plain = parts.find(item => asRecord(item)?.mimeType === "text/plain");
    const plainText = readGmailMimeBody(plain);
    if (plainText) return plainText;
  }
  return parts.map(readGmailMimeBody).filter(Boolean).join("\n") || null;
}

export function normalizeGmailSearchResponse(args: {
  includeContent: boolean;
  maxResults: number;
  response: unknown;
}): Pick<GmailSearchResult, "emails" | "nextPageToken" | "truncated"> {
  const payload = findMessagePayload(args.response);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const emails = messages
    .slice(0, args.maxResults)
    .map((message) => asRecord(message))
    .filter((message): message is Record<string, unknown> => Boolean(message))
    .map((message) => {
      const messageId = cleanText(message.messageId ?? message.id, 300);
      if (!messageId) return null;

      const preview = asRecord(message.preview);
      const content = args.includeContent
        ? readGmailMimeBody(message.payload) ?? gmailBodyText(
            [message.messageText, message.text, message.body, message.content, preview?.body]
              .find(value => typeof value === "string" && value.length > 0)
          )
        : null;

      return {
        messageId,
        threadId: cleanText(message.threadId ?? message.thread_id, 300),
        from:
          cleanAddressList(message.sender ?? message.from, 500) ??
          findHeader(message, "from"),
        to: cleanAddressList(message.to, 1_000) ?? findHeader(message, "to"),
        cc: cleanAddressList(message.cc, 1_000) ?? findHeader(message, "cc"),
        subject:
          cleanText(message.subject, 500) ?? findHeader(message, "subject"),
        receivedAt: normalizeReceivedAt(
          message.messageTimestamp ??
            message.internalDate ??
            message.receivedAt ??
            message.date
        ),
        snippet: cleanText(
          message.snippet ?? preview?.body ?? message.data_preview,
          800
        ),
        ...(content ? { content } : {}),
      };
    })
    .filter(
      (message): message is NonNullable<typeof message> => message !== null
    );
  const nextPageToken = cleanText(
    payload?.nextPageToken ?? payload?.next_page_token,
    500
  );

  return {
    emails,
    nextPageToken,
    truncated: Boolean(nextPageToken) || messages.length > args.maxResults,
  };
}

export async function fetchTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_integrations")
    .select("*")
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to read Gmail integration");
  }
  return data;
}

export async function fetchActiveTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_integrations")
    .select("*")
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to read Gmail integration");
  }
  return data;
}

export async function updateTalentGmailIntegrationStatus(args: {
  admin: TalentAdminClient;
  status: Exclude<GmailIntegrationStatus, "not_connected">;
  talentId: string;
  expectedAccountId?: string;
  expectedGeneration?: string;
}) {
  let query = args.admin
    .from("talent_integrations")
    .update({
      status: args.status,
      updated_at: new Date().toISOString(),
    })
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER);
  if (args.expectedAccountId) query = query.eq("composio_connected_account_id", args.expectedAccountId);
  if (args.expectedGeneration) query = query.eq("career_mail_sync->>generation", args.expectedGeneration);
  const { data, error } = await query.select("talent_id").maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to update Gmail integration");
  }
  return Boolean(data);
}

export async function deleteTalentGmailIntegration(args: {
  admin: TalentAdminClient;
  talentId: string;
  expectedAccountId?: string;
  expectedGeneration?: string;
}) {
  let query = args.admin
    .from("talent_integrations")
    .delete()
    .eq("talent_id", args.talentId)
    .eq("provider", TALENT_GMAIL_PROVIDER);
  if (args.expectedAccountId) query = query.eq("composio_connected_account_id", args.expectedAccountId);
  if (args.expectedGeneration) query = query.eq("career_mail_sync->>generation", args.expectedGeneration);
  const { data, error } = await query.select("talent_id").maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to delete Gmail integration");
  }
  return Boolean(data);
}

const unavailableResult = (
  status: Exclude<GmailSearchResult["status"], "ok">,
  assistantInstruction: string
): GmailSearchResult => withGmailProjection({
  assistantInstruction,
  emails: [],
  nextPageToken: null,
  status,
  truncated: false,
});

async function markAccountUnavailable(args: {
  accountStatus: string;
  admin: TalentAdminClient;
  talentId: string;
  expectedAccountId: string;
  expectedGeneration?: string;
}) {
  if (args.accountStatus === "EXPIRED") {
    await updateTalentGmailIntegrationStatus({
      ...args,
      status: "expired",
    });
    return unavailableResult(
      "connection_expired",
      "Gmail access expired; no inbox messages were read. Reconnection UI: [[integration:gmail-read]]."
    );
  }

  await updateTalentGmailIntegrationStatus({
    ...args,
    status: "disabled",
  });
  return unavailableResult(
    "connection_required",
    "Gmail is unavailable; no inbox messages were read. Connection UI: [[integration:gmail-read]]."
  );
}

export async function executeConnectedGmailSearch(args: {
  admin: TalentAdminClient;
  expectedGeneration?: string;
  includeContent: boolean;
  maxResults: number;
  pageToken?: string;
  query: string;
  threadId?: string;
  talentId: string;
}): Promise<GmailSearchResult> {
  const integration = await fetchActiveTalentGmailIntegration({
    admin: args.admin,
    talentId: args.talentId,
  });
  if (!integration) {
    return unavailableResult(
      "connection_required",
      "Gmail is not connected; no inbox messages were read. Connection UI: [[integration:gmail-read]]."
    );
  }
  const generation = gmailConnectionGeneration(integration);
  if (args.expectedGeneration && generation !== args.expectedGeneration) {
    return unavailableResult("connection_required", "The Gmail connection changed. This invocation did not read the replacement inbox.");
  }

  const connection = {
    admin: args.admin, talentId: args.talentId,
    expectedAccountId: integration.composio_connected_account_id, expectedGeneration: generation,
  };
  let account;
  try {
    account = await getComposioConnectedAccount(
      integration.composio_connected_account_id
    );
  } catch (error) {
    if (error instanceof ComposioApiError && error.status === 404) {
      await updateTalentGmailIntegrationStatus({ ...connection, status: "disabled" });
      return unavailableResult(
        "connection_required",
        "Gmail is no longer connected; no inbox messages were read. Reconnection UI: [[integration:gmail-read]]."
      );
    }
    return unavailableResult(
      "temporarily_unavailable",
      "Explain that Gmail could not be reached temporarily and suggest trying again. Do not claim that the inbox was checked or that the connection expired."
    );
  }

  if (!isOwnedComposioGmailAccount(account, args.talentId)) {
    await updateTalentGmailIntegrationStatus({ ...connection, status: "disabled" });
    return unavailableResult(
      "connection_required",
      "Gmail is unavailable for this user; no inbox messages were read. Reconnection UI: [[integration:gmail-read]]."
    );
  }

  const accountStatus = getComposioAccountStatus(account);
  if (accountStatus !== "ACTIVE") {
    return markAccountUnavailable({ ...connection, accountStatus });
  }

  const access = getComposioGmailReadAccess(account);
  if (access === "missing") {
    return unavailableResult(
      "permissions_required",
      "Gmail is connected without permission to read mail; no emails were read. Permission connection UI: [[integration:gmail-read]]."
    );
  }
  if (access === "unknown") {
    return unavailableResult(
      "temporarily_unavailable",
      "Gmail permissions could not be verified. The user can try again later. No emails were read."
    );
  }

  try {
    const response = args.threadId ? await executeComposioGmailFetchThread({
      connectedAccountId: integration.composio_connected_account_id, userId: args.talentId, threadId: args.threadId,
    }) : await executeComposioGmailFetchEmails({
      arguments: {
        include_payload: args.includeContent,
        max_results: args.maxResults,
        ...(args.pageToken ? { page_token: args.pageToken } : {}),
        query: args.query,
        user_id: "me",
      },
      connectedAccountId: integration.composio_connected_account_id,
      userId: args.talentId,
    });
    const currentIntegration = await fetchActiveTalentGmailIntegration({
      admin: args.admin,
      talentId: args.talentId,
    });
    if (
      !currentIntegration ||
      gmailConnectionGeneration(currentIntegration) !== generation ||
      currentIntegration.composio_connected_account_id !==
        integration.composio_connected_account_id
    ) {
      return unavailableResult(
        "connection_required",
        "Explain that Gmail was disconnected before the inbox check completed. Do not use or mention any email data from this attempt."
      );
    }
    const normalized = normalizeGmailSearchResponse({
      includeContent: args.threadId ? true : args.includeContent,
      maxResults: args.threadId ? Number.MAX_SAFE_INTEGER : args.maxResults,
      response,
    });
    return withGmailProjection({
      ...normalized,
      mailboxGeneration: generation ?? undefined,
      emails: normalized.emails.map(email => ({
        ...email,
        resourceRef: { kind: "email_message" as const, id: `${integration.composio_connected_account_id}/${email.messageId}`, ...(generation ? { revision: generation } : {}) },
      })),
      assistantInstruction:
        "Only the returned messages were retrieved by this search; other inbox contents were not checked.",
      status: "ok",
    });
  } catch (error) {
    console.warn(
      "[GmailSearch] fetch failed",
      getIntegrationErrorDiagnostics(error)
    );
    if (error instanceof ComposioApiError) {
      try {
        const refreshedAccount = await getComposioConnectedAccount(
          integration.composio_connected_account_id
        );
        const refreshedStatus = getComposioAccountStatus(refreshedAccount);
        if (
          isOwnedComposioGmailAccount(refreshedAccount, args.talentId) &&
          refreshedStatus !== "ACTIVE"
        ) {
          return markAccountUnavailable({ ...connection, accountStatus: refreshedStatus });
        }
      } catch (refreshError) {
        if (
          refreshError instanceof ComposioApiError &&
          refreshError.status === 404
        ) {
          await updateTalentGmailIntegrationStatus({ ...connection, status: "disabled" });
          return unavailableResult(
            "connection_required",
            "Gmail is no longer connected; no inbox messages were read. Reconnection UI: [[integration:gmail-read]]."
          );
        }
        // A failed status refresh must not turn a transient vendor failure into
        // a false expired-connection diagnosis.
      }
    }
    return unavailableResult(
      "temporarily_unavailable",
      "Explain that Gmail could not be reached temporarily and suggest trying again. Do not claim that the inbox was checked or that the connection expired."
    );
  }
}
