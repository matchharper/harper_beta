// Server-only transport. UI code must import the public integration types only.
const COMPOSIO_API_BASE_URL = "https://backend.composio.dev/api/v3.1";
const COMPOSIO_REQUEST_TIMEOUT_MS = 20_000;

// Connect Link uses connect.composio.dev. A self-hosted OAuth configuration
// can instead return Composio's short hand-off URL or Google's authorization
// URL directly. These are the only browser destinations this integration
// accepts from Composio.
const TRUSTED_CONNECT_HOSTS = new Set([
  "connect.composio.dev",
  "backend.composio.dev",
  "accounts.google.com",
]);

export const COMPOSIO_GMAIL_TOOLKIT_SLUG = "gmail";
export const COMPOSIO_GMAIL_TOOL_VERSION = "20260817_00";

export type ComposioConnectedAccount = {
  id?: string | null;
  user_id?: string | null;
  auth_config?: { id?: string | null; is_disabled?: boolean | null } | null;
  toolkit?: { slug?: string | null } | null;
  status?: string | null;
  is_disabled?: boolean | null;
};

type ComposioConnectedAccountList = {
  items?: ComposioConnectedAccount[] | null;
};

export type ComposioToolExecution<T> = {
  data?: T;
  error?: string;
  successful?: boolean;
};

type ErrorDetails = {
  code?: string | number;
  slug?: string;
  requestId?: string;
  providerMessage?: string;
  suggestedFix?: string;
  causeCode?: string;
};

export class ComposioApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: ErrorDetails = {}
  ) {
    super(message);
    this.name = "ComposioApiError";
  }
}

export function readComposioEnv(name: string): string {
  if (typeof window !== "undefined") {
    throw new Error("Composio credentials are server-only");
  }
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ComposioApiError(`${name} is required`, 503, {
      code: "MISSING_ENV",
    });
  }
  return value;
}

// Keep the safe diagnostics from the Gmail integration without logging raw
// responses, credentials, connection objects, or provider content.
function safeErrorText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  let text = value;
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

export function getIntegrationErrorDiagnostics(error: unknown) {
  if (!(error instanceof ComposioApiError)) {
    // Database messages can include row contents. Do not serialize them.
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    return {
      name: "IntegrationError",
      ...(typeof code === "string" && /^(?:[A-Z0-9]{5}|PGRST[0-9]+)$/.test(code)
        ? { code: safeErrorText(code) }
        : {}),
    };
  }
  return {
    name: error.name,
    message: safeErrorText(error.message) ?? "Unknown integration error",
    status: error.status,
    code:
      typeof error.details.code === "number"
        ? error.details.code
        : safeErrorText(error.details.code),
    slug: safeErrorText(error.details.slug),
    requestId: safeErrorText(error.details.requestId),
    providerMessage: safeErrorText(error.details.providerMessage),
    suggestedFix: safeErrorText(error.details.suggestedFix),
    causeCode: safeErrorText(error.details.causeCode),
  };
}

export function isComposioAccountId(value: unknown): value is string {
  return typeof value === "string" && /^ca_[A-Za-z0-9_-]{1,157}$/.test(value);
}

export function createComposioClient(
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
  } = {}
) {
  const fetchFn = options.fetch ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const apiKey = readComposioEnv("COMPOSIO_API_KEY");
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? COMPOSIO_REQUEST_TIMEOUT_MS
    );
    try {
      const response = await fetchFn(`${COMPOSIO_API_BASE_URL}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const detail = payload?.error;
        const includeConnectionDiagnostics = path.startsWith(
          "/connected_accounts"
        );
        throw new ComposioApiError(
          `Composio request failed with status ${response.status}`,
          response.status,
          {
            code:
              typeof detail?.code === "number"
                ? detail.code
                : safeErrorText(detail?.code),
            slug: safeErrorText(detail?.slug),
            requestId: safeErrorText(detail?.request_id),
            ...(includeConnectionDiagnostics
              ? {
                  providerMessage: safeErrorText(detail?.message),
                  suggestedFix: safeErrorText(detail?.suggested_fix),
                }
              : {}),
          }
        );
      }
      if (response.status === 204) return undefined as T;
      return (await response.json().catch(() => {
        throw new ComposioApiError("Composio returned invalid JSON", 502);
      })) as T;
    } catch (error) {
      if (error instanceof ComposioApiError) throw error;
      if (controller.signal.aborted) {
        throw new ComposioApiError("Composio request timed out", 504);
      }
      const cause = error instanceof Error ? error.cause : null;
      const causeCode =
        cause && typeof cause === "object" && "code" in cause
          ? safeErrorText(cause.code)
          : undefined;
      throw new ComposioApiError("Composio request failed", 502, {
        causeCode,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function accountPath(accountId: string) {
    if (!isComposioAccountId(accountId)) {
      throw new ComposioApiError("Invalid connected account ID", 400);
    }
    return `/connected_accounts/${encodeURIComponent(accountId)}`;
  }

  function sanitizeAccount(
    account: ComposioConnectedAccount
  ): ComposioConnectedAccount {
    return {
      id: account.id,
      user_id: account.user_id,
      toolkit: { slug: account.toolkit?.slug },
      auth_config: {
        id: account.auth_config?.id,
        is_disabled: account.auth_config?.is_disabled,
      },
      status: account.status,
      is_disabled: account.is_disabled,
    };
  }

  function parseAuthorizeUrl(args: {
    accountId: unknown;
    redirectUrl: unknown;
  }) {
    let url: URL;
    try {
      url = new URL(typeof args.redirectUrl === "string" ? args.redirectUrl : "");
    } catch {
      throw new ComposioApiError(
        "Composio returned an invalid connect URL",
        502
      );
    }
    if (
      url.protocol !== "https:" ||
      !TRUSTED_CONNECT_HOSTS.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      !isComposioAccountId(args.accountId)
    ) {
      throw new ComposioApiError(
        "Composio returned an invalid connect link",
        502
      );
    }
    return { accountId: args.accountId, authorizeUrl: url.toString() };
  }

  return {
    async createLink(args: {
      authConfigId: string;
      userId: string;
      callbackUrl: string;
    }) {
      const response = await request<{
        connected_account_id?: string;
        redirect_url?: string;
        expires_at?: string;
      }>("/connected_accounts/link", {
        method: "POST",
        body: JSON.stringify({
          auth_config_id: args.authConfigId,
          user_id: args.userId,
          callback_url: args.callbackUrl,
        }),
      });
      return parseAuthorizeUrl({
        accountId: response.connected_account_id,
        redirectUrl: response.redirect_url,
      });
    },
    async createDirectOAuthConnection(args: {
      authConfigId: string;
      callbackUrl: string;
      userId: string;
    }) {
      const response = await request<{
        connection_data?: { val?: { redirect_url?: string } };
        connectionData?: { val?: { redirectUrl?: string } };
        id?: string;
        redirect_url?: string;
      }>("/connected_accounts", {
        method: "POST",
        body: JSON.stringify({
          auth_config: { id: args.authConfigId },
          connection: {
            callback_url: args.callbackUrl,
            state: {
              authScheme: "OAUTH2",
              val: {
                long_redirect_url: true,
                status: "INITIALIZING",
              },
            },
            user_id: args.userId,
          },
        }),
      });
      return parseAuthorizeUrl({
        accountId: response.id,
        redirectUrl:
          response.redirect_url ??
          response.connection_data?.val?.redirect_url ??
          response.connectionData?.val?.redirectUrl,
      });
    },
    async getAccount(accountId: string): Promise<ComposioConnectedAccount> {
      const account = await request<ComposioConnectedAccount>(
        accountPath(accountId)
      );
      if (!account || typeof account !== "object" || Array.isArray(account)) {
        throw new ComposioApiError("Composio returned an invalid account", 502);
      }
      // The full vendor object can contain OAuth state/credentials. Retain
      // only metadata used for ownership and lifecycle checks.
      return sanitizeAccount(account);
    },
    async listAccounts(filters: {
      authConfigId: string;
      limit?: number;
      status?: string;
      toolkitSlug: string;
      userId: string;
    }): Promise<ComposioConnectedAccount[]> {
      const params = new URLSearchParams({
        auth_config_ids: filters.authConfigId,
        limit: String(Math.min(100, Math.max(1, filters.limit ?? 10))),
        statuses: filters.status ?? "ACTIVE",
        toolkit_slugs: filters.toolkitSlug,
        user_ids: filters.userId,
      });
      const response = await request<ComposioConnectedAccountList>(
        `/connected_accounts?${params.toString()}`
      );
      return Array.isArray(response.items)
        ? response.items.map(sanitizeAccount)
        : [];
    },
    async revokeAccount(accountId: string) {
      const result = await request<{
        connected_account?: { id?: string; status?: string };
      }>(`${accountPath(accountId)}/revoke`, { method: "POST" });
      if (
        result?.connected_account?.id !== accountId ||
        result.connected_account.status !== "REVOKED"
      ) {
        throw new ComposioApiError("Composio did not confirm revocation", 502);
      }
    },
    async deleteAccount(accountId: string) {
      const result = await request<{ success?: boolean } | undefined>(
        accountPath(accountId),
        { method: "DELETE" }
      );
      if (result !== undefined && result.success !== true) {
        throw new ComposioApiError("Composio did not confirm deletion", 502);
      }
    },
    async executeTool<T>(args: {
      accountId: string;
      arguments: Record<string, unknown>;
      slug: string;
      userId: string;
      version: string;
    }): Promise<T> {
      if (!isComposioAccountId(args.accountId)) {
        throw new ComposioApiError("Invalid connected account ID", 400);
      }
      if (!/^[A-Z][A-Z0-9_]{1,127}$/.test(args.slug)) {
        throw new ComposioApiError("Invalid tool slug", 400);
      }
      if (!/^\d{8}_\d{2}$/.test(args.version)) {
        throw new ComposioApiError("Invalid tool version", 400);
      }
      if (!args.userId.trim()) {
        throw new ComposioApiError("Invalid tool user ID", 400);
      }
      const result = await request<ComposioToolExecution<T>>(
        `/tools/execute/${encodeURIComponent(args.slug)}`,
        {
          method: "POST",
          body: JSON.stringify({
            arguments: args.arguments,
            connected_account_id: args.accountId,
            user_id: args.userId,
            version: args.version,
          }),
        }
      );
      if (result?.successful !== true || result.data === undefined) {
        // Provider errors can contain calendar titles, attendees, or event
        // descriptions. Keep them out of logs and client-facing errors.
        throw new ComposioApiError("Composio tool execution failed", 502, {
          code: "TOOL_EXECUTION_FAILED",
          slug: args.slug,
        });
      }
      return result.data;
    },
  };
}

// Product services depend only on the shared connection/tool lifecycle surface.
// Gmail account discovery stays an adapter detail so existing service fakes do
// not need to implement a provider-specific listing method.
export type ComposioClient = Omit<
  ReturnType<typeof createComposioClient>,
  "createDirectOAuthConnection" | "listAccounts"
>;

export function getComposioGmailAuthConfigId() {
  return readComposioEnv("COMPOSIO_GMAIL_AUTH_CONFIG_ID");
}

export async function createComposioGmailConnectLink(args: {
  callbackUrl: string;
  userId: string;
}) {
  const client = createComposioClient();
  const connectionArgs = {
    authConfigId: getComposioGmailAuthConfigId(),
    callbackUrl: args.callbackUrl,
    userId: args.userId,
  };
  // Gmail uses Harper-owned OAuth credentials. Send the browser straight to
  // Google so neither a Composio Connect Link page nor its branding is shown.
  const result = await client.createDirectOAuthConnection(connectionArgs);
  return {
    connectedAccountId: result.accountId,
    expiresAt: null,
    redirectUrl: result.authorizeUrl,
  };
}

export async function listActiveComposioGmailAccounts(userId: string) {
  return createComposioClient().listAccounts({
    authConfigId: getComposioGmailAuthConfigId(),
    status: "ACTIVE",
    toolkitSlug: COMPOSIO_GMAIL_TOOLKIT_SLUG,
    userId,
  });
}

export async function getComposioConnectedAccount(
  connectedAccountId: string
) {
  return createComposioClient().getAccount(connectedAccountId);
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
  return createComposioClient().executeTool<Record<string, unknown>>({
    accountId: args.connectedAccountId,
    arguments: args.arguments,
    slug: "GMAIL_FETCH_EMAILS",
    userId: args.userId,
    version: COMPOSIO_GMAIL_TOOL_VERSION,
  });
}

export async function revokeComposioConnectedAccount(
  connectedAccountId: string
) {
  await createComposioClient().revokeAccount(connectedAccountId);
}

export async function deleteComposioConnectedAccount(
  connectedAccountId: string
) {
  await createComposioClient().deleteAccount(connectedAccountId);
}
