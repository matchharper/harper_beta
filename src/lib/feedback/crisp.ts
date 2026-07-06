export const CRISP_FEEDBACK_SOURCE = "crisp-feedback";
export const CRISP_FEEDBACK_KIND = "harper-crisp-feedback";

export type CrispFeedbackRole = "user" | "admin" | "system";

export type CrispFeedbackMessage = {
  authorEmail?: string | null;
  authorName?: string | null;
  createdAt: string;
  deletedAt?: string | null;
  deletedBy?: CrispFeedbackRole | null;
  id: string;
  role: CrispFeedbackRole;
  text: string;
};

export type CrispFeedbackPayload = {
  emailReplyAnsweredAt?: string | null;
  emailReplyAskedAt?: string | null;
  emailSendError?: string | null;
  emailSentAt?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  identityProvidedAt?: string | null;
  identityRequestedAt?: string | null;
  kind: typeof CRISP_FEEDBACK_KIND;
  lastRepliedAt?: string | null;
  lastSlackNotifiedAt?: string | null;
  locale?: string | null;
  messages: CrispFeedbackMessage[];
  pagePath: string;
  status: "open" | "replied";
  token: string;
  userEmail?: string | null;
  userId?: string | null;
  userName?: string | null;
  version: 1;
  wantsEmailReply?: boolean | null;
};

export type CrispFeedbackThread = {
  createdAt: string;
  emailReplyAnsweredAt?: string | null;
  emailReplyAskedAt?: string | null;
  emailSendError?: string | null;
  emailSentAt?: string | null;
  guestEmail?: string | null;
  guestName?: string | null;
  id: number;
  lastRepliedAt?: string | null;
  locale?: string | null;
  messages: CrispFeedbackMessage[];
  pagePath: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  status: "open" | "replied";
  userEmail?: string | null;
  userId?: string | null;
  userName?: string | null;
  wantsEmailReply?: boolean | null;
};

type FeedbackRow = {
  content: string | null;
  created_at: string;
  id: number;
  user_id?: string | null;
};

const MAX_MESSAGE_LENGTH = 5000;

export function normalizeCrispText(value: unknown, maxLength = MAX_MESSAGE_LENGTH) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

export function isValidCrispEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createCrispId(prefix: string) {
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${randomValue}`;
}

export function createCrispMessage(
  role: CrispFeedbackRole,
  text: string,
  author?: {
    email?: string | null;
    name?: string | null;
  }
): CrispFeedbackMessage {
  return {
    authorEmail: author?.email ?? null,
    authorName: author?.name ?? null,
    createdAt: new Date().toISOString(),
    id: createCrispId("msg"),
    role,
    text: normalizeCrispText(text),
  };
}

export function getRequesterFromPayload(payload: CrispFeedbackPayload) {
  const requesterName =
    normalizeCrispText(payload.userName, 120) ||
    normalizeCrispText(payload.guestName, 120) ||
    null;
  const requesterEmail =
    normalizeCrispText(payload.userEmail, 240) ||
    normalizeCrispText(payload.guestEmail, 240) ||
    null;

  return {
    email: requesterEmail,
    name: requesterName,
  };
}

export function getLatestCrispUserMessage(payload: CrispFeedbackPayload) {
  return [...payload.messages].reverse().find((message) => message.role === "user");
}

function normalizeMessage(value: unknown): CrispFeedbackMessage | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CrispFeedbackMessage>;
  const role =
    item.role === "admin" || item.role === "system" || item.role === "user"
      ? item.role
      : null;
  const text = normalizeCrispText(item.text);
  if (!role || !text) return null;

  return {
    authorEmail: item.authorEmail ? normalizeCrispText(item.authorEmail, 240) : null,
    authorName: item.authorName ? normalizeCrispText(item.authorName, 120) : null,
    createdAt:
      typeof item.createdAt === "string" && item.createdAt
        ? item.createdAt
        : new Date().toISOString(),
    deletedAt:
      typeof item.deletedAt === "string" && item.deletedAt
        ? item.deletedAt
        : null,
    deletedBy:
      item.deletedBy === "admin" ||
      item.deletedBy === "system" ||
      item.deletedBy === "user"
        ? item.deletedBy
        : null,
    id: typeof item.id === "string" && item.id ? item.id : createCrispId("msg"),
    role,
    text,
  };
}

export function parseCrispFeedbackContent(content: string | null) {
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as Partial<CrispFeedbackPayload>;
    if (parsed.kind !== CRISP_FEEDBACK_KIND || parsed.version !== 1) {
      return null;
    }

    const messages = Array.isArray(parsed.messages)
      ? parsed.messages
          .map((message) => normalizeMessage(message))
          .filter((message): message is CrispFeedbackMessage => Boolean(message))
      : [];

    if (messages.length === 0) return null;

    const status = parsed.status === "replied" ? "replied" : "open";

    return {
      emailReplyAnsweredAt: parsed.emailReplyAnsweredAt ?? null,
      emailReplyAskedAt: parsed.emailReplyAskedAt ?? null,
      emailSendError: parsed.emailSendError ?? null,
      emailSentAt: parsed.emailSentAt ?? null,
      guestEmail: parsed.guestEmail ? normalizeCrispText(parsed.guestEmail, 240) : null,
      guestName: parsed.guestName ? normalizeCrispText(parsed.guestName, 120) : null,
      identityProvidedAt: parsed.identityProvidedAt ?? null,
      identityRequestedAt: parsed.identityRequestedAt ?? null,
      kind: CRISP_FEEDBACK_KIND,
      lastRepliedAt: parsed.lastRepliedAt ?? null,
      lastSlackNotifiedAt: parsed.lastSlackNotifiedAt ?? null,
      locale: parsed.locale ? normalizeCrispText(parsed.locale, 16) : null,
      messages,
      pagePath: normalizeCrispText(parsed.pagePath, 500) || "/",
      status,
      token: normalizeCrispText(parsed.token, 200),
      userEmail: parsed.userEmail ? normalizeCrispText(parsed.userEmail, 240) : null,
      userId: parsed.userId ? normalizeCrispText(parsed.userId, 120) : null,
      userName: parsed.userName ? normalizeCrispText(parsed.userName, 120) : null,
      version: 1,
      wantsEmailReply:
        typeof parsed.wantsEmailReply === "boolean"
          ? parsed.wantsEmailReply
          : parsed.wantsEmailReply === null
            ? null
            : undefined,
    } satisfies CrispFeedbackPayload;
  } catch {
    return null;
  }
}

export function serializeCrispFeedbackPayload(payload: CrispFeedbackPayload) {
  return JSON.stringify(payload);
}

export function buildCrispThread(
  row: FeedbackRow,
  payload: CrispFeedbackPayload
): CrispFeedbackThread {
  const requester = getRequesterFromPayload(payload);

  return {
    createdAt: row.created_at,
    emailReplyAnsweredAt: payload.emailReplyAnsweredAt ?? null,
    emailReplyAskedAt: payload.emailReplyAskedAt ?? null,
    emailSendError: payload.emailSendError ?? null,
    emailSentAt: payload.emailSentAt ?? null,
    guestEmail: payload.guestEmail ?? null,
    guestName: payload.guestName ?? null,
    id: row.id,
    lastRepliedAt: payload.lastRepliedAt ?? null,
    locale: payload.locale ?? null,
    messages: payload.messages,
    pagePath: payload.pagePath,
    requesterEmail: requester.email,
    requesterName: requester.name,
    status: payload.status,
    userEmail: payload.userEmail ?? null,
    userId: payload.userId ?? row.user_id ?? null,
    userName: payload.userName ?? null,
    wantsEmailReply: payload.wantsEmailReply ?? null,
  };
}

export function formatCrispDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
