import { z } from "zod";
import type { StagehandFile } from "./applicationStagehandRuntime";
import { resolveCareerBrowserServiceTier, type CareerBrowserServiceTier } from "../browserServiceTier";

export const BROWSER_USE_APPLICATION_MODEL = "gpt-6-luna";
const uuid = z.string().uuid();
const runSchema = z.object({
  id: uuid,
  sessionId: uuid,
  status: z.string(),
  output: z.unknown().optional(),
  result: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  totalCostUsd: z.string().optional(),
  totalInputTokens: z.number().optional(),
  totalOutputTokens: z.number().optional(),
});
export const browserUseTerminal = (status: string) =>
  ["completed", "failed", "cancelled"].includes(status);

export class BrowserUseHttpError extends Error {
  constructor(readonly status: number, readonly method: string, readonly path: string, readonly retryAfter?: string | null) {
    super(`Browser Use ${method} ${path.split("?")[0]} failed (HTTP ${status})`);
  }
}

function viewerUrl(liveUrl: string | null | undefined, interactive: boolean) {
  if (!liveUrl) return null;
  const url = new URL(liveUrl);
  // Only the provider's viewer may be embedded in an authenticated Career page.
  if (url.origin !== "https://live.browser-use.com")
    throw new Error("Unexpected Browser Use viewer origin");
  url.searchParams.set("readOnly", String(!interactive));
  url.searchParams.set("ui", String(interactive));
  return url.toString();
}

/** A page capture runs after its run's receipt is saved; this caps it so nothing that started it waits long. */
export const SESSION_PAGE_CAPTURE_MS = 15_000;

/** What captureSessionPage found. It never carries the browser's CDP address, which controls the whole browser. */
export type SessionPageCapture =
  | { status: "captured"; jpeg: Buffer; pageUrl: string; capturedAt: string }
  | {
      status: "unavailable";
      reason:
        | "provider_error"
        | "no_active_browser"
        | "no_cdp_url"
        | "cdp_discovery_failed"
        | "connect_failed"
        | "no_page"
        | "screenshot_failed"
        | "timeout";
    };

/** The parts of a playwright-core CDP connection a capture uses. */
type CapturePage = {
  url(): string;
  screenshot(options: { type: "jpeg"; quality: number; scale: "css"; caret: "initial"; timeout: number }): Promise<Buffer>;
};
export type CaptureBrowser = { contexts(): { pages(): CapturePage[] }[]; close(): Promise<void> };
export type ConnectOverCdp = (socketUrl: string, timeout: number) => Promise<CaptureBrowser>;

/**
 * Attaches to a live provider browser. noDefaults leaves its download, focus and media settings as the agent and the
 * person left them. For a browser reached over CDP, close() drops only this connection, not the browser or its pages.
 */
const connectOverCdp: ConnectOverCdp = async (socketUrl, timeout) =>
  (await import("playwright-core")).chromium.connectOverCDP(socketUrl, { timeout, noDefaults: true });

function urlWithProtocol(value: unknown, protocols: string[]) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return protocols.includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The browser's CDP socket. An HTTPS address is a discovery endpoint, resolved as browserUseCloud.mjs does: its
 * /json/version names the socket. The API key is not sent there and a redirect is refused.
 */
async function cdpSocket(endpoint: URL, signal: AbortSignal) {
  if (endpoint.protocol === "wss:") return endpoint.toString();
  const discovery = new URL(endpoint);
  discovery.pathname = discovery.pathname.replace(/\/$/, "") + "/json/version";
  const response = await fetch(discovery, { signal, redirect: "error", cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { webSocketDebuggerUrl?: unknown } | null;
  return urlWithProtocol(body?.webSocketDebuggerUrl, ["wss:"])?.toString() ?? null;
}

function samePage(open: string, wanted: string) {
  try {
    return new URL(open).href === new URL(wanted).href;
  } catch {
    return open === wanted;
  }
}

/** The call's value, or null when it throws or rejects. */
async function orNull<T>(call: () => T | Promise<T>) {
  try {
    return await call();
  } catch {
    return null;
  }
}

/** V4 transport. Never retry POST /runs: an ambiguous response can already be applying. */
export const browserUseAgents = {
  async request(
    path: string,
    body?: unknown,
    method = body === undefined ? "GET" : "POST"
  ) {
    const key = process.env.BROWSER_USE_API_KEY?.trim();
    if (!key)
      throw new Error(
        "BROWSER_USE_API_KEY is required for application browsing"
      );
    const response = await fetch(`https://api.browser-use.com/api/v4${path}`, {
      method,
      headers: {
        "X-Browser-Use-API-Key": key,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (method === "DELETE" && response.status === 404) return {};
    if (!response.ok)
      throw new BrowserUseHttpError(response.status, method, path, response.headers.get("Retry-After"));
    return response.status === 204 ? {} : z.record(z.unknown()).parse(await response.json());
  },
  async createWorkspace() {
    return z
      .object({ id: uuid })
      .parse(await this.request("/workspaces", { name: "Harper application" }))
      .id;
  },
  async clearFiles(workspaceId: string) {
    const root = `/workspaces/${uuid.parse(workspaceId)}/files`;
    let cursor: string | undefined;
    const paths: string[] = [];
    do {
      const page = z
        .object({
          files: z.array(z.object({ path: z.string() })),
          nextCursor: z.string().nullable().optional(),
          hasMore: z.boolean().optional(),
        })
        .parse(
          await this.request(
            `${root}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
          )
        );
      paths.push(...page.files.map((file) => file.path));
      if (page.hasMore && !page.nextCursor)
        throw new Error("Browser Use file listing is incomplete");
      cursor = page.hasMore ? page.nextCursor! : undefined;
    } while (cursor);
    for (const path of paths)
      await this.request(
        `${root}?path=${encodeURIComponent(path)}`,
        undefined,
        "DELETE"
      );
  },
  async upload(workspaceId: string, files: StagehandFile[]) {
    const paths: { documentId: string; name: string; path: string }[] = [];
    // Explicit document selection replaces prior transferred bytes. The provider's
    // file listing omits pending input uploads, so clearing that list alone does
    // not free an earlier filename. Keep same-batch destinations distinct below.
    for (const file of files) {
      const bytes = Buffer.from(file.data, "base64");
      const contentType = file.mimeType ?? "application/octet-stream";
      const name = file.name ?? file.path.split("/").at(-1)!;
      const uploaded = z
        .object({
          files: z.array(
            z.object({
              name: z.string(),
              path: z.string(),
              uploadUrl: z.string().url(),
            })
          ),
        })
        .parse(
          await this.request(
            `/workspaces/${uuid.parse(workspaceId)}/files/upload`,
            {
              files: [{ name, contentType, size: bytes.byteLength }],
              allowOverrides: true,
            }
          )
        );
      const target = uploaded.files[0];
      if (!target)
        throw new Error("Browser Use did not return a file upload destination");
      if (paths.some((file) => file.path === target.path))
        throw new Error("Selected attachments resolve to the same browser file path");
      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes.byteLength),
        },
        body: new Uint8Array(bytes),
        signal: AbortSignal.timeout(60_000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          `Application attachment upload failed (HTTP ${response.status})`
        );
      paths.push({ documentId: file.documentId!, name, path: target.path });
    }
    return paths;
  },
  /** A profile keeps the sign-in state (cookies) of the sites a user logged into, for that user's later browsers. */
  async createProfile(userId: string) {
    return z.object({ id: uuid })
      .parse(await this.request("/profiles", { name: "Harper saved login", userId }))
      .id;
  },
  async deleteProfile(profileId: string) {
    await this.request(`/profiles/${uuid.parse(profileId)}`, undefined, "DELETE");
  },
  async createRun(
    task: string,
    outputSchema: Record<string, unknown>,
    workspaceId?: string,
    sessionId?: string,
    // profileId: a saved-login profile; null explicitly leaves a profiled browser for a fresh one without it.
    options?: { keepAlive?: number; serviceTier?: CareerBrowserServiceTier; profileId?: string | null }
  ) {
    return runSchema.parse(
      await this.request("/runs", {
        task,
        model: BROWSER_USE_APPLICATION_MODEL,
        // modelParams replaces provider defaults: retain the existing high reasoning.
        modelParams: { reasoning: { effort: "high" }, service_tier: resolveCareerBrowserServiceTier(options?.serviceTier) },
        outputSchema,
        ...(workspaceId ? { workspaceId: uuid.parse(workspaceId) } : {}),
        ...(sessionId ? { sessionId: uuid.parse(sessionId) } : {}),
        ...(options?.keepAlive === undefined ? {} : { keepAlive: z.number().int().min(120).max(14400).parse(options.keepAlive) }),
        agentmail: false,
        browserSettings: { record: false, ...(options?.profileId === undefined ? {} : { profileId: options.profileId === null ? null : uuid.parse(options.profileId) }) },
      })
    );
  },
  async status(runId: string) {
    return z
      .object({ status: z.string() })
      .parse(await this.request(`/runs/${uuid.parse(runId)}/status`));
  },
  async cancelRun(runId: string) {
    await this.request(`/runs/${uuid.parse(runId)}/cancel`, undefined, "POST");
    return this.status(runId);
  },
  async livePreview(sessionId: string, interactive = false) {
    const page = z.object({
      items: z.array(z.object({ liveUrl: z.string().nullable().optional() })),
    }).parse(await this.request(
      `/browsers?agentSessionId=${uuid.parse(sessionId)}&filterBy=active&pageSize=100`
    ));
    return viewerUrl(page.items.find((item) => item.liveUrl)?.liveUrl, interactive);
  },
  async inspectSessionBrowser(sessionId: string, interactive = false) {
    let pageNumber = 1;
    let observed = 0;
    let allStopped = true;
    while (true) {
      const page = z.object({
        items: z.array(z.object({
          status: z.string(),
          liveUrl: z.string().nullable().optional(),
        })),
        totalItems: z.number(),
      }).parse(await this.request(
        `/browsers?agentSessionId=${uuid.parse(sessionId)}&pageSize=100&pageNumber=${pageNumber}`
      ));
      const active = page.items.find((item) => item.status === "active");
      if (active) return {
        availability: "active" as const,
        liveUrl: viewerUrl(active.liveUrl, interactive),
      };
      observed += page.items.length;
      allStopped &&= page.items.every((item) => item.status === "stopped");
      if (pageNumber * 100 >= page.totalItems) break;
      pageNumber++;
    }
    return {
      availability: observed > 0 && allStopped ? "stopped" as const : "unknown" as const,
      liveUrl: null,
    };
  },
  /**
   * A viewport JPEG of a page in an agent session's live browser: the open page at pageUrl, else the most recent web
   * page. It attaches over CDP and then only disconnects, leaving the browser and its pages as they were. It never
   * throws: whatever stops it, including SESSION_PAGE_CAPTURE_MS passing, comes back as a reason.
   */
  async captureSessionPage(sessionId: string, pageUrl?: string, connect: ConnectOverCdp = connectOverCdp): Promise<SessionPageCapture> {
    type Reason = Extract<SessionPageCapture, { status: "unavailable" }>["reason"];
    const unavailable = (reason: Reason) => ({ status: "unavailable", reason }) as const;
    const deadline = Date.now() + SESSION_PAGE_CAPTURE_MS;
    const left = () => Math.max(1, deadline - Date.now());
    const timeUp = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<SessionPageCapture>((resolve) => {
      timer = setTimeout(() => {
        timeUp.abort();
        resolve(unavailable("timeout"));
      }, SESSION_PAGE_CAPTURE_MS);
    });
    const capture = async (): Promise<SessionPageCapture> => {
      const listed = await orNull(async () => {
        // Listed as inspectSessionBrowser lists them; the active browser is the session's live one.
        for (let pageNumber = 1; ; pageNumber++) {
          const page = z.object({
            items: z.array(z.object({ status: z.string(), cdpUrl: z.unknown().optional() })),
            totalItems: z.number(),
          }).parse(await this.request(
            `/browsers?agentSessionId=${uuid.parse(sessionId)}&pageSize=100&pageNumber=${pageNumber}`
          ));
          const active = page.items.find((item) => item.status === "active");
          if (active || pageNumber * 100 >= page.totalItems) return { active };
        }
      });
      if (!listed) return unavailable("provider_error");
      if (!listed.active) return unavailable("no_active_browser");
      const endpoint = urlWithProtocol(listed.active.cdpUrl, ["https:", "wss:"]);
      if (!endpoint) return unavailable("no_cdp_url");
      const socket = await orNull(() => cdpSocket(endpoint, timeUp.signal));
      if (timeUp.signal.aborted) return unavailable("timeout");
      if (!socket) return unavailable("cdp_discovery_failed");
      const browser = await orNull(() => connect(socket, left()));
      if (!browser) return unavailable("connect_failed");
      try {
        // A connection that arrives after the time is up is dropped unused.
        if (timeUp.signal.aborted) return unavailable("timeout");
        const pages = browser.contexts().flatMap((context) => context.pages());
        const page = (pageUrl ? pages.find((open) => samePage(open.url(), pageUrl)) : undefined)
          ?? pages.filter((open) => /^https?:\/\//i.test(open.url())).at(-1);
        if (!page) return unavailable("no_page");
        // caret "initial" adds no style to the page; scale "css" keeps one pixel per CSS pixel.
        const jpeg = await page.screenshot({ type: "jpeg", quality: 70, scale: "css", caret: "initial", timeout: left() });
        return { status: "captured", jpeg, pageUrl: page.url(), capturedAt: new Date().toISOString() };
      } catch {
        return unavailable("screenshot_failed");
      } finally {
        // Not awaited, so a slow disconnect never turns a taken picture into a timeout.
        void orNull(() => browser.close());
      }
    };
    try {
      return await Promise.race([capture(), timedOut]);
    } finally {
      clearTimeout(timer);
    }
  },
  async result(runId: string) {
    return runSchema.parse(await this.request(`/runs/${uuid.parse(runId)}`));
  },
  async stop(
    state: {
      runId?: string;
      sessionId?: string;
      workspaceId?: string;
      dispatchStarted?: boolean;
    },
    deleteFiles = true
  ) {
    if (state.dispatchStarted && !state.runId)
      throw new Error(
        "Browser Use dispatch outcome is unknown; remote cleanup could not be confirmed"
      );
    if (state.runId) {
      let current = await this.status(state.runId);
      if (!browserUseTerminal(current.status)) {
        await this.request(
          `/runs/${uuid.parse(state.runId)}/cancel`,
          undefined,
          "POST"
        );
        const deadline = Date.now() + 20_000;
        do {
          current = await this.status(state.runId);
          if (browserUseTerminal(current.status)) break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } while (Date.now() < deadline);
        if (!browserUseTerminal(current.status))
          throw new Error("Browser Use cancellation is not confirmed");
      }
    }
    if (state.sessionId) {
      let page = 1;
      while (true) {
        const browsers = z
          .object({
            items: z.array(z.object({ id: uuid, status: z.string() })),
            totalItems: z.number(),
          })
          .parse(
            await this.request(
              `/browsers?agentSessionId=${uuid.parse(state.sessionId)}&pageSize=100&pageNumber=${page}`
            )
          );
        for (const browser of browsers.items) {
          if (browser.status !== "stopped") {
            const result = await this.request(
              `/browsers/${browser.id}`,
              { action: "stop" },
              "PATCH"
            );
            if (result.status !== "stopped")
              throw new Error("Browser Use browser stop is not confirmed");
          }
        }
        if (page * 100 >= browsers.totalItems) break;
        page++;
      }
    }
    if (deleteFiles && state.workspaceId)
      await this.clearFiles(state.workspaceId);
  },
};
