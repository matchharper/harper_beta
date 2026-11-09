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
  async createRun(
    task: string,
    outputSchema: Record<string, unknown>,
    workspaceId?: string,
    sessionId?: string,
    options?: { keepAlive?: number; serviceTier?: CareerBrowserServiceTier }
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
        browserSettings: { record: false },
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
