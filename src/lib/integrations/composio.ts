// Server-only transport. UI code must import the public integration types only.
const COMPOSIO_API_BASE_URL = "https://backend.composio.dev/api/v3.1";
const COMPOSIO_REQUEST_TIMEOUT_MS = 20_000;

export type ComposioConnectedAccount = {
  id?: string;
  user_id?: string;
  auth_config?: { id?: string; is_disabled?: boolean };
  toolkit?: { slug?: string };
  status?: string;
  is_disabled?: boolean;
};

type ErrorDetails = {
  code?: string | number;
  slug?: string;
  requestId?: string;
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
    status: error.status,
    code:
      typeof error.details.code === "number"
        ? error.details.code
        : safeErrorText(error.details.code),
    slug: safeErrorText(error.details.slug),
    requestId: safeErrorText(error.details.requestId),
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
      throw new ComposioApiError("Composio request failed", 502);
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
      let url: URL;
      try {
        url = new URL(response.redirect_url ?? "");
      } catch {
        throw new ComposioApiError(
          "Composio returned an invalid connect URL",
          502
        );
      }
      if (
        url.protocol !== "https:" ||
        url.hostname !== "connect.composio.dev" ||
        url.username ||
        url.password ||
        url.port ||
        !isComposioAccountId(response.connected_account_id)
      ) {
        throw new ComposioApiError(
          "Composio returned an invalid connect link",
          502
        );
      }
      return {
        accountId: response.connected_account_id,
        authorizeUrl: url.toString(),
      };
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
  };
}

export type ComposioClient = ReturnType<typeof createComposioClient>;
