import { JWT, OAuth2Client } from "google-auth-library";
import { htmlToPlainText, normalizeEmailAddress } from "@/lib/email/parse";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];
/** Read-only access, for mailboxes the app only reads (the #5 agent's reply reader). */
export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Which Workspace mailbox a request acts as (the service account's domain-wide delegation impersonates it) and with
 * which scopes. Left out: the outreach mailbox (GTM_OUTREACH_GMAIL_USER) with the outreach scopes.
 */
export type GmailAccess = {
  mailbox: string;
  scopes?: readonly string[];
  /** Aborts the request (a caller's time budget). */
  signal?: AbortSignal;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  body?: { data?: string };
  headers?: GmailHeader[];
  mimeType?: string;
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
  threadId: string;
};

export type ParsedGmailMessage = {
  body: string;
  deliveryFailure: {
    diagnosticCode: string | null;
    finalRecipient: string | null;
    status: string | null;
  } | null;

  fromEmail: string | null;
  inReplyTo: string | null;
  messageId: string;
  receivedAt: string;
  references: string | null;
  rfcMessageId: string | null;
  subject: string;
  threadId: string;
  toEmail: string | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export class GmailPubSubAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailPubSubAuthenticationError";
  }
}

/** The service account whose domain-wide delegation reads and sends as Workspace mailboxes. */
export function getGmailServiceAccount() {
  return {
    privateKey: requiredEnv("GTM_OUTREACH_GMAIL_PRIVATE_KEY").replace(
      /\\n/g,
      "\n"
    ),
    serviceAccountEmail: requiredEnv(
      "GTM_OUTREACH_GMAIL_SERVICE_ACCOUNT_EMAIL"
    ),
  };
}

/** Whether the service account is configured (a server without it skips Gmail work). */
export function gmailServiceAccountConfigured() {
  return Boolean(
    process.env.GTM_OUTREACH_GMAIL_SERVICE_ACCOUNT_EMAIL?.trim() &&
      process.env.GTM_OUTREACH_GMAIL_PRIVATE_KEY?.trim()
  );
}

export function getGtmOutreachGmailConfig() {
  const mailbox = requiredEnv("GTM_OUTREACH_GMAIL_USER").toLowerCase();
  return {
    fromName:
      process.env.GTM_OUTREACH_GMAIL_FROM_NAME?.trim() ||
      "Harper Creator Partnerships",
    mailbox,
    fromEmail:
      process.env.GTM_OUTREACH_GMAIL_FROM_EMAIL?.trim().toLowerCase() ||
      mailbox,
    ...getGmailServiceAccount(),
  };
}

// One client per mailbox and scopes, so its access token is reused until it expires (a new JWT would fetch a new
// token for every request).
const gmailAuthClients = new Map<string, JWT>();

function createGmailAuth(access?: GmailAccess) {
  const account = getGmailServiceAccount();
  const subject = (
    access?.mailbox ?? getGtmOutreachGmailConfig().mailbox
  ).toLowerCase();
  const scopes = [...(access?.scopes ?? GMAIL_SCOPES)];
  const key = [account.serviceAccountEmail, subject, ...scopes].join("|");
  let auth = gmailAuthClients.get(key);
  if (!auth) {
    auth = new JWT({
      email: account.serviceAccountEmail,
      key: account.privateKey,
      scopes,
      subject,
    });
    gmailAuthClients.set(key, auth);
  }
  return auth;
}

async function gmailRequest<T>(
  path: string,
  init: RequestInit = {},
  access?: GmailAccess
): Promise<T> {
  const auth = createGmailAuth(access);
  const authHeaders = await auth.getRequestHeaders();
  const headers = new Headers(init.headers);
  const authorization = authHeaders.get("authorization");
  if (!authorization) throw new Error("Failed to authorize Gmail request");
  headers.set("Authorization", authorization);
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? access?.signal,
  });
  const raw = await response.text().catch(() => "");
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  if (!response.ok) {
    throw new Error(
      `Gmail API ${response.status}: ${JSON.stringify(data).slice(0, 1500)}`
    );
  }
  return data as T;
}

export function isGmailNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Gmail API 404:/i.test(message);
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  const clean = cleanHeader(value);
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function buildGmailRawMessage(args: {
  body: string;
  from: string;
  fromName?: string;
  messageId: string;
  subject: string;
  to: string;
}) {
  const fromHeader = args.fromName
    ? `${encodeHeader(args.fromName)} <${cleanHeader(args.from)}>`
    : cleanHeader(args.from);
  const mime = [
    `From: ${fromHeader}`,
    `To: ${cleanHeader(args.to)}`,
    `Reply-To: ${cleanHeader(args.from)}`,
    `Subject: ${encodeHeader(args.subject)}`,
    `Message-ID: ${cleanHeader(args.messageId)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(Buffer.from(args.body, "utf8").toString("base64")),
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export async function sendGtmOutreachEmail(args: {
  body: string;
  from: string;
  messageId: string;
  subject: string;
  to: string;
}) {
  const config = getGtmOutreachGmailConfig();
  const configuredMailbox = config.fromEmail;
  if (args.from.trim().toLowerCase() !== configuredMailbox) {
    throw new Error(
      `Approved sender ${args.from} does not match configured Gmail mailbox ${configuredMailbox}`
    );
  }
  return gmailRequest<{ id: string; labelIds?: string[]; threadId: string }>(
    "/messages/send",
    {
      method: "POST",
      body: JSON.stringify({
        raw: buildGmailRawMessage({
          ...args,
          fromName: config.fromName,
        }),
      }),
    }
  );
}

export async function findGmailMessageByRfcId(rfcMessageId: string) {
  const searchableId = rfcMessageId.trim().replace(/^<|>$/g, "");
  const query = encodeURIComponent(`rfc822msgid:${searchableId}`);
  const result = await gmailRequest<{
    messages?: Array<{ id: string; threadId: string }>;
  }>(`/messages?q=${query}&maxResults=1`);
  return result.messages?.[0] ?? null;
}

/** format "metadata": the headers and labels only (no body). */
export async function getGmailMessage(
  messageId: string,
  access?: GmailAccess,
  format: "full" | "metadata" = "full"
) {
  return gmailRequest<GmailMessage>(
    `/messages/${encodeURIComponent(messageId)}?format=${format}`,
    {},
    access
  );
}

export async function getGmailHistoryId(access?: GmailAccess) {
  return (await gmailRequest<{ historyId: string }>("/profile", {}, access))
    .historyId;
}

export async function startGmailWatch(topicName: string) {
  return gmailRequest<{ expiration: string; historyId: string }>("/watch", {
    method: "POST",
    body: JSON.stringify({
      labelFilterBehavior: "include",
      labelIds: ["INBOX"],
      topicName,
    }),
  });
}

export async function listGmailHistory(
  startHistoryId: string,
  access?: GmailAccess
) {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;
  do {
    const params = new URLSearchParams({
      historyTypes: "messageAdded",
      maxResults: "500",
      startHistoryId,
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await gmailRequest<{
      history?: Array<{
        messagesAdded?: Array<{ message?: { id?: string } }>;
      }>;
      historyId?: string;
      nextPageToken?: string;
    }>(`/history?${params.toString()}`, {}, access);
    for (const history of result.history ?? []) {
      for (const added of history.messagesAdded ?? []) {
        if (added.message?.id) messageIds.add(added.message.id);
      }
    }
    latestHistoryId = result.historyId ?? latestHistoryId;
    pageToken = result.nextPageToken;
  } while (pageToken);
  return { latestHistoryId, messageIds: [...messageIds] };
}

/**
 * INBOX message ids, newest first; `limit`: stop after this many. `label`: another label (e.g. "SENT"), or null for
 * any mail the query finds (spam and trash left out, as Gmail does).
 */
export async function listInboxMessageIds(
  query?: string,
  access?: GmailAccess,
  limit = Infinity,
  label: string | null = "INBOX"
) {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;
  do {
    const params = buildInboxListParams(query, pageToken, label);
    const result = await gmailRequest<{
      messages?: Array<{ id?: string }>;
      nextPageToken?: string;
    }>(`/messages?${params.toString()}`, {}, access);
    for (const message of result.messages ?? []) {
      if (message.id && messageIds.size < limit) messageIds.add(message.id);
    }
    pageToken = messageIds.size < limit ? result.nextPageToken : undefined;
  } while (pageToken);
  return [...messageIds];
}

export function buildInboxListParams(
  query?: string,
  pageToken?: string,
  label: string | null = "INBOX"
) {
  const params = new URLSearchParams({ maxResults: "500" });
  if (label) params.set("labelIds", label);
  if (query) params.set("q", query);
  if (pageToken) params.set("pageToken", pageToken);
  return params;
}

/** A message's top-level headers by name (the first value of each), e.g. for automated-mail checks. */
export function getGmailHeaders(message: GmailMessage) {
  const headers: Record<string, string> = {};
  for (const header of message.payload?.headers ?? []) {
    if (header.name && !(header.name in headers)) {
      headers[header.name] = cleanHeader(header.value ?? "");
    }
  }
  return headers;
}

function getHeader(payload: GmailPart | undefined, name: string) {
  const wanted = name.toLowerCase();
  const header = payload?.headers?.find(
    (item) => item.name?.toLowerCase() === wanted
  );
  return cleanHeader(header?.value ?? "") || null;
}

function decodeGmailData(value: string | undefined) {
  if (!value) return "";
  return Buffer.from(value, "base64url").toString("utf8");
}

function collectBodyParts(part: GmailPart | undefined, target: string[]) {
  if (!part) return;
  if (part.mimeType === "text/plain" && part.body?.data) {
    target.unshift(decodeGmailData(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data) {
    target.push(htmlToPlainText(decodeGmailData(part.body.data)));
  }
  for (const child of part.parts ?? []) collectBodyParts(child, target);
}

function collectDeliveryStatusParts(
  part: GmailPart | undefined,
  target: string[]
) {
  if (!part) return false;
  const contentType = getHeader(part, "Content-Type")?.toLowerCase() ?? "";
  const isDeliveryStatus =
    part.mimeType?.toLowerCase() === "message/delivery-status" ||
    contentType.includes("message/delivery-status");
  if (isDeliveryStatus && part.body?.data) {
    target.push(decodeGmailData(part.body.data));
  }
  let found = isDeliveryStatus;
  for (const child of part.parts ?? []) {
    found = collectDeliveryStatusParts(child, target) || found;
  }
  return found;
}

function parseDeliveryStatus(value: string) {
  const unfolded = value.replace(/\r?\n[ \t]+/g, " ");
  const field = (name: string) =>
    unfolded
      .split(/\r?\n/)
      .find((line) => line.toLowerCase().startsWith(`${name.toLowerCase()}:`))
      ?.slice(name.length + 1)
      .trim() || null;
  const recipientField =
    field("Final-Recipient") ?? field("Original-Recipient");
  const recipientValue = recipientField?.includes(";")
    ? recipientField.slice(recipientField.indexOf(";") + 1)
    : recipientField;
  const statusField = field("Status");
  return {
    action: field("Action")?.toLowerCase() ?? null,
    diagnosticCode: field("Diagnostic-Code"),
    finalRecipient: normalizeEmailAddress(recipientValue ?? null),
    status: statusField?.match(/^[245]\.\d{1,3}\.\d{1,3}$/)?.[0] ?? null,
  };
}

export function parseGmailMessage(message: GmailMessage): ParsedGmailMessage {
  const parts: string[] = [];
  const deliveryStatusParts: string[] = [];
  collectBodyParts(message.payload, parts);
  const hasDeliveryStatus = collectDeliveryStatusParts(
    message.payload,
    deliveryStatusParts
  );
  if (parts.length === 0 && message.payload?.body?.data) {
    parts.push(decodeGmailData(message.payload.body.data));
  }
  const internalDate = Number(message.internalDate);
  const receivedAt = Number.isFinite(internalDate)
    ? new Date(internalDate).toISOString()
    : new Date().toISOString();
  const deliveryStatus = parseDeliveryStatus(deliveryStatusParts.join("\n"));
  const isDeliveryFailure =
    hasDeliveryStatus &&
    (deliveryStatus.action === "failed" ||
      deliveryStatus.action === "delayed" ||
      deliveryStatus.status?.startsWith("4.") ||
      deliveryStatus.status?.startsWith("5."));
  return {
    body:
      parts
        .find((part) => part.trim())
        ?.trim()
        .slice(0, 50_000) ?? "",
    deliveryFailure: isDeliveryFailure
      ? {
          diagnosticCode: deliveryStatus.diagnosticCode,
          finalRecipient: deliveryStatus.finalRecipient,
          status: deliveryStatus.status,
        }
      : null,
    fromEmail: normalizeEmailAddress(getHeader(message.payload, "From")),
    inReplyTo: getHeader(message.payload, "In-Reply-To"),
    messageId: message.id,
    receivedAt,
    references: getHeader(message.payload, "References"),
    rfcMessageId: getHeader(message.payload, "Message-ID"),
    subject: getHeader(message.payload, "Subject") ?? "",
    threadId: message.threadId,
    toEmail: normalizeEmailAddress(getHeader(message.payload, "To")),
  };
}

export async function verifyGmailPubSubToken(authorization: string | null) {
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) {
    throw new GmailPubSubAuthenticationError("Missing Pub/Sub identity token");
  }
  const audience = requiredEnv("GTM_OUTREACH_GMAIL_PUBSUB_AUDIENCE");
  const expectedEmail = requiredEnv(
    "GTM_OUTREACH_GMAIL_PUBSUB_SERVICE_ACCOUNT"
  ).toLowerCase();
  const ticket = await new OAuth2Client()
    .verifyIdToken({
      audience,
      idToken: token,
    })
    .catch(() => {
      throw new GmailPubSubAuthenticationError(
        "Invalid Pub/Sub identity token"
      );
    });
  const payload = ticket.getPayload();
  if (
    !payload?.email_verified ||
    payload.email?.toLowerCase() !== expectedEmail
  ) {
    throw new GmailPubSubAuthenticationError("Unexpected Pub/Sub caller");
  }
  return payload;
}
