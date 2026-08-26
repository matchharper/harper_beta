const COMPOSIO_API_BASE_URL = "https://backend.composio.dev/api/v3.1";
const COMPOSIO_REQUEST_TIMEOUT_MS = 20_000;

export const COMPOSIO_GMAIL_TOOLKIT_SLUG = "gmail";
export const COMPOSIO_GMAIL_TOOL_VERSION = "20260817_00";

type FetchLike = typeof fetch;

export type ComposioConnectedAccount = {
  auth_config?: {
    id?: string | null;
  } | null;
  id?: string | null;
  is_disabled?: boolean | null;
  status?: string | null;
  toolkit?: {
    slug?: string | null;
  } | null;
  user_id?: string | null;
};

type ComposioConnectedAccountList = {
  items?: ComposioConnectedAccount[] | null;
};

type ComposioConnectLink = {
  connected_account_id?: string | null;
  expires_at?: string | null;
  redirect_url?: string | null;
};

type ComposioErrorDetails = {
  code?: string | number;
  slug?: string;
  requestId?: string;
  providerMessage?: string;
  suggestedFix?: string;
  causeCode?: string;
};

function safeErrorText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let text = value;
  // Redact known server credentials even if a provider echoes one in prose.
  for (const [name, secret] of Object.entries(process.env)) {
    if (/(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && secret?.trim()) {
      text = text.split(secret.trim()).join("[redacted]");
    }
  }
  return text
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s<>"']+/gi, "[url redacted]")
    .replace(/\bBearer\s+[^\s,"'}]+/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[token redacted]"
    )
    .replace(
      /\b(?:access[_-]?token|refresh[_-]?token|link[_-]?token|client[_-]?secret|api[_-]?key|x-api-key|authorization|cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "[credential redacted]"
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 600);
}

export class ComposioApiError extends Error {
  status: number;
  details: ComposioErrorDetails;

  constructor(
    message: string,
    status: number,
    details: ComposioErrorDetails = {}
  ) {
    super(message);
    this.name = "ComposioApiError";
    this.status = status;
    this.details = details;
  }
}

export function getIntegrationErrorDiagnostics(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const details = error instanceof ComposioApiError ? error.details : {};
  return {
    name: safeErrorText(record.name) ?? "Error",
    message: safeErrorText(record.message) ?? "Unknown integration error",
    ...(error instanceof ComposioApiError ? { status: error.status } : {}),
    code:
      typeof details.code === "number"
        ? details.code
        : safeErrorText(details.code ?? record.code),
    slug: safeErrorText(details.slug),
    requestId: safeErrorText(details.requestId),
    providerMessage: safeErrorText(details.providerMessage),
    suggestedFix: safeErrorText(details.suggestedFix),
    causeCode: safeErrorText(details.causeCode),
  };
}

async function readConnectionErrorDetails(
  response: Response
): Promise<ComposioErrorDetails> {
  const payload = await response.json().catch(() => null);
  const error = payload?.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return {};
  // Never retain raw responses, headers, connection data, or tool results.
  return {
    code:
      typeof error.code === "number" ? error.code : safeErrorText(error.code),
    slug: safeErrorText(error.slug),
    requestId: safeErrorText(error.request_id),
    providerMessage: safeErrorText(error.message),
    suggestedFix: safeErrorText(error.suggested_fix),
  };
}

function readServerEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ComposioApiError(`${name} is required`, 500, {
      code: "MISSING_ENV",
    });
  }
  return value;
}

export function getComposioGmailAuthConfigId() {
  return readServerEnv("COMPOSIO_GMAIL_AUTH_CONFIG_ID");
}

function normalizeConnectedAccountId(value: string) {
  const normalized = value.trim();
  if (!/^ca_[A-Za-z0-9_-]+$/.test(normalized) || normalized.length > 160) {
    throw new ComposioApiError("Invalid connected account ID", 400);
  }
  return normalized;
}

async function composioRequest<T>(
  path: string,
  init: RequestInit = {},
  fetchFn: FetchLike = fetch
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    COMPOSIO_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetchFn(`${COMPOSIO_API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-api-key": readServerEnv("COMPOSIO_API_KEY"),
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? controller.signal,
    });

    if (!response.ok) {
      // Connection errors contain setup diagnostics. Tool errors can echo
      // private email content, so do not read their bodies for logging.
      const details = path.startsWith("/connected_accounts")
        ? await readConnectionErrorDetails(response)
        : {};
      throw new ComposioApiError(
        `Composio request failed with status ${response.status}`,
        response.status,
        details
      );
    }

    if (response.status === 204) return undefined as T;

    try {
      return (await response.json()) as T;
    } catch {
      throw new ComposioApiError("Composio returned invalid JSON", 502);
    }
  } catch (error) {
    if (error instanceof ComposioApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ComposioApiError("Composio request timed out", 504);
    }
    const cause = error instanceof Error ? error.cause : null;
    const causeCode =
      cause && typeof cause === "object" && "code" in cause
        ? safeErrorText(cause.code)
        : undefined;
    throw new ComposioApiError("Composio request failed", 502, { causeCode });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createComposioGmailConnectLink(args: {
  callbackUrl: string;
  userId: string;
}) {
  const response = await composioRequest<ComposioConnectLink>(
    "/connected_accounts/link",
    {
      body: JSON.stringify({
        auth_config_id: getComposioGmailAuthConfigId(),
        callback_url: args.callbackUrl,
        user_id: args.userId,
      }),
      method: "POST",
    }
  );
  const redirectUrl = response.redirect_url?.trim();
  if (!redirectUrl) {
    throw new ComposioApiError("Composio did not return a connect URL", 502);
  }
  return {
    connectedAccountId: response.connected_account_id?.trim() || null,
    expiresAt: response.expires_at?.trim() || null,
    redirectUrl,
  };
}

export async function listActiveComposioGmailAccounts(userId: string) {
  const params = new URLSearchParams();
  params.set("auth_config_ids", getComposioGmailAuthConfigId());
  params.set("limit", "10");
  params.set("statuses", "ACTIVE");
  params.set("toolkit_slugs", COMPOSIO_GMAIL_TOOLKIT_SLUG);
  params.set("user_ids", userId);
  const response = await composioRequest<ComposioConnectedAccountList>(
    `/connected_accounts?${params.toString()}`
  );
  return Array.isArray(response.items) ? response.items : [];
}

export async function getComposioConnectedAccount(connectedAccountId: string) {
  const accountId = normalizeConnectedAccountId(connectedAccountId);
  return composioRequest<ComposioConnectedAccount>(
    `/connected_accounts/${encodeURIComponent(accountId)}`
  );
}

export function isOwnedComposioGmailAccount(
  account: ComposioConnectedAccount,
  userId: string
) {
  return (
    account.user_id === userId &&
    account.toolkit?.slug?.toLowerCase() === COMPOSIO_GMAIL_TOOLKIT_SLUG &&
    account.auth_config?.id === getComposioGmailAuthConfigId()
  );
}

export function getComposioAccountStatus(account: ComposioConnectedAccount) {
  if (account.is_disabled === true) return "INACTIVE";
  return String(account.status ?? "")
    .trim()
    .toUpperCase();
}

export async function executeComposioGmailFetchEmails(args: {
  arguments: Record<string, unknown>;
  connectedAccountId: string;
  userId: string;
}) {
  const response = await composioRequest<Record<string, unknown>>(
    "/tools/execute/GMAIL_FETCH_EMAILS",
    {
      body: JSON.stringify({
        arguments: args.arguments,
        connected_account_id: normalizeConnectedAccountId(
          args.connectedAccountId
        ),
        user_id: args.userId,
        version: COMPOSIO_GMAIL_TOOL_VERSION,
      }),
      method: "POST",
    }
  );

  if (response.successful === false || response.error) {
    throw new ComposioApiError("Composio Gmail tool execution failed", 502);
  }
  return response;
}

export async function revokeComposioConnectedAccount(
  connectedAccountId: string
) {
  const accountId = normalizeConnectedAccountId(connectedAccountId);
  await composioRequest(
    `/connected_accounts/${encodeURIComponent(accountId)}/revoke`,
    { method: "POST" }
  );
}

export async function deleteComposioConnectedAccount(
  connectedAccountId: string
) {
  const accountId = normalizeConnectedAccountId(connectedAccountId);
  await composioRequest(
    `/connected_accounts/${encodeURIComponent(accountId)}`,
    {
      method: "DELETE",
    }
  );
}
